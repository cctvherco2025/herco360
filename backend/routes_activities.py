"""Activity (Agenda) routes."""
import calendar
from datetime import datetime, timedelta, date as date_cls
from fastapi import APIRouter, HTTPException, Depends
from core import db, get_current_user, serialize_doc, new_id, now_iso
from models import ActivityInput, RespondInput
from notifications import create_notification, log_activity
from reminders import DEFAULT_REMINDER_OFFSETS

router = APIRouter(prefix='/activities', tags=['activities'])

MANAGER_POSITIONS = {'Jefe', 'Gerente', 'Director comercial'}

MAX_OCCURRENCES = 60
DEFAULT_COUNTS = {'daily': 30, 'weekly': 12, 'monthly': 6}

# ── Actividades de varios días ──────────────────────────────────────────────
# Una actividad es UN solo documento con su rango: `date` (primer día) +
# `start_time` (hora del primer día) hasta `end_date` (último día) +
# `end_time` (hora del último día). También se guardan fecha_hora_inicio /
# fecha_hora_fin completas en hora de Honduras (UTC-6, sin horario de verano).
MAX_SPAN_DAYS = 31
TZ_SUFFIX = '-06:00'  # America/Tegucigalpa


def _parse_date(s: str) -> date_cls:
    return datetime.strptime(s, '%Y-%m-%d').date()


def _fecha_hora(d: str, t: str) -> str:
    return f'{d}T{t}:00{TZ_SUFFIX}'


def _rango(data, prev: dict = None):
    """(date, end_date) validados. Sin `end_date` (clientes viejos): una
    actividad nueva es de un día; al editar se conserva la duración que tenía
    (así mover una actividad de 3 días no la recorta a 1)."""
    try:
        d0 = _parse_date(data.date)
    except Exception:
        raise HTTPException(status_code=400, detail='Fecha inválida')
    if data.end_date:
        try:
            d1 = _parse_date(data.end_date)
        except Exception:
            raise HTTPException(status_code=400, detail='Fecha de fin inválida')
    elif prev and prev.get('end_date') and prev.get('date'):
        d1 = d0 + (_parse_date(prev['end_date']) - _parse_date(prev['date']))
    else:
        d1 = d0
    if d1 < d0:
        raise HTTPException(status_code=400, detail='El último día no puede ser antes del primero')
    if (d1 - d0).days > MAX_SPAN_DAYS:
        raise HTTPException(status_code=400, detail=f'Una actividad puede durar como máximo {MAX_SPAN_DAYS + 1} días')
    if d1 == d0 and data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail='La hora de fin debe ser mayor a la de inicio')
    return d0.isoformat(), d1.isoformat()


def _dias(date: str, end_date: str, start_time: str, end_time: str) -> list:
    """Tramos por día de una actividad: [(día, desde, hasta)]. Primer día desde
    la hora de inicio, días intermedios completos, último día hasta la hora
    de fin. Sirve para validar y reservar la sala día por día."""
    d0, d1 = _parse_date(date), _parse_date(end_date or date)
    out, d = [], d0
    while d <= d1:
        out.append((d.isoformat(), start_time if d == d0 else '00:00', end_time if d == d1 else '23:59'))
        d += timedelta(days=1)
    return out


def _check_repeticion(dates: list, start_time: str, end_time: str, span_days: int):
    """Una actividad de varios días puede repetirse, pero no si la siguiente
    repetición empieza antes de que termine la actual."""
    if len(dates) < 2 or span_days == 0:
        return
    for a, b in zip(dates, dates[1:]):
        fin = datetime.strptime(f'{_parse_date(a) + timedelta(days=span_days)} {end_time}', '%Y-%m-%d %H:%M')
        siguiente = datetime.strptime(f'{b} {start_time}', '%Y-%m-%d %H:%M')
        if siguiente < fin:
            raise HTTPException(status_code=400, detail=(
                f'La actividad dura {span_days + 1} días y se repetiría antes de terminar. Cambiá la repetición.'))


def _add_months(d: date_cls, n: int) -> date_cls:
    month = d.month - 1 + n
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return d.replace(year=year, month=month, day=day)


def _gen_dates(start_str: str, recurrence: str, count) -> list:
    """Return a list of YYYY-MM-DD date strings for the recurrence series."""
    try:
        d0 = datetime.strptime(start_str, '%Y-%m-%d').date()
    except Exception:
        return [start_str]
    if recurrence not in ('daily', 'weekly', 'monthly'):
        return [d0.isoformat()]
    n = count if (isinstance(count, int) and count > 0) else DEFAULT_COUNTS[recurrence]
    n = max(1, min(n, MAX_OCCURRENCES))
    out = []
    for i in range(n):
        if recurrence == 'daily':
            out.append((d0 + timedelta(days=i)).isoformat())
        elif recurrence == 'weekly':
            out.append((d0 + timedelta(weeks=i)).isoformat())
        else:  # monthly
            out.append(_add_months(d0, i).isoformat())
    return out


