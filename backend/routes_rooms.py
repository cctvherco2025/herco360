"""Meeting room + reservation routes."""
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from core import db, get_current_user, serialize_doc, new_id, now_iso
from models import ReservationInput
from notifications import create_notification, log_activity

router = APIRouter(prefix='/rooms', tags=['rooms'])
res_router = APIRouter(prefix='/reservations', tags=['reservations'])


def _today_str():
    return datetime.now().strftime('%Y-%m-%d')


def _now_hm():
    return datetime.now().strftime('%H:%M')


async def _derive_room_status(room_id):
    """Compute current status from today's active reservations."""
    today = _today_str()
    now = _now_hm()
    active = await db.reservations.find(
        {'room_id': room_id, 'date': today, 'status': {'$in': ['Reservada', 'Ocupada']}},
        {'_id': 0}).to_list(100)
    for r in active:
        if r['start_time'] <= now <= r['end_time']:
            return 'Ocupada', r
    upcoming = [r for r in active if r['start_time'] > now]
    if upcoming:
        upcoming.sort(key=lambda x: x['start_time'])
        return 'Reservada', upcoming[0]
    return 'Disponible', None


@router.get('')
async def list_rooms(user=Depends(get_current_user)):
    rooms = await db.rooms.find({}, {'_id': 0}).to_list(50)
    result = []
    for room in rooms:
        status, current = await _derive_room_status(room['id'])
        room['current_status'] = status
        room['current_reservation'] = serialize_doc(current)
        result.append(room)
    return serialize_doc(result)


@router.get('/{room_id}/status')
async def room_status(room_id: str, user=Depends(get_current_user)):
    status, current = await _derive_room_status(room_id)
    return {'status': status, 'current_reservation': serialize_doc(current)}


@res_router.get('')
async def list_reservations(date: str = None, room_id: str = None, upcoming: bool = False,
                            user=Depends(get_current_user)):
    query = {}
    if date:
        query['date'] = date
    if room_id:
        query['room_id'] = room_id
    if upcoming:
        query['date'] = {'$gte': _today_str()}
    reservations = await db.reservations.find(query, {'_id': 0}).sort([('date', 1), ('start_time', 1)]).to_list(500)
    return serialize_doc(reservations)


@res_router.post('')
async def create_reservation(data: ReservationInput, user=Depends(get_current_user)):
    # Cannot reserve on past dates.
    if data.date < _today_str():
        raise HTTPException(status_code=400, detail='No puedes reservar la sala en fechas pasadas')
    # Mondays are reserved for Dirección Comercial's weekly meeting.
    try:
        if datetime.strptime(data.date, '%Y-%m-%d').weekday() == 0:
            raise HTTPException(status_code=409,
                                detail='Los lunes la Sala de Juntas está reservada para la reunión de Dirección Comercial')
    except HTTPException:
        raise
    except Exception:
        pass
    room = None
    if data.room_id:
        room = await db.rooms.find_one({'id': data.room_id}, {'_id': 0})
    if not room:
        room = await db.rooms.find_one({}, {'_id': 0})
    if not room:
        raise HTTPException(status_code=404, detail='No hay salas configuradas')
    # overlap check (active reservations)
    existing = await db.reservations.find(
        {'room_id': room['id'], 'date': data.date, 'status': {'$in': ['Reservada', 'Ocupada']}},
        {'_id': 0}).to_list(100)
    for r in existing:
        if not (data.end_time <= r['start_time'] or data.start_time >= r['end_time']):
            raise HTTPException(status_code=409,
                                detail=f"La sala ya está reservada de {r['start_time']} a {r['end_time']}")
    reservation = {
        'id': new_id(), 'room_id': room['id'], 'room_name': room['name'],
        'activity_id': data.activity_id, 'title': data.title,
        'date': data.date, 'start_time': data.start_time, 'end_time': data.end_time,
        'status': 'Reservada', 'reserved_by': user['id'], 'reserved_by_name': user['name'],
        'notes': data.notes or '', 'created_at': now_iso(),
    }
    await db.reservations.insert_one(reservation)
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'reservó la Sala de Juntas', data.title, 'reservation')
    saved = await db.reservations.find_one({'id': reservation['id']}, {'_id': 0})
    return serialize_doc(saved)


@res_router.post('/{reservation_id}/cancel')
async def cancel_reservation(reservation_id: str, user=Depends(get_current_user)):
    r = await db.reservations.find_one({'id': reservation_id}, {'_id': 0})
    if not r:
        raise HTTPException(status_code=404, detail='Reserva no encontrada')
    await db.reservations.update_one({'id': reservation_id}, {'$set': {'status': 'Cancelada'}})
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'canceló una reserva', r['title'], 'reservation')
    if r.get('reserved_by') and r['reserved_by'] != user['id']:
        await create_notification(r['reserved_by'], 'sala_cancelada',
                                  f"La reserva '{r['title']}' fue cancelada",
                                  related_id=reservation_id, related_type='reservation',
                                  actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    return {'message': 'Reserva cancelada'}


@res_router.post('/{reservation_id}/finalize')
async def finalize_reservation(reservation_id: str, user=Depends(get_current_user)):
    r = await db.reservations.find_one({'id': reservation_id}, {'_id': 0})
    if not r:
        raise HTTPException(status_code=404, detail='Reserva no encontrada')
    await db.reservations.update_one({'id': reservation_id}, {'$set': {'status': 'Finalizada'}})
    return {'message': 'Reserva finalizada'}
