"""Estructura de la organización: departamentos, áreas y cargos.

Departamentos (db.org_departamentos): Ventas Retail, Logística y los que cree
un super admin. Están totalmente separados: cada uno ve solo a su gente y sus
datos. El `id` es la clave que se guarda en cada usuario y en los datos
(`departamento`); los de siempre usan su nombre como clave ('Ventas Retail',
'Logística') para no migrar datos. Lo que no tiene el campo es de Retail.

Áreas (db.org_areas): un árbol sin límite de niveles por departamento
(`padre_id`). Cada usuario está en un área (`area_id`) y guarda el camino
desde la raíz (`area_path`) para calcular el mando sin consultas.

Cargos (db.org_cargos): con el nombre que use cada departamento y un nivel de
mando (NIVELES). Los permisos se calculan por el nivel, no por el nombre. Cada
usuario guarda `cargo_id` y su `nivel`.

Lo que usan los módulos de tienda de Retail (Director comercial, Gerente,
Jefe, Jefe de tienda, Coordinador; Tienda, ECCP, Operación Tienda, Casa
Matriz) es "del sistema" (`sistema`): se puede renombrar pero no borrar. Su
`clave` es el nombre de siempre y es lo que se guarda en el usuario
(`position` / `area`), así el código que depende de esos nombres sigue igual.

Quién edita: el super admin todo; en su departamento, sus admins y su jefe
(nivel jefe_depto). Crear departamentos: solo el super admin.
"""
import logging
import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import (db, get_current_user, serialize_doc, new_id, now_iso, RETAIL, LOGISTICA,
                  departamento_de, es_super_admin, filtro_depto)
import permisos
import acceso

router = APIRouter(prefix='/org', tags=['organizacion'])
logger = logging.getLogger('organizacion')

# Niveles de mando, de mayor a menor.
NIVELES = {
    'jefe_depto': 'Jefe del departamento',
    'gerente': 'Gerente',
    'jefe': 'Jefe',
    'coordinador': 'Coordinador',
    'colaborador': 'Colaborador',
}
# Cargos de mando: solo los asigna un admin (no se eligen al registrarse).
NIVELES_DE_MANDO = ('jefe_depto', 'gerente', 'jefe')

AREAS_RETAIL = ['ECCP', 'Negocios País', 'Negocios Remotos', 'Caja', 'Ferrecréditos',
                'Operación Tienda', 'Centro de Servicio', 'Tienda', 'Auditoría', 'Casa Matriz']
AREAS_RETAIL_SISTEMA = {'Tienda', 'ECCP', 'Operación Tienda', 'Casa Matriz'}
CARGOS_RETAIL = [('Director comercial', 'jefe_depto', True), ('Gerente', 'gerente', True), ('Jefe', 'jefe', True),
                 ('Jefe de tienda', 'jefe', True), ('Coordinador', 'coordinador', True),
                 ('Asesor Comercial', 'colaborador', False), ('Colaborador', 'colaborador', False)]
CARGOS_LOGISTICA = [('Gerente de Logística', 'jefe_depto', True), ('Jefe', 'jefe', False),
                    ('Coordinador', 'coordinador', False), ('Auxiliar', 'colaborador', False)]
# Un departamento nuevo arranca con estos cargos (se renombran y se agregan más).
CARGOS_NUEVO = [('Jefe del departamento', 'jefe_depto'), ('Jefe', 'jefe'),
                ('Coordinador', 'coordinador'), ('Colaborador', 'colaborador')]


def _txt(v, n=80) -> str:
    return ' '.join(str(v or '').split())[:n]


# --------------------------------------------------------------------------- #
#  Migración (idempotente, al arrancar)
# --------------------------------------------------------------------------- #
async def ensure_indexes():
    await db.org_departamentos.create_index('id', unique=True)
    await db.org_areas.create_index('id', unique=True)
    await db.org_areas.create_index([('departamento', 1), ('padre_id', 1)])
    await db.org_cargos.create_index('id', unique=True)
    await db.org_cargos.create_index('departamento')


async def _area(depto, nombre, padre_id=None, sistema=False, orden=0):
    """Busca (o crea) un área por nombre bajo un padre."""
    a = await db.org_areas.find_one({'departamento': depto, 'padre_id': padre_id, 'clave': nombre}, {'_id': 0})
    if a:
        return a
    a = {'id': new_id(), 'departamento': depto, 'nombre': nombre, 'clave': nombre, 'padre_id': padre_id,
         'sistema': sistema, 'orden': orden, 'created_at': now_iso()}
    await db.org_areas.insert_one(a)
    a.pop('_id', None)
    return a


