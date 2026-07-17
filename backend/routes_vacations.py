"""Vacation / leave requests with area-manager authorization."""
from datetime import date as date_cls, timedelta
from fastapi import APIRouter, HTTPException, Depends
from core import db, get_current_user, serialize_doc, now_iso, new_id
from models import VacationRequestInput, VacationReview
from notifications import create_notification, notify_area_managers, log_activity

router = APIRouter(prefix='/vacations', tags=['vacations'])

MANAGER_POSITIONS = {'Jefe', 'Gerente', 'Director comercial'}


TYPE_COLORS = {
    
    'Vacaciones': '#ec9032',
    'Permiso': '#3cbef6',
    'Incapacidad': '#dc2626',
}


def _is_manager(user):
    return user.get('role') == 'admin' or user.get('position') in MANAGER_POSITIONS


def _sees_all_areas(user):
    """Admins and the Director comercial can review every area (no area restriction)."""
    return user.get('role') == 'admin' or (user.get('position') or '').strip() == 'Director comercial'


def _date_range(start, end):
    s = date_cls.fromisoformat(start)
    e = date_cls.fromisoformat(end)
    days = []
    d = s
    while d <= e:
        days.append(d.isoformat())
        d += timedelta(days=1)
    return days


@router.post('')
async def create_request(data: VacationRequestInput, user=Depends(get_current_user)):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail='La fecha de fin no puede ser anterior a la de inicio')
    if data.start_date < date_cls.today().isoformat():
        raise HTTPException(status_code=400, detail='No puedes solicitar fechas pasadas')
    if data.type not in TYPE_COLORS:
        raise HTTPException(status_code=400, detail='Tipo inválido')
    doc = {
        'id': new_id(),
        'user_id': user['id'], 'user_name': user['name'],
        'user_avatar': user.get('avatar_url'), 'area': user.get('area', ''),
        'position': user.get('position', ''),
        'start_date': data.start_date, 'end_date': data.end_date,
        'type': data.type, 'reason': (data.reason or '').strip(),
        'status': 'pending',
        'reviewed_by': None, 'reviewed_by_name': None,
        'reviewed_at': None, 'review_comment': None,
        'created_at': now_iso(),
    }
    await db.vacation_requests.insert_one(doc)
    await notify_area_managers(
        user.get('area', ''), 'vacacion_solicitada',
        f"{user['name']} solicitó {data.type} del {data.start_date} al {data.end_date}",
        exclude_user_id=user['id'], related_id=doc['id'], related_type='vacation',
        actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.get('/mine')
async def my_requests(user=Depends(get_current_user)):
    rows = await db.vacation_requests.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return serialize_doc(rows)


@router.get('/to-review')
async def to_review(user=Depends(get_current_user)):
    if not _is_manager(user):
        return []
    q = {'status': 'pending', 'user_id': {'$ne': user['id']}}
    if not _sees_all_areas(user):
        q['area'] = user.get('area')
    rows = await db.vacation_requests.find(q, {'_id': 0}).sort('created_at', 1).to_list(200)
    return serialize_doc(rows)


@router.get('/pending-count')
async def pending_count(user=Depends(get_current_user)):
    if not _is_manager(user):
        return {'count': 0}
    q = {'status': 'pending', 'user_id': {'$ne': user['id']}}
    if not _sees_all_areas(user):
        q['area'] = user.get('area')
    return {'count': await db.vacation_requests.count_documents(q)}


async def _load_reviewable(request_id, user):
    req = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Solicitud no encontrada')
    if req['status'] != 'pending':
        raise HTTPException(status_code=400, detail='La solicitud ya fue procesada')
    if req['user_id'] == user['id']:
        raise HTTPException(status_code=403, detail='No puedes autorizar tu propia solicitud')
    allowed = _sees_all_areas(user) or (
        user.get('position') in MANAGER_POSITIONS and req.get('area') == user.get('area'))
    if not allowed:
        raise HTTPException(status_code=403, detail='No puedes autorizar solicitudes de otra área')
    return req


@router.post('/{request_id}/approve')
async def approve_request(request_id: str, data: VacationReview, user=Depends(get_current_user)):
    req = await _load_reviewable(request_id, user)
    await db.vacation_requests.update_one({'id': request_id}, {'$set': {
        'status': 'approved', 'reviewed_by': user['id'], 'reviewed_by_name': user['name'],
        'reviewed_at': now_iso(), 'review_comment': (data.comment or '').strip(),
    }})
    # Paint the vacation on the requester's calendar (one full-day marker per day).
    color = TYPE_COLORS.get(req['type'], '#ec9032')
    for dt in _date_range(req['start_date'], req['end_date']):
        await db.activities.insert_one({
            'id': new_id(), 'title': f"{req['type']} — {req['user_name']}", 'color': color,
            'date': dt, 'start_time': '08:00', 'end_time': '18:00',
            'description': req.get('reason', ''), 'location': '',
            'participants': [], 'uses_meeting_room': False,
            'recurrence': 'none', 'series_id': None,
            'is_vacation': True, 'vacation_id': req['id'],
            'created_by': req['user_id'], 'created_by_name': req['user_name'],
            'created_by_avatar': req.get('user_avatar'), 'created_at': now_iso(),
        })
    await create_notification(
        req['user_id'], 'vacacion_aprobada',
        f"{user['name']} aprobó tu solicitud de {req['type']} ({req['start_date']} al {req['end_date']})",
        related_id=req['id'], related_type='vacation',
        actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'aprobó una solicitud de vacaciones', req['user_name'], 'vacation')
    updated = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    return serialize_doc(updated)


@router.post('/{request_id}/reject')
async def reject_request(request_id: str, data: VacationReview, user=Depends(get_current_user)):
    req = await _load_reviewable(request_id, user)
    await db.vacation_requests.update_one({'id': request_id}, {'$set': {
        'status': 'rejected', 'reviewed_by': user['id'], 'reviewed_by_name': user['name'],
        'reviewed_at': now_iso(), 'review_comment': (data.comment or '').strip(),
    }})
    await create_notification(
        req['user_id'], 'vacacion_rechazada',
        f"{user['name']} rechazó tu solicitud de {req['type']} ({req['start_date']} al {req['end_date']})",
        related_id=req['id'], related_type='vacation',
        actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    updated = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    return serialize_doc(updated)

@router.get('/calendar')
async def calendar(start: str, end: str, user=Depends(get_current_user)):
    """Vacaciones/permisos visibles en el calendario, según jerarquía:
    admin y Director comercial ven todas las áreas; jefes/gerentes ven su área;
    un usuario normal (sin posición de mando) solo ve las suyas."""
    q = {
        'status': {'$in': ['approved', 'pending']},
        'start_date': {'$lte': end},
        'end_date': {'$gte': start},
    }
    if _sees_all_areas(user):
        pass
    elif _is_manager(user):
        q['area'] = user.get('area')
    else:
        q['user_id'] = user['id']
    rows = await db.vacation_requests.find(q, {'_id': 0}).sort('start_date', 1).to_list(500)
    return serialize_doc(rows)

@router.put('/{request_id}')
async def update_request(request_id: str, data: VacationRequestInput, user=Depends(get_current_user)):
    req = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Solicitud no encontrada')
    if req['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail='No puedes editar solicitudes de otro usuario')
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail='La fecha de fin no puede ser anterior a la de inicio')
    if data.start_date < date_cls.today().isoformat():
        raise HTTPException(status_code=400, detail='No puedes solicitar fechas pasadas')
    if data.type not in TYPE_COLORS:
        raise HTTPException(status_code=400, detail='Tipo inválido')
    overlap = await db.vacation_requests.find_one({
        'id': {'$ne': request_id},
        'user_id': user['id'],
        'status': {'$in': ['pending', 'approved']},
        'start_date': {'$lte': data.end_date},
        'end_date': {'$gte': data.start_date},
    })
    if overlap:
        raise HTTPException(
            status_code=400,
            detail=f"Ya tienes una solicitud de {overlap['type']} ({overlap['status']}) que se traslapa con esas fechas")

    was_approved = req['status'] == 'approved'
    await db.vacation_requests.update_one({'id': request_id}, {'$set': {
        'start_date': data.start_date, 'end_date': data.end_date,
        'type': data.type, 'reason': (data.reason or '').strip(),
        'status': 'pending',
        'reviewed_by': None, 'reviewed_by_name': None,
        'reviewed_at': None, 'review_comment': None,
    }})
    if was_approved:
        # Estaba aprobada: hay que borrar las actividades ya pintadas en el calendario y notificar de nuevo.
        await db.activities.delete_many({'vacation_id': request_id})
        await notify_area_managers(
            user.get('area', ''), 'vacacion_solicitada',
            f"{user['name']} modificó su solicitud de {data.type} ({data.start_date} al {data.end_date}), requiere nueva autorización",
            exclude_user_id=user['id'], related_id=request_id, related_type='vacation',
            actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    updated = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    return serialize_doc(updated)


@router.delete('/{request_id}')
async def delete_request(request_id: str, user=Depends(get_current_user)):
    req = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Solicitud no encontrada')
    if req['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail='No puedes eliminar solicitudes de otro usuario')
    if req['status'] == 'approved':
        raise HTTPException(status_code=400, detail='No puedes eliminar una solicitud ya aprobada. Edítala primero.')
    await db.vacation_requests.delete_one({'id': request_id})
    return {'ok': True}