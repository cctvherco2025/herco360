"""Migración a los perfiles de acceso (acceso.py).

Por defecto SIMULA: solo lee la base, compara para cada persona lo que puede
hoy (reglas de antes, acceso_legacy.py) con lo que podrá con su perfil más
sus excepciones, y escribe un reporte. Con --aplicar crea los perfiles, el
perfil por cargo y las excepciones de cada persona y guarda lo que puede;
antes hace un respaldo. No toca los campos de antes (module_access,
permisos, permisos_extra ni el perfil de Tareas de los cargos).

    py -3 scripts/acceso_migrar.py --reporte reporte.json
    py -3 scripts/acceso_migrar.py --reporte reporte.json --aplicar --respaldo respaldo.json --confirmo
    py -3 scripts/acceso_migrar.py --verificar
    py -3 scripts/acceso_migrar.py --resincronizar [--confirmo]   # justo antes de subir
"""
import argparse
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / '.env')

from pymongo import MongoClient  # noqa: E402

import os  # noqa: E402
import acceso  # noqa: E402
import acceso_legacy as L  # noqa: E402
import core  # noqa: E402
from core import es_retail, es_super_admin  # noqa: E402

# Reglas que usan las rutas: deben dar lo mismo antes y después de migrar
FUNCIONES = [
    'can_access_inventory', 'can_access_reports', 'can_access_vacaciones', 'can_access_cams',
    'can_access_formulario', 'can_edit_flos_schema', 'can_access_rutina', 'can_edit_rutina_schema', 'can_fill_rutina',
    'can_admin_promos', 'can_manage_promos', 'can_access_formularios_principal', 'can_access_promociones_mes',
    'can_create_custom_formulario', 'can_fill_guardias', 'can_admin_guardias', 'can_access_guardias',
    'can_fill_recorridos', 'can_admin_recorridos', 'can_access_recorridos', 'can_fill_etiquetas', 'can_admin_etiquetas',
    'can_ver_todas_etiquetas', 'etiquetas_solo_su_tienda', 'can_access_etiquetas', 'can_admin_activos',
]
# Antes "ver todas las etiquetas" era solo el permiso suelto; quien registra o
# administra también las veía todas. Ahora el permiso dice eso mismo.
EQUIVALENTE = {
    'can_ver_todas_etiquetas': lambda u: L.can_access_etiquetas(u) and L.etiquetas_solo_su_tienda(u) == '',
}

def disponible(u, k) -> bool:
    return es_super_admin(u) or es_retail(u) or k not in acceso.SOLO_RETAIL


def excepciones_para(u, base: set, quiere: set) -> dict:
    """Las excepciones mínimas para que el perfil dé exactamente lo de hoy."""
    if u.get('role') == 'admin':
        claves = acceso.DESDE_CARGO
    elif acceso.es_fijo(u):
        claves = acceso.DESDE_CARGO_JEFE
    else:
        claves = set(acceso.TODOS)
    exc = {}
    for k in acceso.TODOS:
        if k not in claves or not disponible(u, k):
            continue
        modulo = acceso.MODULO_DE.get(k)
        if modulo and modulo not in quiere and not acceso.es_fijo(u):
            continue  # sin el módulo, lo de adentro no cuenta
        if (k in base) != (k in quiere):
            exc[k] = k in quiere
    return exc


def verificar(db):
    """Después de aplicar (solo lee): lo guardado en cada persona debe ser lo
    que le daban las reglas de antes y lo que sale de recalcular con los
    perfiles, el perfil por cargo y las excepciones guardados."""
    perfiles = {p['id']: set(p.get('permisos') or []) for p in db.acceso_perfiles.find({}, {'_id': 0})}
    asignaciones = list(db.acceso_asignaciones.find({}, {'_id': 0}))
    niveles = {c['id']: c.get('nivel') for c in db.org_cargos.find({}, {'_id': 0, 'id': 1, 'nivel': 1})}
    problemas, aprobados, sin_migrar = [], 0, []
    for u in db.users.find({'status': 'approved'}, {'_id': 0, 'password_hash': 0}):
        aprobados += 1
        if 'acceso_migrado_at' not in u:
            sin_migrar.append(u.get('name'))
            continue
        guardado = set(u.get('acceso') or [])
        antes = L.acceso_de_antes(u)[0]
        pid = acceso.resolver_perfil(u, asignaciones, niveles.get(u.get('cargo_id')))
        recalculado = set(acceso.efectivo(u, perfiles.get(pid, set()), u.get('acceso_excepciones')))
        for k in sorted(guardado ^ antes):
            problemas.append(f"{u.get('name')}: {k} guardado={k in guardado} antes={k in antes}")
        for k in sorted(guardado ^ recalculado):
            problemas.append(f"{u.get('name')}: {k} guardado={k in guardado} recalculado={k in recalculado}")
    print(json.dumps({'perfiles': len(perfiles), 'asignaciones': len(asignaciones), 'aprobados': aprobados,
                      'sin_migrar': sin_migrar, 'problemas': len(problemas)}, ensure_ascii=False, indent=1))
    for p in problemas[:40]:
        print('  ', p)


