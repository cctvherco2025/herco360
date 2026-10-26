"""User management routes."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from pydantic import BaseModel
from core import (db, get_current_user, require_admin, serialize_doc, now_iso,
                  hash_password, new_id, require_access_manager, GATED_MODULES,
                  can_access_inventory, can_access_reports, can_access_cams, can_access_formulario,
                  can_access_rutina, can_access_formularios_principal, can_access_promociones_mes,
                  can_create_custom_formulario, can_edit_rutina_schema, can_edit_flos_schema,
                  can_access_vacaciones, can_admin_promos, can_fill_guardias,
                  can_fill_recorridos, can_fill_etiquetas, can_admin_activos,
                  RETAIL, LOGISTICA, DEPARTAMENTOS, GERENTE_LOGISTICA, CARGOS_LOGISTICA,
                  AREAS_LOGISTICA_INICIALES, departamento_de, es_logistica, es_jefe_depto,
                  filtro_depto, mismo_depto)
from models import ProfileUpdate, RoleUpdate, AdminUserCreate, AdminUserUpdate, ModuleAccessUpdate
from notifications import create_notification, log_activity
from routes_groups import quitar_de_grupos

router = APIRouter(prefix='/users', tags=['users'])


def avatar_for(name):
    from urllib.parse import quote
    return f"https://ui-avatars.com/api/?name={quote(name)}&background=1e395e&color=fff&bold=true"


# ---- Departamentos ----
# Usuarios: los admins gestionan a todos; el Gerente de Logística aprueba,
# crea y edita a la gente de Logística (no a otros gerentes ni admins, no
# da rol de admin ni cambia el departamento). Eliminar sigue siendo de admins.
async def require_gestor_usuarios(user=Depends(get_current_user)):
    if user.get('role') == 'admin' or (es_jefe_depto(user) and es_logistica(user)):
        return user
    raise HTTPException(status_code=403, detail='Se requieren permisos de administrador')


def _puede_gestionar(gestor, target) -> bool:
    if gestor.get('role') == 'admin':
        return True
    return (es_logistica(target) and target.get('role') != 'admin'
            and (target.get('position') or '').strip() != GERENTE_LOGISTICA)


async def areas_logistica():
    doc = await db.config.find_one({'_id': 'areas_logistica'}) or {}
    return doc.get('areas') or list(AREAS_LOGISTICA_INICIALES)


async def normalizar_depto(datos: dict, depto: str):
    """Ajusta cargo, área y tienda al departamento (en `datos`, in place).
    Retail: Director comercial → área Casa Matriz; solo el área Tienda tiene
    sucursal. Logística: cargos y áreas de su organigrama, sin sucursal; el
    Gerente de Logística va en el área Gerencia."""
    cargo = (datos.get('position') or '').strip()
    if depto == LOGISTICA:
        if cargo and cargo not in CARGOS_LOGISTICA:
            raise HTTPException(status_code=400, detail=f'En Logística el cargo debe ser: {", ".join(CARGOS_LOGISTICA)}')
        if cargo == GERENTE_LOGISTICA:
            datos['area'] = 'Gerencia'
        elif datos.get('area') not in await areas_logistica():
            raise HTTPException(status_code=400, detail='Elige un área de Logística')
        datos['sucursal'] = 'Casa Matriz'
    else:
        if cargo == GERENTE_LOGISTICA:
            raise HTTPException(status_code=400, detail='Ese cargo es de Logística')
        if cargo == 'Director comercial':
            datos['area'] = 'Casa Matriz'
        if datos.get('area') != 'Tienda':
            datos['sucursal'] = 'Casa Matriz'


class AreasInput(BaseModel):
    areas: List[str]


@router.get('/organizacion')
async def organizacion():
    """Departamentos con sus cargos y áreas (para registrarse y editar
    usuarios). Público: lo usa la pantalla de registro."""
    return {
        'departamentos': list(DEPARTAMENTOS),
        'logistica': {'cargos': CARGOS_LOGISTICA, 'areas': await areas_logistica()},
    }


@router.put('/organizacion/areas-logistica')
async def guardar_areas_logistica(data: AreasInput, user=Depends(get_current_user)):
    """Áreas del organigrama de Logística: las editan un admin o el Gerente de Logística."""
    if not (user.get('role') == 'admin' or (es_jefe_depto(user) and es_logistica(user))):
        raise HTTPException(status_code=403, detail='Solo un admin o el Gerente de Logística')
    areas = []
    for a in data.areas:
        a = (a or '').strip()[:60]
        if a and a.lower() not in {x.lower() for x in areas} and a != 'Gerencia':
            areas.append(a)
    if not areas:
        raise HTTPException(status_code=400, detail='Deja al menos un área')
    await db.config.update_one({'_id': 'areas_logistica'}, {'$set': {'areas': areas}}, upsert=True)
    return {'areas': areas}


@router.get('')
async def list_users(status: str = None, user=Depends(get_current_user)):
    # cada departamento ve solo a su gente (los admins ven a todos)
    query = filtro_depto(user)
    if status:
        query['status'] = status
    users = await db.users.find(query, {'_id': 0, 'password_hash': 0}).sort('created_at', -1).to_list(500)
    return serialize_doc(users)


@router.get('/pending-count')
async def pending_count(user=Depends(get_current_user)):
    count = await db.users.count_documents({'status': 'pending', **filtro_depto(user)})
    return {'count': count}


def _effective_access(u):
    return {
        'inventario': can_access_inventory(u), 'reportes': can_access_reports(u),
        'cams': can_access_cams(u), 'formulario': can_access_formulario(u),
        'rutina': can_access_rutina(u),
        'formularios_principal': can_access_formularios_principal(u),
        'promociones_mes': can_access_promociones_mes(u),
        'formularios_custom': can_create_custom_formulario(u),
        'rutina_schema': can_edit_rutina_schema(u),
        'formulario_schema': can_edit_flos_schema(u),
        'vacaciones': can_access_vacaciones(u),
        'promociones_admin': can_admin_promos(u),
        'guardias': can_fill_guardias(u),
        'recorridos': can_fill_recorridos(u),
        'etiquetas': can_fill_etiquetas(u),
        'activos': can_admin_activos(u),
    }


@router.get('/access')
async def list_access(manager=Depends(require_access_manager)):
    """Users + their effective access to gated modules (for the access-management panel)."""
    users = await db.users.find({'status': 'approved', **filtro_depto(manager)}, {'_id': 0, 'password_hash': 0}).sort('name', 1).to_list(500)
    out = []
    for u in users:
        locked = u.get('role') == 'admin' or es_jefe_depto(u)
        out.append({
            'id': u['id'], 'name': u['name'], 'email': u.get('email'),
            'position': u.get('position'), 'area': u.get('area'),
            'departamento': departamento_de(u),
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
    if manager.get('role') != 'admin' and not mismo_depto(manager, target):
        raise HTTPException(status_code=403, detail='Esa persona es de otro departamento')
    if target.get('role') == 'admin' or es_jefe_depto(target):
        raise HTTPException(status_code=400, detail='Este rol ya tiene acceso total; no se puede modificar')
    module_access = dict(target.get('module_access') or {})
    if data.enabled is None:
        module_access.pop(data.module, None)  # reset to role default
    else:
        module_access[data.module] = bool(data.enabled)
    await db.users.update_one({'id': user_id}, {'$set': {'module_access': module_access}})
    updated = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    await log_activity(manager['id'], manager['name'], manager.get('avatar_url'),
                       'actualizó accesos de', updated['name'], 'user', departamento_de(updated))
    return {'id': updated['id'], 'module_access': module_access, 'access': _effective_access(updated)}


MANAGER_POSITIONS = {'Jefe', 'Gerente', 'Director comercial', GERENTE_LOGISTICA}


@router.get('/team')
async def team_calendars(user=Depends(get_current_user)):
    """Calendars a manager may overlay: same-área members of the same
    departamento (admins see all; the jefe de departamento sees all of it)."""
    sees_all = user.get('role') == 'admin' or es_jefe_depto(user)
    if not sees_all and user.get('position') not in MANAGER_POSITIONS:
        return []
    q = {'status': 'approved', 'id': {'$ne': user['id']}, **filtro_depto(user)}
    if not sees_all:
        q['area'] = user.get('area')
    members = await db.users.find(q, {'_id': 0, 'password_hash': 0}).sort('name', 1).to_list(300)
    return serialize_doc([{
        'id': m['id'], 'name': m['name'], 'area': m.get('area'),
        'position': m.get('position'), 'avatar_url': m.get('avatar_url'),
    } for m in members])


@router.post('')
async def create_user(data: AdminUserCreate, admin=Depends(require_gestor_usuarios)):
    email = data.email.lower()
    if await db.users.find_one({'email': email}):
        raise HTTPException(status_code=400, detail='El correo ya está registrado')
    es_admin = admin.get('role') == 'admin'
    role = data.role if (es_admin and data.role in ('admin', 'user')) else 'user'
    # el Gerente de Logística solo crea gente de Logística (y no otro gerente)
    depto = (data.departamento if data.departamento in DEPARTAMENTOS else RETAIL) if es_admin else LOGISTICA
    if not es_admin and (data.position or '').strip() == GERENTE_LOGISTICA:
        raise HTTPException(status_code=403, detail='Ese cargo lo asigna un administrador')
    datos = {'position': data.position or 'Colaborador', 'area': data.area or '', 'sucursal': data.sucursal or ''}
    await normalizar_depto(datos, depto)
    doc = {
        'id': new_id(),
        'name': data.name,
        'email': email,
        'password_hash': hash_password(data.password),
        'role': role,
        'status': 'approved',
        'position': datos['position'],
        'departamento': depto,
        'area': datos['area'],
        'sucursal': datos['sucursal'],
        'avatar_url': avatar_for(data.name),
        'phone': '',
        'created_at': now_iso(),
    }
    await db.users.insert_one(doc)
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'creó un usuario', data.name, 'user', depto)
    doc.pop('password_hash', None)
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.patch('/me')
async def update_me(data: ProfileUpdate, user=Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    # Cargo, área y tienda deciden a qué módulos entra cada quien: solo los
    # cambia un administrador (Usuarios → Editar). Aquí solo nombre, teléfono y foto.
    for campo in ('position', 'area', 'sucursal'):
        nuevo = updates.pop(campo, None)
        if nuevo is not None and nuevo.strip() != (user.get(campo) or '').strip():
            raise HTTPException(status_code=403,
                                detail='Tu cargo, área y tienda los cambia un administrador')
    if 'time_format' in updates and updates['time_format'] not in ('12h', '24h'):
        updates.pop('time_format')
    if updates:
        await db.users.update_one({'id': user['id']}, {'$set': updates})
    updated = await db.users.find_one({'id': user['id']}, {'_id': 0, 'password_hash': 0})
    return serialize_doc(updated)


class VistosInput(BaseModel):
    claves: List[str]
    quitar: bool = False


@router.post('/me/vistos')
async def marcar_vistos(data: VistosInput, user=Depends(get_current_user)):
    """Novedades y recorridos guiados que la persona ya vio (se guardan en su
    usuario para que no le vuelvan a salir en otro dispositivo). `quitar`
    los vuelve a mostrar (p. ej. repetir un recorrido)."""
    claves = [c.strip()[:60] for c in data.claves if c and c.strip()][:50]
    if claves:
        op = {'$pull': {'vistos': {'$in': claves}}} if data.quitar else {'$addToSet': {'vistos': {'$each': claves}}}
        await db.users.update_one({'id': user['id']}, op)
    doc = await db.users.find_one({'id': user['id']}, {'_id': 0, 'vistos': 1})
    return {'vistos': (doc or {}).get('vistos', [])}


@router.post('/{user_id}/approve')
async def approve_user(user_id: str, admin=Depends(require_gestor_usuarios)):
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    if not _puede_gestionar(admin, target):
        raise HTTPException(status_code=403, detail='Esa persona no es de tu departamento')
    await db.users.update_one({'id': user_id}, {'$set': {'status': 'approved'}})
    await create_notification(user_id, 'usuario_aprobado',
                              'Tu cuenta fue aprobada. ¡Bienvenido a HERCO OPS!',
                              related_id=user_id, related_type='user',
                              actor_name=admin['name'], actor_avatar=admin.get('avatar_url'))
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'aprobó un usuario', target['name'], 'user', departamento_de(target))
    return {'message': 'Usuario aprobado'}


@router.post('/{user_id}/reject')
async def reject_user(user_id: str, admin=Depends(require_gestor_usuarios)):
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    if not _puede_gestionar(admin, target):
        raise HTTPException(status_code=403, detail='Esa persona no es de tu departamento')
    await db.users.update_one({'id': user_id}, {'$set': {'status': 'rejected'}})
    await quitar_de_grupos(user_id)
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'rechazó un usuario', target['name'], 'user', departamento_de(target))
    return {'message': 'Usuario rechazado'}


@router.patch('/{user_id}/role')
async def change_role(user_id: str, data: RoleUpdate, admin=Depends(require_admin)):
    if data.role not in ('admin', 'user'):
        raise HTTPException(status_code=400, detail='Rol inválido')
    if user_id == admin['id'] and data.role != 'admin':
        raise HTTPException(status_code=400, detail='No puedes quitarte tu propio rol de administrador')
    await db.users.update_one({'id': user_id}, {'$set': {'role': data.role}})
    return {'message': 'Rol actualizado'}


@router.patch('/{user_id}')
async def update_user(user_id: str, data: AdminUserUpdate, admin=Depends(require_gestor_usuarios)):
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    if not _puede_gestionar(admin, target):
        raise HTTPException(status_code=403, detail='Esa persona no es de tu departamento')
    payload = data.model_dump(exclude_none=True)
    if admin.get('role') != 'admin':
        # el Gerente de Logística no da rol de admin, no cambia el departamento
        # ni nombra a otro gerente
        payload.pop('role', None)
        payload.pop('departamento', None)
        if (payload.get('position') or '').strip() == GERENTE_LOGISTICA:
            raise HTTPException(status_code=403, detail='Ese cargo lo asigna un administrador')
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
    # Un admin no se quita a sí mismo el rol ni se desactiva (no quedaría quien administre).
    if user_id == admin['id'] and (updates.get('role', 'admin') != 'admin'
                                   or updates.get('status', 'approved') != 'approved'):
        raise HTTPException(status_code=400, detail='No puedes quitarte el rol de administrador ni desactivar tu cuenta')
    if 'password' in payload:
        if len(payload['password']) < 4:
            raise HTTPException(status_code=400, detail='La contraseña debe tener al menos 4 caracteres')
        updates['password_hash'] = hash_password(payload['password'])
    # cargo, área y tienda según el departamento (el actual o el nuevo)
    depto = payload['departamento'] if payload.get('departamento') in DEPARTAMENTOS else departamento_de(target)
    if depto != departamento_de(target):
        updates['departamento'] = depto
    datos = {f: updates.get(f, target.get(f)) for f in ('position', 'area', 'sucursal')}
    if 'departamento' in updates or 'position' in updates or 'area' in updates:
        await normalizar_depto(datos, depto)
    elif depto == RETAIL and datos['area'] != 'Tienda':
        datos['sucursal'] = 'Casa Matriz'
    for f in ('position', 'area', 'sucursal'):
        if datos.get(f) != target.get(f):
            updates[f] = datos[f]
    if updates:
        await db.users.update_one({'id': user_id}, {'$set': updates})
    # desactivado (estado distinto de aprobado): sale de los grupos de Agenda
    if 'status' in updates and updates['status'] != 'approved':
        await quitar_de_grupos(user_id)
    updated = await db.users.find_one({'id': user_id}, {'_id': 0, 'password_hash': 0})
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'editó un usuario', updated['name'], 'user', departamento_de(updated))
    return serialize_doc(updated)


@router.delete('/{user_id}')
async def delete_user(user_id: str, admin=Depends(require_admin)):
    if user_id == admin['id']:
        raise HTTPException(status_code=400, detail='No puedes eliminar tu propia cuenta')
    target = await db.users.find_one({'id': user_id})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    await db.users.delete_one({'id': user_id})
    await quitar_de_grupos(user_id)
    await log_activity(admin['id'], admin['name'], admin.get('avatar_url'),
                       'eliminó un usuario', target['name'], 'user', departamento_de(target))
    return {'message': 'Usuario eliminado'}