async def _cargo(depto, nombre, nivel='colaborador', sistema=False, orden=0):
    c = await db.org_cargos.find_one({'departamento': depto, 'clave': nombre}, {'_id': 0})
    if c:
        return c
    c = {'id': new_id(), 'departamento': depto, 'nombre': nombre, 'clave': nombre, 'nivel': nivel,
         'sistema': sistema, 'orden': orden, 'created_at': now_iso(),
         'perfil_id': permisos.perfil_por_defecto(depto, nombre, nivel)}
    await db.org_cargos.insert_one(c)
    c.pop('_id', None)
    return c


async def asegurar():
    """Crea la estructura de Retail y Logística a partir de lo que ya existe y
    completa en cada usuario su área, cargo, nivel y camino. Se puede correr
    las veces que sea: no duplica ni pisa lo que ya se editó."""
    for i, (did, nombre) in enumerate(((RETAIL, 'Ventas Retail'), (LOGISTICA, 'Logística'))):
        if not await db.org_departamentos.find_one({'id': did}):
            await db.org_departamentos.insert_one({'id': did, 'nombre': nombre, 'sistema': True, 'orden': i,
                                                   'created_at': now_iso()})
    for i, a in enumerate(AREAS_RETAIL):
        await _area(RETAIL, a, sistema=a in AREAS_RETAIL_SISTEMA, orden=i)
    for i, (n, nivel, sis) in enumerate(CARGOS_RETAIL):
        await _cargo(RETAIL, n, nivel, sis, i)
    viejas = (await db.config.find_one({'_id': 'areas_logistica'}) or {}).get('areas') or ['Bodega', 'Distribución', 'Transporte']
    for i, a in enumerate(['Gerencia'] + viejas):
        await _area(LOGISTICA, a, orden=i)
    for i, (n, nivel, sis) in enumerate(CARGOS_LOGISTICA):
        await _cargo(LOGISTICA, n, nivel, sis, i)

    # usuarios sin estructura: se ubican por el nombre de su área y cargo
    async for u in db.users.find({'$or': [{'cargo_id': {'$exists': False}}, {'area_id': {'$exists': False}}]},
                                 {'_id': 0, 'id': 1, 'departamento': 1, 'position': 1, 'area': 1}):
        depto = u.get('departamento') or RETAIL
        if not await db.org_departamentos.find_one({'id': depto}):
            depto = RETAIL
        cargo = await _cargo(depto, (u.get('position') or 'Colaborador').strip() or 'Colaborador')
        area = await _area(depto, u['area'].strip()) if (u.get('area') or '').strip() else None
        await db.users.update_one({'id': u['id']}, {'$set': {
            'departamento': depto, 'cargo_id': cargo['id'], 'nivel': cargo['nivel'],
            'area_id': area['id'] if area else None, 'area_path': await camino(area['id']) if area else []}})


# --------------------------------------------------------------------------- #
#  Utilidades
# --------------------------------------------------------------------------- #
async def camino(area_id) -> list:
    """Ids desde la raíz hasta el área (incluida)."""
    out, actual, vistos = [], area_id, set()
    while actual and actual not in vistos:
        vistos.add(actual)
        a = await db.org_areas.find_one({'id': actual}, {'_id': 0, 'id': 1, 'padre_id': 1})
        if not a:
            break
        out.insert(0, a['id'])
        actual = a.get('padre_id')
    return out


async def departamentos() -> list:
    return await db.org_departamentos.find({}, {'_id': 0}).sort([('orden', 1), ('nombre', 1)]).to_list(100)


async def existe_departamento(did) -> bool:
    return bool(did) and bool(await db.org_departamentos.find_one({'id': did}, {'_id': 1}))


async def areas_de(depto) -> list:
    return await db.org_areas.find({'departamento': depto}, {'_id': 0}).sort([('orden', 1), ('nombre', 1)]).to_list(2000)


async def cargos_de(depto) -> list:
    return await db.org_cargos.find({'departamento': depto}, {'_id': 0}).sort([('orden', 1), ('nombre', 1)]).to_list(500)


def _etiquetas(areas: list) -> dict:
    """id -> 'Bodega › Recepción' (camino completo) para listas planas."""
    por_id = {a['id']: a for a in areas}

    def etiqueta(a, vistos=()):
        p = por_id.get(a.get('padre_id'))
        if p and p['id'] not in vistos:
            return f"{etiqueta(p, vistos + (a['id'],))} › {a['nombre']}"
        return a['nombre']
    return {a['id']: etiqueta(a) for a in areas}


