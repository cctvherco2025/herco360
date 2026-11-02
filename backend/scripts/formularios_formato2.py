"""Pasa los formularios personalizados de antes al constructor nuevo (formato 2).

Solo los genéricos (Promociones del mes sigue con su flujo propio). Cada
formulario queda con un paso, una sección por cada sección de antes y las
mismas preguntas, con el mismo id (así sus respuestas siguen ligadas):

    Opción única → Selección única · Casillas → Selección múltiple ·
    Texto libre → Texto largo · «permite foto» → foto de evidencia opcional.

Ninguna queda obligatoria (antes no lo eran). Si estaba publicado, queda
publicado como versión 1 y sus respuestas se marcan con esa versión; si era
borrador, queda en borrador.

Por defecto SIMULA: solo lee la base y muestra qué haría.

    py -3 scripts/formularios_formato2.py [--db BASE]
    py -3 scripts/formularios_formato2.py --aplicar --respaldo respaldo.json --confirmo [--db BASE]
    py -3 scripts/formularios_formato2.py --deshacer --respaldo respaldo.json --confirmo [--db BASE]
"""
import argparse
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

import formularios_v2 as V  # noqa: E402

AUTOR = 'Paso al formato 2'
TIPO_NUEVO = {'opcion_unica': 'unica', 'checklist': 'multiple', 'texto': 'largo'}


def ahora() -> str:
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


def pendientes(db) -> list:
    """Genéricos que todavía no están en el formato 2."""
    return [f for f in db.custom_forms.find({'esquema': {'$ne': V.ESQUEMA}}, {'_id': 0})
            if (f.get('kind') or 'generic') == 'generic']


def convertir(f: dict) -> dict:
    secciones = {}
    for it in f.get('items') or []:
        tipo = TIPO_NUEVO.get(it.get('tipo'))
        if not tipo:
            raise ValueError(f'«{it.get("titulo")}» tiene un tipo desconocido: {it.get("tipo")}')
        nuevo = {'id': it['id'], 'tipo': tipo, 'titulo': it.get('titulo') or '', 'descripcion': it.get('pregunta') or '',
                 'obligatoria': False, 'evidencia': 'opcional' if it.get('permite_foto') else 'no'}
        if tipo != 'largo':
            nuevo['opciones'] = [{'label': o.get('label'), 'pts': o.get('pts')} for o in it.get('opciones') or []]
            nuevo['puntaje'] = bool(it.get('scored'))
        secciones.setdefault((it.get('seccion') or 'General').strip() or 'General', []).append(nuevo)
    return V.limpiar_contenido({'pasos': [{'nombre': 'Preguntas',
                                           'secciones': [{'nombre': n, 'items': its} for n, its in secciones.items()]}]})


def planear(db) -> list:
    plan = []
    for f in pendientes(db):
        p = {'id': f['id'], 'titulo': f['titulo'], 'status': f.get('status') or 'publicado',
             'respuestas': db.custom_form_responses.count_documents({'form_id': f['id']}), 'errores': []}
        try:
            p['contenido'] = convertir(f)
        except Exception as e:  # tipo desconocido o pregunta inválida
            p['errores'].append(str(getattr(e, 'detail', e)))
            plan.append(p)
            continue
        if p['status'] == 'publicado':
            p['errores'] += V.errores_para_publicar(p['contenido'])
        p['preguntas'] = [f'{it["titulo"]} ({V.TIPOS[it["tipo"]][0].lower()}'
                          f'{", con puntaje" if it.get("puntaje") else ""}{", foto opcional" if it.get("evidencia") == "opcional" else ""})'
                          for it in V.items_de(p['contenido'])]
        plan.append(p)
    return plan


def resumen(plan) -> str:
    if not plan:
        return 'No hay formularios por pasar.'
    li = []
    for p in plan:
        li.append(f'- {p["titulo"]} ({p["status"]}, {p["respuestas"]} respuestas)')
        li += [f'    · {q}' for q in p.get('preguntas', [])]
        li += [f'    ! {e}' for e in p['errores']]
        if not p['errores']:
            li.append('    → ' + ('publicado como versión 1' if p['status'] == 'publicado' else 'queda en borrador'))
    return '\n'.join(li)


