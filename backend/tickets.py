"""Tickets de inconsistencias (Promociones del mes).

Cuando el jefe o el gerente de tienda envía observaciones al revisar una
categoría, se abre un ticket con esas líneas, asignado a quien la contestó:

  abierto    el coordinador corrige en piso y sube una foto por línea
  corregido  el coordinador marcó todo como corregido; espera validación
  cerrado    quien revisa validó en piso: la categoría queda validada
  cancelado  la respuesta se eliminó

Quien revisa puede reabrir un ticket corregido (con un comentario). Los dos
lados conversan en el mismo hilo. El ticket guarda de dónde viene (`origen`)
para poder usarse después con otros formularios.
"""
import json
import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pymongo import ReturnDocument

from core import (db, get_current_user, serialize_doc, new_id, now_iso, es_revisor_tienda,
                  tienda_promos, can_admin_promos)
from notifications import create_notification
import promo_plazos
import storage

router = APIRouter(prefix='/tickets', tags=['tickets'])
logger = logging.getLogger('tickets')

MAX_FOTO = 8 * 1024 * 1024
ESTADOS = ('abierto', 'corregido', 'cerrado', 'cancelado')


# --------------------------------------------------------------------------- #
#  Permisos
# --------------------------------------------------------------------------- #
def es_asignado(user: dict, t: dict) -> bool:
    return (t.get('asignado_a') or {}).get('id') == user.get('id')


def es_revisor(user: dict, t: dict) -> bool:
    """Jefe o gerente de esa tienda, o quien administra Promociones; nunca el asignado."""
    if es_asignado(user, t):
        return False
    return (es_revisor_tienda(user) and tienda_promos(user) == t.get('tienda')) or can_admin_promos(user)


def puede_ver(user: dict, t: dict) -> bool:
    return es_asignado(user, t) or es_revisor(user, t)


async def _ticket_o_404(ticket_id: str) -> dict:
    t = await db.tickets.find_one({'id': ticket_id}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Ticket no encontrado')
    return t


async def _revisores_ids(tienda: str) -> list:
    """Jefes y gerente de la tienda (a quienes se avisa cuando el coordinador corrige)."""
    from core import PROMO_TIENDAS, JEFE_TIENDA
    sucs = [s for s, t in PROMO_TIENDAS.items() if t == tienda]
    users = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': sucs},
         '$or': [{'position': JEFE_TIENDA}, {'position': 'Gerente', 'area': 'Tienda'}]},
        {'_id': 0, 'id': 1}).to_list(50)
    return [u['id'] for u in users]


async def _avisar(uids, tipo: str, msg: str, t: dict, actor: dict):
    for uid in dict.fromkeys(uids):
        if uid and uid != actor.get('id'):
            await create_notification(uid, tipo, msg, related_id=t['id'], related_type='ticket',
                                      actor_name=actor.get('name'), actor_avatar=actor.get('avatar_url'))


async def _subir_fotos(ticket_id: str, fotos: List[UploadFile]) -> list:
    out = []
    for f in fotos or []:
        content = await f.read()
        if not content:
            continue
        if len(content) > MAX_FOTO:
            raise HTTPException(status_code=400, detail=f'Una foto supera el máximo de {MAX_FOTO // (1024 * 1024)} MB')
        ctype = f.content_type or 'image/jpeg'
        fid = new_id()
        ext = 'png' if 'png' in ctype else ('webp' if 'webp' in ctype else 'jpg')
        path = f'{storage.APP_NAME}/tickets/{ticket_id}/{fid}.{ext}'
        try:
            await storage.put_object(path, content, ctype)
        except Exception as ex:
            logger.error(f'ticket photo upload failed: {ex}')
            raise HTTPException(status_code=502, detail='No se pudo subir una de las fotos')
        out.append({'id': fid, 'path': path, 'content_type': ctype})
    return out


def _mensaje(user: dict, texto: str, rol: str, fotos=None) -> dict:
    return {'id': new_id(), 'de_id': user.get('id'), 'de_name': user.get('name'), 'rol': rol,
            'texto': texto, 'fotos': fotos or [], 'at': now_iso()}


def _sistema(texto: str) -> dict:
    return {'id': new_id(), 'de_id': None, 'de_name': None, 'rol': 'sistema', 'texto': texto, 'fotos': [], 'at': now_iso()}


