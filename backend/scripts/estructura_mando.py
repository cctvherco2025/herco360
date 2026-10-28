"""Nueva estructura de Ventas Retail y mando por perfil (acordado el 2026-10-28).

Por defecto SIMULA: solo lee la base y escribe un reporte de lo que cambiaría.
- Tiendas: el área Tienda pasa debajo de Operación Tienda con el nombre
  "Tiendas" y cada tienda (H1, H2, H4, H5, H6) queda como subárea suya, con
  su gente según la sucursal de cada quien.
- Negocios País: Negocios Remotos pasa debajo y se crean las subáreas de sus
  gerentes (GERENTES_NP).
- Perfiles: «Gente a cargo» (equipo.aprobar / equipo.ver_todo) para que cada
  perfil apruebe y vea lo acordado (ver deseado()).
- Activa el mando por perfil (db.config 'mando_por_perfil') y recalcula los
  aprobadores de las solicitudes de vacaciones pendientes.
Para cada persona compara quién la aprueba y a quién ve hoy contra después.

    py -3 scripts/estructura_mando.py --reporte reporte.json [--db BASE]
    py -3 scripts/estructura_mando.py --reporte reporte.json --aplicar --respaldo respaldo.json --confirmo [--db BASE]
    py -3 scripts/estructura_mando.py --deshacer --respaldo respaldo.json --confirmo [--db BASE]
"""
import argparse
import copy
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
from core import RETAIL, es_jefe_depto  # noqa: E402
from models import SUCURSALES  # noqa: E402

TIENDA, OPERACION, NEG_PAIS, NEG_REMOTOS = 'Tienda', 'Operación Tienda', 'Negocios País', 'Negocios Remotos'
NOMBRE_TIENDAS = 'Tiendas'
# Gerente de Negocios País -> su subárea (se renombran después desde Estructura)
GERENTES_NP = {'Juan Guerrero': 'Negocios Casa Matriz', 'Onil Diaz': 'Negocios Regional'}
APRUEBA = {'equipo', 'equipo.aprobar'}
VE_EQUIPO = {'equipo', 'equipo.ver_todo'}
EQUIPO = APRUEBA | VE_EQUIPO
# Perfiles sin gente: por su clave
POR_CLAVE_RETAIL = {'gerente_tienda': APRUEBA, 'gerente_op': APRUEBA, 'gerente': APRUEBA, 'jefe_eccp': APRUEBA,
                    'jefe': APRUEBA, 'jefe_tienda': VE_EQUIPO}
CAMPOS_USUARIO = ['area_id', 'area_path', 'area', 'sucursal', 'acceso', 'acceso_excepciones']
AUTOR = 'scripts/estructura_mando.py'


def ahora():
    return datetime.now(timezone.utc).isoformat()


def nombre(u):
    return ' '.join((u.get('name') or '').split())


def deseado(u) -> set:
    """Lo de «Gente a cargo» que debe tener cada persona (lo acordado)."""
    if es_jefe_depto(u):
        return set()  # ve y aprueba a todo su departamento sin perfil
    if (u.get('departamento') or RETAIL) == RETAIL:
        cargo = (u.get('position') or '').strip()
        if cargo in ('Jefe', 'Gerente'):
            return set(APRUEBA)  # aprueba y ve a quienes le reportan
        if cargo == 'Jefe de tienda':
            return set(VE_EQUIPO)  # ve a los coordinadores de su tienda sin aprobarlos
        return set()
    return set(APRUEBA | VE_EQUIPO) if mando.nivel_de(u) in ('gerente', 'jefe') else set()  # como hoy


# --------------------------------------------------------------------------- #
#  Lectura y plan (sin escribir)
# --------------------------------------------------------------------------- #
def leer(db) -> dict:
    return {
        'areas': list(db.org_areas.find({}, {'_id': 0})),
        'cargos': list(db.org_cargos.find({}, {'_id': 0})),
        'users': list(db.users.find({}, {'_id': 0, 'password_hash': 0})),
        'perfiles': list(db.acceso_perfiles.find({}, {'_id': 0})),
        'asignaciones': list(db.acceso_asignaciones.find({}, {'_id': 0})),
        'vacaciones': list(db.vacation_requests.find({'status': 'pending'}, {'_id': 0})),
        'flag': db.config.find_one({'_id': mando.CONFIG}),
    }


def camino(aid, por_id) -> list:
    out, vistos = [], set()
    while aid and aid not in vistos and aid in por_id:
        vistos.add(aid)
        out.insert(0, aid)
        aid = por_id[aid].get('padre_id')
    return out


