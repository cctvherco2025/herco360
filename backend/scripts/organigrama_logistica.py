"""Organigrama de Logística (acordado el 2026-11-02).

Por defecto SIMULA: solo lee la base y escribe un reporte de lo que cambiaría.
- Borra las áreas de prueba (todas menos Gerencia) y los cargos de prueba
  (Jefe, Coordinador, Auxiliar). Solo si no tienen gente.
- Crea el árbol de áreas y los cargos del organigrama (ESTRUCTURA):

    Gerencia ............. Gerente de Logística
    └ Operaciones AF y CD  Jefe de operaciones de AF y CD's
      ├ CD ............... Jefe de CD, Asistente administrativo
      │ └ Almacén ........ Coordinador de almacén, Operador de montacarga, Asistente de ingresos
      │   └ Entregas ..... Entregador de almacén, Asistente de almacén
      └ AF ............... Jefe de AF, Operador de montacarga, Asistente de ingresos
        └ Entregas ....... Entregador de almacén, Asistente de almacén

- Perfil «Coordinador» (Colaborador + aprueba a quienes le reportan) para el
  Coordinador de almacén y el Entregador de almacén. Los jefes usan el perfil
  Jefe y los demás Colaborador (los de siempre por nivel).
- Ubica a las personas de PERSONAS (creadas el 2026-11-02 en Gerencia como
  Auxiliar) en su área y cargo, y recalcula lo que pueden.
El reporte simula una persona en cada lugar y dice quién la aprueba y a quién ve.

    py -3 scripts/organigrama_logistica.py --reporte reporte.json [--db BASE]
    py -3 scripts/organigrama_logistica.py --reporte reporte.json --aplicar --respaldo respaldo.json --confirmo [--db BASE]
    py -3 scripts/organigrama_logistica.py --deshacer --respaldo respaldo.json --confirmo [--db BASE]
"""
import argparse
import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / '.env')

import os  # noqa: E402
from pymongo import MongoClient  # noqa: E402

import acceso  # noqa: E402
import mando  # noqa: E402
import permisos  # noqa: E402
from core import LOGISTICA, GERENTE_LOGISTICA  # noqa: E402

GERENCIA = 'Gerencia'
CARGOS_VIEJOS = ['Jefe', 'Coordinador', 'Auxiliar']
# Cargos nuevos: (nombre, nivel, perfil propio o None = el de su nivel)
COORD = 'coordinador'
CARGOS = [
    ("Jefe de operaciones de AF y CD's", 'gerente', None),
    ('Jefe de CD', 'jefe', None),
    ('Jefe de AF', 'jefe', None),
    ('Coordinador de almacén', 'coordinador', COORD),
    ('Entregador de almacén', 'coordinador', COORD),
    ('Asistente administrativo', 'colaborador', None),
    ('Operador de montacarga', 'colaborador', None),
    ('Asistente de ingresos', 'colaborador', None),
    ('Asistente de almacén', 'colaborador', None),
]
# Áreas: (camino, cargos que van ahí). El primero del camino es Gerencia.
OPS = (GERENCIA, 'Operaciones AF y CD')
ESTRUCTURA = [
    ((GERENCIA,), [GERENTE_LOGISTICA]),
    (OPS, ["Jefe de operaciones de AF y CD's"]),
    (OPS + ('CD',), ['Jefe de CD', 'Asistente administrativo']),
    (OPS + ('CD', 'Almacén'), ['Coordinador de almacén', 'Operador de montacarga', 'Asistente de ingresos']),
    (OPS + ('CD', 'Almacén', 'Entregas'), ['Entregador de almacén', 'Asistente de almacén']),
    (OPS + ('AF',), ['Jefe de AF', 'Operador de montacarga', 'Asistente de ingresos']),
    (OPS + ('AF', 'Entregas'), ['Entregador de almacén', 'Asistente de almacén']),
]
PERFIL_COORD = {
    'clave': COORD, 'nombre': 'Coordinador',
    'descripcion': 'Coordinador y entregador de almacén: aprueban a quienes les reportan',
}
# Personas: correo -> (camino del área, cargo)
AF, CD = OPS + ('AF',), OPS + ('CD',)
PERSONAS = {
    'edwinguevara@herco.hn': ((GERENCIA,), GERENTE_LOGISTICA),
    'gestordealmacen@herco.hn': (OPS, "Jefe de operaciones de AF y CD's"),
    'almacenjuticalpa@herco.hn': (AF, 'Jefe de AF'),
    'almacenchampagnat@herco.hn': (AF, 'Jefe de AF'),
    'almacensanlorenzo@herco.hn': (AF, 'Jefe de AF'),
    'valle@herco.hn': (AF, 'Jefe de AF'),
    'libertad@herco.hn': (AF, 'Jefe de AF'),
    'ceramicas@herco.hn': (CD, 'Jefe de CD'),
    'cdferretero@herco.hn': (CD, 'Jefe de CD'),
    'rodinfunes@herco.hn': (CD, 'Jefe de CD'),
    'cdbuenavista@herco.hn': (CD, 'Jefe de CD'),
    'maderas@herco.hn': (CD, 'Jefe de CD'),
}
CAMPOS_USUARIO = ['cargo_id', 'nivel', 'position', 'area_id', 'area', 'area_path']
AUTOR = 'scripts/organigrama_logistica.py'


