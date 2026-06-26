"""User management routes."""
from fastapi import APIRouter, HTTPException, Depends
from core import db, get_current_user, require_admin, serialize_doc, now_iso, hash_password, new_id
from models import ProfileUpdate, RoleUpdate, AdminUserCreate, AdminUserUpdate
from notifications import create_notification, log_activity

router = APIRouter(prefix='/users', tags=['users'])


def avatar_for(name):
    from urllib.parse import quote
    return f"https://ui-avatars.com/api/?name={quote(name)}&background=1e395e&color=fff&bold=true"


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


@router.post('')
async def create_user(data: AdminUserCreate, admin=Depends(require_admin)):
    email = data.email.lower()
    if await db.users.find_one({'email': email}):
        raise HTTPException(status_code=400, detail='El correo ya está registrado')
    role = data.role if data.role in ('admin', 'user') else 'user'
    sucursal = (data.sucursal or '') if (data.area == 'Tienda') else 'Casa Matriz'
    doc = {
        'id': new_id(),
        'name': data.name,
        'email': email,
        'password_hash': hash_password(data.password),
        'role': role,
        'status': 'approved',
        'position': data.position or 'Colaborador',
        'area': data.area or '',
        'sucursal': sucursal,
        'avatar_url': avatar_for(data.name),
        'phone': '',
        'created_at': now_iso(),
    }
    await db.users.insert_one(doc)
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'creó un usuario', data.name, 'user')
    doc.pop('password_hash', None)
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.patch('/me')
async def update_me(data: ProfileUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    # Only "Tienda" area has a sucursal; everyone else is "Casa Matriz".
    if updates.get('area') and updates['area'] != 'Tienda':
        updates['sucursal'] = 'Casa Matriz'
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


@router.patch('/{user_id}')
async def update_user(user_id: str, data: AdminUserUpdate, admin=Depends(require_admin)):
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    payload = data.model_dump(exclude_none=True)
    updates = {}
    if 'email' in payload:
        new_email = payload['email'].lower()
        clash = await db.users.find_one({'email': new_email, 'id': {'$ne': user_id}})
        if clash:
            raise HTTPException(status_code=400, detail='El correo ya está registrado')
        updates['email'] = new_email
    for f in ('name', 'position', 'area', 'sucursal', 'status'):
        if f in payload:
            updates[f] = payload[f]
    if 'role' in payload:
        if payload['role'] not in ('admin', 'user'):
            raise HTTPException(status_code=400, detail='Rol inválido')
        updates['role'] = payload['role']
    if 'password' in payload:
        if len(payload['password']) < 4:
            raise HTTPException(status_code=400, detail='La contraseña debe tener al menos 4 caracteres')
        updates['password_hash'] = hash_password(payload['password'])
    # Only "Tienda" area keeps a sucursal; everyone else is "Casa Matriz".
    eff_area = updates.get('area', target.get('area'))
    if eff_area != 'Tienda':
        updates['sucursal'] = 'Casa Matriz'
    if updates:
        await db.users.update_one({'id': user_id}, {'$set': updates})
    updated = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'editó un usuario', updated['name'], 'user')
    return serialize_doc(updated)


@router.delete('/{user_id}')
async def delete_user(user_id: str, admin=Depends(require_admin)):
    if user_id == admin['id']:
        raise HTTPException(status_code=400, detail='No puedes eliminar tu propia cuenta')
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    await db.users.delete_one({'id': user_id})
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'eliminó un usuario', target['name'], 'user')
    return {'message': 'Usuario eliminado'}
