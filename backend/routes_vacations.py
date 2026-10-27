"""Vacaciones y permisos.

Las aprueba el responsable más cercano (mando.responsables_cercanos): los
cargos de mando del área más cercana hacia arriba en el árbol que mandan
sobre la persona; si no hay, el jefe del departamento. Se calculan al pedirla
(y al editarla) y se guardan en la solicitud (`aprobadores`). El jefe del
departamento y sus admins también pueden aprobar cualquiera del departamento.
Las solicitudes de antes (sin `aprobadores`) siguen con la regla del área."""
from datetime import date as date_cls, timedelta
from fastapi import APIRouter, HTTPException, Depends
from core import (db, get_current_user, require_vacaciones_access, serialize_doc, now_iso, new_id, today_local_str,
                  GERENTE_LOGISTICA, RETAIL, departamento_de, es_jefe_depto, es_super_admin, filtro_depto)
from models import VacationRequestInput, VacationReview
from notifications import create_notification, log_activity
import mando

router = APIRouter(prefix='/vacations', tags=['vacations'])

MANAGER_POSITIONS = {'Jefe', 'Gerente', 'Director comercial', GERENTE_LOGISTICA}


TYPE_COLORS = {
    
    'Vacaciones': '#ec9032',
    'Permiso': '#3cbef6',
    'Incapacidad': '#dc2626',
}


def _is_manager(user):
    return user.get('role') == 'admin' or user.get('position') in MANAGER_POSITIONS or mando.es_mando(user)


def _sees_all_areas(user):
    """Admins y el jefe del departamento (Director comercial / Gerente de
    Logística) revisan todas las áreas; el jefe, solo de su departamento."""
    return user.get('role') == 'admin' or es_jefe_depto(user)


async def _avisar_aprobadores(ids, user, mensaje, request_id):
    for uid in dict.fromkeys(ids or []):
        if uid != user['id']:
            await create_notification(uid, 'vacacion_solicitada', mensaje, related_id=request_id, related_type='vacation',
                                      actor_name=user['name'], actor_avatar=user.get('avatar_url'))


def _filtro_por_revisar(user) -> dict:
    """Solicitudes que la persona puede aprobar: todas las del departamento
    (super admin, admins, jefe del departamento) o aquellas en las que es
    aprobador (y las de antes, de su área, si tiene cargo de mando)."""
    base = {'status': 'pending', 'user_id': {'$ne': user['id']}, **filtro_depto(user)}
    if _sees_all_areas(user):
        return base
    ors = [{'aprobadores': user['id']}]
    if _is_manager(user):
        ors.append({'aprobadores': {'$exists': False}, 'area': user.get('area')})
    return {**base, '$or': ors}


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
async def create_request(data: VacationRequestInput, user=Depends(require_vacaciones_access)):
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail='La fecha de fin no puede ser anterior a la de inicio')
    if data.start_date < today_local_str():
        raise HTTPException(status_code=400, detail='No puedes solicitar fechas pasadas')
    if data.type not in TYPE_COLORS:
        raise HTTPException(status_code=400, detail='Tipo inválido')
    doc = {
        'id': new_id(),
        'user_id': user['id'], 'user_name': user['name'],
        'user_avatar': user.get('avatar_url'), 'area': user.get('area', ''),
        'departamento': departamento_de(user),
        'position': user.get('position', ''),
        'start_date': data.start_date, 'end_date': data.end_date,
        'type': data.type, 'reason': (data.reason or '').strip(),
        'status': 'pending',
        'reviewed_by': None, 'reviewed_by_name': None,
        'reviewed_at': None, 'review_comment': None,
        'created_at': now_iso(),
    }
    doc['aprobadores'] = await mando.responsables_cercanos(user)
    await db.vacation_requests.insert_one(doc)
    await _avisar_aprobadores(doc['aprobadores'], user,
                              f"{user['name']} solicitó {data.type} del {data.start_date} al {data.end_date}", doc['id'])
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.get('/mine')
async def my_requests(user=Depends(require_vacaciones_access)):
    rows = await db.vacation_requests.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(200)
    return serialize_doc(rows)


@router.get('/to-review')
async def to_review(user=Depends(require_vacaciones_access)):
    rows = await db.vacation_requests.find(_filtro_por_revisar(user), {'_id': 0}).sort('created_at', 1).to_list(200)
    return serialize_doc(rows)


