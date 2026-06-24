"""User management routes."""
from fastapi import APIRouter, HTTPException, Depends
from core import db, get_current_user, require_admin, serialize_doc, now_iso
from models import ProfileUpdate, RoleUpdate
from notifications import create_notification, log_activity

router = APIRouter(prefix='/users', tags=['users'])


@router.get('')
async def list_users(status: str = None, user=Depends(get_current_user)):
    query = {}
    if status:
        query['status'] = status
    users = await db.users.find(query, {'_id': 0, 'password_hash': 0}).sort('created_at', -1).to_list(500)
    return serialize_doc(users)


@router.get('/pending-count')
async def pending_count(user=Depends(get_current_user)):
    count = await db.users.count_documents({'status': 'pending'})
    return {'count': count}


@router.patch('/me')
async def update_me(data: ProfileUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if updates:
        await db.users.update_one({'id': user['id']}, {'$set': updates})
    updated = await db.users.find_one({'id': user['id']}, {'_id': 0, 'password_hash': 0})
    return serialize_doc(updated)


@router.post('/{user_id}/approve')
async def approve_user(user_id: str, admin=Depends(require_admin)):
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    await db.users.update_one({'id': user_id}, {'$set': {'status': 'approved'}})
    await create_notification(user_id, 'usuario_aprobado',
                              'Tu cuenta fue aprobada. ¡Bienvenido a HERCO360!',
                              related_id=user_id, related_type='user',
                              actor_name=admin['name'], actor_avatar=admin.get('avatar_url'))
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'aprobó un usuario', target['name'], 'user')
    return {'message': 'Usuario aprobado'}


@router.post('/{user_id}/reject')
async def reject_user(user_id: str, admin=Depends(require_admin)):
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    await db.users.update_one({'id': user_id}, {'$set': {'status': 'rejected'}})
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'rechazó un usuario', target['name'], 'user')
    return {'message': 'Usuario rechazado'}


@router.patch('/{user_id}/role')
async def change_role(user_id: str, data: RoleUpdate, admin=Depends(require_admin)):
    if data.role not in ('admin', 'user'):
        raise HTTPException(status_code=400, detail='Rol inválido')
    await db.users.update_one({'id': user_id}, {'$set': {'role': data.role}})
    return {'message': 'Rol actualizado'}
