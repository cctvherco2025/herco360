"""Seguimientos: tickets de inconsistencias (Promociones del mes y formularios
del constructor nuevo).

Promociones: cuando el jefe o el gerente de tienda envía observaciones al
revisar una categoría, se abre un ticket con esas líneas, asignado a quien la
contestó. Formularios: al enviar una respuesta, las preguntas configuradas
para eso (p. ej. «No cumple») abren uno con esas líneas, asignado a quien
llenó; lo revisan las personas guardadas en `revisores`.

  abierto    el coordinador corrige en piso y sube una foto por línea
  corregido  el coordinador marcó todo como corregido; espera validación
  cerrado    quien revisa validó en piso: la categoría queda validada
  cancelado  la respuesta se eliminó

Quien revisa puede reabrir un ticket corregido (con un comentario). Los dos
lados conversan en el mismo hilo. El ticket guarda de dónde viene (`origen`)
para poder usarse después con otros formularios.
"""
import json
import re
import logging
from typing import List

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pymongo import ReturnDocument

from core import (require_modulo, puede_modulo, db, get_current_user, serialize_doc, new_id, now_iso, es_revisor_tienda,
                  tienda_promos, can_admin_promos, es_super_admin)
from notifications import create_notification
import promo_plazos
import promo_revisores
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


def de_formulario(t: dict) -> bool:
    return (t.get('origen') or {}).get('tipo') == 'formulario'


def es_revisor(user: dict, t: dict) -> bool:
    """Quien valida o reabre. Promociones: jefe o gerente de esa tienda, o
    quien administra Promociones; en las categorías con revisores por categoría,
    esas personas en lugar del jefe y el gerente. Formularios: quienes guardó
    el seguimiento al abrirse (y el super admin). Nunca el asignado."""
    if es_asignado(user, t):
        return False
    if de_formulario(t):
        return user.get('id') in revisores_ids(t) or es_super_admin(user)
    extras = promo_revisores.extras_ids(t.get('tienda'), t.get('categoria'))
    if extras:
        return user.get('id') in extras or can_admin_promos(user)
    return (es_revisor_tienda(user) and tienda_promos(user) == t.get('tienda')) or can_admin_promos(user)


def revisores_ids(t: dict) -> list:
    return [r['id'] for r in t.get('revisores') or [] if r.get('id')]


def puede_ver(user: dict, t: dict) -> bool:
    # en Promociones el jefe y el gerente de la tienda siempre lo ven, aunque lo valide otra persona
    return (es_asignado(user, t) or es_revisor(user, t)
            or (not de_formulario(t) and es_revisor_tienda(user) and tienda_promos(user) == t.get('tienda')))