def area_por_clave(areas, clave):
    cand = [a for a in areas if a.get('departamento') == RETAIL and a.get('clave') == clave and not a.get('sucursal')]
    return sorted(cand, key=lambda a: a.get('padre_id') or '')[0] if cand else None


def planear(datos) -> dict:
    """Aplica en memoria y devuelve el plan con todo lo que cambia."""
    nuevo = copy.deepcopy(datos)
    areas, users = nuevo['areas'], nuevo['users']
    errores, notas = [], []
    tienda, op = area_por_clave(areas, TIENDA), area_por_clave(areas, OPERACION)
    np_, nr = area_por_clave(areas, NEG_PAIS), area_por_clave(areas, NEG_REMOTOS)
    for n, a in ((TIENDA, tienda), (OPERACION, op), (NEG_PAIS, np_), (NEG_REMOTOS, nr)):
        if not a:
            errores.append(f'No existe el área {n} en Ventas Retail')
    if errores:
        return {'errores': errores}
    creadas, cambios_area = [], {}

    def cambiar_area(a, **campos):
        dif = {k: v for k, v in campos.items() if a.get(k) != v}
        if dif:
            cambios_area.setdefault(a['id'], {}).update(dif)
            a.update(dif)

    def subarea(padre, nombre_sub, orden, **extra):
        hija = next((a for a in areas if a.get('padre_id') == padre['id']
                     and (a.get('sucursal') == extra['sucursal'] if 'sucursal' in extra else a['nombre'] == nombre_sub)), None)
        if hija:
            return hija
        hija = {'id': str(uuid.uuid4()), 'departamento': RETAIL, 'nombre': nombre_sub, 'clave': extra.pop('clave', nombre_sub),
                'padre_id': padre['id'], 'sistema': False, 'orden': orden, 'created_at': ahora(), 'created_by': AUTOR, **extra}
        areas.append(hija)
        creadas.append(hija)
        return hija

    # Tiendas
    cambiar_area(tienda, nombre=NOMBRE_TIENDAS, padre_id=op['id'])
    por_sucursal = {s: subarea(tienda, s, i, clave=TIENDA, sucursal=s) for i, s in enumerate(SUCURSALES)}
    movidas = []
    for u in users:
        if u.get('area_id') != tienda['id']:
            continue
        sub = por_sucursal.get((u.get('sucursal') or '').strip())
        if sub:
            u['area_id'] = sub['id']
            movidas.append((nombre(u), u.get('position'), f"{NOMBRE_TIENDAS} › {sub['nombre']}"))
        else:
            notas.append(f"{nombre(u)} ({u.get('position')}) se queda en {NOMBRE_TIENDAS}: su sucursal es '{u.get('sucursal')}'")
    # Negocios País
    cambiar_area(nr, padre_id=np_['id'])
    for i, (persona, sub_nombre) in enumerate(GERENTES_NP.items()):
        sub = subarea(np_, sub_nombre, i)
        quien = [u for u in users if nombre(u).casefold() == persona.casefold() and u.get('area_id') in (np_['id'], sub['id'])]
        if len(quien) != 1:
            errores.append(f'No encontré a {persona} (una sola persona) en {NEG_PAIS}')
            continue
        if quien[0]['area_id'] != sub['id']:
            quien[0]['area_id'] = sub['id']
            movidas.append((persona, quien[0].get('position'), f'{NEG_PAIS} › {sub_nombre}'))
    # camino, área y sucursal de cada persona de Retail
    por_id = {a['id']: a for a in areas}
    for u in users:
        a = por_id.get(u.get('area_id'))
        if not a:
            continue
        u['area_path'] = camino(a['id'], por_id)
        u['area'] = a['clave']
        if a.get('sucursal'):
            u['sucursal'] = a['sucursal']

    # Perfiles: «Gente a cargo» según lo acordado
    niveles = {c['id']: c.get('nivel') for c in nuevo['cargos']}
    perfiles = {p['id']: p for p in nuevo['perfiles']}
    quien_usa = {}
    for u in users:
        if u.get('status') == 'approved' and 'acceso_migrado_at' in u:
            quien_usa.setdefault(acceso.resolver_perfil(u, nuevo['asignaciones'], niveles.get(u.get('cargo_id'))), []).append(u)
    cambios_perfil = {}
    for pid, p in perfiles.items():
        gente = [u for u in quien_usa.get(pid, []) if not es_jefe_depto(u)]
        if gente:
            votos = {}
            for u in gente:
                votos.setdefault(frozenset(deseado(u)), []).append(u)
            quiere = set(max(votos, key=lambda k: len(votos[k])))
        elif p['departamento'] == RETAIL:
            quiere = set(POR_CLAVE_RETAIL.get(p.get('clave'), set()))
        else:
            quiere = set(APRUEBA | VE_EQUIPO) if p.get('clave') == 'jefe' else set()
        nuevos = sorted((set(p['permisos']) - EQUIPO) | quiere)
        if nuevos != sorted(p['permisos']):
            cambios_perfil[pid] = {'nombre': p['nombre'], 'agrega': sorted(set(nuevos) - set(p['permisos'])),
                                   'quita': sorted(set(p['permisos']) - set(nuevos)), 'permisos': nuevos}
            p['permisos'] = nuevos
    # acceso de cada persona y excepciones para quien no coincide con su perfil
    excepciones = {}
    for u in users:
        if 'acceso_migrado_at' not in u:
            continue
        base = set((perfiles.get(acceso.resolver_perfil(u, nuevo['asignaciones'], niveles.get(u.get('cargo_id')))) or {}).get('permisos') or [])
        exc = {k: v for k, v in (u.get('acceso_excepciones') or {}).items() if k not in EQUIPO}
        if u.get('status') == 'approved' and not es_jefe_depto(u):
            quiere = deseado(u)
            for k in EQUIPO:
                if (k in quiere) != (k in base):
                    exc[k] = k in quiere
        if exc != (u.get('acceso_excepciones') or {}):
            excepciones[u['id']] = {'nombre': nombre(u), 'antes': u.get('acceso_excepciones') or {}, 'despues': exc}
            u['acceso_excepciones'] = exc
        u['acceso'] = acceso.efectivo(u, sorted(base), exc)

    # quién aprueba a quién y a quién ve: hoy (estructura y regla de antes) contra después
    def mapa(lista_users, perfil):
        out = {}
        for depto in {u.get('departamento') or RETAIL for u in lista_users}:
            gente = [u for u in lista_users if (u.get('departamento') or RETAIL) == depto and u.get('status') == 'approved']
            for u in gente:
                out[u['id']] = (sorted(mando.aprobadores_de(u, gente, perfil)), sorted(p['id'] for p in mando.visibles_de(u, gente, perfil)))
        return out
    hoy = mapa(datos['users'], bool(datos['flag'] and datos['flag'].get('activo')))
    despues = mapa(users, True)
    nom = {u['id']: nombre(u) for u in users}
    personas = []
    for u in sorted(users, key=lambda x: ((x.get('departamento') or RETAIL), nombre(x))):
        if u['id'] not in despues:
            continue
        (ap0, ve0), (ap1, ve1) = hoy.get(u['id'], ([], [])), despues[u['id']]
        personas.append({
            'nombre': nom[u['id']], 'cargo': u.get('position'), 'area': ' › '.join(por_id[a]['nombre'] for a in u.get('area_path') or [] if a in por_id),
            'departamento': u.get('departamento') or RETAIL,
            'aprueba_antes': [nom.get(i, i) for i in ap0], 'aprueba_despues': [nom.get(i, i) for i in ap1],
            've_antes': len(ve0), 've_despues': len(ve1),
            've_agrega': sorted(nom.get(i, i) for i in set(ve1) - set(ve0)), 've_quita': sorted(nom.get(i, i) for i in set(ve0) - set(ve1)),
            'cambia': ap0 != ap1 or ve0 != ve1,
        })
    # solicitudes de vacaciones pendientes
    gente_depto = {}
    for u in users:
        if u.get('status') == 'approved':
            gente_depto.setdefault(u.get('departamento') or RETAIL, []).append(u)
    por_uid = {u['id']: u for u in users}
    cambios_vac = {}
    for r in nuevo['vacaciones']:
        u = por_uid.get(r['user_id'])
        if not u or 'aprobadores' not in r:
            continue
        ap = mando.aprobadores_de(u, gente_depto.get(u.get('departamento') or RETAIL, []), True)
        if sorted(ap) != sorted(r['aprobadores']):
            cambios_vac[r['id']] = {'de': nombre(u), 'antes': [nom.get(i, i) for i in r['aprobadores']],
                                    'despues': [nom.get(i, i) for i in ap], 'aprobadores': ap}
    cambios_usuario = {}
    viejos = {u['id']: u for u in datos['users']}
    for u in users:
        dif = {k: u.get(k) for k in CAMPOS_USUARIO if u.get(k) != viejos[u['id']].get(k)}
        if dif:
            cambios_usuario[u['id']] = dif
    return {'errores': errores, 'notas': notas, 'areas_nuevas': creadas, 'cambios_area': cambios_area,
            'movidas': movidas, 'cambios_perfil': cambios_perfil, 'excepciones': excepciones,
            'cambios_usuario': cambios_usuario, 'personas': personas, 'cambios_vacaciones': cambios_vac,
            'activar': not (datos['flag'] and datos['flag'].get('activo'))}