def _ordenar_arbol(areas: list) -> list:
    """Lista plana en orden de árbol (padre seguido de sus hijas), con nivel."""
    hijos = {}
    for a in areas:
        hijos.setdefault(a.get('padre_id'), []).append(a)
    out = []

    def bajar(pid, nivel, vistos):
        for a in sorted(hijos.get(pid, []), key=lambda x: (x.get('orden', 0), x['nombre'])):
            if a['id'] in vistos:
                continue
            out.append({**a, 'nivel_arbol': nivel})
            bajar(a['id'], nivel + 1, vistos | {a['id']})
    bajar(None, 0, set())
    return out


async def resolver(depto: str, cargo_id: Optional[str] = None, area_id: Optional[str] = None,
                   cargo_nombre: Optional[str] = None, area_nombre: Optional[str] = None) -> dict:
    """Valida cargo y área dentro del departamento y devuelve lo que se guarda
    en el usuario. Acepta ids (pantallas nuevas) o nombres (compatibilidad)."""
    cargo = None
    if cargo_id:
        cargo = await db.org_cargos.find_one({'id': cargo_id, 'departamento': depto}, {'_id': 0})
    elif cargo_nombre:
        cargo = await db.org_cargos.find_one({'departamento': depto, '$or': [{'clave': cargo_nombre}, {'nombre': cargo_nombre}]}, {'_id': 0})
    if not cargo:
        raise HTTPException(status_code=400, detail='Elige un cargo del departamento')
    area = None
    if area_id:
        area = await db.org_areas.find_one({'id': area_id, 'departamento': depto}, {'_id': 0})
        if not area:
            raise HTTPException(status_code=400, detail='Elige un área del departamento')
    elif area_nombre:
        area = await db.org_areas.find_one({'departamento': depto, '$or': [{'clave': area_nombre}, {'nombre': area_nombre}]}, {'_id': 0})
        if not area:
            raise HTTPException(status_code=400, detail='Elige un área del departamento')
    if not area and cargo['nivel'] != 'jefe_depto':
        raise HTTPException(status_code=400, detail='Elige el área')
    return {
        'departamento': depto, 'cargo_id': cargo['id'], 'nivel': cargo['nivel'], 'position': cargo['clave'],
        'area_id': area['id'] if area else None, 'area': area['clave'] if area else '',
        'area_path': await camino(area['id']) if area else [],
    }


def es_cargo_de_mando(cargo: dict) -> bool:
    return (cargo or {}).get('nivel') in NIVELES_DE_MANDO


# --------------------------------------------------------------------------- #
#  Permisos de edición
# --------------------------------------------------------------------------- #
def puede_editar(user, depto) -> bool:
    """Editan la estructura de un departamento: el super admin, y sus admins y
    su jefe (nivel jefe_depto)."""
    if es_super_admin(user):
        return True
    if departamento_de(user) != depto:
        return False
    return user.get('role') == 'admin' or user.get('nivel') == 'jefe_depto'


def _exigir(user, depto):
    if not puede_editar(user, depto):
        raise HTTPException(status_code=403, detail='Solo un admin o el jefe del departamento cambia su estructura')


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
@router.get('/publico')
async def publico():
    """Para registrarse: departamentos con sus áreas (camino completo) y los
    cargos que cada quien puede elegir (los de mando los asigna un admin)."""
    out = []
    for d in await departamentos():
        areas = await areas_de(d['id'])
        etq = _etiquetas(areas)
        out.append({
            'id': d['id'], 'nombre': d['nombre'],
            'areas': [{'id': a['id'], 'nombre': etq[a['id']], 'clave': a['clave']} for a in _ordenar_arbol(areas)],
            'cargos': [{'id': c['id'], 'nombre': c['nombre'], 'clave': c['clave'], 'nivel': c['nivel']}
                       for c in await cargos_de(d['id']) if not es_cargo_de_mando(c)],
        })
    return {'departamentos': out}


