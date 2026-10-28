"""Acceso por perfiles: qué puede hacer cada persona en la app.

- Catálogo (MODULOS): los módulos de la app agrupados como en el menú
  (General, Formularios, Activos) y los permisos de adentro de cada uno.
  Apagar un módulo apaga todo lo de adentro.
- Perfiles (db.acceso_perfiles): paquetes de permisos con nombre, de cada
  departamento. Los arma el super admin.
- Perfil por cargo (db.acceso_asignaciones): qué perfil usa cada cargo, con
  ajustes por área que valen también para sus subáreas (manda el ajuste del
  área más cercana). Sin asignación: Básico en Retail; en los demás
  departamentos, Jefe o Colaborador según el nivel del cargo.
- Excepciones por persona (users.acceso_excepciones = {permiso: true|false}).
- Acceso total fijo: los admins y el jefe del departamento no usan perfil.
  Registrar en ECCP (Guardias, Recorridos, Etiquetas) sí les sale de su cargo,
  como siempre, y al jefe del departamento también eliminar tareas.
- Los módulos de tienda solo existen en Ventas Retail (el super admin los ve).

Lo que puede cada persona se calcula y se guarda en users.acceso. El perfil
dice QUÉ puede hacer; SOBRE QUÉ (su tienda, su área, su gente) lo sigue
decidiendo cada módulo.

Convive con los campos de antes (module_access, permisos, permisos_extra y el
perfil de Tareas de cada cargo), que no se tocan: así se puede volver a la
versión anterior.
"""
import re
from collections import Counter
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import (db, get_current_user, serialize_doc, new_id, now_iso, RETAIL, departamento_de,
                  filtro_departamento, es_retail, es_super_admin, es_jefe_depto)
from notifications import log_activity

router = APIRouter(prefix='/acceso', tags=['acceso'])

PESTANAS = [('general', 'General'), ('formularios', 'Formularios'), ('activos', 'Activos')]
GRUPOS = {'ver': 'Ver', 'hacer': 'Hacer', 'admin': 'Administrar'}

# (pestaña, módulo, nombre, solo Retail, [(permiso, nombre, grupo)])
MODULOS = [
    ('general', 'agenda', 'Agenda', False, []),
    ('general', 'vacaciones', 'Vacaciones', False, []),
    ('general', 'sala', 'Sala de Juntas', True, []),
    ('general', 'tareas', 'Tareas', False, [
        ('tareas.ver_equipo', 'Ver las tareas de su gente', 'ver'),
        ('tareas.crear', 'Crear y asignar', 'hacer'),
        ('tareas.editar', 'Editar', 'hacer'),
        ('tareas.validar', 'Validar o devolver', 'hacer'),
        ('tareas.cancelar', 'Cancelar', 'admin'),
        ('tareas.eliminar', 'Eliminar', 'admin')]),
    ('general', 'reportes', 'Reportes', True, []),
    ('general', 'cams', 'Reportes CAMS', True, []),
    ('formularios', 'flos', 'Evaluación FLOS', True, [
        ('flos.esquema', 'Editar criterios y puntajes', 'admin')]),
    ('formularios', 'rutina', 'Rutina Operativa', True, [
        ('rutina.llenar', 'Nueva evaluación', 'hacer'),
        ('rutina.esquema', 'Editar preguntas y puntajes', 'admin')]),
    ('formularios', 'guardias', 'Revisión de Guardias', True, [
        ('guardias.registrar', 'Nueva evaluación', 'hacer')]),
    ('formularios', 'recorridos', 'Recorridos Preventivos', True, [
        ('recorridos.registrar', 'Nuevo recorrido', 'hacer')]),
    ('formularios', 'etiquetas', 'Auditoría de Etiquetas', True, [
        ('etiquetas.todas', 'Ver todas las tiendas', 'ver'),
        ('etiquetas.registrar', 'Nueva auditoría', 'hacer')]),
    ('formularios', 'promos', 'Promociones del mes', True, [
        ('promos.publicar', 'Publicar promociones', 'hacer'),
        ('promos.admin', 'Administrar todas las publicaciones', 'admin')]),
    ('formularios', 'formularios', 'Formularios personalizados', False, [
        ('formularios.crear', 'Crear formularios', 'admin')]),
    ('formularios', 'seguimientos', 'Seguimientos', True, []),
    ('activos', 'activos', 'Activos', False, [
        ('activos.administrar', 'Administrar todos los activos y categorías', 'admin')]),
    ('activos', 'checklists', 'Checklists', False, []),
    ('activos', 'planes', 'Planificaciones', False, []),
    ('activos', 'mis_mant', 'Mis mantenimientos', False, []),
    ('activos', 'inventario', 'Inventarios Autoservicio', True, []),
]
MODULO_DE = {p: m for _, m, _, _, ps in MODULOS for p, _, _ in ps}  # permiso de adentro -> su módulo
NOMBRE_MODULO = {m: n for _, m, n, _, _ in MODULOS}
TODOS = [k for _, m, _, _, ps in MODULOS for k in [m] + [p for p, _, _ in ps]]
SOLO_RETAIL = {k for _, m, _, sr, ps in MODULOS if sr for k in [m] + [p for p, _, _ in ps]}
# A los de acceso total fijo estos les salen de su cargo (perfil y excepciones)
DESDE_CARGO = {'guardias.registrar', 'recorridos.registrar', 'etiquetas.registrar'}
DESDE_CARGO_JEFE = DESDE_CARGO | {'tareas.eliminar'}