def resumen(plan, nombres_area) -> str:
    if plan['errores']:
        return 'ERRORES:\n' + '\n'.join(f'  - {e}' for e in plan['errores'])
    li = []
    li.append(f"Áreas nuevas: {', '.join(a['nombre'] for a in plan['areas_nuevas']) or 'ninguna'}")
    for aid, c in plan['cambios_area'].items():
        partes = [f"{k}={nombres_area.get(v, v) if k == 'padre_id' else v}" for k, v in c.items()]
        li.append(f"Área {nombres_area.get(aid, aid)}: {', '.join(partes)}")
    li.append(f"Personas que cambian de área: {len(plan['movidas'])}")
    for n, cargo, destino in plan['movidas']:
        li.append(f'  - {n} ({cargo}) -> {destino}')
    for n in plan['notas']:
        li.append(f'  ! {n}')
    li.append(f"Perfiles que cambian: {len(plan['cambios_perfil'])}")
    for c in plan['cambios_perfil'].values():
        li.append(f"  - {c['nombre']}: agrega {c['agrega'] or '-'} quita {c['quita'] or '-'}")
    li.append(f"Excepciones por persona que cambian: {len(plan['excepciones'])}")
    for c in plan['excepciones'].values():
        li.append(f"  - {c['nombre']}: {c['antes']} -> {c['despues']}")
    otros = {uid: {k: v for k, v in c.items() if k == 'acceso'} for uid, c in plan['cambios_usuario'].items() if 'acceso' in c}
    li.append(f"Personas cuyo acceso guardado cambia: {len(otros)} (solo debería sumar o quitar «Gente a cargo»)")
    cambian = [p for p in plan['personas'] if p['cambia']]
    li.append(f"Quién aprueba / a quién ve: cambia para {len(cambian)} de {len(plan['personas'])} personas")
    for p in cambian:
        li.append(f"  - {p['nombre']} ({p['cargo']} · {p['area'] or 'sin área'})")
        if p['aprueba_antes'] != p['aprueba_despues']:
            li.append(f"      la aprueba: {', '.join(p['aprueba_antes']) or 'nadie'}  ->  {', '.join(p['aprueba_despues']) or 'nadie'}")
        if p['ve_agrega'] or p['ve_quita']:
            li.append(f"      ve a {p['ve_antes']} -> {p['ve_despues']} personas"
                      + (f"; deja de ver: {', '.join(p['ve_quita'])}" if p['ve_quita'] else '')
                      + (f"; empieza a ver: {', '.join(p['ve_agrega'])}" if p['ve_agrega'] else ''))
    li.append(f"Solicitudes de vacaciones pendientes con otro aprobador: {len(plan['cambios_vacaciones'])}")
    for c in plan['cambios_vacaciones'].values():
        li.append(f"  - de {c['de']}: {', '.join(c['antes']) or 'nadie'} -> {', '.join(c['despues']) or 'nadie'}")
    li.append('Activa el mando por perfil' if plan['activar'] else 'El mando por perfil ya estaba activo')
    return '\n'.join(li)