@router.get('/pending-count')
async def pending_count(user=Depends(require_vacaciones_access)):
    return {'count': await db.vacation_requests.count_documents(_filtro_por_revisar(user))}


async def _load_reviewable(request_id, user):
    req = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Solicitud no encontrada')
    if req['status'] != 'pending':
        raise HTTPException(status_code=400, detail='La solicitud ya fue procesada')
    if req['user_id'] == user['id']:
        raise HTTPException(status_code=403, detail='No puedes autorizar tu propia solicitud')
    mismo = (req.get('departamento') or RETAIL) == departamento_de(user)
    if 'aprobadores' in req:
        es_aprobador = user['id'] in (req.get('aprobadores') or [])
    else:  # solicitudes de antes: regla del área
        es_aprobador = _is_manager(user) and req.get('area') == user.get('area')
    allowed = es_super_admin(user) or (mismo and (_sees_all_areas(user) or es_aprobador))
    if not allowed:
        raise HTTPException(status_code=403, detail='Esta solicitud la aprueba el responsable de su área')
    return req


@router.post('/{request_id}/approve')
async def approve_request(request_id: str, data: VacationReview, user=Depends(require_vacaciones_access)):
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
                       'aprobó una solicitud de vacaciones', req['user_name'], 'vacation',
                       req.get('departamento') or RETAIL)
    updated = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    return serialize_doc(updated)


@router.post('/{request_id}/reject')
async def reject_request(request_id: str, data: VacationReview, user=Depends(require_vacaciones_access)):
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
async def calendar(start: str, end: str, user=Depends(require_vacaciones_access)):
    """Vacaciones/permisos visibles en el calendario, según jerarquía: el
    jefe del departamento y sus admins ven todo el departamento; un cargo de
    mando, las de la gente sobre la que manda (su área y subáreas); los demás,
    las suyas."""
    q = {
        'status': {'$in': ['approved', 'pending']},
        'start_date': {'$lte': end},
        'end_date': {'$gte': start},
        **filtro_depto(user),
    }
    if _sees_all_areas(user):
        pass
    elif mando.es_mando(user):
        q['user_id'] = {'$in': [user['id']] + await mando.ids_subordinados(user)}
    else:
        q['user_id'] = user['id']
    rows = await db.vacation_requests.find(q, {'_id': 0}).sort('start_date', 1).to_list(500)
    return serialize_doc(rows)

@router.put('/{request_id}')
async def update_request(request_id: str, data: VacationRequestInput, user=Depends(require_vacaciones_access)):
    req = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Solicitud no encontrada')
    if req['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail='No puedes editar solicitudes de otro usuario')
    if data.end_date < data.start_date:
        raise HTTPException(status_code=400, detail='La fecha de fin no puede ser anterior a la de inicio')
    if data.start_date < today_local_str():
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
    aprobadores = await mando.responsables_cercanos(user)
    await db.vacation_requests.update_one({'id': request_id}, {'$set': {
        'aprobadores': aprobadores,
        'start_date': data.start_date, 'end_date': data.end_date,
        'type': data.type, 'reason': (data.reason or '').strip(),
        'status': 'pending',
        'reviewed_by': None, 'reviewed_by_name': None,
        'reviewed_at': None, 'review_comment': None,
    }})
    if was_approved:
        # Estaba aprobada: hay que borrar las actividades ya pintadas en el calendario y notificar de nuevo.
        await db.activities.delete_many({'vacation_id': request_id})
        await _avisar_aprobadores(
            aprobadores, user,
            f"{user['name']} modificó su solicitud de {data.type} ({data.start_date} al {data.end_date}), requiere nueva autorización",
            request_id)
    updated = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    return serialize_doc(updated)


@router.delete('/{request_id}')
async def delete_request(request_id: str, user=Depends(require_vacaciones_access)):
    req = await db.vacation_requests.find_one({'id': request_id}, {'_id': 0})
    if not req:
        raise HTTPException(status_code=404, detail='Solicitud no encontrada')
    if req['user_id'] != user['id']:
        raise HTTPException(status_code=403, detail='No puedes eliminar solicitudes de otro usuario')
    if req['status'] == 'approved':
        raise HTTPException(status_code=400, detail='No puedes eliminar una solicitud ya aprobada. Edítala primero.')
    await db.vacation_requests.delete_one({'id': request_id})
    return {'ok': True}