def _norm_offsets(offsets, legacy_minutes, keep):
    """Normalise the reminder config coming from the client.

    - `offsets` is a list -> clean it (drop non-positive, cap at 1440, dedupe,
      sort descending). An explicit empty list means "no reminder".
    - else if the legacy single `reminder_minutes` was sent -> [that] or [].
    - else (both omitted, e.g. an older cached client) -> `keep` (the value the
      activity already had, or the default set for a brand-new activity).
    """
    if isinstance(offsets, list):
        clean = sorted({int(x) for x in offsets if isinstance(x, (int, float)) and 0 < int(x) <= 24 * 60}, reverse=True)
        return clean
    if legacy_minutes is not None:
        try:
            m = int(legacy_minutes)
        except (TypeError, ValueError):
            return list(keep)
        return [m] if 0 < m <= 24 * 60 else []
    return list(keep)


def _is_monday(date_str: str) -> bool:
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').weekday() == 0
    except Exception:
        return False


def _times_overlap(start_a: str, end_a: str, start_b: str, end_b: str) -> bool:
    """Two same-day HH:MM intervals overlap if A starts before B ends and B starts before A ends."""
    if not (start_a and end_a and start_b and end_b):
        return False
    return start_a < end_b and start_b < end_a


async def _check_conflicts(date: str, start_time: str, end_time: str,
                           participant_ids, creator_id: str, uses_meeting_room: bool,
                           exclude_activity_id: str = None):
    """Raise 409 if the proposed slot clashes with the meeting room.

    - Vacation markers (is_vacation=True) never block a slot.
    - Cancelled/finished room reservations never block.
    - Participant conflicts are intentionally NOT checked: people can be
      double-booked across activities.
    """
    # --- Room conflict (source of truth: reservations collection) ---
    if uses_meeting_room:
        res_query = {'date': date}
        if exclude_activity_id:
            res_query['activity_id'] = {'$ne': exclude_activity_id}
        reservations = await db.reservations.find(res_query, {'_id': 0}).to_list(500)
        for r in reservations:
            if r.get('status') in ('Cancelada', 'Finalizada'):
                continue
            if _times_overlap(start_time, end_time, r.get('start_time', ''), r.get('end_time', '')):
                raise HTTPException(
                    status_code=409,
                    detail=(f"La Sala de Juntas ya está reservada de "
                            f"{r.get('start_time')} a {r.get('end_time')} ese día."))

    # Participant conflict check removed — participants can now be double-booked.
    return


async def _build_participants(participant_ids):
    participants = []
    if participant_ids:
        users = await db.users.find({'id': {'$in': participant_ids}}, {'_id': 0}).to_list(200)
        for u in users:
            participants.append({
                'user_id': u['id'], 'name': u['name'],
                'avatar_url': u.get('avatar_url'), 'status': 'invited',
            })
    return participants


async def _ensure_room_reservation(activity, actor):
    """Reserva la sala para la actividad: una reserva por cada día que dura
    (la agenda de la sala es por día). Los lunes nunca se auto-reservan
    (Dirección Comercial); igual ya se rechazan antes de llegar aquí."""
    room = await db.rooms.find_one({}, {'_id': 0})
    if not room:
        return
    primera = None
    for dia, desde, hasta in _dias(activity['date'], activity.get('end_date'), activity['start_time'], activity['end_time']):
        if _is_monday(dia):
            continue
        reservation = {
            'id': new_id(), 'room_id': room['id'], 'room_name': room['name'],
            'activity_id': activity['id'], 'title': activity['title'],
            'date': dia, 'start_time': desde, 'end_time': hasta, 'status': 'Reservada',
            'reserved_by': actor['id'], 'reserved_by_name': actor['name'],
            'notes': activity.get('description', ''), 'created_at': now_iso(),
        }
        await db.reservations.insert_one(reservation)
        primera = primera or reservation
    if not primera:
        return
    await log_activity(actor['id'], actor['name'], actor.get('avatar_url'),
                       'reservó la Sala de Juntas', activity['title'], 'reservation')
    for p in activity.get('participants', []):
        await create_notification(p['user_id'], 'sala_reservada',
                                  f"Sala de Juntas reservada para '{activity['title']}'",
                                  related_id=primera['id'], related_type='reservation',
                                  actor_name=actor['name'], actor_avatar=actor.get('avatar_url'))