@router.get('/estructura')
async def estructura(user=Depends(get_current_user)):
    """Departamentos que la persona ve (el super admin, todos) con su árbol de
    áreas, cargos y cuánta gente hay en cada uno."""
    deptos = [d for d in await departamentos() if es_super_admin(user) or d['id'] == departamento_de(user)]
    ids = [d['id'] for d in deptos]
    # pocas consultas en total (no por departamento): áreas, cargos y gente
    areas_por, cargos_por = {}, {}
    for a in await db.org_areas.find({'departamento': {'$in': ids}}, {'_id': 0}).to_list(5000):
        areas_por.setdefault(a['departamento'], []).append(a)
    for c in await db.org_cargos.find({'departamento': {'$in': ids}}, {'_id': 0}).to_list(2000):
        cargos_por.setdefault(c['departamento'], []).append(c)
    conteo_a, conteo_c = {}, {}
    q_users = {'status': 'approved'} if es_super_admin(user) else {'status': 'approved', **filtro_departamento(ids[0] if ids else RETAIL)}
    async for u in db.users.find(q_users, {'_id': 0, 'area_id': 1, 'cargo_id': 1}):
        conteo_a[u.get('area_id')] = conteo_a.get(u.get('area_id'), 0) + 1
        conteo_c[u.get('cargo_id')] = conteo_c.get(u.get('cargo_id'), 0) + 1
    out = []
    for d in deptos:
        areas = areas_por.get(d['id'], [])
        cargos = sorted(cargos_por.get(d['id'], []), key=lambda c: (c.get('orden', 0), c['nombre']))
        etq = _etiquetas(areas)
        out.append({
            **d, 'puede_editar': puede_editar(user, d['id']),
            'areas': [{**a, 'etiqueta': etq[a['id']], 'personas': conteo_a.get(a['id'], 0)} for a in _ordenar_arbol(areas)],
            'cargos': [{**c, 'personas': conteo_c.get(c['id'], 0)} for c in cargos],
        })
    return serialize_doc({'departamentos': out, 'niveles': NIVELES, 'super_admin': es_super_admin(user)})


def filtro_departamento(depto) -> dict:
    """Filtro de usuarios/datos de un departamento (Retail incluye lo que no tiene el campo)."""
    return {'departamento': {'$in': [None, RETAIL]}} if depto == RETAIL else {'departamento': depto}


# --------------------------------------------------------------------------- #
#  Departamentos (super admin)
# --------------------------------------------------------------------------- #
class DeptoInput(BaseModel):
    nombre: str


@router.post('/departamentos')
async def crear_departamento(data: DeptoInput, user=Depends(get_current_user)):
    if not es_super_admin(user):
        raise HTTPException(status_code=403, detail='Solo el super admin crea departamentos')
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del departamento')
    if await db.org_departamentos.find_one({'nombre': {'$regex': f'^{re.escape(nombre)}$', '$options': 'i'}}):
        raise HTTPException(status_code=400, detail='Ya existe un departamento con ese nombre')
    d = {'id': new_id(), 'nombre': nombre, 'sistema': False,
         'orden': await db.org_departamentos.count_documents({}), 'created_at': now_iso(), 'created_by': user['name']}
    await db.org_departamentos.insert_one(d)
    for i, (n, nivel) in enumerate(CARGOS_NUEVO):
        await _cargo(d['id'], n, nivel, False, i)
    await acceso.asegurar_departamento(d['id'])
    d.pop('_id', None)
    return serialize_doc(d)


@router.put('/departamentos/{did}')
async def renombrar_departamento(did: str, data: DeptoInput, user=Depends(get_current_user)):
    if not es_super_admin(user):
        raise HTTPException(status_code=403, detail='Solo el super admin renombra departamentos')
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del departamento')
    if not await db.org_departamentos.find_one({'id': did}):
        raise HTTPException(status_code=404, detail='Departamento no encontrado')
    if await db.org_departamentos.find_one({'id': {'$ne': did}, 'nombre': {'$regex': f'^{re.escape(nombre)}$', '$options': 'i'}}):
        raise HTTPException(status_code=400, detail='Ya existe un departamento con ese nombre')
    await db.org_departamentos.update_one({'id': did}, {'$set': {'nombre': nombre}})
    return {'id': did, 'nombre': nombre}


@router.delete('/departamentos/{did}')
async def borrar_departamento(did: str, user=Depends(get_current_user)):
    if not es_super_admin(user):
        raise HTTPException(status_code=403, detail='Solo el super admin elimina departamentos')
    d = await db.org_departamentos.find_one({'id': did}, {'_id': 0})
    if not d:
        raise HTTPException(status_code=404, detail='Departamento no encontrado')
    if d.get('sistema'):
        raise HTTPException(status_code=400, detail=f'{d["nombre"]} no se puede eliminar')
    n = await db.users.count_documents({'departamento': did})
    if n:
        raise HTTPException(status_code=400, detail=f'Tiene {n} persona(s): muévelas antes de eliminarlo')
    await db.org_areas.delete_many({'departamento': did})
    await db.org_cargos.delete_many({'departamento': did})
    await db.acceso_perfiles.delete_many({'departamento': did})
    await db.acceso_asignaciones.delete_many({'departamento': did})
    await db.org_departamentos.delete_one({'id': did})
    return {'message': f'Departamento {d["nombre"]} eliminado'}


