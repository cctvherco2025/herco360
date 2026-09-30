"""Dashboard summary + global search routes."""
from datetime import timedelta
from fastapi import APIRouter, Depends
from core import db, get_current_user, serialize_doc, now_local
from routes_rooms import _derive_room_status
import recurrence as rec

router = APIRouter(tags=['dashboard'])


def _today_str():
    return now_local().strftime('%Y-%m-%d')


@router.get('/dashboard')
async def dashboard(user=Depends(get_current_user)):
    today = _today_str()
    # Today's activities involving the user (created or participant) OR all if admin
    # "hoy" incluye actividades de varios días que ya empezaron y no han
    # terminado, y la repetición de hoy de las series con RRULE
    today_docs = await db.activities.find(rec.filtro_rango(today, today), {'_id': 0}).to_list(500)
    today_acts = sorted(rec.expandir(today_docs, today, today), key=lambda a: a.get('start_time') or '')
    my_today = [a for a in today_acts
                if a['created_by'] == user['id']
                or any(p['user_id'] == user['id'] for p in a.get('participants', []))
                or user['role'] == 'admin']


    # Upcoming (next 7 days, excluding today): actividades y repeticiones que empiezan en ese rango
    tomorrow = (now_local() + timedelta(days=1)).strftime('%Y-%m-%d')
    end = (now_local() + timedelta(days=7)).strftime('%Y-%m-%d')
    up_query = rec.filtro_rango(tomorrow, end)
    if user['role'] != 'admin':
        up_query = {'$and': [up_query, {'$or': [
            {'created_by': user['id']},
            {'participants.user_id': user['id']},
        ]}]}
    up_docs = await db.activities.find(up_query, {'_id': 0}).to_list(2000)
    upcoming = sum(1 for a in rec.expandir(up_docs, tomorrow, end) if a['date'] > today)

    # Room status
    room = await db.rooms.find_one({}, {'_id': 0})
    room_status = 'Disponible'
    room_name = 'Sala de Juntas'
    if room:
        room_status, _ = await _derive_room_status(room['id'])
        room_name = room['name']

    # Pending users (admin relevant)
    pending_users = await db.users.count_documents({'status': 'pending'})

    # Unread notifications
    unread = await db.notifications.count_documents({'user_id': user['id'], 'read': False})

    # Recent activity feed
    recent = await db.activity_log.find({}, {'_id': 0}).sort('created_at', -1).to_list(8)

    return {
        'stats': {
            'today_count': len(my_today),
            'upcoming_count': upcoming,
            'room_status': room_status,
            'room_name': room_name,
            'pending_users': pending_users,
            'unread_notifications': unread,
        },
        'today_activities': serialize_doc(my_today),
        'recent_activity': serialize_doc(recent),
    }


@router.get('/search')
async def search(q: str = '', user=Depends(get_current_user)):
    if not q or len(q.strip()) < 1:
        return {'activities': [], 'users': []}
    rx = {'$regex': q.strip(), '$options': 'i'}
    activities = await db.activities.find({'title': rx}, {'_id': 0}).limit(8).to_list(8)
    users = await db.users.find(
        {'$or': [{'name': rx}, {'email': rx}], 'status': 'approved'},
        {'_id': 0, 'password_hash': 0}).limit(8).to_list(8)
    return {'activities': serialize_doc(activities), 'users': serialize_doc(users)}