def ahora():
    return datetime.now(timezone.utc).isoformat()


def leer(db) -> dict:
    q = {'departamento': LOGISTICA}
    return {
        'areas': list(db.org_areas.find(q, {'_id': 0})),
        'cargos': list(db.org_cargos.find(q, {'_id': 0})),
        'perfiles': list(db.acceso_perfiles.find(q, {'_id': 0})),
        'asignaciones': list(db.acceso_asignaciones.find(q, {'_id': 0})),
        'users': list(db.users.find(q, {'_id': 0, 'id': 1, 'name': 1, 'email': 1, 'status': 1,
                                        **{k: 1 for k in CAMPOS_USUARIO}})),
    }


def planear(datos) -> dict:
    errores = []
    gerencia = next((a for a in datos['areas'] if a['nombre'] == GERENCIA and not a.get('padre_id')), None)
    gerente = next((c for c in datos['cargos'] if c['clave'] == GERENTE_LOGISTICA), None)
    if not gerencia or not gerente:
        errores.append('No encuentro el área Gerencia o el cargo Gerente de Logística')

    # lo que se borra (sin gente)
    borrar_areas = [a for a in datos['areas'] if not gerencia or a['id'] != gerencia['id']]
    borrar_cargos = [c for c in datos['cargos'] if c['clave'] in CARGOS_VIEJOS]
    ids_borrar = {a['id'] for a in borrar_areas} | {c['id'] for c in borrar_cargos}
    por_email = {(u.get('email') or '').lower(): u for u in datos['users']}
    for e in PERSONAS:
        if e not in por_email:
            errores.append(f'No encuentro a {e} en Logística')
    for u in datos['users']:
        if (u.get('email') or '').lower() in PERSONAS:
            continue  # se mueve
        if u.get('area_id') in ids_borrar or u.get('cargo_id') in ids_borrar:
            errores.append(f"{u.get('name')} está en un área o cargo que se borraría")
    otras = [a for a in datos['areas'] if a not in borrar_areas]
    for a in otras:
        if gerencia and a['id'] != gerencia['id']:
            errores.append(f"Área inesperada: {a['nombre']}")

    # cargos nuevos
    existentes = {c['clave'] for c in datos['cargos'] if c not in borrar_cargos}
    cargos_nuevos, cargo_id = [], {GERENTE_LOGISTICA: gerente['id'] if gerente else None}
    for i, (n, nivel, _) in enumerate(CARGOS):
        if n in existentes:
            errores.append(f'Ya existe el cargo {n}')
            continue
        c = {'id': str(uuid.uuid4()), 'departamento': LOGISTICA, 'nombre': n, 'clave': n, 'nivel': nivel,
             'sistema': False, 'orden': i + 1, 'created_at': ahora(), 'created_by': AUTOR,
             'perfil_id': permisos.perfil_por_defecto(LOGISTICA, n, nivel)}
        cargos_nuevos.append(c)
        cargo_id[n] = c['id']

    # áreas nuevas (en orden de árbol: el padre siempre antes)
    areas_nuevas, area_id, hijos = [], {(GERENCIA,): gerencia['id'] if gerencia else None}, {}
    for camino, _ in ESTRUCTURA:
        if camino in area_id:
            continue
        padre = area_id[camino[:-1]]
        orden = hijos.get(padre, 0)
        hijos[padre] = orden + 1
        a = {'id': str(uuid.uuid4()), 'departamento': LOGISTICA, 'nombre': camino[-1], 'clave': camino[-1],
             'padre_id': padre, 'sistema': False, 'orden': orden, 'created_at': ahora(), 'created_by': AUTOR}
        areas_nuevas.append(a)
        area_id[camino] = a['id']

    # perfil Coordinador y su asignación por cargo
    pid = acceso.id_perfil(LOGISTICA, COORD)
    colab = next((p for p in datos['perfiles'] if p['id'] == acceso.id_perfil(LOGISTICA, 'colaborador')), None)
    perfil_nuevo = None
    if any(p['id'] == pid for p in datos['perfiles']):
        errores.append(f'Ya existe el perfil {pid}')
    elif not colab:
        errores.append('No encuentro el perfil Colaborador de Logística')
    else:
        perfil_nuevo = {'id': pid, 'departamento': LOGISTICA, **PERFIL_COORD,
                        'permisos': sorted(set(colab['permisos']) | set(acceso.APRUEBA)),
                        'sistema': False, 'orden': len(datos['perfiles']), 'created_at': ahora(), 'created_by': AUTOR}
    asignaciones = [{'id': f'{cargo_id[n]}@*', 'departamento': LOGISTICA, 'cargo_id': cargo_id[n], 'area_id': None,
                     'perfil_id': pid, 'created_at': ahora(), 'created_by': AUTOR}
                    for n, _, p in CARGOS if p == COORD and n in cargo_id]

    # personas: su área y cargo nuevos
    niveles = {n: nv for n, nv, _ in CARGOS}
    niveles[GERENTE_LOGISTICA] = 'jefe_depto'
    mover = {}
    for e, (camino, cargo) in PERSONAS.items():
        u = por_email.get(e)
        if not u or cargo not in cargo_id:
            continue
        mover[u['id']] = {'cargo_id': cargo_id[cargo], 'nivel': niveles[cargo], 'position': cargo,
                          'area_id': area_id[camino], 'area': camino[-1],
                          'area_path': [area_id[camino[:i + 1]] for i in range(len(camino))]}

    return {'errores': errores, 'borrar_areas': borrar_areas, 'borrar_cargos': borrar_cargos,
            'areas_nuevas': areas_nuevas, 'cargos_nuevos': cargos_nuevos, 'perfil_nuevo': perfil_nuevo,
            'asignaciones': asignaciones, 'mover': mover, 'area_id': area_id, 'cargo_id': cargo_id}