# --------------------------------------------------------------------------- #
#  Áreas (árbol)
# --------------------------------------------------------------------------- #
class AreaInput(BaseModel):
    departamento: Optional[str] = None
    nombre: str
    padre_id: Optional[str] = None


async def _area_o_404(aid):
    a = await db.org_areas.find_one({'id': aid}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='Área no encontrada')
    return a


async def _validar_padre(depto, padre_id, mover_id=None):
    if not padre_id:
        return None
    p = await db.org_areas.find_one({'id': padre_id, 'departamento': depto}, {'_id': 0})
    if not p:
        raise HTTPException(status_code=400, detail='El área de arriba no es de este departamento')
    if mover_id and mover_id in await camino(padre_id):
        raise HTTPException(status_code=400, detail='Un área no puede quedar debajo de sí misma')
    return p


async def _nombre_libre(depto, padre_id, nombre, excluir=None):
    q = {'departamento': depto, 'padre_id': padre_id, 'nombre': {'$regex': f'^{re.escape(nombre)}$', '$options': 'i'}}
    if excluir:
        q['id'] = {'$ne': excluir}
    if await db.org_areas.find_one(q):
        raise HTTPException(status_code=400, detail=f'Ya hay un área {nombre} en ese nivel')


@router.post('/areas')
async def crear_area(data: AreaInput, user=Depends(get_current_user)):
    depto = data.departamento if (es_super_admin(user) and data.departamento) else departamento_de(user)
    _exigir(user, depto)
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del área')
    await _validar_padre(depto, data.padre_id)
    await _nombre_libre(depto, data.padre_id, nombre)
    a = {'id': new_id(), 'departamento': depto, 'nombre': nombre, 'clave': nombre, 'padre_id': data.padre_id or None,
         'sistema': False, 'orden': await db.org_areas.count_documents({'departamento': depto, 'padre_id': data.padre_id or None}),
         'created_at': now_iso(), 'created_by': user['name']}
    await db.org_areas.insert_one(a)
    a.pop('_id', None)
    return serialize_doc(a)


async def _recalcular_caminos(area_id):
    """El área se movió: actualiza el camino de su gente y la de sus subáreas."""
    ids = [area_id]
    i = 0
    while i < len(ids):
        ids += [h['id'] for h in await db.org_areas.find({'padre_id': ids[i]}, {'_id': 0, 'id': 1}).to_list(1000)]
        i += 1
    for aid in ids:
        await db.users.update_many({'area_id': aid}, {'$set': {'area_path': await camino(aid)}})
    await acceso.recalcular({'area_id': {'$in': ids}})


@router.put('/areas/{aid}')
async def editar_area(aid: str, data: AreaInput, user=Depends(get_current_user)):
    a = await _area_o_404(aid)
    _exigir(user, a['departamento'])
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del área')
    padre_id = data.padre_id or None
    await _validar_padre(a['departamento'], padre_id, mover_id=aid)
    await _nombre_libre(a['departamento'], padre_id, nombre, excluir=aid)
    sets = {'nombre': nombre, 'padre_id': padre_id, 'updated_at': now_iso()}
    if not a.get('sistema'):
        # las del sistema guardan su clave (la usa el código); las demás, el nombre
        sets['clave'] = nombre
        await db.users.update_many({'area_id': aid}, {'$set': {'area': nombre}})
    await db.org_areas.update_one({'id': aid}, {'$set': sets})
    if padre_id != a.get('padre_id'):
        await _recalcular_caminos(aid)
    return serialize_doc(await _area_o_404(aid))


@router.delete('/areas/{aid}')
async def borrar_area(aid: str, user=Depends(get_current_user)):
    a = await _area_o_404(aid)
    _exigir(user, a['departamento'])
    if a.get('sistema'):
        raise HTTPException(status_code=400, detail=f'{a["nombre"]} la usa el sistema: se puede renombrar, no borrar')
    if await db.org_areas.find_one({'padre_id': aid}):
        raise HTTPException(status_code=400, detail='Tiene subáreas: muévelas o bórralas primero')
    n = await db.users.count_documents({'area_id': aid})
    if n:
        raise HTTPException(status_code=400, detail=f'Tiene {n} persona(s): cámbialas de área primero')
    await db.org_areas.delete_one({'id': aid})
    await db.acceso_asignaciones.delete_many({'area_id': aid})
    return {'message': f'Área {a["nombre"]} eliminada'}