async def _check_conflicts_rango(date, end_date, start_time, end_time, participant_ids, creator_id,
                                 uses_meeting_room, exclude_activity_id=None):
    """Lunes y choques de sala en CADA día que dura la actividad."""
    tramos = _dias(date, end_date, start_time, end_time)
    if uses_meeting_room and any(_is_monday(d) for d, _, _ in tramos):
        raise HTTPException(status_code=409,
                            detail='Los lunes la Sala de Juntas está reservada para Dirección Comercial')
    for dia, desde, hasta in tramos:
        await _check_conflicts(dia, desde, hasta, participant_ids, creator_id, uses_meeting_room,
                               exclude_activity_id=exclude_activity_id)


@router.get('')
async def list_activities(start: str = None, end: str = None, category: str = None,
                          mine: bool = False, user_id: str = None, user=Depends(get_current_user)):
    query = {}
    conds = []
    if start and end:
        # Toda actividad que TOQUE el rango: empieza antes de que termine el
        # rango y termina después de que empieza (incluye las de varios días
        # que empezaron antes). Sin end_date (docs aún no migrados) = un día.
        conds.append({'date': {'$lte': end}})
        conds.append({'$or': [{'end_date': {'$gte': start}},
                              {'end_date': {'$exists': False}, 'date': {'$gte': start}}]})
    if category:
        query['category'] = category
    # Determine whose calendar we are reading.
    target_id = user['id']
    if user_id and user_id != user['id']:
        target = await db.users.find_one({'id': user_id})
        if not target:
            raise HTTPException(status_code=404, detail='Usuario no encontrado')
        pos = (user.get('position') or '').strip()
        allowed = (user.get('role') == 'admin' or pos == 'Director comercial' or
                   (pos in MANAGER_POSITIONS and target.get('area') == user.get('area')))
        if not allowed:
            raise HTTPException(status_code=403, detail='No puedes ver este calendario')
        target_id = user_id
    # Agenda is personal: only the owner's created/invited activities.
    conds.append({'$or': [{'created_by': target_id}, {'participants.user_id': target_id}]})
    query['$and'] = conds
    activities = await db.activities.find(query, {'_id': 0}).sort('date', 1).to_list(1000)
    for a in activities:
        a.setdefault('end_date', a.get('date'))
    return serialize_doc(activities)


@router.get('/{activity_id}')
async def get_activity(activity_id: str, user=Depends(get_current_user)):
    a = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Actividad no encontrada')
    return serialize_doc(a)


@router.post('')
async def create_activity(data: ActivityInput, user=Depends(get_current_user)):
    date0, end0 = _rango(data)
    span = timedelta(days=(_parse_date(end0) - _parse_date(date0)).days)
    participants = await _build_participants(data.participant_ids)
    recurrence = (data.recurrence or 'none')
    dates = _gen_dates(date0, recurrence, data.recurrence_count)
    _check_repeticion(dates, data.start_time, data.end_time, span.days)
    series_id = new_id() if len(dates) > 1 else None

    # Pre-check ALL occurrences (and every day of each) before inserting
    # anything, so a series never gets created "half-way" when one date clashes.
    for dt in dates:
        await _check_conflicts_rango(dt, (_parse_date(dt) + span).isoformat(), data.start_time, data.end_time,
                                     data.participant_ids, user['id'], data.uses_meeting_room)

    first_activity = None
    for idx, dt in enumerate(dates):
        end_dt = (_parse_date(dt) + span).isoformat()
        activity = {
            'id': new_id(), 'title': data.title, 'color': data.color,
            'date': dt, 'start_time': data.start_time, 'end_time': data.end_time,
            'end_date': end_dt,
            'fecha_hora_inicio': _fecha_hora(dt, data.start_time),
            'fecha_hora_fin': _fecha_hora(end_dt, data.end_time),
            'description': data.description or '', 'location': data.location or '',
            'participants': participants, 'uses_meeting_room': data.uses_meeting_room,
            'recurrence': recurrence, 'series_id': series_id,
            'reminder_offsets': _norm_offsets(data.reminder_offsets, data.reminder_minutes, DEFAULT_REMINDER_OFFSETS),
            'reminders_sent': [],
            'created_by': user['id'], 'created_by_name': user['name'],
            'created_by_avatar': user.get('avatar_url'), 'created_at': now_iso(),
        }
        await db.activities.insert_one(activity)
        if data.uses_meeting_room:
            await _ensure_room_reservation(activity, user)
        if idx == 0:
            first_activity = activity

    # Log once for the whole series.
    log_title = data.title + (f' (serie de {len(dates)})' if len(dates) > 1 else '')
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'creó una actividad', log_title, 'activity')
    # Notify each participant once (referencing the first occurrence).
    for p in participants:
        if p['user_id'] == user['id']:
            continue
        await create_notification(p['user_id'], 'actividad_asignada',
                                  f"{user['name']} te asignó a '{data.title}'",
                                  related_id=first_activity['id'], related_type='activity',
                                  actor_name=user['name'], actor_avatar=user.get('avatar_url'))

    saved = await db.activities.find_one({'id': first_activity['id']}, {'_id': 0})
    result = serialize_doc(saved)
    result['series_count'] = len(dates)
    return result