def aplicar(db, plan, respaldo: Path):
    r = {'creado': ahora(), 'base': db.name, 'formularios': []}
    for p in plan:
        r['formularios'].append({'antes': db.custom_forms.find_one({'id': p['id']}, {'_id': 0}), 'version_id': None})
    respaldo.write_text(json.dumps(r, ensure_ascii=False, indent=1, default=str), encoding='utf-8')
    print(f'Respaldo: {respaldo}')
    for p, guardado in zip(plan, r['formularios']):
        f, c, t = guardado['antes'], p['contenido'], ahora()
        sets = {'esquema': V.ESQUEMA, 'estado': 'borrador', 'status': 'borrador', 'borrador': c, 'rev': 1,
                'guardado_at': t, 'guardado_por': AUTOR, 'version': 0, 'version_id': None, 'contenido_publicado': None,
                'imagenes': f.get('imagenes') or {}, 'pasado_a_formato2_at': t,
                # sigue llegándole a los mismos: disponible para quien ya lo veía
                'asignacion': V.fasig.asignacion_de(f), 'supervision': V.fasig.limpiar_supervision({}),
                'permisos': V.fasig.limpiar_permisos({}), 'permisos_resueltos': {}}
        if p['status'] == 'publicado':
            vid = str(uuid.uuid4())
            guardado['version_id'] = vid
            db.custom_form_versiones.insert_one({
                'id': vid, 'form_id': p['id'], 'numero': 1, 'titulo': f['titulo'], 'contenido': c,
                'cambios': V.cambios_entre(None, c), 'nota': 'Pasado del formulario de antes al constructor nuevo',
                'publicada_at': t, 'publicada_por': {'id': None, 'name': AUTOR}})
            sets.update({'estado': 'publicado', 'status': 'publicado', 'version': 1, 'version_id': vid,
                         'contenido_publicado': c, **V.compat(c)})
            db.custom_form_responses.update_many({'form_id': p['id'], 'version_id': {'$exists': False}},
                                                 {'$set': {'version_id': vid, 'version': 1}})
        db.custom_forms.update_one({'id': p['id']}, {'$set': sets})
    # con el id de cada versión, para poder deshacer
    respaldo.write_text(json.dumps(r, ensure_ascii=False, indent=1, default=str), encoding='utf-8')


def deshacer(db, respaldo: Path):
    r = json.loads(respaldo.read_text(encoding='utf-8'))
    if r.get('base') != db.name:
        sys.exit(f"El respaldo es de la base {r.get('base')}, no de {db.name}")
    for g in r['formularios']:
        f = g['antes']
        hoy = db.custom_forms.find_one({'id': f['id']}, {'_id': 0, 'rev': 1, 'version': 1})
        if hoy and ((hoy.get('rev') or 1) > 1 or (hoy.get('version') or 0) > 1):
            print(f'  ! «{f["titulo"]}» se editó o publicó después del paso: no lo toco')
            continue
        db.custom_forms.replace_one({'id': f['id']}, f, upsert=True)
        if g.get('version_id'):
            db.custom_form_responses.update_many({'form_id': f['id'], 'version_id': g['version_id']}, {'$unset': {'version_id': '', 'version': ''}})
            db.custom_form_versiones.delete_one({'id': g['version_id']})
        print(f'  «{f["titulo"]}» como antes')
    print('Deshecho.')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', help='base a usar (por defecto DB_NAME del .env)')
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
    plan = planear(db)
    print(resumen(plan))
    if not a.aplicar:
        print('\nSIMULACRO: no se escribió nada.')
        return
    if any(p['errores'] for p in plan):
        sys.exit('No aplico: hay errores.')
    if not plan:
        return
    if not (a.respaldo and a.confirmo):
        sys.exit('Para aplicar: --respaldo archivo.json y --confirmo')
    if a.respaldo.exists():
        sys.exit(f'{a.respaldo} ya existe: no lo piso')
    aplicar(db, plan, a.respaldo)
    print('\nAplicado.', 'Verificación: 0 pendientes.' if not pendientes(db) else f'Verificación: quedan {len(pendientes(db))}')


if __name__ == '__main__':
    main()
