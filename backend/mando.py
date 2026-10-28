"""Mando: quién aprueba a quién y a quién ve cada uno.

Cada usuario guarda su departamento, su área (`area_id`), el camino desde la
raíz (`area_path`) y el `nivel` de su cargo (ver organizacion.py).

- El equipo de una persona lo da la estructura: su área y todas sus
  subáreas; en su misma área, solo quien tiene un nivel menor (dos gerentes
  de la misma área no están uno en el equipo del otro).
- Qué hace con su equipo lo dice su perfil (acceso.py, «Gente a cargo»):
  `equipo.aprobar` aprueba las vacaciones de quienes le reportan (de quien
  es el responsable más cercano) y los ve; `equipo.ver_todo` ve los
  calendarios y vacaciones de todo su equipo, aunque no los apruebe.
- El jefe del departamento (nivel jefe_depto) ve a todo su departamento y
  aprueba a quien no tiene a nadie más cerca.

Mientras no se active el mando por perfil (db.config 'mando_por_perfil',
lo activa scripts/estructura_mando.py) sigue la regla de antes: aprueban y
ven a todo su equipo los cargos de mando, y en Ventas Retail los de mando
mandan sobre cualquiera de su misma área.

Se usa para: aprobar vacaciones (el responsable más cercano), ver calendarios
y vacaciones del equipo y asignar tareas en las áreas que trabajan por mando.
"""
import acceso
from core import db, departamento_de, es_retail, es_jefe_depto, mismo_depto, filtro_departamento

RANGO = {'jefe_depto': 0, 'gerente': 1, 'jefe': 2, 'coordinador': 3, 'colaborador': 4}
# Retail: cargos de mando de siempre (para usuarios aún sin nivel)
MANDO_RETAIL = {'Jefe', 'Gerente', 'Director comercial'}
NIVEL_POR_CARGO = {'Director comercial': 'jefe_depto', 'Gerente de Logística': 'jefe_depto', 'Gerente': 'gerente',
                   'Jefe': 'jefe', 'Jefe de tienda': 'jefe', 'Coordinador': 'coordinador'}
CONFIG = 'mando_por_perfil'


def nivel_de(u) -> str:
    u = u or {}
    return u.get('nivel') or NIVEL_POR_CARGO.get((u.get('position') or '').strip(), 'colaborador')


def es_mando(u) -> bool:
    """Regla de antes: tiene un cargo que manda sobre un área. En Retail, los
    de siempre (Jefe, Gerente, Director comercial: el Jefe de tienda no
    aprueba vacaciones). La siguen usando Tareas y las solicitudes de antes."""
    if es_retail(u):
        return ((u or {}).get('position') or '').strip() in MANDO_RETAIL
    return nivel_de(u) in ('jefe_depto', 'gerente', 'jefe')


async def por_perfil() -> bool:
    """¿Ya manda el perfil (equipo.aprobar / equipo.ver_todo)?"""
    return bool(await db.config.find_one({'_id': CONFIG, 'activo': True}, {'_id': 1}))


# --------------------------------------------------------------------------- #
#  Reglas (sin base: reciben a la gente ya cargada; las usa también el script)
# --------------------------------------------------------------------------- #
def aprueba(u, perfil: bool) -> bool:
    return acceso.tiene(u, 'equipo.aprobar') if perfil else es_mando(u)


def ve_todo(u, perfil: bool) -> bool:
    return acceso.tiene(u, 'equipo.ver_todo') if perfil else es_mando(u)


def _camino(u) -> list:
    return (u or {}).get('area_path') or ([u['area_id']] if (u or {}).get('area_id') else [])


def en_equipo(jefe, persona, perfil: bool) -> bool:
    """¿`persona` está debajo de `jefe` en la estructura?"""
    if not jefe or not persona or jefe.get('id') == persona.get('id') or not mismo_depto(jefe, persona):
        return False
    if es_jefe_depto(jefe):
        return True
    if not jefe.get('area_id') or jefe['area_id'] not in _camino(persona):
        return False
    if persona.get('area_id') != jefe['area_id']:
        return True  # está en una subárea
    if not perfil and es_retail(jefe):
        return True  # regla de antes: en Retail, cualquiera de su misma área
    return RANGO.get(nivel_de(persona), 9) > RANGO.get(nivel_de(jefe), 9)


def aprobadores_de(persona, gente: list, perfil: bool) -> list:
    """Quién aprueba lo de `persona`: quienes aprueban en el área más cercana
    hacia arriba y la tienen en su equipo; si no hay nadie, el jefe del
    departamento. `gente`: los aprobados de su departamento."""
    otros = [c for c in gente if c.get('id') != persona.get('id')]
    for area_id in reversed(_camino(persona)):
        cerca = [c['id'] for c in otros if c.get('area_id') == area_id and not es_jefe_depto(c)
                 and aprueba(c, perfil) and en_equipo(c, persona, perfil)]
        if cerca:
            return cerca
    return [j['id'] for j in otros if es_jefe_depto(j)]


def visibles_de(jefe, gente: list, perfil: bool) -> list:
    """A quién ve `jefe` (calendarios y vacaciones): todo el departamento el
    jefe del departamento; si no, todo su equipo o solo quienes le reportan."""
    if es_jefe_depto(jefe):
        return [p for p in gente if p.get('id') != jefe.get('id') and mismo_depto(jefe, p)]
    equipo = [p for p in gente if en_equipo(jefe, p, perfil)]
    if ve_todo(jefe, perfil):
        return equipo
    if aprueba(jefe, perfil):
        return [p for p in equipo if jefe['id'] in aprobadores_de(p, gente, perfil)]
    return []


# --------------------------------------------------------------------------- #
#  Con la base
# --------------------------------------------------------------------------- #
async def gente_de(depto, solo_aprobados=True) -> list:
    q = filtro_departamento(depto)
    if solo_aprobados:
        q = {**q, 'status': 'approved'}
    return await db.users.find(q, {'_id': 0, 'password_hash': 0}).to_list(3000)


async def subordinados(jefe, solo_aprobados=True) -> list:
    """Personas que `jefe` ve (de su departamento)."""
    if not jefe:
        return []
    return visibles_de(jefe, await gente_de(departamento_de(jefe), solo_aprobados), await por_perfil())


async def ids_subordinados(jefe) -> list:
    return [p['id'] for p in await subordinados(jefe)]


async def ve_a(jefe, persona) -> bool:
    """¿Puede ver el calendario de `persona`?"""
    if not jefe or not persona or not mismo_depto(jefe, persona):
        return False
    return persona.get('id') in await ids_subordinados(jefe)


async def responsables_cercanos(persona) -> list:
    """Quién aprueba lo de `persona` (ids, sin la persona)."""
    return aprobadores_de(persona, await gente_de(departamento_de(persona)), await por_perfil())


async def resumen(u) -> dict:
    """Para la pantalla: ¿aprueba a alguien? ¿ve a su equipo?"""
    perfil = await por_perfil()
    jefe = es_jefe_depto(u)
    return {'aprueba': jefe or aprueba(u, perfil), 've_equipo': jefe or aprueba(u, perfil) or ve_todo(u, perfil)}


async def tiene_equipo(u) -> bool:
    return (await resumen(u))['ve_equipo']