def es_fijo(user) -> bool:
    u = user or {}
    return u.get('role') == 'admin' or es_jefe_depto(u)


def efectivo(user, base, excepciones=None) -> list:
    """Lo que puede la persona: su perfil (`base`) con sus excepciones, o el
    acceso total fijo; sin los módulos de tienda fuera de Retail."""
    propio = set(base or ())
    for k, v in (excepciones or {}).items():
        if v is True:
            propio.add(k)
        elif v is False:
            propio.discard(k)
    u = user or {}
    if u.get('role') == 'admin':
        keys = (set(TODOS) - DESDE_CARGO) | (propio & DESDE_CARGO)
    elif es_jefe_depto(u):
        keys = (set(TODOS) - DESDE_CARGO_JEFE) | (propio & DESDE_CARGO_JEFE)
    else:
        keys = {k for k in propio if k in TODOS and (k not in MODULO_DE or MODULO_DE[k] in propio)}
    if not es_super_admin(u) and not es_retail(u):
        keys -= SOLO_RETAIL
    return sorted(keys)


def tiene(user, permiso: str) -> bool:
    """¿Puede hacerlo? (sobre qué, lo decide cada módulo). Quien todavía no
    pasó a los perfiles sigue con las reglas de antes."""
    u = user or {}
    if 'acceso_migrado_at' not in u:
        import acceso_legacy
        return permiso in acceso_legacy.acceso_de_antes(u)[0]
    return permiso in (u.get('acceso') or [])


def lista(user) -> list:
    """Todo lo que puede la persona (para mandarlo a la pantalla)."""
    u = user or {}
    if 'acceso_migrado_at' not in u:
        import acceso_legacy
        return sorted(acceso_legacy.acceso_de_antes(u)[0])
    return u.get('acceso') or []


# --------------------------------------------------------------------------- #
#  Perfiles y asignaciones iniciales (reproducen las reglas de antes)
# --------------------------------------------------------------------------- #
# Lo que hoy no tiene candado (todos lo ven) y lo de siempre para todos
SIN_CANDADO = ['agenda', 'sala', 'tareas', 'seguimientos', 'activos', 'checklists', 'planes', 'mis_mant']
BASE = SIN_CANDADO + ['vacaciones', 'promos']
GESTOR = ['tareas.ver_equipo', 'tareas.crear', 'tareas.editar', 'tareas.validar', 'tareas.cancelar']
FORMS_GERENTE = ['flos', 'rutina', 'rutina.llenar', 'promos.publicar', 'formularios']
ECCP = ['reportes', 'guardias', 'guardias.registrar', 'recorridos', 'recorridos.registrar',
        'etiquetas', 'etiquetas.registrar', 'etiquetas.todas', 'formularios']
INV = ['inventario']

