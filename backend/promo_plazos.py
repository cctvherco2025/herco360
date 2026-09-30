"""Plazos de Promociones del mes: vencimientos, recordatorios y escalamiento.

Los admins de Promociones guardan los plazos por defecto (config
'promo_plazos'); cada publicación copia los suyos al publicarse y se pueden
ajustar ese mes. Con ellos:

  tarea pendiente    vence_respuesta = publicada_at + responder_dias
  tarea enviada      vence_revision  = enviada_at   + revisar_dias
  ticket abierto     vence           = abierto/reabierto + corregir_horas
  ticket corregido   vence           = corregido    + revisar_dias

El motor de recordatorios (reminders.py, cada 60 s) llama a
revisar_vencimientos(): `recordar_horas` antes avisa a quien le toca actuar;
al vencer avisa a quien le toca y a los admins de Promociones, una sola vez
por etapa (campos aviso_*). Cada aviso se "reclama" con una actualización
atómica antes de enviarse, así dos servidores con el motor corriendo (el
local y el de Render) no mandan la misma alerta dos veces. Las horas son de
pared en Honduras (now_local).
Horas corridas: no descuenta noches ni domingos.
"""
import logging
from datetime import datetime, timedelta

from core import db, now_local, PROMO_TIENDAS, JEFE_TIENDA
from notifications import create_notification

logger = logging.getLogger('promo_plazos')

DEFAULTS = {'responder_dias': 3, 'revisar_dias': 2, 'corregir_horas': 24, 'recordar_horas': 4}
LIMITES = {'responder_dias': (1, 31), 'revisar_dias': (1, 15), 'corregir_horas': (1, 240), 'recordar_horas': (1, 48)}
_FMT = '%Y-%m-%dT%H:%M:%S'
_DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
_MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']


def limpiar(plazos) -> dict:
    """Plazos válidos (enteros dentro de sus límites); lo que falte, por defecto."""
    out = dict(DEFAULTS)
    for k, (lo, hi) in LIMITES.items():
        try:
            v = int((plazos or {}).get(k))
        except (TypeError, ValueError):
            continue
        out[k] = max(lo, min(hi, v))
    return out


async def config() -> dict:
    doc = await db.config.find_one({'_id': 'promo_plazos'}, {'_id': 0}) or {}
    return limpiar(doc)


async def guardar_config(plazos: dict, user: dict) -> dict:
    limpio = limpiar(plazos)
    await db.config.update_one({'_id': 'promo_plazos'},
                               {'$set': {**limpio, 'updated_by': user.get('name'), 'updated_at': iso(now_local())}},
                               upsert=True)
    return limpio


def iso(dt: datetime) -> str:
    return dt.strftime(_FMT)


def parse(s):
    try:
        return datetime.strptime(s[:19], _FMT) if s else None
    except ValueError:
        return None


def mas(base: str, horas: float) -> str:
    """base (iso local) + horas -> iso local; None si no hay base."""
    b = parse(base)
    return iso(b + timedelta(hours=horas)) if b else None


def desde_ahora(horas: float) -> str:
    return iso(now_local() + timedelta(hours=horas))


def fecha_corta(s: str) -> str:
    d = parse(s)
    return f'{_DIAS[d.weekday()]} {d.day} {_MESES[d.month - 1]} · {d:%H:%M}' if d else ''


# --------------------------------------------------------------------------- #
#  A quién avisar
# --------------------------------------------------------------------------- #
async def _admins_promos() -> list:
    users = await db.users.find(
        {'status': 'approved', '$or': [{'role': 'admin'}, {'module_access.promociones_admin': True}]},
        {'_id': 0, 'id': 1}).to_list(100)
    return [u['id'] for u in users]


async def _revisores(tienda: str) -> list:
    sucs = [s for s, t in PROMO_TIENDAS.items() if t == tienda]
    users = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': sucs},
         '$or': [{'position': JEFE_TIENDA}, {'position': 'Gerente', 'area': 'Tienda'}]},
        {'_id': 0, 'id': 1}).to_list(50)
    return [u['id'] for u in users]


async def _coordinadores_sin_respuesta(form_id: str, tienda: str) -> list:
    """Coordinadores (y jefes) de esa tienda que no han contestado ninguna
    categoría de la publicación: a ellos se les recuerda lo que falta."""
    sucs = [s for s, t in PROMO_TIENDAS.items() if t == tienda]
    gente = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': sucs},
         '$or': [{'position': 'Coordinador', 'area': 'Tienda'}, {'position': JEFE_TIENDA}]},
        {'_id': 0, 'id': 1}).to_list(200)
    ya = {t.get('coordinador_id') for t in await db.promo_tareas.find(
        {'form_id': form_id, 'coordinador_id': {'$ne': None}}, {'_id': 0, 'coordinador_id': 1}).to_list(500)}
    return [u['id'] for u in gente if u['id'] not in ya]


async def _avisar(uids, tipo, msg, related_id, related_type):
    for uid in dict.fromkeys(uids):
        if uid:
            try:
                await create_notification(uid, tipo, msg, related_id=related_id, related_type=related_type)
            except Exception as e:  # pragma: no cover
                logger.warning(f'aviso de plazo falló para {uid}: {e}')


