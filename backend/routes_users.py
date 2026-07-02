"""User management routes."""
from fastapi import APIRouter, HTTPException, Depends
from core import (db, get_current_user, require_admin, serialize_doc, now_iso,
                  hash_password, new_id, require_access_manager, GATED_MODULES,
                  can_access_inventory, can_access_reports)
from models import ProfileUpdate, RoleUpdate, AdminUserCreate, AdminUserUpdate, ModuleAccessUpdate
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


def _effective_access(u):
    return {'inventario': can_access_inventory(u), 'reportes': can_access_reports(u)}


@router.get('/access')
async def list_access(manager=Depends(require_access_manager)):
    """Users + their effective access to gated modules (for the access-management panel)."""
    users = await db.users.find({'status': 'approved'}, {'_id': 0, 'password_hash': 0}).sort('name', 1).to_list(500)
    out = []
    for u in users:
        cargo = (u.get('position') or '').strip()
        locked = u.get('role') == 'admin' or cargo == 'Director comercial'
        out.append({
            'id': u['id'], 'name': u['name'], 'email': u.get('email'),
            'position': u.get('position'), 'area': u.get('area'),
            'avatar_url': u.get('avatar_url'), 'role': u.get('role'),
            'locked': locked,  # full-access roles cannot be edited
            'module_access': u.get('module_access') or {},
            'access': _effective_access(u),
        })
    return serialize_doc(out)


@router.patch('/{user_id}/module-access')
async def set_module_access(user_id: str, data: ModuleAccessUpdate, manager=Depends(require_access_manager)):
    if data.module not in GATED_MODULES:
        raise HTTPException(status_code=400, detail='Módulo no válido')
    target = await db.users.find_one({'id': user_id}, {'_id': 0})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    cargo = (target.get('position') or '').strip()
    if target.get('role') == 'admin' or cargo == 'Director comercial':
        raise HTTPException(status_code=400, detail='Este rol ya tiene acceso total; no se puede modificar')
    module_access = dict(target.get('module_access') or {})
    if data.enabled is None:
        module_access.pop(data.module, None)  # reset to role default
    else:
        module_access[data.module] = bool(data.enabled)
    await db.users.update_one({'id': user_id}, {'$set': {'module_access': module_access}})
    updated = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    await log_activity(manager['id'], manager['name'], manager.get('avatar_url'),
                       'actualizó accesos de', updated['name'], 'user')
    return {'id': updated['id'], 'module_access': module_access, 'access': _effective_access(updated)}


MANAGER_POSITIONS = {'Jefe', 'Gerente', 'Director comercial'}


@router.get('/team')
async def team_calendars(user=Depends(get_current_user)):
    """Calendars a manager may overlay: same-área members (admins & Director comercial see all)."""
    is_admin = user.get('role') == 'admin'
    sees_all = is_admin or (user.get('position') or '').strip() == 'Director comercial'
    if not sees_all and user.get('position') not in MANAGER_POSITIONS:
        return []
    q = {'status': 'approved', 'id': {'$ne': user['id']}}
    if not sees_all:
        q['area'] = user.get('area')
    members = await db.users.find(q, {'_id': 0, 'password_hash': 0}).sort('name', 1).to_list(300)
    return serialize_doc([{
        'id': m['id'], 'name': m['name'], 'area': m.get('area'),
        'position': m.get('position'), 'avatar_url': m.get('avatar_url'),
    } for m in members])


@router.post('')
async def create_user(data: AdminUserCreate, admin=Depends(require_admin)):
    email = data.email.lower()
    if await db.users.find_one({'email': email}):
        raise HTTPException(status_code=400, detail='El correo ya está registrado')
    role = data.role if data.role in ('admin', 'user') else 'user'
    sucursal = (data.sucursal or '') if (data.area == 'Tienda') else 'Casa Matriz'
    area = 'Casa Matriz' if (data.position == 'Director comercial') else (data.area or '')
    doc = {
        'id': new_id(),
        'name': data.name,
        'email': email,
        'password_hash': hash_password(data.password),
        'role': role,
        'status': 'approved',
        'position': data.position or 'Colaborador',
        'area': area,
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
    # Director comercial oversees the whole company -> área fixed to "Casa Matriz".
    if updates.get('position') == 'Director comercial':
        updates['area'] = 'Casa Matriz'
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
    # Director comercial oversees the whole company -> área fixed to "Casa Matriz".
    eff_position = updates.get('position', target.get('position'))
    if eff_position == 'Director comercial':
        updates['area'] = 'Casa Matriz'
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