PERFILES_RETAIL = [
    ('gerente_tienda', 'Gerente de tienda', 'Gerente en Tienda', BASE + GESTOR + FORMS_GERENTE + INV + ['reportes', 'etiquetas']),
    ('gerente_op', 'Gerente de operación', 'Gerente en Operación Tienda', BASE + GESTOR + FORMS_GERENTE + INV),
    ('gerente', 'Gerente', 'Gerente en otras áreas', BASE + GESTOR + FORMS_GERENTE),
    ('jefe_eccp', 'Jefe ECCP', 'Jefe en ECCP', BASE + GESTOR + ECCP + INV),
    ('coord_eccp', 'Coordinador ECCP', 'Coordinador en ECCP', BASE + ECCP),
    ('jefe_tienda', 'Jefe de tienda', 'Jefe de tienda', BASE + GESTOR + INV + ['reportes']),
    ('coord_tienda', 'Coordinador de tienda', 'Coordinador en Tienda', BASE + INV + ['reportes']),
    ('jefe', 'Jefe', 'Jefe en otras áreas', BASE + GESTOR),
    ('basico', 'Básico', 'Quien no tenga otro perfil', BASE),
]
# (cargo, área o None para todo el cargo, perfil)
ASIGNACIONES_RETAIL = [
    ('Gerente', None, 'gerente'), ('Gerente', 'Tienda', 'gerente_tienda'), ('Gerente', 'Operación Tienda', 'gerente_op'),
    ('Jefe', None, 'jefe'), ('Jefe', 'ECCP', 'jefe_eccp'),
    ('Jefe de tienda', None, 'jefe_tienda'),
    ('Coordinador', None, 'basico'), ('Coordinador', 'Tienda', 'coord_tienda'), ('Coordinador', 'ECCP', 'coord_eccp'),
]
# Otros departamentos (sus módulos de tienda no aplican)
PERFILES_OTROS = [
    ('jefe', 'Jefe', 'Cargos de mando', BASE + GESTOR + ['formularios']),
    ('colaborador', 'Colaborador', 'Los demás cargos', BASE + ['formularios']),
]
NIVELES_DE_MANDO = ('jefe_depto', 'gerente', 'jefe')


def id_perfil(depto: str, clave: str) -> str:
    return f'{"retail" if depto == RETAIL else depto}.{clave}'


def perfil_por_defecto(depto: str, nivel: str) -> str:
    """El perfil de un cargo sin asignación."""
    if (depto or RETAIL) == RETAIL:
        return id_perfil(RETAIL, 'basico')
    return id_perfil(depto, 'jefe' if nivel in NIVELES_DE_MANDO else 'colaborador')


def perfiles_iniciales(deptos: list) -> list:
    out = []
    for d in deptos:
        lista = PERFILES_RETAIL if d == RETAIL else PERFILES_OTROS
        for i, (clave, nombre, uso, permisos) in enumerate(lista):
            out.append({'id': id_perfil(d, clave), 'departamento': d, 'clave': clave, 'nombre': nombre,
                        'descripcion': uso, 'permisos': sorted(set(permisos)), 'sistema': True, 'orden': i})
    return out


def asignaciones_iniciales(cargos: list, areas: list) -> list:
    """Perfil por cargo de Retail (por la clave del cargo y del área)."""
    cargo_id = {c['clave']: c['id'] for c in cargos if c['departamento'] == RETAIL}
    area_id = {a['clave']: a['id'] for a in areas if a['departamento'] == RETAIL and not a.get('padre_id')}
    out = []
    for cargo, area, perfil in ASIGNACIONES_RETAIL:
        if cargo in cargo_id and (area is None or area in area_id):
            out.append({'id': f'{cargo_id[cargo]}@{area_id[area] if area else "*"}', 'departamento': RETAIL,
                        'cargo_id': cargo_id[cargo], 'area_id': area_id[area] if area else None,
                        'perfil_id': id_perfil(RETAIL, perfil)})
    return out


def resolver_perfil(user, asignaciones: list, nivel_cargo: str = None) -> str:
    """El perfil de la persona: el ajuste del área más cercana para su cargo,
    si no el de su cargo, si no el de por defecto."""
    u = user or {}
    del_cargo = [a for a in asignaciones if a['cargo_id'] == u.get('cargo_id')]
    camino = u.get('area_path') or ([u['area_id']] if u.get('area_id') else [])
    for area in reversed(camino):
        for a in del_cargo:
            if a.get('area_id') == area:
                return a['perfil_id']
    for a in del_cargo:
        if not a.get('area_id'):
            return a['perfil_id']
    return perfil_por_defecto(u.get('departamento') or RETAIL, nivel_cargo or u.get('nivel'))


# --------------------------------------------------------------------------- #
#  Cálculo con la base
# --------------------------------------------------------------------------- #
async def migrado() -> bool:
    """¿Ya se pasó a los perfiles? (scripts/acceso_migrar.py --aplicar)"""
    return bool(await db.acceso_perfiles.find_one({}, {'_id': 1}))


