"""Activity (Agenda) routes."""
from fastapi import APIRouter, HTTPException, Depends
from core import db, get_current_user, serialize_doc, new_id, now_iso
from models import ActivityInput, RespondInput
from notifications import create_notification, log_activity

router = APIRouter(prefix='/activities', tags=['activities'])


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
    room = await db.rooms.find_one({}, {'_id': 0})
    if not room:
        return
    reservation = {
        'id': new_id(), 'room_id': room['id'], 'room_name': room['name'],
        'activity_id': activity['id'], 'title': activity['title'],
        'date': activity['date'], 'start_time': activity['start_time'],
        'end_time': activity['end_time'], 'status': 'Reservada',
        'reserved_by': actor['id'], 'reserved_by_name': actor['name'],
        'notes': activity.get('description', ''), 'created_at': now_iso(),
    }
    await db.reservations.insert_one(reservation)
    await log_activity(actor['id'], actor['name'], actor.get('avatar_url'),
                       'reservó la Sala de Juntas', activity['title'], 'reservation')
    for p in activity.get('participants', []):
        await create_notification(p['user_id'], 'sala_reservada',
                                  f"Sala de Juntas reservada para '{activity['title']}'",
                                  related_id=reservation['id'], related_type='reservation',
                                  actor_name=actor['name'], actor_avatar=actor.get('avatar_url'))


@router.get('')
async def list_activities(start: str = None, end: str = None, category: str = None,
                          mine: bool = False, user=Depends(get_current_user)):
    query = {}
    if start and end:
        query['date'] = {'$gte': start, '$lte': end}
    if category:
        query['category'] = category
    if mine:
        query['$or'] = [{'created_by': user['id']}, {'participants.user_id': user['id']}]
    activities = await db.activities.find(query, {'_id': 0}).sort('date', 1).to_list(1000)
    return serialize_doc(activities)


@router.get('/{activity_id}')
async def get_activity(activity_id: str, user=Depends(get_current_user)):
    a = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Actividad no encontrada')
    return serialize_doc(a)


@router.post('')
async def create_activity(data: ActivityInput, user=Depends(get_current_user)):
    participants = await _build_participants(data.participant_ids)
    activity = {
        'id': new_id(), 'title': data.title, 'color': data.color,
        'date': data.date, 'start_time': data.start_time, 'end_time': data.end_time,
        'description': data.description or '', 'location': data.location or '',
        'participants': participants, 'uses_meeting_room': data.uses_meeting_room,
        'created_by': user['id'], 'created_by_name': user['name'],
        'created_by_avatar': user.get('avatar_url'), 'created_at': now_iso(),
    }
    await db.activities.insert_one(activity)
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'creó una actividad', data.title, 'activity')
    for p in participants:
        if p['user_id'] == user['id']:
            continue
        await create_notification(p['user_id'], 'actividad_asignada',
                                  f"{user['name']} te asignó a '{data.title}'",
                                  related_id=activity['id'], related_type='activity',
                                  actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    if data.uses_meeting_room:
        await _ensure_room_reservation(activity, user)
    saved = await db.activities.find_one({'id': activity['id']}, {'_id': 0})
    return serialize_doc(saved)


@router.put('/{activity_id}')
async def update_activity(activity_id: str, data: ActivityInput, user=Depends(get_current_user)):
    a = await db.activities.find_one({'id': activity_id}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Actividad no encontrada')
    participants = await _build_participants(data.participant_ids)
    # preserve existing response status
    prev = {p['user_id']: p['status'] for p in a.get('participants', [])}
    for p in participants:
        if p['user_id'] in prev:
            p['status'] = prev[p['user_id']]
    updates = {
        'title': data.title, 'color': data.color, 'date': data.date,
        'start_time': data.start_time, 'end_time': data.end_time,
        'description': data.description or '', 'location': data.location or '',
        'participants': participants, 'uses_meeting_room': data.uses_meeting_room,
    }
    await db.activities.update_one({'id': activity_id}, {'$set': updates})
    saved = await db.activities.find_one({'id': activity_id}, {'_id': 0})
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