async def _ticket_o_404(ticket_id: str) -> dict:
    await promo_revisores.cargar()
    t = await db.tickets.find_one({'id': ticket_id}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Seguimiento no encontrado')
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


async def _destino_revisores(t: dict) -> list:
    """A quién avisar de lo que hace el asignado."""
    if de_formulario(t):
        return revisores_ids(t)
    return promo_revisores.extras_ids(t['tienda'], t.get('categoria')) or await _revisores_ids(t['tienda'])


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
        'mensajes': [_sistema(f"{revisor['name']} abrió el seguimiento con {len(lineas)} "
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


async def crear_ticket_formulario(form: dict, resp: dict, lineas: list, revisores: list, plazo_horas: int) -> dict:
    """Uno por respuesta de un formulario del constructor nuevo. `lineas`:
    [{'item_id', 'titulo', 'tipo' (lo contestado), 'comentario', 'evidencia'}]."""
    n = await db.counters.find_one_and_update({'_id': 'tickets_form'}, {'$inc': {'n': 1}},
                                              upsert=True, return_document=ReturnDocument.AFTER)
    lugar = resp.get('sucursal') or ''
    plazos = {'corregir_horas': plazo_horas, 'revisar_dias': 2, 'recordar_horas': max(2, min(24, plazo_horas // 4))}
    quien = {'id': resp['respondent_id'], 'name': resp['respondent_name']}
    t = {
        'id': new_id(), 'numero': f"FORM-{n['n']:04d}",
        'origen': {'tipo': 'formulario', 'form_id': form['id'], 'respuesta_id': resp['id'], 'version': resp.get('version')},
        'tienda': lugar, 'categoria': form['titulo'],
        'titulo': form['titulo'] + (f' · {lugar}' if lugar else ''),
        'abierto_por': {'id': None, 'name': 'el formulario'},
        'asignado_a': quien, 'revisores': revisores,
        'estado': 'abierto', 'reaperturas': 0,
        'lineas': [{**ln, 'corregida': False, 'fotos': []} for ln in lineas],
        'mensajes': [_sistema(f"Se abrió al enviar «{form['titulo']}»: {len(lineas)} "
                              f"punto{'s' if len(lineas) != 1 else ''} por corregir.")],
        'created_at': now_iso(), 'updated_at': now_iso(),
        'cerrado_por': None, 'cerrado_at': None,
        'plazos': plazos, 'recordar_horas': plazos['recordar_horas'],
        'vence': promo_plazos.desde_ahora(plazo_horas), 'aviso': None, 'vencido': False,
    }
    await db.tickets.insert_one(t)
    t.pop('_id', None)
    sistema = {'id': None, 'name': 'Formularios'}
    await _avisar([quien['id']], 'ticket_abierto',
                  f"{t['numero']}: tu respuesta de «{form['titulo']}» tiene {len(lineas)} punto{'s' if len(lineas) != 1 else ''} "
                  f"por corregir. Corrígelos y sube la foto.", t, sistema)
    await _avisar(revisores_ids(t), 'ticket_abierto',
                  f"{t['numero']}: se abrió un seguimiento de «{form['titulo']}» para {quien['name']}. Te toca validarlo.", t, sistema)
    return t


async def cancelar_de_respuestas(resp_ids: list):
    """Respuestas de formularios eliminadas: sus seguimientos abiertos ya no aplican."""
    if resp_ids:
        await db.tickets.update_many(
            {'origen.respuesta_id': {'$in': list(resp_ids)}, 'estado': {'$in': ['abierto', 'corregido']}},
            {'$set': {'estado': 'cancelado', 'updated_at': now_iso()},
             '$push': {'mensajes': _sistema('Se canceló: la respuesta del formulario se eliminó.')}})


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
          'updated_at': 1, 'lineas.corregida': 1, 'vence': 1, 'vencido': 1, 'revisores': 1}


def _filtro(user: dict) -> dict:
    """Los que la persona puede ver: los suyos, los de su tienda si revisa, o
    todos si administra Promociones."""
    if es_super_admin(user):
        return {}
    ors = [{'asignado_a.id': user['id']}, {'revisores.id': user['id']}]
    if can_admin_promos(user):
        ors.append({'origen.tipo': {'$ne': 'formulario'}})
    elif es_revisor_tienda(user):
        ors.append({'tienda': tienda_promos(user), 'origen.tipo': {'$ne': 'formulario'}})
    for tienda, cats in _pares_cat(user).items():
        ors.append({'tienda': tienda, 'categoria': {'$in': cats}, 'origen.tipo': {'$ne': 'formulario'}})
    return {'$or': ors}


def _pares_cat(user: dict) -> dict:
    """{tienda: [categorías como regex]} que la persona valida por revisores por categoría."""
    out = {}
    for r in promo_revisores.reglas():
        for tienda, p in (r.get('por_tienda') or {}).items():
            if p and p.get('id') == user.get('id'):
                out.setdefault(tienda, []).extend(
                    re.compile(f'^{re.escape(c)}$', re.IGNORECASE) for c in r.get('categorias') or [])
    return out


@router.get('')
async def listar(estado: str = None, user=Depends(require_modulo('seguimientos'))):
    await promo_revisores.cargar()
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
    if not puede_modulo(user, 'seguimientos'):
        return {'pendientes': 0, 'tiene': False}
    await promo_revisores.cargar()
    n = await db.tickets.count_documents({'asignado_a.id': user['id'], 'estado': 'abierto'})
    pares = _pares_cat(user)
    if can_admin_promos(user) or es_revisor_tienda(user) or pares:
        # corregidos de Promociones que le toca validar (en las categorías con
        # revisores por categoría, a esas personas y no al jefe ni al gerente)
        q = {'estado': 'corregido', 'asignado_a.id': {'$ne': user['id']}, 'origen.tipo': {'$ne': 'formulario'}}
        if not can_admin_promos(user):
            ors = [{'tienda': t, 'categoria': {'$in': cs}} for t, cs in pares.items()]
            if es_revisor_tienda(user):
                ors.append({'tienda': tienda_promos(user)})
            q['$or'] = ors
        rows = await db.tickets.find(q, {'_id': 0, 'tienda': 1, 'categoria': 1, 'origen': 1, 'asignado_a': 1}).to_list(1000)
        n += sum(1 for k in rows if es_revisor(user, k))
    n += await db.tickets.count_documents({'estado': 'corregido', 'revisores.id': user['id'], 'asignado_a.id': {'$ne': user['id']}})
    # los de formularios pueden ser de cualquier departamento: quien tenga alguno entra aunque no sea de tienda
    tiene = bool(pares) or bool(await db.tickets.find_one(
        {'$or': [{'asignado_a.id': user['id']}, {'revisores.id': user['id']}]}, {'_id': 1}))
    return {'pendientes': n, 'tiene': tiene}


@router.get('/{ticket_id}')
async def detalle(ticket_id: str, user=Depends(require_modulo('seguimientos'))):
    t = await _ticket_o_404(ticket_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver este seguimiento')
    t['soy_asignado'] = es_asignado(user, t)
    t['soy_revisor'] = es_revisor(user, t)
    return serialize_doc(t)


@router.get('/{ticket_id}/cambios')
async def cambios(ticket_id: str, desde: str = '', user=Depends(require_modulo('seguimientos'))):
    """Consulta liviana que la pantalla hace cada pocos segundos mientras la
    conversación está abierta: si nada cambió desde `desde`, no devuelve el seguimiento."""
    t = await db.tickets.find_one({'id': ticket_id}, {'_id': 0, 'mensajes': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Seguimiento no encontrado')
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver este seguimiento')
    if desde and t.get('updated_at') == desde:
        return {'cambio': False}
    return {'cambio': True, 'ticket': await detalle(ticket_id, user)}


@router.get('/{ticket_id}/foto/{foto_id}')
async def foto(ticket_id: str, foto_id: str, user=Depends(require_modulo('seguimientos'))):
    t = await _ticket_o_404(ticket_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver este seguimiento')
    fotos = [f for ln in t.get('lineas', []) for f in ln.get('fotos', []) + ln.get('evidencia', [])] + \
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
                  user=Depends(require_modulo('seguimientos'))):
    t = await _ticket_o_404(ticket_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes escribir en este seguimiento')
    if t['estado'] in ('cerrado', 'cancelado'):
        raise HTTPException(status_code=409, detail='El seguimiento ya está cerrado')
    texto = (texto or '').strip()[:2000]
    subidas = await _subir_fotos(t['id'], fotos)
    if not texto and not subidas:
        raise HTTPException(status_code=400, detail='Escribe un mensaje o adjunta una foto')
    rol = 'coordinador' if es_asignado(user, t) else 'revisor'
    await db.tickets.update_one({'id': t['id']}, {'$push': {'mensajes': _mensaje(user, texto, rol, subidas)},
                                                  '$set': {'updated_at': now_iso()}})
    destino = await _destino_revisores(t) if rol == 'coordinador' else [t['asignado_a']['id']]
    await _avisar(destino, 'ticket_mensaje', f"{t['numero']} · {user['name']}: {texto[:80] or 'envió una foto'}", t, user)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/lineas/{item_id}')
async def corregir_linea(ticket_id: str, item_id: str, corregida: bool = Form(True),
                         fotos: List[UploadFile] = File(default=[]), user=Depends(require_modulo('seguimientos'))):
    """El coordinador marca una línea como corregida y sube su foto."""
    t = await _ticket_o_404(ticket_id)
    if not es_asignado(user, t):
        raise HTTPException(status_code=403, detail='Solo quien tiene asignado el seguimiento corrige sus líneas')
    if t['estado'] != 'abierto':
        raise HTTPException(status_code=409, detail='El seguimiento no está abierto')
    idx = next((i for i, ln in enumerate(t['lineas']) if ln['item_id'] == item_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail='Esa línea no está en el seguimiento')
    subidas = await _subir_fotos(t['id'], fotos)
    upd = {f'lineas.{idx}.corregida': bool(corregida), 'updated_at': now_iso()}
    ops = {'$set': upd}
    if subidas:
        ops['$push'] = {f'lineas.{idx}.fotos': {'$each': subidas}}
    await db.tickets.update_one({'id': t['id'], 'estado': 'abierto'}, ops)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/corregido')
async def enviar_correccion(ticket_id: str, texto: str = Form(''), user=Depends(require_modulo('seguimientos'))):
    """El coordinador avisa que corrigió todo: cada línea corregida con foto."""
    t = await _ticket_o_404(ticket_id)
    if not es_asignado(user, t):
        raise HTTPException(status_code=403, detail='Solo quien tiene asignado el seguimiento envía la corrección')
    if t['estado'] != 'abierto':
        raise HTTPException(status_code=409, detail='El seguimiento no está abierto')
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
        raise HTTPException(status_code=409, detail='El seguimiento cambió; vuelve a abrirlo')
    que = f"lo de «{t['categoria']}»" if de_formulario(t) else f"{t['categoria']} de {t['tienda']}"
    await _avisar(await _destino_revisores(t), 'ticket_corregido', f"{t['numero']}: {user['name']} corrigió {que}. Valídalo.", t, user)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/cerrar')
async def cerrar(ticket_id: str, texto: str = Form(''), user=Depends(require_modulo('seguimientos'))):
    """Quien revisa valida en piso y cierra: la categoría queda validada."""
    t = await _ticket_o_404(ticket_id)
    if not es_revisor(user, t):
        raise HTTPException(status_code=403, detail='Solo quien revisa el seguimiento lo cierra')
    if t['estado'] not in ('abierto', 'corregido'):
        raise HTTPException(status_code=409, detail='El seguimiento ya está cerrado')
    ahora = now_iso()
    msgs = ([_mensaje(user, texto.strip()[:2000], 'revisor')] if (texto or '').strip() else []) + \
        [_sistema(f"{user['name']} validó y cerró el seguimiento.")]
    r = await db.tickets.update_one({'id': t['id'], 'estado': t['estado']}, {
        '$set': {'estado': 'cerrado', 'cerrado_por': {'id': user['id'], 'name': user['name']},
                 'cerrado_at': ahora, 'updated_at': ahora, 'vence': None},
        '$push': {'mensajes': {'$each': msgs}}})
    if r.matched_count == 0:
        raise HTTPException(status_code=409, detail='El seguimiento cambió; vuelve a abrirlo')
    tarea_id = (t.get('origen') or {}).get('tarea_id')
    if tarea_id:
        await db.promo_tareas.update_one({'id': tarea_id, 'estado': 'con_observaciones'}, {'$set': {
            'estado': 'validada', 'validada_por': user['id'], 'validada_por_name': user['name'], 'validada_at': ahora}})
    fin = '' if de_formulario(t) else f" {t['categoria']} de {t['tienda']} quedó validada."
    await _avisar([t['asignado_a']['id']], 'ticket_cerrado', f"{t['numero']} validado y cerrado por {user['name']}.{fin}", t, user)
    return await detalle(t['id'], user)


@router.post('/{ticket_id}/reabrir')
async def reabrir(ticket_id: str, texto: str = Form(''), user=Depends(require_modulo('seguimientos'))):
    """Quien revisa no quedó conforme: vuelve al coordinador con un comentario."""
    t = await _ticket_o_404(ticket_id)
    if not es_revisor(user, t):
        raise HTTPException(status_code=403, detail='Solo quien revisa el seguimiento lo reabre')
    if t['estado'] != 'corregido':
        raise HTTPException(status_code=409, detail='Solo se reabre un seguimiento corregido')
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
                                         _sistema(f"{user['name']} reabrió el seguimiento.")]}}})
    if r.matched_count == 0:
        raise HTTPException(status_code=409, detail='El seguimiento cambió; vuelve a abrirlo')
    await _avisar([t['asignado_a']['id']], 'ticket_reabierto', f"{t['numero']} reabierto por {user['name']}: {texto[:80]}", t, user)
    return await detalle(t['id'], user)
