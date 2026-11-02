"""Reglas de cada formulario (pestaña Automatizaciones): CUANDO pase algo → SI se
cumple una condición → AVISAR a alguien. Solo avisan: no cambian estados ni
crean nada.

Viven en `reglas` del formulario y se aplican al guardar, sin volver a publicar.
Cada regla avisa una sola vez por entrega (una por devolución, si es «se
devuelve»): db.form_reglas_log tiene una clave única y lo que ya se disparó no
se repite aunque el servidor reintente.
"""
import logging

from pymongo.errors import DuplicateKeyError

from core import db, new_id, now_iso
from notifications import create_notification
import formularios_acceso as fa
import formularios_reglas as reglas_form

logger = logging.getLogger('formularios_automatizaciones')

EVENTOS = ('entregado', 'respuesta', 'aprobado', 'devuelto', 'vencido')
DESTINOS = ('quien_lleno', 'supervisor', 'creador')
MAX_REGLAS = 30
TEXTO = {
    'entregado': '{quien} entregó «{titulo}».', 'respuesta': 'Se detectó la respuesta de una regla en «{titulo}» de {quien}.',
    'aprobado': 'Se aprobó «{titulo}» de {quien}.', 'devuelto': 'Se devolvió «{titulo}» de {quien}.',
    'vencido': '{quien} no entregó «{titulo}» a tiempo.',
}


def limpiar(reglas) -> list:
    out = []
    for r in (reglas if isinstance(reglas, list) else [])[:MAX_REGLAS]:
        if not isinstance(r, dict):
            continue
        cuando = r.get('cuando') if r.get('cuando') in EVENTOS else 'entregado'
        avisar = r.get('avisar') if isinstance(r.get('avisar'), dict) else {}
        out.append({
            'id': str(r.get('id') or new_id())[:64], 'activa': r.get('activa') is not False, 'cuando': cuando,
            # lo que venció no tiene respuestas que mirar
            'condicion': None if cuando == 'vencido' else reglas_form.limpiar_condicion(r.get('condicion')),
            'avisar': {'a': [d for d in DESTINOS if d in (avisar.get('a') or [])],
                       'personas': list(dict.fromkeys(str(x)[:64] for x in (avisar.get('personas') or []) if x))[:50]},
            'mensaje': ' '.join(str(r.get('mensaje') or '').split())[:300],
        })
    return out


def _se_cumple(regla: dict, respuesta) -> bool:
    if regla['cuando'] == 'respuesta' and not regla['condicion']:
        return False  # sin decir qué respuesta, no hay nada que detectar
    if not regla['condicion']:
        return True
    efectivos, tipos = {}, {}
    for e in (respuesta or {}).get('entries') or []:
        tipos[e['id']] = e.get('tipo')
        archivos = reglas_form.FAMILIA.get(e.get('tipo')) == 'archivos'
        efectivos[e['id']] = len(e.get('photos') or []) + len(e.get('archivos') or []) if archivos else e.get('valor')
    return reglas_form.cumple(regla['condicion'], efectivos, tipos)


def _nombre(a: dict) -> str:
    return (a.get('enviada_por') or {}).get('name') or a.get('user_name') or f'Tienda {a.get("sucursal")}'


async def _destinos(regla: dict, f: dict, a: dict, supervisores) -> list:
    ids = []
    if 'quien_lleno' in regla['avisar']['a']:
        envio = (a.get('enviada_por') or {}).get('id')
        ids += [envio] if envio else (a.get('miembros') or [a.get('user_id')])
    if 'supervisor' in regla['avisar']['a']:
        ids += await supervisores(f, a)
    if 'creador' in regla['avisar']['a']:
        ids.append(f.get('creator_id'))
    ids += regla['avisar']['personas']
    return list(dict.fromkeys(i for i in ids if i))


async def disparar(evento: str, f: dict, a: dict, respuesta, supervisores):
    """`supervisores(f, a)`: los ids de quien revisa esta entrega."""
    for regla in limpiar(f.get('reglas')):
        if not regla['activa'] or regla['cuando'] != evento or not _se_cumple(regla, respuesta):
            continue
        ids = await _destinos(regla, f, a, supervisores)
        if not ids:
            continue
        clave = f'{regla["id"]}:{a["id"]}:{evento}'
        if evento == 'devuelto':
            clave += f':{len(a.get("historial") or [])}'
        try:
            await db.form_reglas_log.insert_one({'clave': clave, 'form_id': f['id'], 'regla_id': regla['id'], 'asignacion_id': a['id'],
                                                 'evento': evento, 'destinos': ids, 'at': now_iso()})
        except DuplicateKeyError:
            continue
        titulo = f.get('titulo')
        texto = TEXTO[evento].format(quien=_nombre(a), titulo=titulo)
        if regla['mensaje']:
            texto = f'{regla["mensaje"]} · «{titulo}» de {_nombre(a)}'
        participan = {(a.get('enviada_por') or {}).get('id'), a.get('user_id'), *(a.get('miembros') or []), *[s['id'] for s in a.get('supervisores') or []]}
        async for u in db.users.find({'id': {'$in': ids}, 'status': 'approved'}, {'_id': 0, 'password_hash': 0}):
            # el aviso lleva a la entrega solo a quien la puede abrir
            abre = u['id'] in participan or fa.puede(u, f, 'resultados')
            await create_notification(u['id'], 'form_regla', texto, related_id=a['id'] if abre else None, related_type='formulario' if abre else None)


async def ensure_indexes():
    await db.form_reglas_log.create_index('clave', unique=True)
    await db.form_reglas_log.create_index('form_id')