# --------------------------------------------------------------------------- #
#  Crear (desde la revisión de Promociones)
# --------------------------------------------------------------------------- #
async def crear_ticket_promo(tarea: dict, lineas: list, revisor: dict, mes: str) -> dict:
    """Abre el ticket de una tarea de Promociones con sus líneas con
    inconsistencias: [{'item_id', 'titulo', 'tipo', 'comentario'}]."""
    n = await db.counters.find_one_and_update({'_id': 'tickets_promo'}, {'$inc': {'n': 1}},
                                              upsert=True, return_document=ReturnDocument.AFTER)
    form = await db.custom_forms.find_one({'id': tarea['form_id']}, {'_id': 0, 'plazos': 1}) or {}
    plazos = form.get('plazos')
    t = {
        'id': new_id(), 'numero': f"PROMO-{n['n']:04d}",
        'origen': {'tipo': 'promociones', 'tarea_id': tarea['id'], 'form_id': tarea['form_id'],
                   'periodo': tarea.get('periodo'), 'periodo_label': mes},
        'tienda': tarea['tienda'], 'categoria': tarea['categoria'],
        'titulo': f"Inconsistencias en {tarea['categoria']} · {tarea['tienda']}",
        'abierto_por': {'id': revisor['id'], 'name': revisor['name']},
        'asignado_a': {'id': tarea.get('coordinador_id'), 'name': tarea.get('coordinador_name')},
        'estado': 'abierto', 'reaperturas': 0,
        'lineas': [{**ln, 'corregida': False, 'fotos': []} for ln in lineas],
        'mensajes': [_sistema(f"{revisor['name']} abrió el ticket con {len(lineas)} "
                              f"línea{'s' if len(lineas) != 1 else ''} por corregir.")],
        'created_at': now_iso(), 'updated_at': now_iso(),
        'cerrado_por': None, 'cerrado_at': None,
        # plazos copiados de la publicación: abierto -> corregir; corregido -> validar
        'plazos': plazos, 'recordar_horas': (plazos or {}).get('recordar_horas'),
        'vence': promo_plazos.desde_ahora(plazos['corregir_horas']) if plazos else None,
        'aviso': None, 'vencido': False,
    }
    await db.tickets.insert_one(t)
    t.pop('_id', None)
    await _avisar([t['asignado_a']['id']], 'ticket_abierto',
                  f"{t['numero']}: {revisor['name']} encontró {len(lineas)} inconsistencia{'s' if len(lineas) != 1 else ''} "
                  f"en {tarea['categoria']} de {tarea['tienda']} ({mes}). Corrígelas y sube la foto.", t, revisor)
    return t


async def cancelar_de_tareas(tarea_ids: list):
    """La respuesta se eliminó: sus tickets abiertos ya no aplican."""
    if tarea_ids:
        await db.tickets.update_many(
            {'origen.tarea_id': {'$in': list(tarea_ids)}, 'estado': {'$in': ['abierto', 'corregido']}},
            {'$set': {'estado': 'cancelado', 'updated_at': now_iso()},
             '$push': {'mensajes': _sistema('Se canceló: la respuesta de esta categoría se eliminó.')}})


# --------------------------------------------------------------------------- #
#  Consultas
# --------------------------------------------------------------------------- #
_LISTA = {'_id': 0, 'id': 1, 'numero': 1, 'titulo': 1, 'tienda': 1, 'categoria': 1, 'estado': 1,
          'origen': 1, 'abierto_por': 1, 'asignado_a': 1, 'reaperturas': 1, 'created_at': 1,
          'updated_at': 1, 'lineas.corregida': 1, 'vence': 1, 'vencido': 1}


def _filtro(user: dict) -> dict:
    """Los que la persona puede ver: los suyos, los de su tienda si revisa, o
    todos si administra Promociones."""
    if can_admin_promos(user):
        return {}
    ors = [{'asignado_a.id': user['id']}]
    if es_revisor_tienda(user):
        ors.append({'tienda': tienda_promos(user)})
    return {'$or': ors}


@router.get('')
async def listar(estado: str = None, user=Depends(get_current_user)):
    q = _filtro(user)
    if estado in ESTADOS:
        q['estado'] = estado
    rows = await db.tickets.find(q, _LISTA).sort('updated_at', -1).to_list(300)
    for r in rows:
        r['soy_asignado'] = es_asignado(user, r)
    return serialize_doc(rows)