# --------------------------------------------------------------------------- #
#  Aplicar y deshacer
# --------------------------------------------------------------------------- #
def aplicar(db, datos, plan, respaldo: Path):
    tocados = set(plan['cambios_usuario'])
    r = {
        'creado': ahora(), 'base': db.name,
        'areas_antes': [a for a in datos['areas'] if a['id'] in plan['cambios_area']],
        'areas_nuevas': [a['id'] for a in plan['areas_nuevas']],
        'usuarios_antes': [{'id': u['id'], **{k: u.get(k) for k in CAMPOS_USUARIO}, 'faltan': [k for k in CAMPOS_USUARIO if k not in u]}
                           for u in datos['users'] if u['id'] in tocados],
        'perfiles_antes': [{'id': p['id'], 'permisos': p['permisos']} for p in datos['perfiles'] if p['id'] in plan['cambios_perfil']],
        'vacaciones_antes': [{'id': v['id'], 'aprobadores': v.get('aprobadores')} for v in datos['vacaciones'] if v['id'] in plan['cambios_vacaciones']],
        'flag_antes': datos['flag'],
    }
    respaldo.write_text(json.dumps(r, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    print(f'Respaldo: {respaldo}')
    for a in plan['areas_nuevas']:
        db.org_areas.insert_one(dict(a))
    for aid, c in plan['cambios_area'].items():
        db.org_areas.update_one({'id': aid}, {'$set': {**c, 'updated_at': ahora()}})
    for uid, c in plan['cambios_usuario'].items():
        db.users.update_one({'id': uid}, {'$set': c})
    for pid, c in plan['cambios_perfil'].items():
        db.acceso_perfiles.update_one({'id': pid}, {'$set': {'permisos': c['permisos'], 'updated_at': ahora(), 'updated_by': AUTOR}})
    for vid, c in plan['cambios_vacaciones'].items():
        db.vacation_requests.update_one({'id': vid, 'status': 'pending'}, {'$set': {'aprobadores': c['aprobadores']}})
    if plan['activar']:
        db.config.update_one({'_id': mando.CONFIG}, {'$set': {'activo': True, 'desde': ahora(), 'por': AUTOR}}, upsert=True)


def deshacer(db, respaldo: Path):
    r = json.loads(respaldo.read_text(encoding='utf-8'))
    if r.get('base') != db.name:
        sys.exit(f"El respaldo es de la base {r.get('base')}, no de {db.name}")
    for u in r['usuarios_antes']:
        sets = {k: u[k] for k in CAMPOS_USUARIO if k not in u['faltan']}
        unsets = {k: '' for k in u['faltan']}
        db.users.update_one({'id': u['id']}, {'$set': sets, **({'$unset': unsets} if unsets else {})})
    for a in r['areas_antes']:
        db.org_areas.replace_one({'id': a['id']}, a)
    for aid in r['areas_nuevas']:
        n = db.users.count_documents({'area_id': aid})
        if n:
            print(f'  ! el área nueva {aid} tiene {n} persona(s): no la borro')
        else:
            db.org_areas.delete_one({'id': aid})
    for p in r['perfiles_antes']:
        db.acceso_perfiles.update_one({'id': p['id']}, {'$set': {'permisos': p['permisos']}})
    for v in r['vacaciones_antes']:
        db.vacation_requests.update_one({'id': v['id'], 'status': 'pending'}, {'$set': {'aprobadores': v['aprobadores']}})
    if r['flag_antes']:
        db.config.replace_one({'_id': mando.CONFIG}, r['flag_antes'], upsert=True)
    else:
        db.config.delete_one({'_id': mando.CONFIG})
    print('Deshecho: estructura, personas, perfiles, vacaciones pendientes y mando por perfil como antes.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', help='base a usar (por defecto DB_NAME del .env)')
    ap.add_argument('--reporte', type=Path)
    ap.add_argument('--aplicar', action='store_true')
    ap.add_argument('--deshacer', action='store_true')
    ap.add_argument('--respaldo', type=Path)
    ap.add_argument('--confirmo', action='store_true')
    a = ap.parse_args()
    db = MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=15000)[a.db or os.environ['DB_NAME']]
    print(f'Base: {db.name}')
    if a.deshacer:
        if not (a.respaldo and a.respaldo.exists() and a.confirmo):
            sys.exit('Para deshacer: --respaldo (existente) y --confirmo')
        deshacer(db, a.respaldo)
        return
    datos = leer(db)
    plan = planear(datos)
    nombres_area = {x['id']: x['nombre'] for x in datos['areas'] + plan.get('areas_nuevas', [])}
    texto = resumen(plan, nombres_area)
    print(texto)
    if a.reporte:
        a.reporte.write_text(json.dumps({k: v for k, v in plan.items()}, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
        a.reporte.with_suffix('.txt').write_text(texto, encoding='utf-8')
        print(f'Reporte: {a.reporte} y {a.reporte.with_suffix(".txt")}')
    if not a.aplicar:
        print('\nSIMULACRO: no se escribió nada.')
        return
    if plan['errores']:
        sys.exit('No aplico: hay errores.')
    if not (a.respaldo and a.confirmo):
        sys.exit('Para aplicar: --respaldo archivo.json y --confirmo')
    if a.respaldo.exists():
        sys.exit(f'{a.respaldo} ya existe: no lo piso')
    aplicar(db, datos, plan, a.respaldo)
    # verificación: lo que quedó en la base debe ser lo planeado
    otra = planear(leer(db))
    pendiente = {k: otra[k] for k in ('areas_nuevas', 'cambios_area', 'movidas', 'cambios_perfil', 'excepciones',
                                      'cambios_usuario', 'cambios_vacaciones') if otra[k]}
    print('\nAplicado.', 'Verificación: 0 pendientes.' if not pendiente and not otra['activar']
          else f'Verificación: quedan cambios {list(pendiente)}')


if __name__ == '__main__':
    main()
