"""Permisos por acción, con perfiles por cargo y excepciones por persona.

- Catálogo (CATALOGO): las acciones de cada módulo, p. ej. 'tareas.crear'.
- Perfiles (db.perm_perfiles): un paquete de acciones con nombre, p. ej.
  "Gestor de tareas". Los crea y edita el super admin.
- Cada cargo (db.org_cargos.perfil_id) usa un perfil; lo eligen el super
  admin y, en su departamento, sus admins y su jefe.
- Excepciones por persona (users.permisos_extra = {accion: true|false}):
  agregan o quitan una acción puntual a alguien.

Lo que puede cada persona se calcula (perfil de su cargo + excepciones) y
se guarda en el usuario (users.permisos) para revisarlo sin consultas; se
recalcula al cambiar un perfil, el perfil de un cargo, el cargo de alguien o
sus excepciones. Los admins pueden todo en su departamento (el super admin,
en todos).

El permiso dice QUÉ puede hacer; SOBRE QUÉ lo decide la estructura de cada
módulo (en Tareas: su tienda en Retail, su área y subáreas en los demás).
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import db, get_current_user, serialize_doc, new_id, now_iso, RETAIL, es_super_admin, departamento_de

router = APIRouter(prefix='/permisos', tags=['permisos'])

CATALOGO = {
    'tareas': {
        'nombre': 'Tareas',
        'acciones': [
            ('tareas.ver_equipo', 'Ver tareas del equipo', 'Ver las tareas de su gente, además de las propias.'),
            ('tareas.crear', 'Crear', 'Crear tareas y asignarlas a su gente.'),
            ('tareas.editar', 'Editar', 'Cambiar título, descripción, prioridad, fecha y personas asignadas.'),
            ('tareas.validar', 'Validar / devolver', 'Revisar la foto de quien la hizo y aceptarla o devolverla.'),
            ('tareas.cancelar', 'Cancelar', 'Anular la tarea; queda en el historial.'),
            ('tareas.eliminar', 'Eliminar', 'Borrarla por completo, solo si nadie la ha marcado hecha.'),
        ],
    },
}
ACCIONES = [a[0] for m in CATALOGO.values() for a in m['acciones']]

GESTOR, RESPONSABLE = 'gestor_tareas', 'responsable'
PERFILES_INICIALES = [
    {'id': GESTOR, 'nombre': 'Gestor de tareas', 'sistema': True,
     'descripcion': 'Crea, edita, valida y cancela las tareas de su gente.',
     'permisos': ['tareas.ver_equipo', 'tareas.crear', 'tareas.editar', 'tareas.validar', 'tareas.cancelar']},
    {'id': RESPONSABLE, 'nombre': 'Responsable', 'sistema': True,
     'descripcion': 'Hace las tareas que le asignan.', 'permisos': []},
]
# Retail: los cargos que hoy crean y validan tareas de tienda
GESTORES_RETAIL = {'Director comercial', 'Gerente', 'Jefe de tienda'}


def perfil_por_defecto(depto: str, clave: str, nivel: str) -> str:
    """El perfil que reproduce lo de antes de existir los permisos."""
    if (depto or RETAIL) == RETAIL:
        return GESTOR if clave in GESTORES_RETAIL else RESPONSABLE
    return GESTOR if nivel in ('jefe_depto', 'gerente', 'jefe') else RESPONSABLE


def tiene(user, accion: str) -> bool:
    """¿Puede hacer esta acción? (sobre qué, lo decide cada módulo)."""
    u = user or {}
    if u.get('role') == 'admin':
        return True
    return accion in (u.get('permisos') or [])


# --------------------------------------------------------------------------- #
#  Migración y recálculo
# --------------------------------------------------------------------------- #
async def asegurar():
    """Perfiles iniciales y un perfil para cada cargo que no lo tenga; después
    recalcula los permisos de todos. Idempotente."""
    for p in PERFILES_INICIALES:
        if not await db.perm_perfiles.find_one({'id': p['id']}):
            await db.perm_perfiles.insert_one({**p, 'created_at': now_iso()})
    async for c in db.org_cargos.find({'perfil_id': {'$exists': False}}, {'_id': 0}):
        await db.org_cargos.update_one({'id': c['id']}, {'$set': {
            'perfil_id': perfil_por_defecto(c['departamento'], c.get('clave'), c.get('nivel'))}})
    await recalcular({})


async def recalcular(filtro_usuarios: dict):
    """Vuelve a calcular `permisos` de los usuarios que cumplen el filtro."""
    perfiles = {p['id']: set(p.get('permisos') or []) for p in await db.perm_perfiles.find({}, {'_id': 0}).to_list(500)}
    cargos = {c['id']: c.get('perfil_id') for c in await db.org_cargos.find({}, {'_id': 0, 'id': 1, 'perfil_id': 1}).to_list(5000)}
    async for u in db.users.find(filtro_usuarios, {'_id': 0, 'id': 1, 'cargo_id': 1, 'permisos_extra': 1, 'permisos': 1}):
        base = set(perfiles.get(cargos.get(u.get('cargo_id')), set()))
        for accion, valor in (u.get('permisos_extra') or {}).items():
            if valor is True:
                base.add(accion)
            elif valor is False:
                base.discard(accion)
        nuevos = sorted(a for a in base if a in ACCIONES)
        if nuevos != u.get('permisos'):  # también si todavía no tiene el campo
            await db.users.update_one({'id': u['id']}, {'$set': {'permisos': nuevos}})


async def recalcular_usuario(uid: str):
    await recalcular({'id': uid})


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
@router.get('/catalogo')
async def catalogo(user=Depends(get_current_user)):
    perfiles = await db.perm_perfiles.find({}, {'_id': 0}).sort('nombre', 1).to_list(500)
    usos = {}
    async for c in db.org_cargos.find({}, {'_id': 0, 'perfil_id': 1}):
        usos[c.get('perfil_id')] = usos.get(c.get('perfil_id'), 0) + 1
    return serialize_doc({
        'modulos': [{'id': k, 'nombre': m['nombre'],
                     'acciones': [{'id': a, 'nombre': n, 'ayuda': h} for a, n, h in m['acciones']]}
                    for k, m in CATALOGO.items()],
        'perfiles': [{**p, 'cargos': usos.get(p['id'], 0)} for p in perfiles],
        'puede_editar_perfiles': es_super_admin(user),
    })


# --------------------------------------------------------------------------- #
#  Perfiles (super admin)
# --------------------------------------------------------------------------- #
class PerfilInput(BaseModel):
    nombre: str
    descripcion: Optional[str] = ''
    permisos: List[str] = []


def _limpiar_perfil(data: PerfilInput):
    nombre = ' '.join((data.nombre or '').split())[:60]
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del perfil')
    return {'nombre': nombre, 'descripcion': ' '.join((data.descripcion or '').split())[:200],
            'permisos': sorted({a for a in data.permisos if a in ACCIONES})}


def _solo_super(user):
    if not es_super_admin(user):
        raise HTTPException(status_code=403, detail='Los perfiles los administra el super admin')


@router.post('/perfiles')
async def crear_perfil(data: PerfilInput, user=Depends(get_current_user)):
    _solo_super(user)
    campos = _limpiar_perfil(data)
    if await db.perm_perfiles.find_one({'nombre': campos['nombre']}):
        raise HTTPException(status_code=400, detail='Ya existe un perfil con ese nombre')
    p = {'id': new_id(), **campos, 'sistema': False, 'created_at': now_iso(), 'created_by': user['name']}
    await db.perm_perfiles.insert_one(p)
    p.pop('_id', None)
    return serialize_doc(p)


@router.put('/perfiles/{pid}')
async def editar_perfil(pid: str, data: PerfilInput, user=Depends(get_current_user)):
    _solo_super(user)
    if not await db.perm_perfiles.find_one({'id': pid}):
        raise HTTPException(status_code=404, detail='Perfil no encontrado')
    campos = _limpiar_perfil(data)
    if await db.perm_perfiles.find_one({'nombre': campos['nombre'], 'id': {'$ne': pid}}):
        raise HTTPException(status_code=400, detail='Ya existe un perfil con ese nombre')
    await db.perm_perfiles.update_one({'id': pid}, {'$set': {**campos, 'updated_at': now_iso(), 'updated_by': user['name']}})
    cargos = [c['id'] for c in await db.org_cargos.find({'perfil_id': pid}, {'_id': 0, 'id': 1}).to_list(5000)]
    await recalcular({'cargo_id': {'$in': cargos}})
    return serialize_doc(await db.perm_perfiles.find_one({'id': pid}, {'_id': 0}))


@router.delete('/perfiles/{pid}')
async def borrar_perfil(pid: str, user=Depends(get_current_user)):
    _solo_super(user)
    p = await db.perm_perfiles.find_one({'id': pid}, {'_id': 0})
    if not p:
        raise HTTPException(status_code=404, detail='Perfil no encontrado')
    if p.get('sistema'):
        raise HTTPException(status_code=400, detail=f'{p["nombre"]} es un perfil base: se edita, no se borra')
    n = await db.org_cargos.count_documents({'perfil_id': pid})
    if n:
        raise HTTPException(status_code=400, detail=f'Lo usan {n} cargo(s): cámbialos de perfil primero')
    await db.perm_perfiles.delete_one({'id': pid})
    return {'message': f'Perfil {p["nombre"]} eliminado'}


# --------------------------------------------------------------------------- #
#  Perfil de un cargo
# --------------------------------------------------------------------------- #
class CargoPerfilInput(BaseModel):
    perfil_id: str


@router.put('/cargos/{cid}')
async def perfil_de_cargo(cid: str, data: CargoPerfilInput, user=Depends(get_current_user)):
    import organizacion  # evita la importación circular
    c = await db.org_cargos.find_one({'id': cid}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='Cargo no encontrado')
    if not organizacion.puede_editar(user, c['departamento']):
        raise HTTPException(status_code=403, detail='Solo un admin o el jefe del departamento cambia el perfil de sus cargos')
    if not await db.perm_perfiles.find_one({'id': data.perfil_id}):
        raise HTTPException(status_code=400, detail='Elige un perfil válido')
    await db.org_cargos.update_one({'id': cid}, {'$set': {'perfil_id': data.perfil_id}})
    await recalcular({'cargo_id': cid})
    return {'id': cid, 'perfil_id': data.perfil_id}


# --------------------------------------------------------------------------- #
#  Excepciones de una persona
# --------------------------------------------------------------------------- #
async def _usuario_editable(uid, user):
    import organizacion
    target = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    if not organizacion.puede_editar(user, departamento_de(target)):
        raise HTTPException(status_code=403, detail='Solo un admin o el jefe de su departamento cambia sus permisos')
    return target


@router.get('/usuario/{uid}')
async def permisos_de_usuario(uid: str, user=Depends(get_current_user)):
    """Lo que puede la persona y de dónde viene (su cargo o una excepción)."""
    target = await _usuario_editable(uid, user)
    cargo = await db.org_cargos.find_one({'id': target.get('cargo_id')}, {'_id': 0}) or {}
    perfil = await db.perm_perfiles.find_one({'id': cargo.get('perfil_id')}, {'_id': 0}) or {}
    base = set(perfil.get('permisos') or [])
    extra = target.get('permisos_extra') or {}
    return serialize_doc({
        'es_admin': target.get('role') == 'admin',
        'cargo': cargo.get('nombre'), 'perfil': {'id': perfil.get('id'), 'nombre': perfil.get('nombre')},
        'acciones': [{'id': a, 'por_cargo': a in base, 'excepcion': extra.get(a),
                      'efectivo': extra[a] if isinstance(extra.get(a), bool) else a in base} for a in ACCIONES],
    })


class ExcepcionesInput(BaseModel):
    excepciones: Dict[str, Optional[bool]]  # accion -> true (dar) | false (quitar) | null (según su cargo)


@router.put('/usuario/{uid}')
async def guardar_excepciones(uid: str, data: ExcepcionesInput, user=Depends(get_current_user)):
    target = await _usuario_editable(uid, user)
    extra = dict(target.get('permisos_extra') or {})
    for accion, valor in data.excepciones.items():
        if accion not in ACCIONES:
            continue
        if valor is None:
            extra.pop(accion, None)
        else:
            extra[accion] = bool(valor)
    await db.users.update_one({'id': uid}, {'$set': {'permisos_extra': extra}})
    await recalcular_usuario(uid)
    return await permisos_de_usuario(uid, user)