async def _contexto():
    perfiles = {p['id']: p for p in await db.acceso_perfiles.find({}, {'_id': 0}).to_list(1000)}
    asignaciones = await db.acceso_asignaciones.find({}, {'_id': 0}).to_list(5000)
    niveles = {c['id']: c.get('nivel') for c in await db.org_cargos.find({}, {'_id': 0, 'id': 1, 'nivel': 1}).to_list(5000)}
    return perfiles, asignaciones, niveles


def _perfil_de(u, asignaciones, niveles) -> str:
    return resolver_perfil(u, asignaciones, niveles.get(u.get('cargo_id')))


async def recalcular(filtro: dict):
    """Vuelve a calcular `acceso` de las personas (ya migradas) que cumplen el filtro."""
    perfiles, asignaciones, niveles = await _contexto()
    if not perfiles:
        return  # sin migrar: siguen las reglas de antes
    async for u in db.users.find({**filtro, 'acceso_migrado_at': {'$exists': True}}, {'_id': 0, 'password_hash': 0}):
        base = (perfiles.get(_perfil_de(u, asignaciones, niveles)) or {}).get('permisos') or []
        nuevo = efectivo(u, base, u.get('acceso_excepciones'))
        if nuevo != u.get('acceso'):
            await db.users.update_one({'id': u['id']}, {'$set': {'acceso': nuevo}})


async def con_modulo(ids, modulo: str) -> set:
    """De estas personas, las que tienen el módulo encendido (para buscadores
    de personas y para validar a quién se invita, asigna o nombra responsable)."""
    ids = [i for i in dict.fromkeys(ids or []) if i]
    if not ids:
        return set()
    return {u['id'] async for u in db.users.find({'id': {'$in': ids}}, {'_id': 0, 'password_hash': 0}) if tiene(u, modulo)}


async def preparar_usuario(uid: str):
    """Persona nueva o que cambió de cargo, área, rol o departamento: entra a
    los perfiles (si ya se migró) y se recalcula lo que puede."""
    if not await migrado():
        return
    await db.users.update_one({'id': uid, 'acceso_migrado_at': {'$exists': False}},
                              {'$set': {'acceso_excepciones': {}, 'acceso_migrado_at': now_iso()}})
    await recalcular({'id': uid})


async def asegurar_departamento(did: str):
    """Departamento nuevo: sus perfiles de arranque (Jefe y Colaborador)."""
    if not await migrado() or await db.acceso_perfiles.find_one({'departamento': did}, {'_id': 1}):
        return
    for p in perfiles_iniciales([did]):
        await db.acceso_perfiles.insert_one({**p, 'created_at': now_iso(), 'created_by': 'sistema'})


# --------------------------------------------------------------------------- #
#  Rutas
# --------------------------------------------------------------------------- #
def _puede_editar(user, depto) -> bool:
    import organizacion  # evita la importación circular
    return organizacion.puede_editar(user, depto)


def _depto(user, departamento: Optional[str]) -> str:
    return departamento if (es_super_admin(user) and departamento) else departamento_de(user)


def _exigir(user, depto):
    if not _puede_editar(user, depto):
        raise HTTPException(status_code=403, detail='Solo un admin o el jefe del departamento maneja sus permisos')


def _solo_super(user):
    if not es_super_admin(user):
        raise HTTPException(status_code=403, detail='Los perfiles los arma el super admin')


async def _exigir_migrado():
    if not await migrado():
        raise HTTPException(status_code=409, detail='Los perfiles todavía no están activos')


def _validos(depto) -> set:
    return set(TODOS) if depto == RETAIL else set(TODOS) - SOLO_RETAIL


def _por_defecto(depto) -> set:
    return {perfil_por_defecto(depto, 'colaborador'), perfil_por_defecto(depto, 'jefe')}


@router.get('/catalogo')
async def catalogo(departamento: Optional[str] = None, user=Depends(get_current_user)):
    d = _depto(user, departamento)
    _exigir(user, d)
    return {
        'departamento': d,
        'pestanas': [{'id': i, 'nombre': n} for i, n in PESTANAS],
        'grupos': GRUPOS,
        'modulos': [{'id': m, 'nombre': n, 'pestana': t, 'solo_retail': sr, 'disponible': not sr or d == RETAIL,
                     'permisos': [{'id': p, 'nombre': pn, 'grupo': g} for p, pn, g in ps]}
                    for t, m, n, sr, ps in MODULOS],
        'migrado': await migrado(),
        'puede_editar_perfiles': es_super_admin(user),
    }