# --------------------------------------------------------------------------- #
#  Cargos
# --------------------------------------------------------------------------- #
class CargoInput(BaseModel):
    departamento: Optional[str] = None
    nombre: str
    nivel: str = 'colaborador'


async def _ultimo_jefe(c) -> bool:
    """¿Es el único cargo de jefe del departamento? (siempre tiene que quedar uno)"""
    if c.get('nivel') != 'jefe_depto':
        return False
    return await db.org_cargos.count_documents({'departamento': c['departamento'], 'nivel': 'jefe_depto'}) <= 1


async def _cargo_o_404(cid):
    c = await db.org_cargos.find_one({'id': cid}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=404, detail='Cargo no encontrado')
    return c


@router.post('/cargos')
async def crear_cargo(data: CargoInput, user=Depends(get_current_user)):
    depto = data.departamento if (es_super_admin(user) and data.departamento) else departamento_de(user)
    _exigir(user, depto)
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del cargo')
    if data.nivel not in NIVELES:
        raise HTTPException(status_code=400, detail='Nivel de mando no válido')
    if await db.org_cargos.find_one({'departamento': depto, 'nombre': {'$regex': f'^{re.escape(nombre)}$', '$options': 'i'}}):
        raise HTTPException(status_code=400, detail=f'Ya existe el cargo {nombre}')
    c = {'id': new_id(), 'departamento': depto, 'nombre': nombre, 'clave': nombre, 'nivel': data.nivel, 'sistema': False,
         'orden': await db.org_cargos.count_documents({'departamento': depto}), 'created_at': now_iso(), 'created_by': user['name'],
         'perfil_id': permisos.perfil_por_defecto(depto, nombre, data.nivel)}
    await db.org_cargos.insert_one(c)
    c.pop('_id', None)
    return serialize_doc(c)


@router.put('/cargos/{cid}')
async def editar_cargo(cid: str, data: CargoInput, user=Depends(get_current_user)):
    c = await _cargo_o_404(cid)
    _exigir(user, c['departamento'])
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del cargo')
    if data.nivel not in NIVELES:
        raise HTTPException(status_code=400, detail='Nivel de mando no válido')
    if await db.org_cargos.find_one({'departamento': c['departamento'], 'id': {'$ne': cid},
                                     'nombre': {'$regex': f'^{re.escape(nombre)}$', '$options': 'i'}}):
        raise HTTPException(status_code=400, detail=f'Ya existe el cargo {nombre}')
    sets = {'nombre': nombre, 'updated_at': now_iso()}
    if c.get('sistema'):
        if data.nivel != c['nivel']:
            raise HTTPException(status_code=400, detail='El nivel de un cargo del sistema no se cambia')
    else:
        if data.nivel != c['nivel'] and await _ultimo_jefe(c):
            raise HTTPException(status_code=400, detail='Es el único cargo de jefe del departamento: no se le cambia el nivel')
        sets.update({'clave': nombre, 'nivel': data.nivel})
        await db.users.update_many({'cargo_id': cid}, {'$set': {'position': nombre, 'nivel': data.nivel}})
    await db.org_cargos.update_one({'id': cid}, {'$set': sets})
    await acceso.recalcular({'cargo_id': cid})
    return serialize_doc(await _cargo_o_404(cid))


@router.delete('/cargos/{cid}')
async def borrar_cargo(cid: str, user=Depends(get_current_user)):
    c = await _cargo_o_404(cid)
    _exigir(user, c['departamento'])
    if c.get('sistema'):
        raise HTTPException(status_code=400, detail=f'{c["nombre"]} lo usa el sistema: se puede renombrar, no borrar')
    n = await db.users.count_documents({'cargo_id': cid})
    if n:
        raise HTTPException(status_code=400, detail=f'{n} persona(s) tienen este cargo: cámbialo primero')
    if await _ultimo_jefe(c):
        raise HTTPException(status_code=400, detail='Es el único cargo de jefe del departamento: no se puede quitar')
    await db.org_cargos.delete_one({'id': cid})
    await db.acceso_asignaciones.delete_many({'cargo_id': cid})
    return {'message': f'Cargo {c["nombre"]} eliminado'}