def resincronizar(db, escribir: bool):
    """Mientras producción siga con la versión de antes, lo que se cambie en
    su "Gestión de accesos" solo queda en los campos de antes. Esto vuelve a
    calcular las excepciones de quien ya no coincide, con los perfiles y el
    perfil por cargo guardados. Se corre justo antes de subir la versión
    nueva; después ya no, porque mandan los perfiles."""
    perfiles = {p['id']: set(p.get('permisos') or []) for p in db.acceso_perfiles.find({}, {'_id': 0})}
    asignaciones = list(db.acceso_asignaciones.find({}, {'_id': 0}))
    niveles = {c['id']: c.get('nivel') for c in db.org_cargos.find({}, {'_id': 0, 'id': 1, 'nivel': 1})}
    cambios = 0
    for u in db.users.find({'acceso_migrado_at': {'$exists': True}}, {'_id': 0, 'password_hash': 0}):
        quiere = L.acceso_de_antes(u)[0]
        if set(u.get('acceso') or []) == quiere:
            continue
        base = perfiles.get(acceso.resolver_perfil(u, asignaciones, niveles.get(u.get('cargo_id'))), set())
        exc = excepciones_para(u, base, quiere)
        nuevo = acceso.efectivo(u, base, exc)
        print(f"  {u.get('name')}: excepciones {u.get('acceso_excepciones')} -> {exc}"
              f"{'' if set(nuevo) == quiere else '  (¡NO COINCIDE!)'}")
        cambios += 1
        if escribir:
            db.users.update_one({'id': u['id']}, {'$set': {'acceso_excepciones': exc, 'acceso': nuevo}})
    print(f"{'Resincronizadas' if escribir else 'Por resincronizar'}: {cambios} persona(s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--reporte', help='archivo JSON del reporte (simulacro o aplicar)')
    ap.add_argument('--aplicar', action='store_true', help='escribir en la base (si no, solo simula)')
    ap.add_argument('--respaldo', help='archivo JSON del respaldo (obligatorio con --aplicar)')
    ap.add_argument('--confirmo', action='store_true', help='confirmo que quiero escribir en la base')
    ap.add_argument('--verificar', action='store_true', help='después de aplicar: revisa lo guardado (solo lee)')
    ap.add_argument('--resincronizar', action='store_true',
                    help='antes de subir: pasa a los perfiles lo cambiado con la versión de antes (escribe solo con --confirmo)')
    args = ap.parse_args()
    if args.verificar or args.resincronizar:
        db = MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=20000)[os.environ['DB_NAME']]
        if args.resincronizar:
            resincronizar(db, args.confirmo)
        else:
            verificar(db)
        return
    if not args.reporte:
        sys.exit('Falta --reporte')
    if args.aplicar and not (args.respaldo and args.confirmo):
        sys.exit('Con --aplicar hacen falta --respaldo y --confirmo')

    db = MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=20000)[os.environ['DB_NAME']]
    deptos = [d['id'] for d in db.org_departamentos.find({}, {'_id': 0, 'id': 1})]
    cargos = list(db.org_cargos.find({}, {'_id': 0}))
    areas = list(db.org_areas.find({}, {'_id': 0}))
    users = list(db.users.find({}, {'_id': 0, 'password_hash': 0}))
    nivel_cargo = {c['id']: c.get('nivel') for c in cargos}
    nombre_cargo = {c['id']: c.get('nombre') for c in cargos}
    nombre_area = {a['id']: a.get('nombre') for a in areas}

    perfiles = acceso.perfiles_iniciales(deptos)
    asignaciones = acceso.asignaciones_iniciales(cargos, areas)
    permisos_de = {p['id']: set(p['permisos']) for p in perfiles}
    nombre_perfil = {p['id']: p['nombre'] for p in perfiles}

    personas, diferencias, dif_funciones = [], [], []
    uso_perfil, exc_por_permiso = Counter(), Counter()
    sueltos_total = Counter()
    for u in users:
        pid = acceso.resolver_perfil(u, asignaciones, nivel_cargo.get(u.get('cargo_id')))
        base = permisos_de.get(pid, set())
        quiere, sueltos = L.acceso_de_antes(u)
        exc = excepciones_para(u, base, quiere)
        nuevo = set(acceso.efectivo(u, base, exc))
        aprobado = u.get('status') == 'approved'
        # las reglas que usan las rutas (core.py), antes y después, con la persona ya migrada
        migrada = {**u, 'acceso': sorted(nuevo), 'acceso_excepciones': exc, 'acceso_migrado_at': 'simulacro'}
        for fn in FUNCIONES:
            antes, despues = EQUIVALENTE.get(fn, getattr(L, fn))(u), getattr(core, fn)(migrada)
            if fn == 'etiquetas_solo_su_tienda' and not L.can_access_etiquetas(u):
                continue  # sin acceso al módulo no se usa
            if antes != despues and aprobado:
                dif_funciones.append({'persona': u.get('name'), 'funcion': fn, 'antes': antes, 'despues': despues})
        for k in [p for p in acceso.MODULO_DE if p.startswith('tareas.')]:
            if L.tiene_tarea(u, k) != acceso.tiene(migrada, k) and aprobado:
                dif_funciones.append({'persona': u.get('name'), 'funcion': f'tiene({k})',
                                      'antes': L.tiene_tarea(u, k), 'despues': acceso.tiene(migrada, k)})
        fila = {
            'id': u['id'], 'nombre': u.get('name'), 'estado': u.get('status'), 'rol': u.get('role'),
            'departamento': u.get('departamento') or 'Ventas Retail',
            'cargo': nombre_cargo.get(u.get('cargo_id'), u.get('position')),
            'area': nombre_area.get(u.get('area_id'), u.get('area')), 'sucursal': u.get('sucursal'),
            'fijo': acceso.es_fijo(u), 'perfil': nombre_perfil.get(pid, pid), 'perfil_id': pid,
            'excepciones': exc, 'acceso': sorted(nuevo),
            'excepciones_de_antes': {**(u.get('module_access') or {}), **(u.get('permisos_extra') or {})},
            'sueltos_hoy': sueltos,
        }
        personas.append(fila)
        if aprobado:
            uso_perfil['Acceso total fijo' if fila['fijo'] else fila['perfil']] += 1
            for k, v in exc.items():
                exc_por_permiso[f'{k} {"+" if v else "-"}'] += 1
            sueltos_total.update(sueltos)
        for k in sorted(quiere ^ nuevo):
            diferencias.append({'persona': u.get('name'), 'estado': u.get('status'), 'cargo': fila['cargo'],
                                'area': fila['area'], 'rol': u.get('role'), 'fijo': fila['fijo'],
                                'permiso': k, 'hoy': k in quiere, 'nuevo': k in nuevo})

    aprobados = [p for p in personas if p['estado'] == 'approved']
    dif_aprobados = [d for d in diferencias if d['estado'] == 'approved']
    resumen = {
        'modo': 'aplicar' if args.aplicar else 'simulacro',
        'fecha': datetime.now(timezone.utc).isoformat(),
        'usuarios': len(users), 'aprobados': len(aprobados),
        'perfiles': len(perfiles), 'asignaciones': len(asignaciones),
        'uso_de_perfiles': dict(uso_perfil.most_common()),
        'personas_con_excepciones': sum(1 for p in aprobados if p['excepciones']),
        'excepciones_nuevas': sum(len(p['excepciones']) for p in aprobados),
        'excepciones_de_antes': sum(len(p['excepciones_de_antes']) for p in aprobados),
        'excepciones_por_permiso': dict(exc_por_permiso.most_common()),
        'permisos_que_hoy_no_se_usan_sin_su_modulo': dict(sueltos_total),
        'diferencias_aprobados': len(dif_aprobados),
        'diferencias_todos': len(diferencias),
        'diferencias_en_reglas_de_las_rutas': len(dif_funciones),
    }
    for d in dif_funciones[:40]:
        print(f"  REGLA {d['persona']}: {d['funcion']} antes={d['antes']!r} después={d['despues']!r}")
    Path(args.reporte).write_text(json.dumps({'resumen': resumen, 'diferencias': diferencias,
                                              'diferencias_en_reglas': dif_funciones, 'personas': personas,
                                              'perfiles': perfiles, 'asignaciones': asignaciones},
                                             ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(resumen, ensure_ascii=False, indent=1))
    for d in dif_aprobados[:40]:
        print(f"  DIF {d['persona']} ({d['cargo']} · {d['area']}{' · fijo' if d['fijo'] else ''}): "
              f"{d['permiso']} hoy={d['hoy']} nuevo={d['nuevo']}")

    if not args.aplicar:
        return
    if dif_aprobados or dif_funciones:
        sys.exit('Hay diferencias: no se aplica nada.')
    respaldo = {
        'fecha': resumen['fecha'],
        'users': users, 'org_cargos': cargos, 'org_areas': areas,
        'org_departamentos': list(db.org_departamentos.find({}, {'_id': 0})),
        'perm_perfiles': list(db.perm_perfiles.find({}, {'_id': 0})),
    }
    Path(args.respaldo).write_text(json.dumps(respaldo, ensure_ascii=False, default=str), encoding='utf-8')
    ahora = datetime.now(timezone.utc).isoformat()
    for p in perfiles:
        if not db.acceso_perfiles.find_one({'id': p['id']}):
            db.acceso_perfiles.insert_one({**p, 'created_at': ahora, 'created_by': 'migración'})
    for a in asignaciones:
        if not db.acceso_asignaciones.find_one({'id': a['id']}):
            db.acceso_asignaciones.insert_one({**a, 'created_at': ahora, 'created_by': 'migración'})
    hechos = 0
    for p in personas:
        r = db.users.update_one({'id': p['id'], 'acceso_migrado_at': {'$exists': False}},
                                {'$set': {'acceso_excepciones': p['excepciones'], 'acceso': p['acceso'],
                                          'acceso_migrado_at': ahora}})
        hechos += r.modified_count
    print(f'Aplicado: {len(perfiles)} perfiles, {len(asignaciones)} asignaciones, {hechos} personas.')


if __name__ == '__main__':
    main()