# --------------------------------------------------------------------------- #
#  Motor (lo llama reminders.py cada minuto)
# --------------------------------------------------------------------------- #
async def _reclamar(coleccion: str, doc: dict, campo: str, etapa: str, estado: str, extra: dict = None) -> bool:
    """Marca la etapa del aviso solo si nadie la marcó antes (mismo valor que
    se leyó y mismo estado). True = este servidor manda el aviso."""
    r = await db[coleccion].update_one(
        {'id': doc['id'], 'estado': estado, campo: doc.get(campo)},
        {'$set': {campo: etapa, **(extra or {})}})
    return r.modified_count == 1


def _etapa(vence: str, recordar_horas: int, ahora: datetime):
    """'vencido', 'recordar' o None según la hora."""
    v = parse(vence)
    if not v:
        return None
    if ahora >= v:
        return 'vencido'
    if ahora >= v - timedelta(hours=recordar_horas or DEFAULTS['recordar_horas']):
        return 'recordar'
    return None


async def revisar_vencimientos() -> None:
    ahora = now_local()
    admins = None

    async def los_admins():
        nonlocal admins
        if admins is None:
            admins = await _admins_promos()
        return admins

    # 1) Categorías sin contestar: se agrupan por publicación y tienda.
    grupos = {}
    for t in await db.promo_tareas.find(
            {'estado': 'pendiente', 'vence_respuesta': {'$ne': None}, 'aviso_respuesta': {'$ne': 'vencido'}},
            {'_id': 0}).to_list(1000):
        etapa = _etapa(t['vence_respuesta'], t.get('recordar_horas'), ahora)
        if not etapa or t.get('aviso_respuesta') == etapa:
            continue
        if not await _reclamar('promo_tareas', t, 'aviso_respuesta', etapa, 'pendiente',
                               {'vencida': True} if etapa == 'vencido' else {}):
            continue
        grupos.setdefault((t['form_id'], t['tienda'], etapa), []).append(t)
    for (form_id, tienda, etapa), ts in grupos.items():
        cats = ', '.join(sorted(t['categoria'] for t in ts))
        cuando = fecha_corta(ts[0]['vence_respuesta'])
        if etapa == 'recordar':
            destino = await _revisores(tienda) + await _coordinadores_sin_respuesta(form_id, tienda)
            await _avisar(destino, 'promo_recordatorio', f'{tienda}: faltan {cats}. Vence {cuando}.', form_id, 'promociones')
        else:
            destino = await _revisores(tienda) + await los_admins()
            await _avisar(destino, 'promo_vencida', f'Venció sin respuesta: {tienda} · {cats} (plazo {cuando}).', form_id, 'promociones')

    # 2) Categorías contestadas sin revisar.
    for t in await db.promo_tareas.find(
            {'estado': 'enviada', 'vence_revision': {'$ne': None}, 'aviso_revision': {'$ne': 'vencido'}},
            {'_id': 0}).to_list(1000):
        etapa = _etapa(t['vence_revision'], t.get('recordar_horas'), ahora)
        if not etapa or t.get('aviso_revision') == etapa:
            continue
        if not await _reclamar('promo_tareas', t, 'aviso_revision', etapa, 'enviada'):
            continue
        cuando = fecha_corta(t['vence_revision'])
        revisores = [u for u in await _revisores(t['tienda']) if u != t.get('coordinador_id')]
        if etapa == 'recordar':
            await _avisar(revisores, 'promo_recordatorio',
                          f"Revisa {t['categoria']} de {t['tienda']}: vence {cuando}.", t['form_id'], 'promociones')
        else:
            await _avisar(revisores + await los_admins(), 'promo_vencida',
                          f"Venció sin revisar: {t['categoria']} de {t['tienda']} (plazo {cuando}).", t['form_id'], 'promociones')

    # 3) Tickets: abierto (le toca al coordinador) o corregido (a quien revisa).
    for k in await db.tickets.find(
            {'estado': {'$in': ['abierto', 'corregido']}, 'vence': {'$ne': None}, 'aviso': {'$ne': 'vencido'}},
            {'_id': 0}).to_list(1000):
        etapa = _etapa(k['vence'], k.get('recordar_horas'), ahora)
        if not etapa or k.get('aviso') == etapa:
            continue
        if not await _reclamar('tickets', k, 'aviso', etapa, k['estado'], {'vencido': True} if etapa == 'vencido' else {}):
            continue
        cuando = fecha_corta(k['vence'])
        if k['estado'] == 'abierto':
            actor, que = [(k.get('asignado_a') or {}).get('id')], 'corregir'
        else:
            actor = [u for u in await _revisores(k['tienda']) if u != (k.get('asignado_a') or {}).get('id')]
            que = 'validar'
        if etapa == 'recordar':
            await _avisar(actor, 'promo_recordatorio', f"{k['numero']}: falta {que}. Vence {cuando}.", k['id'], 'ticket')
        else:
            await _avisar(actor + await los_admins(), 'promo_vencida',
                          f"{k['numero']} venció sin {que} ({k['categoria']} · {k['tienda']}, plazo {cuando}).", k['id'], 'ticket')
