"""Mando: quién manda sobre quién, según el árbol de áreas y el nivel del cargo.

Cada usuario guarda su departamento, su área (`area_id`), el camino desde la
raíz (`area_path`) y el `nivel` de su cargo (ver organizacion.py). Con eso:

- El jefe del departamento (nivel jefe_depto) manda sobre todo su departamento.
- Un cargo de mando (gerente o jefe) manda sobre su área y todas sus
  subáreas, a cualquier profundidad. En su misma área, solo sobre quien tiene
  un nivel menor (un jefe no manda sobre otro jefe ni sobre el gerente).
- Ventas Retail conserva su regla de siempre en una misma área: los cargos de
  mando (Jefe, Gerente) mandan sobre cualquiera de su área.

Se usa para: aprobar vacaciones (el responsable más cercano), ver calendarios
del equipo y asignar/validar tareas en los departamentos que trabajan por mando.
"""
from core import db, RETAIL, departamento_de, es_retail, es_jefe_depto, mismo_depto, filtro_departamento

RANGO = {'jefe_depto': 0, 'gerente': 1, 'jefe': 2, 'coordinador': 3, 'colaborador': 4}
# Retail: cargos de mando de siempre (para usuarios aún sin nivel)
MANDO_RETAIL = {'Jefe', 'Gerente', 'Director comercial'}
NIVEL_POR_CARGO = {'Director comercial': 'jefe_depto', 'Gerente de Logística': 'jefe_depto', 'Gerente': 'gerente',
                   'Jefe': 'jefe', 'Jefe de tienda': 'jefe', 'Coordinador': 'coordinador'}


def nivel_de(u) -> str:
    u = u or {}
    return u.get('nivel') or NIVEL_POR_CARGO.get((u.get('position') or '').strip(), 'colaborador')


def es_mando(u) -> bool:
    """Tiene un cargo que manda sobre un área. En Retail, los de siempre
    (Jefe, Gerente, Director comercial: el Jefe de tienda no aprueba vacaciones)."""
    if es_retail(u):
        return ((u or {}).get('position') or '').strip() in MANDO_RETAIL
    return nivel_de(u) in ('jefe_depto', 'gerente', 'jefe')


def manda_sobre(jefe, persona) -> bool:
    if not jefe or not persona or jefe.get('id') == persona.get('id') or not mismo_depto(jefe, persona):
        return False
    if es_jefe_depto(jefe):
        return True
    if not es_mando(jefe) or not jefe.get('area_id'):
        return False
    camino = persona.get('area_path') or ([persona['area_id']] if persona.get('area_id') else [])
    if jefe['area_id'] not in camino:
        return False
    if persona.get('area_id') != jefe['area_id']:
        return True  # está en una subárea
    if es_retail(jefe):
        return True  # Retail: en la misma área, como siempre
    return RANGO.get(nivel_de(persona), 9) > RANGO.get(nivel_de(jefe), 9)


PROY = {'_id': 0, 'id': 1, 'name': 1, 'avatar_url': 1, 'position': 1, 'area': 1, 'area_id': 1, 'area_path': 1,
        'nivel': 1, 'departamento': 1, 'status': 1}


async def subordinados(jefe, solo_aprobados=True) -> list:
    """Personas sobre las que `jefe` manda (de su departamento)."""
    if not jefe:
        return []
    q = {**filtro_departamento(departamento_de(jefe)), 'id': {'$ne': jefe['id']}}
    if solo_aprobados:
        q['status'] = 'approved'
    if not es_jefe_depto(jefe):
        if not es_mando(jefe) or not jefe.get('area_id'):
            return []
        q['$or'] = [{'area_path': jefe['area_id']}, {'area_id': jefe['area_id']}]
    rows = await db.users.find(q, PROY).to_list(3000)
    return [p for p in rows if manda_sobre(jefe, p)]


async def ids_subordinados(jefe) -> list:
    return [p['id'] for p in await subordinados(jefe)]


async def responsables_cercanos(persona) -> list:
    """Quién aprueba lo de `persona`: los cargos de mando del área más cercana
    hacia arriba que mandan sobre ella; si no hay ninguno, el jefe del
    departamento. Devuelve ids (sin la persona)."""
    depto = departamento_de(persona)
    camino = persona.get('area_path') or ([persona['area_id']] if persona.get('area_id') else [])
    base = {**filtro_departamento(depto), 'status': 'approved', 'id': {'$ne': persona.get('id')}}
    for area_id in reversed(camino):
        candidatos = await db.users.find({**base, 'area_id': area_id}, PROY).to_list(200)
        cerca = [c['id'] for c in candidatos if not es_jefe_depto(c) and manda_sobre(c, persona)]
        if cerca:
            return cerca
    jefes = await db.users.find({**base, '$or': [{'nivel': 'jefe_depto'}, {'nivel': {'$exists': False},
                                                  'position': {'$in': ['Director comercial', 'Gerente de Logística']}}]},
                                PROY).to_list(50)
    return [j['id'] for j in jefes if es_jefe_depto(j)]