@router.get('/perfiles')
async def listar_perfiles(departamento: Optional[str] = None, user=Depends(get_current_user)):
    d = _depto(user, departamento)
    _exigir(user, d)
    perfiles, asignaciones, niveles = await _contexto()
    uso = Counter()
    async for u in db.users.find({**filtro_departamento(d), 'status': 'approved'}, {'_id': 0, 'password_hash': 0}):
        if not es_fijo(u):
            uso[_perfil_de(u, asignaciones, niveles)] += 1
    del_depto = sorted((p for p in perfiles.values() if p['departamento'] == d), key=lambda p: (p.get('orden', 0), p['nombre']))
    return serialize_doc({'perfiles': [{**p, 'personas': uso.get(p['id'], 0), 'por_defecto': p['id'] in _por_defecto(d)}
                                       for p in del_depto]})


class PerfilInput(BaseModel):
    departamento: Optional[str] = None
    nombre: str
    descripcion: Optional[str] = ''
    permisos: List[str] = []


def _limpiar(data: PerfilInput, depto: str) -> dict:
    nombre = ' '.join((data.nombre or '').split())[:60]
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del perfil')
    validos = _validos(depto)
    return {'nombre': nombre, 'descripcion': ' '.join((data.descripcion or '').split())[:200],
            'permisos': sorted({p for p in data.permisos if p in validos})}


async def _nombre_libre(depto, nombre, excluir=None):
    q = {'departamento': depto, 'nombre': {'$regex': f'^{re.escape(nombre)}$', '$options': 'i'}}
    if excluir:
        q['id'] = {'$ne': excluir}
    if await db.acceso_perfiles.find_one(q):
        raise HTTPException(status_code=400, detail='Ya existe un perfil con ese nombre')


@router.post('/perfiles')
async def crear_perfil(data: PerfilInput, user=Depends(get_current_user)):
    _solo_super(user)
    await _exigir_migrado()
    d = data.departamento or departamento_de(user)
    if not await db.org_departamentos.find_one({'id': d}):
        raise HTTPException(status_code=400, detail='Elige un departamento válido')
    campos = _limpiar(data, d)
    await _nombre_libre(d, campos['nombre'])
    p = {'id': new_id(), 'departamento': d, 'clave': None, **campos, 'sistema': False,
         'orden': await db.acceso_perfiles.count_documents({'departamento': d}),
         'created_at': now_iso(), 'created_by': user['name']}
    await db.acceso_perfiles.insert_one(p)
    p.pop('_id', None)
    await log_activity(user['id'], user['name'], user.get('avatar_url'), 'creó el perfil', p['nombre'], 'perfil', d)
    return serialize_doc(p)


@router.put('/perfiles/{pid}')
async def editar_perfil(pid: str, data: PerfilInput, user=Depends(get_current_user)):
    _solo_super(user)
    p = await db.acceso_perfiles.find_one({'id': pid}, {'_id': 0})
    if not p:
        raise HTTPException(status_code=404, detail='Perfil no encontrado')
    campos = _limpiar(data, p['departamento'])
    await _nombre_libre(p['departamento'], campos['nombre'], excluir=pid)
    await db.acceso_perfiles.update_one({'id': pid}, {'$set': {**campos, 'updated_at': now_iso(), 'updated_by': user['name']}})
    await recalcular(filtro_departamento(p['departamento']))
    await log_activity(user['id'], user['name'], user.get('avatar_url'), 'editó el perfil', campos['nombre'], 'perfil', p['departamento'])
    return serialize_doc(await db.acceso_perfiles.find_one({'id': pid}, {'_id': 0}))


@router.delete('/perfiles/{pid}')
async def borrar_perfil(pid: str, user=Depends(get_current_user)):
    _solo_super(user)
    p = await db.acceso_perfiles.find_one({'id': pid}, {'_id': 0})
    if not p:
        raise HTTPException(status_code=404, detail='Perfil no encontrado')
    if pid in _por_defecto(p['departamento']):
        raise HTTPException(status_code=400, detail=f'{p["nombre"]} es el perfil de quien no tiene otro: se edita, no se borra')
    n = await db.acceso_asignaciones.count_documents({'perfil_id': pid})
    if n:
        raise HTTPException(status_code=400, detail=f'Lo usan {n} cargo(s) o área(s): cámbialos de perfil primero')
    await db.acceso_perfiles.delete_one({'id': pid})
    await log_activity(user['id'], user['name'], user.get('avatar_url'), 'eliminó el perfil', p['nombre'], 'perfil', p['departamento'])
    return {'message': f'Perfil {p["nombre"]} eliminado'}


