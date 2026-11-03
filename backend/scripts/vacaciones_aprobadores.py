"""Aprobadores para las solicitudes de vacaciones pendientes de antes de la
jerarquía configurable (2026-10-27), que no los guardaron.

Sin `aprobadores` seguían la regla vieja: las aprueba cualquiera con mando de
la misma área, y como todos los gerentes y jefes de tienda tienen el área
"Tienda", cualquiera de ellos aprobaba las de las otras tiendas. Este script
les guarda los aprobadores que da la jerarquía de hoy (mando.responsables_cercanos),
igual que a una solicitud nueva. No avisa a nadie.

Por defecto SIMULA: solo lee y dice a quién irían.

    py -3 scripts/vacaciones_aprobadores.py [--db BASE]
    py -3 scripts/vacaciones_aprobadores.py --aplicar --respaldo respaldo.json --confirmo [--db BASE]
    py -3 scripts/vacaciones_aprobadores.py --deshacer --respaldo respaldo.json --confirmo [--db BASE]
"""
import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

ap = argparse.ArgumentParser()
ap.add_argument('--db')
ap.add_argument('--aplicar', action='store_true')
ap.add_argument('--deshacer', action='store_true')
ap.add_argument('--respaldo', type=Path)
ap.add_argument('--confirmo', action='store_true')
a = ap.parse_args()

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND / '.env')
if a.db:
    os.environ['DB_NAME'] = a.db  # antes de importar core: mando lee esta base

import mando  # noqa: E402
from core import db  # noqa: E402

SIN = {'status': 'pending', 'aprobadores': {'$exists': False}}


async def plan():
    nombres = {u['id']: u['name'] async for u in db.users.find({}, {'_id': 0, 'id': 1, 'name': 1})}
    out = []
    async for r in db.vacation_requests.find(SIN, {'_id': 0}):
        u = await db.users.find_one({'id': r['user_id']}, {'_id': 0})
        ids = await mando.responsables_cercanos(u) if u else []
        out.append({'id': r['id'], 'quien': r['user_name'], 'fechas': f"{r['start_date']} a {r['end_date']}",
                    'aprobadores': ids, 'nombres': [nombres.get(i, i) for i in ids]})
    return out


async def main():
    print(f'Base: {db.name}')
    if a.deshacer:
        if not (a.respaldo and a.respaldo.exists() and a.confirmo):
            sys.exit('Para deshacer: --respaldo (existente) y --confirmo')
        r = json.loads(a.respaldo.read_text(encoding='utf-8'))
        if r['base'] != db.name:
            sys.exit(f"El respaldo es de la base {r['base']}, no de {db.name}")
        res = await db.vacation_requests.update_many({'id': {'$in': r['ids']}}, {'$unset': {'aprobadores': ''}})
        print(f'Deshecho: {res.modified_count} solicitudes vuelven a no tener aprobadores')
        return
    p = await plan()
    for x in p:
        print(f"- {x['quien']} ({x['fechas']}): {', '.join(x['nombres']) or 'NADIE (la verían solo admins y el jefe del departamento)'}")
    if not p:
        print('No hay solicitudes pendientes sin aprobadores.')
    if not a.aplicar:
        print('Simulacro: no se cambió nada.')
        return
    if not (a.respaldo and a.confirmo):
        sys.exit('Para aplicar: --respaldo archivo.json y --confirmo')
    if a.respaldo.exists():
        sys.exit(f'{a.respaldo} ya existe: no lo piso')
    a.respaldo.write_text(json.dumps({'base': db.name, 'ids': [x['id'] for x in p], 'plan': p}, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'Respaldo: {a.respaldo}')
    for x in p:
        await db.vacation_requests.update_one({'id': x['id'], **SIN}, {'$set': {'aprobadores': x['aprobadores']}})
    print(f'Listo: {len(p)} solicitudes con aprobadores')


asyncio.run(main())
