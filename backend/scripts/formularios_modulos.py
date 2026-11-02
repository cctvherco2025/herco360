"""Enciende el módulo Mis formularios en los perfiles y recalcula el acceso.

Sin esto nadie lo ve (ni le llega nada asignado), salvo que se encienda a mano
en Perfiles. El recálculo también le da Seguimientos a los departamentos fuera
de Retail que lo tengan en su perfil: dejó de ser un módulo solo de tienda.

Por defecto SIMULA: solo lee la base y muestra qué haría.

    py -3 scripts/formularios_modulos.py [--db BASE]
    py -3 scripts/formularios_modulos.py --aplicar --respaldo respaldo.json --confirmo [--db BASE]
    py -3 scripts/formularios_modulos.py --deshacer --respaldo respaldo.json --confirmo [--db BASE]
"""
import argparse
import asyncio
import json
import os
import sys
from collections import Counter
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv  # noqa: E402
from pymongo import MongoClient  # noqa: E402

load_dotenv(BACKEND / '.env')

MODULO = 'mis_formularios'


def perfiles_sin(db) -> list:
    return list(db.acceso_perfiles.find({'permisos': {'$ne': MODULO}}, {'_id': 0, 'id': 1, 'nombre': 1, 'departamento': 1}))


def fotos(db) -> dict:
    return {u['id']: u.get('acceso') for u in db.users.find({'acceso_migrado_at': {'$exists': True}}, {'_id': 0, 'id': 1, 'acceso': 1})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--db', help='base a usar (por defecto DB_NAME del .env)')
    ap.add_argument('--aplicar', action='store_true')
    ap.add_argument('--deshacer', action='store_true')
    ap.add_argument('--respaldo', type=Path)
    ap.add_argument('--confirmo', action='store_true')
    a = ap.parse_args()
    nombre = a.db or os.environ['DB_NAME']
    os.environ['DB_NAME'] = nombre  # acceso.recalcular trabaja sobre esta misma base
    db = MongoClient(os.environ['MONGO_URL'], serverSelectionTimeoutMS=15000)[nombre]
    print(f'Base: {db.name}')
    if a.deshacer:
        if not (a.respaldo and a.respaldo.exists() and a.confirmo):
            sys.exit('Para deshacer: --respaldo (existente) y --confirmo')
        r = json.loads(a.respaldo.read_text(encoding='utf-8'))
        if r.get('base') != db.name:
            sys.exit(f"El respaldo es de la base {r.get('base')}, no de {db.name}")
        db.acceso_perfiles.update_many({'id': {'$in': r['perfiles']}}, {'$pull': {'permisos': MODULO}})
        for uid, acceso in r['usuarios'].items():
            db.users.update_one({'id': uid}, {'$set': {'acceso': acceso}})
        print(f'Deshecho: {len(r["perfiles"])} perfiles y {len(r["usuarios"])} personas como antes.')
        return
    plan = perfiles_sin(db)
    for p in plan:
        print(f'- {p.get("departamento") or "-"} · {p["nombre"]}')
    print(f'{len(plan)} perfiles por encender.')
    if not a.aplicar:
        print('\nSIMULACRO: no se escribió nada.')
        return
    if not (a.respaldo and a.confirmo):
        sys.exit('Para aplicar: --respaldo archivo.json y --confirmo')
    if a.respaldo.exists():
        sys.exit(f'{a.respaldo} ya existe: no lo piso')
    antes = fotos(db)
    a.respaldo.write_text(json.dumps({'base': db.name, 'perfiles': [p['id'] for p in plan], 'usuarios': antes},
                                     ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Respaldo: {a.respaldo}')
    db.acceso_perfiles.update_many({'id': {'$in': [p['id'] for p in plan]}}, {'$addToSet': {'permisos': MODULO}})
    import acceso
    asyncio.run(acceso.recalcular({}))
    despues = fotos(db)
    ganaron = Counter(k for uid, ks in despues.items() for k in set(ks or []) - set(antes.get(uid) or []))
    perdieron = Counter(k for uid, ks in antes.items() for k in set(ks or []) - set(despues.get(uid) or []))
    print(f'Aplicado. Ganaron: {dict(ganaron)}. Perdieron: {dict(perdieron)}.')
    print(f'Verificación: {len(perfiles_sin(db))} perfiles sin encender; {sum(MODULO in (v or []) for v in despues.values())} de {len(despues)} personas con el módulo.')


if __name__ == '__main__':
    main()