@router.put('/{activity_id}')
async def update_activity(activity_id: str, data: ActivityInput, user=Depends(get_current_user)):
    a = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Actividad no encontrada')
    date0, end0 = _rango(data, prev=a)
    participants = await _build_participants(data.participant_ids)
    # Lunes y choques de sala en cada día del rango, excluyendo esta actividad.
    await _check_conflicts_rango(date0, end0, data.start_time, data.end_time,
                                 data.participant_ids, a.get('created_by'), data.uses_meeting_room,
                                 exclude_activity_id=activity_id)
    # preserve existing response status
    prev = {p['user_id']: p['status'] for p in a.get('participants', [])}
    for p in participants:
        if p['user_id'] in prev:
            p['status'] = prev[p['user_id']]
    # Field omitted (older cached client) -> keep whatever the activity already had.
    _existing_offsets = a.get('reminder_offsets')
    if not isinstance(_existing_offsets, list):
        _existing_offsets = _norm_offsets(None, a.get('reminder_minutes'), DEFAULT_REMINDER_OFFSETS)
    new_offsets = _norm_offsets(data.reminder_offsets, data.reminder_minutes, _existing_offsets)
    updates = {
        'title': data.title, 'color': data.color, 'date': date0,
        'start_time': data.start_time, 'end_time': data.end_time,
        'end_date': end0,
        'fecha_hora_inicio': _fecha_hora(date0, data.start_time),
        'fecha_hora_fin': _fecha_hora(end0, data.end_time),
        'description': data.description or '', 'location': data.location or '',
        'participants': participants, 'uses_meeting_room': data.uses_meeting_room,
        'reminder_offsets': new_offsets,
    }
    # Re-arm reminders whenever the schedule or the reminder set changes.
    if (a.get('date') != date0 or a.get('start_time') != data.start_time
            or sorted(_existing_offsets) != sorted(new_offsets)):
        updates['reminders_sent'] = []
    await db.activities.update_one(
        {'id': activity_id},
        {'$set': updates, '$unset': {'reminder_minutes': '', 'reminder_sent': ''}},
    )
    saved = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    # Reconcile the meeting-room reservation tied to this activity.
    await db.reservations.delete_many({'activity_id': activity_id})
    if data.uses_meeting_room:
        await _ensure_room_reservation(saved, user)
    return serialize_doc(saved)


@router.delete('/{activity_id}')
async def delete_activity(activity_id: str, user=Depends(get_current_user)):
    a = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Actividad no encontrada')
    await db.activities.delete_one({'id': activity_id})
    await db.reservations.delete_many({'activity_id': activity_id})
    return {'message': 'Actividad eliminada'}


@router.post('/{activity_id}/respond')
async def respond_participation(activity_id: str, data: RespondInput, user=Depends(get_current_user)):
    a = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Actividad no encontrada')
    if data.response not in ('accepted', 'rejected'):
        raise HTTPException(status_code=400, detail='Respuesta inválida')
    found = False
    for p in a.get('participants', []):
        if p['user_id'] == user['id']:
            p['status'] = data.response
            found = True
    if not found:
        raise HTTPException(status_code=403, detail='No eres participante de esta actividad')
    await db.activities.update_one({'id': activity_id}, {'$set': {'participants': a['participants']}})
    if data.response == 'rejected':
        await create_notification(a['created_by'], 'participacion_rechazada',
                                  f"{user['name']} rechazó su participación en '{a['title']}'",
                                  related_id=activity_id, related_type='activity',
                                  actor_name=user['name'], actor_avatar=user.get('avatar_url'))
        await log_activity(user['id'], user['name'], user.get('avatar_url'),
                           'rechazó su participación', a['title'], 'activity')
    return {'message': 'Respuesta registrada', 'status': data.response}