"""Public (no-auth) endpoints for guest access to the meeting room (Sala de Juntas).

Guests reserve the room by entering only their name. A per-reservation
`guest_token` is returned and required to cancel — so a guest can only cancel
their own bookings (token kept in their browser). Mondays remain reserved for
Dirección Comercial. Guest reservations live in the same `reservations`
collection, so authenticated staff also see them on the internal calendar.
"""
from datetime import datetime
from fastapi import APIRouter, HTTPException
from core import db, serialize_doc, new_id, now_iso
from models import PublicReservationInput, GuestCancelInput

router = APIRouter(prefix='/public', tags=['public'])


@router.get('/room')
async def public_room():
    room = await db.rooms.find_one({}, {'_id': 0})
    if not room:
        return {'room': None}
    return {'room': {'name': room.get('name'), 'location': room.get('location'), 'capacity': room.get('capacity')}}


@router.get('/reservations')
async def public_reservations(start: str = None, end: str = None):
    query = {'status': {'$nin': ['Cancelada']}}
    if start and end:
        query['date'] = {'$gte': start, '$lte': end}
    res = await db.reservations.find(query, {'_id': 0}).sort([('date', 1), ('start_time', 1)]).to_list(500)
    # Expose only the minimal, non-sensitive fields publicly.
    return [{
        'id': r['id'], 'title': r['title'], 'date': r['date'],
        'start_time': r['start_time'], 'end_time': r['end_time'],
        'status': r['status'], 'reserved_by_name': r.get('reserved_by_name', ''),
    } for r in res]


@router.post('/reservations')
async def public_create(data: PublicReservationInput):
    name = (data.guest_name or '').strip()
    if not name:
        raise HTTPException(status_code=400, detail='Indica tu nombre')
    if not (data.title or '').strip():
        raise HTTPException(status_code=400, detail='Indica el motivo de la reserva')
    # Cannot reserve on past dates.
    if data.date < datetime.now().strftime('%Y-%m-%d'):
        raise HTTPException(status_code=400, detail='No puedes reservar la sala en fechas pasadas')
    # Mondays are reserved for Dirección Comercial.
    try:
        if datetime.strptime(data.date, '%Y-%m-%d').weekday() == 0:
            raise HTTPException(status_code=409,
                                detail='Los lunes la Sala de Juntas está reservada para Dirección Comercial')
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail='Fecha inválida')
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=400, detail='La hora de fin debe ser mayor que la de inicio')

    room = await db.rooms.find_one({}, {'_id': 0})
    if not room:
        raise HTTPException(status_code=404, detail='No hay salas configuradas')

    existing = await db.reservations.find(
        {'room_id': room['id'], 'date': data.date, 'status': {'$in': ['Reservada', 'Ocupada']}},
        {'_id': 0}).to_list(100)
    for r in existing:
        if not (data.end_time <= r['start_time'] or data.start_time >= r['end_time']):
            raise HTTPException(status_code=409,
                                detail=f"La sala ya está reservada de {r['start_time']} a {r['end_time']}")

    token = new_id()
    reservation = {
        'id': new_id(), 'room_id': room['id'], 'room_name': room['name'],
        'activity_id': None, 'title': data.title.strip(),
        'date': data.date, 'start_time': data.start_time, 'end_time': data.end_time,
        'status': 'Reservada', 'reserved_by': None, 'reserved_by_name': name,
        'is_guest': True, 'guest_token': token, 'notes': '', 'created_at': now_iso(),
    }
    await db.reservations.insert_one(reservation)
    return {
        'id': reservation['id'], 'guest_token': token, 'title': reservation['title'],
        'date': data.date, 'start_time': data.start_time, 'end_time': data.end_time,
    }


@router.post('/reservations/{reservation_id}/cancel')
async def public_cancel(reservation_id: str, data: GuestCancelInput):
    r = await db.reservations.find_one({'id': reservation_id}, {'_id': 0})
    if not r:
        raise HTTPException(status_code=404, detail='Reserva no encontrada')
    if not r.get('is_guest') or r.get('guest_token') != data.guest_token:
        raise HTTPException(status_code=403, detail='No puedes cancelar esta reserva')
    await db.reservations.update_one({'id': reservation_id}, {'$set': {'status': 'Cancelada'}})
    return {'message': 'Reserva cancelada'}