# ---- Perfil por cargo ----
@router.get('/asignaciones')
async def listar_asignaciones(departamento: Optional[str] = None, user=Depends(get_current_user)):
    """Cada cargo del departamento con su perfil, sus ajustes por área y
    cuánta gente cae en cada uno."""
    import organizacion
    d = _depto(user, departamento)
    _exigir(user, d)
    perfiles, asignaciones, niveles = await _contexto()
    areas = await organizacion.areas_de(d)
    etq = organizacion._etiquetas(areas)
    gente = await db.users.find({**filtro_departamento(d), 'status': 'approved'}, {'_id': 0, 'password_hash': 0}).to_list(3000)
    out = []
    for c in await organizacion.cargos_de(d):
        propias = [a for a in asignaciones if a['cargo_id'] == c['id']]
        base = next((a for a in propias if not a.get('area_id')), None)
        del_cargo = [u for u in gente if u.get('cargo_id') == c['id'] and not es_fijo(u)]
        ajustes = [{'id': a['id'], 'area_id': a['area_id'], 'area': etq.get(a['area_id'], '—'), 'perfil_id': a['perfil_id'],
                    'personas': sum(1 for u in del_cargo if _perfil_de(u, asignaciones, niveles) == a['perfil_id']
                                    and a['area_id'] in (u.get('area_path') or []))}
                   for a in propias if a.get('area_id')]
        pid = base['perfil_id'] if base else perfil_por_defecto(d, c.get('nivel'))
        out.append({
            'cargo_id': c['id'], 'cargo': c['nombre'], 'nivel': c.get('nivel'),
            'fijo': c.get('nivel') == 'jefe_depto',
            'perfil_id': pid, 'asignado': bool(base),
            'personas': sum(1 for u in del_cargo if _perfil_de(u, asignaciones, niveles) == pid),
            'ajustes': sorted(ajustes, key=lambda x: x['area']),
        })
    return serialize_doc({
        'cargos': out,
        'areas': [{'id': a['id'], 'nombre': etq[a['id']]} for a in organizacion._ordenar_arbol(areas)],
        'perfiles': [{'id': p['id'], 'nombre': p['nombre']}
                     for p in sorted(perfiles.values(), key=lambda p: (p.get('orden', 0), p['nombre'])) if p['departamento'] == d],
    })


class AsignacionInput(BaseModel):
    cargo_id: str
    area_id: Optional[str] = None
    perfil_id: str


@router.put('/asignaciones')
async def guardar_asignacion(data: AsignacionInput, user=Depends(get_current_user)):
    await _exigir_migrado()
    cargo = await db.org_cargos.find_one({'id': data.cargo_id}, {'_id': 0})
    if not cargo:
        raise HTTPException(status_code=404, detail='Cargo no encontrado')
    d = cargo['departamento']
    _exigir(user, d)
    if cargo.get('nivel') == 'jefe_depto':
        raise HTTPException(status_code=400, detail='El jefe del departamento tiene acceso total fijo: no usa perfil')
    if data.area_id and not await db.org_areas.find_one({'id': data.area_id, 'departamento': d}):
        raise HTTPException(status_code=400, detail='Elige un área del departamento')
    if not await db.acceso_perfiles.find_one({'id': data.perfil_id, 'departamento': d}):
        raise HTTPException(status_code=400, detail='Elige un perfil del departamento')
    aid = f'{data.cargo_id}@{data.area_id or "*"}'
    await db.acceso_asignaciones.update_one(
        {'id': aid}, {'$set': {'id': aid, 'departamento': d, 'cargo_id': data.cargo_id, 'area_id': data.area_id or None,
                               'perfil_id': data.perfil_id, 'updated_at': now_iso(), 'updated_by': user['name']}}, upsert=True)
    await recalcular({'cargo_id': data.cargo_id})
    await log_activity(user['id'], user['name'], user.get('avatar_url'), 'cambió el perfil del cargo', cargo['nombre'], 'perfil', d)
    return {'id': aid}