@router.get('/contador')
async def contador(user=Depends(get_current_user)):
    """Los que esperan algo de la persona: abiertos asignados a ella, y
    corregidos de su tienda por validar si revisa."""
    n = await db.tickets.count_documents({'asignado_a.id': user['id'], 'estado': 'abierto'})
    if can_admin_promos(user) or es_revisor_tienda(user):
        q = {'estado': 'corregido', 'asignado_a.id': {'$ne': user['id']}}
        if not can_admin_promos(user):
            q['tienda'] = tienda_promos(user)
        n += await db.tickets.count_documents(q)
    return {'pendientes': n}


@router.get('/{ticket_id}')
async def detalle(ticket_id: str, user=Depends(get_current_user)):
    t = await _ticket_o_404(ticket_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver este ticket')
    t['soy_asignado'] = es_asignado(user, t)
    t['soy_revisor'] = es_revisor(user, t)
    return serialize_doc(t)


@router.get('/{ticket_id}/foto/{foto_id}')
async def foto(ticket_id: str, foto_id: str, user=Depends(get_current_user)):
    t = await _ticket_o_404(ticket_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver este ticket')
    fotos = [f for ln in t.get('lineas', []) for f in ln.get('fotos', [])] + \
            [f for m in t.get('mensajes', []) for f in m.get('fotos', [])]
    p = next((f for f in fotos if f['id'] == foto_id), None)
    if not p:
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    try:
        content, ctype = await storage.get_object(p['path'])
    except Exception as ex:
        logger.error(f'ticket photo download failed: {ex}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=p.get('content_type', ctype))


# --------------------------------------------------------------------------- #
#  Acciones
# --------------------------------------------------------------------------- #
@router.post('/{ticket_id}/mensajes')
async def mensaje(ticket_id: str, texto: str = Form(''), fotos: List[UploadFile] = File(default=[]),
                  user=Depends(get_current_user)):
    t = await _ticket_o_404(ticket_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes escribir en este ticket')
    if t['estado'] in ('cerrado', 'cancelado'):
        raise HTTPException(status_code=409, detail='El ticket ya está cerrado')
    texto = (texto or '').strip()[:2000]
    subidas = await _subir_fotos(t['id'], fotos)
    if not texto and not subidas:
        raise HTTPException(status_code=400, detail='Escribe un mensaje o adjunta una foto')
    rol = 'coordinador' if es_asignado(user, t) else 'revisor'
    await db.tickets.update_one({'id': t['id']}, {'$push': {'mensajes': _mensaje(user, texto, rol, subidas)},
                                                  '$set': {'updated_at': now_iso()}})
    destino = await _revisores_ids(t['tienda']) if rol == 'coordinador' else [t['asignado_a']['id']]
    await _avisar(destino, 'ticket_mensaje', f"{t['numero']} · {user['name']}: {texto[:80] or 'envió una foto'}", t, user)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/lineas/{item_id}')
async def corregir_linea(ticket_id: str, item_id: str, corregida: bool = Form(True),
                         fotos: List[UploadFile] = File(default=[]), user=Depends(get_current_user)):
    """El coordinador marca una línea como corregida y sube su foto."""
    t = await _ticket_o_404(ticket_id)
    if not es_asignado(user, t):
        raise HTTPException(status_code=403, detail='Solo quien tiene asignado el ticket corrige sus líneas')
    if t['estado'] != 'abierto':
        raise HTTPException(status_code=409, detail='El ticket no está abierto')
    idx = next((i for i, ln in enumerate(t['lineas']) if ln['item_id'] == item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail='Esa línea no está en el ticket')
    subidas = await _subir_fotos(t['id'], fotos)
    upd = {f'lineas.{idx}.corregida': bool(corregida), 'updated_at': now_iso()}
    ops = {'$set': upd}
    if subidas:
        ops['$push'] = {f'lineas.{idx}.fotos': {'$each': subidas}}
    await db.tickets.update_one({'id': t['id'], 'estado': 'abierto'}, ops)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/corregido')
async def enviar_correccion(ticket_id: str, texto: str = Form(''), user=Depends(get_current_user)):
    """El coordinador avisa que corrigió todo: cada línea corregida con foto."""
    t = await _ticket_o_404(ticket_id)
    if not es_asignado(user, t):
        raise HTTPException(status_code=403, detail='Solo quien tiene asignado el ticket envía la corrección')
    if t['estado'] != 'abierto':
        raise HTTPException(status_code=409, detail='El ticket no está abierto')
    faltan = [ln['titulo'] for ln in t['lineas'] if not (ln.get('corregida') and ln.get('fotos'))]
    if faltan:
        raise HTTPException(status_code=400, detail=f'Marca como corregida y sube la foto de: {", ".join(faltan[:3])}'
                                                    + ('…' if len(faltan) > 3 else ''))
    texto = (texto or '').strip()[:2000] or 'Corregido. Adjunté las fotos.'
    plazos = t.get('plazos')
    r = await db.tickets.update_one({'id': t['id'], 'estado': 'abierto'}, {
        '$set': {'estado': 'corregido', 'updated_at': now_iso(), 'aviso': None, 'vencido': False,
                 'vence': promo_plazos.desde_ahora(plazos['revisar_dias'] * 24) if plazos else None},
        '$push': {'mensajes': _mensaje(user, texto, 'coordinador')}})
    if r.matched_count == 0:
        raise HTTPException(status_code=409, detail='El ticket cambió; vuelve a abrirlo')
    await _avisar(await _revisores_ids(t['tienda']), 'ticket_corregido',
                  f"{t['numero']}: {user['name']} corrigió {t['categoria']} de {t['tienda']}. Valídalo.", t, user)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/cerrar')
async def cerrar(ticket_id: str, texto: str = Form(''), user=Depends(get_current_user)):
    """Quien revisa valida en piso y cierra: la categoría queda validada."""
    t = await _ticket_o_404(ticket_id)
    if not es_revisor(user, t):
        raise HTTPException(status_code=403, detail='Solo el jefe o el gerente de la tienda cierran el ticket')
    if t['estado'] not in ('abierto', 'corregido'):
        raise HTTPException(status_code=409, detail='El ticket ya está cerrado')
    ahora = now_iso()
    msgs = ([_mensaje(user, texto.strip()[:2000], 'revisor')] if (texto or '').strip() else []) + \
        [_sistema(f"{user['name']} validó y cerró el ticket.")]
    r = await db.tickets.update_one({'id': t['id'], 'estado': t['estado']}, {
        '$set': {'estado': 'cerrado', 'cerrado_por': {'id': user['id'], 'name': user['name']},
                 'cerrado_at': ahora, 'updated_at': ahora, 'vence': None},
        '$push': {'mensajes': {'$each': msgs}}})
    if r.matched_count == 0:
        raise HTTPException(status_code=409, detail='El ticket cambió; vuelve a abrirlo')
    tarea_id = (t.get('origen') or {}).get('tarea_id')
    if tarea_id:
        await db.promo_tareas.update_one({'id': tarea_id, 'estado': 'con_observaciones'}, {'$set': {
            'estado': 'validada', 'validada_por': user['id'], 'validada_por_name': user['name'], 'validada_at': ahora}})
    await _avisar([t['asignado_a']['id']], 'ticket_cerrado',
                  f"{t['numero']} validado y cerrado por {user['name']}. {t['categoria']} de {t['tienda']} quedó validada.", t, user)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/reabrir')
async def reabrir(ticket_id: str, texto: str = Form(''), user=Depends(get_current_user)):
    """Quien revisa no quedó conforme: vuelve al coordinador con un comentario."""
    t = await _ticket_o_404(ticket_id)
    if not es_revisor(user, t):
        raise HTTPException(status_code=403, detail='Solo el jefe o el gerente de la tienda reabren el ticket')
    if t['estado'] != 'corregido':
        raise HTTPException(status_code=409, detail='Solo se reabre un ticket corregido')
    texto = (texto or '').strip()[:2000]
    if not texto:
        raise HTTPException(status_code=400, detail='Escribe qué sigue mal para reabrirlo')
    plazos = t.get('plazos')
    sets = {'estado': 'abierto', 'reaperturas': (t.get('reaperturas') or 0) + 1, 'updated_at': now_iso(),
            'aviso': None, 'vencido': False,
            'vence': promo_plazos.desde_ahora(plazos['corregir_horas']) if plazos else None}
    for i in range(len(t.get('lineas', []))):
        sets[f'lineas.{i}.corregida'] = False
    r = await db.tickets.update_one({'id': t['id'], 'estado': 'corregido'}, {
        '$set': sets,
        '$push': {'mensajes': {'$each': [_mensaje(user, texto, 'revisor'),
                                         _sistema(f"{user['name']} reabrió el ticket.")]}}})
    if r.matched_count == 0:
        raise HTTPException(status_code=409, detail='El ticket cambió; vuelve a abrirlo')
    await _avisar([t['asignado_a']['id']], 'ticket_reabierto', f"{t['numero']} reabierto por {user['name']}: {texto[:80]}", t, user)
    return await detalle(t['id'], user)