def simular(datos, plan) -> list:
    """Una persona de mentira en cada lugar del organigrama: quién la aprueba
    y a quién ve, con las mismas reglas de mando.py."""
    perfiles = {p['id']: p for p in datos['perfiles']}
    if plan['perfil_nuevo']:
        perfiles[plan['perfil_nuevo']['id']] = plan['perfil_nuevo']
    niveles = {n: nv for n, nv, _ in CARGOS}
    niveles[GERENTE_LOGISTICA] = 'jefe_depto'
    gente = []
    for camino, cargos in ESTRUCTURA:
        path = [plan['area_id'][camino[:i + 1]] for i in range(len(camino))]
        for n in cargos:
            u = {'id': f'{" / ".join(camino[1:]) or GERENCIA} · {n}', 'departamento': LOGISTICA,
                 'cargo_id': plan['cargo_id'][n], 'nivel': niveles[n], 'area_id': path[-1], 'area_path': path,
                 'acceso_migrado_at': ahora()}
            base = (perfiles.get(acceso.resolver_perfil(u, plan['asignaciones'], niveles[n])) or {}).get('permisos')
            u['acceso'] = acceso.efectivo(u, base)
            gente.append(u)
    return [{'puesto': u['id'],
             'aprueba': mando.aprobadores_de(u, gente, True),
             've': [p['id'] for p in mando.visibles_de(u, gente, True)]} for u in gente]


def resumen(datos, plan, sim) -> str:
    li = ['Se borran áreas: ' + (', '.join(a['nombre'] for a in plan['borrar_areas']) or '-'),
          'Se borran cargos: ' + (', '.join(c['nombre'] for c in plan['borrar_cargos']) or '-'),
          f"Áreas nuevas: {len(plan['areas_nuevas'])} · cargos nuevos: {len(plan['cargos_nuevos'])}"
          f" · perfil Coordinador: {'sí' if plan['perfil_nuevo'] else 'no'}", '', 'Personas:']
    nombres = {u['id']: u.get('name') for u in datos['users']}
    for uid, c in plan['mover'].items():
        li.append(f"   {nombres.get(uid)}: {c['position']} en {c['area']}")
    li.append('')
    for s in sim:
        li.append(s['puesto'])
        li.append('   aprueba: ' + (', '.join(s['aprueba']) or '-'))
        if s['ve']:
            li.append(f"   ve ({len(s['ve'])}): " + ', '.join(s['ve']))
    return '\n'.join(li)


async def recalcular(ids):
    """Lo que pueden (perfiles nuevos y de antes), como al cambiarlos desde Usuarios."""
    for uid in ids:
        await permisos.recalcular_usuario(uid)
        await acceso.preparar_usuario(uid)