@router.delete('/asignaciones/{aid}')
async def borrar_asignacion(aid: str, user=Depends(get_current_user)):
    a = await db.acceso_asignaciones.find_one({'id': aid}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Ajuste no encontrado')
    _exigir(user, a['departamento'])
    await db.acceso_asignaciones.delete_one({'id': aid})
    await recalcular({'cargo_id': a['cargo_id']})
    return {'message': 'Ajuste quitado'}


# ---- Personas ----
async def _persona_editable(uid, user):
    target = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(status_code=404, detail='Usuario no encontrado')
    _exigir(user, departamento_de(target))
    return target


@router.get('/personas')
async def personas(departamento: Optional[str] = None, user=Depends(get_current_user)):
    d = _depto(user, departamento)
    _exigir(user, d)
    perfiles, asignaciones, niveles = await _contexto()
    out = []
    async for u in db.users.find({**filtro_departamento(d), 'status': 'approved'}, {'_id': 0, 'password_hash': 0}).sort('name', 1):
        pid = _perfil_de(u, asignaciones, niveles)
        out.append({'id': u['id'], 'name': u['name'], 'email': u.get('email'), 'avatar_url': u.get('avatar_url'),
                    'position': u.get('position'), 'area': u.get('area'), 'sucursal': u.get('sucursal'),
                    'fijo': es_fijo(u), 'perfil': (perfiles.get(pid) or {}).get('nombre'),
                    'excepciones': len(u.get('acceso_excepciones') or {})})
    return serialize_doc(out)


@router.get('/usuario/{uid}')
async def acceso_de_usuario(uid: str, user=Depends(get_current_user)):
    """Lo que puede la persona y de dónde viene (su perfil o una excepción)."""
    target = await _persona_editable(uid, user)
    perfiles, asignaciones, niveles = await _contexto()
    pid = _perfil_de(target, asignaciones, niveles)
    base = set((perfiles.get(pid) or {}).get('permisos') or [])
    extra = target.get('acceso_excepciones') or {}
    puede = set(lista(target))
    validos = _validos(departamento_de(target))
    return serialize_doc({
        'fijo': es_fijo(target), 'admin': target.get('role') == 'admin', 'migrado': 'acceso_migrado_at' in target,
        'perfil': {'id': pid, 'nombre': (perfiles.get(pid) or {}).get('nombre')},
        'permisos': [{'id': k, 'por_perfil': k in base, 'excepcion': extra.get(k), 'efectivo': k in puede}
                     for k in TODOS if k in validos],
    })


class ExcepcionesInput(BaseModel):
    excepciones: Dict[str, Optional[bool]]  # permiso -> true (dar) | false (quitar) | null (según su perfil)


@router.put('/usuario/{uid}')
async def guardar_excepciones(uid: str, data: ExcepcionesInput, user=Depends(get_current_user)):
    await _exigir_migrado()
    target = await _persona_editable(uid, user)
    if 'acceso_migrado_at' not in target:
        raise HTTPException(status_code=409, detail='Esta persona todavía no pasó a los perfiles')
    if es_fijo(target) and any(k not in DESDE_CARGO_JEFE for k in data.excepciones):
        raise HTTPException(status_code=400, detail='Tiene acceso total fijo: solo se ajusta lo que le sale de su cargo')
    validos = _validos(departamento_de(target))
    extra = dict(target.get('acceso_excepciones') or {})
    for k, v in data.excepciones.items():
        if k not in validos:
            continue
        if v is None:
            extra.pop(k, None)
        else:
            extra[k] = bool(v)
    await db.users.update_one({'id': uid}, {'$set': {'acceso_excepciones': extra}})
    await recalcular({'id': uid})
    await log_activity(user['id'], user['name'], user.get('avatar_url'), 'cambió los permisos de', target['name'], 'user',
                       departamento_de(target))
    return await acceso_de_usuario(uid, user)


# ---- Aviso al apagar un módulo ----
# Lo que una persona tiene pendiente en cada módulo (si lo pierde, se queda ahí
# sin que lo vea): (módulo, texto en singular, texto en plural, consulta).
async def _pendientes(uid: str) -> dict:
    import recurrence
    from core import today_local_str
    hoy = today_local_str()
    fin = f'{int(hoy[:4]) + 1}{hoy[4:]}'
    cuentas = {
        'agenda': ('reunión próxima', 'reuniones próximas', db.activities.count_documents(
            {'$and': [recurrence.filtro_rango(hoy, fin), {'$or': [{'created_by': uid}, {'participants.user_id': uid}]}]})),
        'tareas': ('tarea pendiente', 'tareas pendientes', db.tareas.count_documents(
            {'estado': 'abierta', 'asignados': {'$elemMatch': {'id': uid, 'estado': {'$in': ['pendiente', 'devuelta']}}}})),
        'mis_mant': ('mantenimiento pendiente', 'mantenimientos pendientes', db.mant_tareas.count_documents(
            {'responsable_id': uid, 'estado': {'$in': ['programada', 'pendiente']}})),
        'planes': ('planificación que supervisa', 'planificaciones que supervisa', db.mant_planes.count_documents(
            {'supervisor_id': uid, 'estado': 'activa'})),
        'activos': ('categoría de activos a su cargo', 'categorías de activos a su cargo', db.activo_categorias.count_documents(
            {'responsables': uid})),
        'seguimientos': ('seguimiento abierto', 'seguimientos abiertos', db.tickets.count_documents(
            {'asignado_a.id': uid, 'estado': 'abierto'})),
    }
    out = {}
    for modulo, (uno, varios, consulta) in cuentas.items():
        n = await consulta
        if n:
            out[modulo] = f'{n} {uno if n == 1 else varios}'
    return out


class ImpactoInput(BaseModel):
    perfil_id: Optional[str] = None       # editar un perfil: con `permisos`
    permisos: Optional[List[str]] = None
    cargo_id: Optional[str] = None        # perfil por cargo: con `area_id` y `perfil_id` (o `quitar`)
    area_id: Optional[str] = None
    quitar: bool = False
    usuario_id: Optional[str] = None      # excepciones de una persona: con `excepciones`
    excepciones: Optional[Dict[str, Optional[bool]]] = None


@router.post('/impacto')
async def impacto(data: ImpactoInput, user=Depends(get_current_user)):
    """Antes de guardar: a quién se le quita algún módulo con este cambio
    (`personas`, con lo que pierde y lo que tiene pendiente en ello). Solo
    calcula; no guarda nada."""
    perfiles, asignaciones, niveles = await _contexto()
    base_de = {pid: set(p.get('permisos') or []) for pid, p in perfiles.items()}
    q = {'status': 'approved', 'acceso_migrado_at': {'$exists': True}}
    if data.usuario_id:
        q['id'] = data.usuario_id
    elif data.cargo_id:
        q['cargo_id'] = data.cargo_id
    elif data.perfil_id:
        p = perfiles.get(data.perfil_id)
        if not p:
            raise HTTPException(status_code=404, detail='Perfil no encontrado')
        q.update(filtro_departamento(p['departamento']))
        base_de[data.perfil_id] = set(data.permisos or [])
    else:
        return {'personas': []}
    if data.cargo_id:
        aid = f'{data.cargo_id}@{data.area_id or "*"}'
        asignaciones = [a for a in asignaciones if a['id'] != aid]
        if not data.quitar and data.perfil_id:
            asignaciones.append({'id': aid, 'cargo_id': data.cargo_id, 'area_id': data.area_id or None, 'perfil_id': data.perfil_id})
    out = []
    async for u in db.users.find(q, {'_id': 0, 'password_hash': 0}):
        if not _puede_editar(user, departamento_de(u)):
            raise HTTPException(status_code=403, detail='Solo un admin o el jefe del departamento maneja sus permisos')
        exc = dict(u.get('acceso_excepciones') or {})
        if data.usuario_id:
            for k, v in (data.excepciones or {}).items():
                if v is None:
                    exc.pop(k, None)
                else:
                    exc[k] = bool(v)
        nuevo = set(efectivo(u, base_de.get(_perfil_de(u, asignaciones, niveles), set()), exc))
        pierde = [m for m in set(u.get('acceso') or []) - nuevo if m not in MODULO_DE]
        if not pierde:
            continue
        pend = await _pendientes(u['id'])
        out.append({'id': u['id'], 'nombre': u['name'],
                    'modulos': [NOMBRE_MODULO[m] for m in sorted(pierde, key=TODOS.index)],
                    'pendientes': ', '.join(pend[m] for m in pierde if m in pend)})
    return {'personas': sorted(out, key=lambda p: (not p['pendientes'], p['nombre']))}
