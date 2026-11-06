"""Da el módulo Planogramas a Amy Hernandez, Luis Fernando Guevara y Oniel
Espinal (excepción por persona) y recalcula el acceso de todos, para que a
nadie más se le encienda solo.

    py scripts/dar_planogramas.py            # simulacro: solo muestra
    py scripts/dar_planogramas.py --aplicar  # guarda

Usa DB_NAME del entorno (o --db NOMBRE).
"""
import asyncio
import os
import sys

if '--db' in sys.argv:
    os.environ['DB_NAME'] = sys.argv[sys.argv.index('--db') + 1]
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core import db  # noqa: E402
import acceso  # noqa: E402

CORREOS = ['amyhernandez@herco.hn', 'luisguevara@herco.hn', 'onielosespinal@gmail.com']


async def main():
    aplicar = '--aplicar' in sys.argv
    print('Base:', os.environ.get('DB_NAME'), '| modo:', 'APLICAR' if aplicar else 'simulacro')
    personas = await db.users.find({'email': {'$in': CORREOS}}, {'_id': 0, 'id': 1, 'name': 1, 'email': 1,
                                                                  'acceso_excepciones': 1, 'acceso_migrado_at': 1}).to_list(10)
    if len(personas) != len(CORREOS):
        print('Faltan personas:', set(CORREOS) - {p['email'] for p in personas})
        return
    for p in personas:
        print(' -', p['name'], '| migrado' if 'acceso_migrado_at' in p else '| SIN MIGRAR')
    # qué cambiaría en el acceso de cada persona al recalcular
    ids = {p['id'] for p in personas}
    perfiles, asignaciones, niveles = await acceso._contexto()
    async for u in db.users.find({'acceso_migrado_at': {'$exists': True}}, {'_id': 0, 'password_hash': 0}):
        exc = dict(u.get('acceso_excepciones') or {})
        if u['id'] in ids:
            exc['planogramas'] = True
        base = (perfiles.get(acceso._perfil_de(u, asignaciones, niveles)) or {}).get('permisos') or []
        nuevo, antes = set(acceso.efectivo(u, base, exc)), set(u.get('acceso') or [])
        if nuevo != antes:
            print(f"   {u['name']}: +{sorted(nuevo - antes)} -{sorted(antes - nuevo)}")
    if not aplicar:
        return
    for p in personas:
        exc = dict(p.get('acceso_excepciones') or {})
        exc['planogramas'] = True
        await db.users.update_one({'id': p['id']}, {'$set': {'acceso_excepciones': exc}})
    await acceso.recalcular({})
    con = [u['name'] async for u in db.users.find({'acceso': 'planogramas'}, {'_id': 0, 'name': 1})]
    print('Con Planogramas ahora:', con)


asyncio.run(main())