def aplicar(db, datos, plan, respaldo: Path):
    r = {'creado': ahora(), 'base': db.name,
         'usuarios_antes': [{'id': u['id'], **{k: u.get(k) for k in CAMPOS_USUARIO}}
                            for u in datos['users'] if u['id'] in plan['mover']],
         'areas_borradas': plan['borrar_areas'], 'cargos_borrados': plan['borrar_cargos'],
         'areas_nuevas': [a['id'] for a in plan['areas_nuevas']], 'cargos_nuevos': [c['id'] for c in plan['cargos_nuevos']],
         'perfil_nuevo': plan['perfil_nuevo']['id'], 'asignaciones': [a['id'] for a in plan['asignaciones']]}
    respaldo.write_text(json.dumps(r, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    print(f'Respaldo: {respaldo}')
    for a in plan['areas_nuevas']:
        db.org_areas.insert_one(dict(a))
    for c in plan['cargos_nuevos']:
        db.org_cargos.insert_one(dict(c))
    db.acceso_perfiles.insert_one(dict(plan['perfil_nuevo']))
    for a in plan['asignaciones']:
        db.acceso_asignaciones.insert_one(dict(a))
    for uid, c in plan['mover'].items():
        db.users.update_one({'id': uid}, {'$set': c})
    asyncio.run(recalcular(list(plan['mover'])))
    # primero las subáreas: no se borra un área con hijas
    for a in sorted(plan['borrar_areas'], key=lambda a: a.get('padre_id') is None):
        db.org_areas.delete_one({'id': a['id']})
        db.acceso_asignaciones.delete_many({'area_id': a['id']})
    for c in plan['borrar_cargos']:
        db.org_cargos.delete_one({'id': c['id']})
        db.acceso_asignaciones.delete_many({'cargo_id': c['id']})
    print('Aplicado.')


def deshacer(db, respaldo: Path):
    r = json.loads(respaldo.read_text(encoding='utf-8'))
    if r.get('base') != db.name:
        sys.exit(f"El respaldo es de la base {r.get('base')}, no de {db.name}")
    for a in r['areas_borradas']:
        db.org_areas.replace_one({'id': a['id']}, a, upsert=True)
    for c in r['cargos_borrados']:
        db.org_cargos.replace_one({'id': c['id']}, c, upsert=True)
    for u in r['usuarios_antes']:
        db.users.update_one({'id': u['id']}, {'$set': {k: u[k] for k in CAMPOS_USUARIO}})
    asyncio.run(recalcular([u['id'] for u in r['usuarios_antes']]))
    for campo, col in (('areas_nuevas', db.org_areas), ('cargos_nuevos', db.org_cargos)):
        for i in r[campo]:
            n = db.users.count_documents({'$or': [{'area_id': i}, {'cargo_id': i}]})
            if n:
                print(f'  ! {i} ya tiene {n} persona(s): no lo borro')
            else:
                col.delete_one({'id': i})
    db.acceso_asignaciones.delete_many({'id': {'$in': r['asignaciones']}})
    db.acceso_perfiles.delete_one({'id': r['perfil_nuevo']})
    print('Deshecho: áreas, cargos, perfil y personas como antes.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reporte', type=Path)
    ap.add_argument('--db')
    ap.add_argument('--aplicar', action='store_true')
    ap.add_argument('--deshacer', action='store_true')
    ap.add_argument('--respaldo', type=Path)
    ap.add_argument('--confirmo', action='store_true')
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding='utf-8')
    db = MongoClient(os.environ['MONGO_URL'])[a.db or os.environ['DB_NAME']]
    if a.deshacer:
        if not (a.respaldo and a.respaldo.exists() and a.confirmo):
            sys.exit('Para deshacer: --respaldo (existente) y --confirmo')
        deshacer(db, a.respaldo)
        return
    datos = leer(db)
    plan = planear(datos)
    if plan['errores']:
        sys.exit('No se puede:\n- ' + '\n- '.join(plan['errores']))
    sim = simular(datos, plan)
    texto = resumen(datos, plan, sim)
    print(texto)
    if a.reporte:
        a.reporte.write_text(json.dumps({'base': db.name, 'simulacion': sim, 'plan': {
            k: v for k, v in plan.items() if k not in ('area_id', 'cargo_id')}}, ensure_ascii=False, indent=1, default=str),
            encoding='utf-8')
        print(f'\nReporte: {a.reporte}')
    if not a.aplicar:
        print('\nSIMULACRO: no se cambió nada.')
        return
    if not (a.respaldo and a.confirmo):
        sys.exit('Para aplicar: --respaldo archivo.json y --confirmo')
    if a.respaldo.exists():
        sys.exit(f'{a.respaldo} ya existe: no lo piso')
    aplicar(db, datos, plan, a.respaldo)


if __name__ == '__main__':
    main()
