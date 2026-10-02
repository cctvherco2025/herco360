"""Tareas de tienda.

Un encargo operativo que un gerente o un jefe de tienda le asigna a uno o
varios coordinadores (y el gerente también al jefe), p. ej. "ordenar góndolas".
Es un módulo aparte del de Tickets (que son las inconsistencias de Promociones).

Flujo de cada persona asignada:

  pendiente   le toca hacerla
  hecha       la marcó hecha subiendo una foto de evidencia; espera validación
  devuelta    el gerente/jefe no quedó conforme y la devolvió con un motivo
  validada    el gerente/jefe la dio por buena

La tarea completa queda:

  abierta     mientras alguna parte no esté validada
  cerrada     cuando todas las partes están validadas
  cancelada   el gerente/jefe la canceló

Tiendas que participan en Promociones del mes: H1 (Herco Max), H2 (Herco Centro) y H6 (Herco JT).
Fechas de los campos de auditoría (created_at, etc.) en UTC (now_iso). La
fecha límite es un día (YYYY-MM-DD) en hora de la empresa.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from core import (db, get_current_user, serialize_doc, new_id, now_iso, now_local,
                  es_revisor_tienda, es_coordinador_tienda, tienda_promos, PROMO_TIENDAS, JEFE_TIENDA)
from notifications import create_notification
import storage

router = APIRouter(prefix='/tareas', tags=['tareas'])
logger = logging.getLogger('tareas')

MAX_FOTO = 8 * 1024 * 1024
PRIORIDADES = ('alta', 'media', 'baja')
ESTADOS = ('abierta', 'cerrada', 'cancelada')
# estado de cada persona asignada
EST_PENDIENTE, EST_HECHA, EST_DEVUELTA, EST_VALIDADA = 'pendiente', 'hecha', 'devuelta', 'validada'


# --------------------------------------------------------------------------- #
#  Modelos de entrada
# --------------------------------------------------------------------------- #
class TareaCreate(BaseModel):
    titulo: str = Field(min_length=1, max_length=200)
    descripcion: str = Field(default='', max_length=4000)
    prioridad: str = 'media'
    fecha_limite: Optional[str] = None  # 'YYYY-MM-DD'
    asignados: List[str] = Field(min_length=1)  # ids de usuarios


class TareaUpdate(BaseModel):
    titulo: Optional[str] = Field(default=None, max_length=200)
    descripcion: Optional[str] = Field(default=None, max_length=4000)
    prioridad: Optional[str] = None
    fecha_limite: Optional[str] = None
    asignados: Optional[List[str]] = None


# --------------------------------------------------------------------------- #
#  Permisos
# --------------------------------------------------------------------------- #
def _es_supervisor(user: dict) -> bool:
    """Admin y Director comercial ven y administran todas las tiendas."""
    u = user or {}
    return u.get('role') == 'admin' or (u.get('position') or '').strip() == 'Director comercial'


def puede_crear(user: dict) -> bool:
    """Crean gerente y jefe de tienda (de una tienda que participa)."""
    return es_revisor_tienda(user)


def es_validador(user: dict, t: dict) -> bool:
    """Valida/cierra/edita/cancela: gerente o jefe de esa tienda, o un supervisor."""
    return _es_supervisor(user) or (es_revisor_tienda(user) and tienda_promos(user) == t.get('tienda'))


def mi_asignacion(user: dict, t: dict) -> Optional[dict]:
    return next((a for a in (t.get('asignados') or []) if a.get('id') == user.get('id')), None)


def puede_ver(user: dict, t: dict) -> bool:
    return mi_asignacion(user, t) is not None or es_validador(user, t)


def puede_ver_modulo(user: dict) -> bool:
    return es_revisor_tienda(user) or es_coordinador_tienda(user) or _es_supervisor(user)


async def _tarea_o_404(tarea_id: str) -> dict:
    t = await db.tareas.find_one({'id': tarea_id}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    return t


# --------------------------------------------------------------------------- #
#  Utilidades
# --------------------------------------------------------------------------- #
def _sucursales_de(tienda: str) -> list:
    return [s for s, t in PROMO_TIENDAS.items() if t == tienda]


async def _validadores_ids(tienda: str) -> list:
    """Gerentes y jefes de la tienda (a quienes se avisa cuando se marca hecha)."""
    users = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': _sucursales_de(tienda)},
         '$or': [{'position': JEFE_TIENDA}, {'position': 'Gerente', 'area': 'Tienda'}]},
        {'_id': 0, 'id': 1}).to_list(50)
    return [u['id'] for u in users]


async def _asignables(user: dict) -> list:
    """A quién puede asignar quien crea: coordinadores de su tienda y, si quien
    crea es el gerente, también el jefe de tienda. Nunca a sí mismo."""
    tienda = tienda_promos(user)
    es_gerente = (user.get('position') or '').strip() == 'Gerente'
    cargos = ['Coordinador'] + ([JEFE_TIENDA] if es_gerente else [])
    users = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': _sucursales_de(tienda)}, 'area': 'Tienda',
         'position': {'$in': cargos}, 'id': {'$ne': user['id']}},
        {'_id': 0, 'id': 1, 'name': 1, 'position': 1}).to_list(100)
    users.sort(key=lambda u: (u['position'] != JEFE_TIENDA, u['name']))
    return users


async def _avisar(uids, tipo: str, msg: str, t: dict, actor: dict):
    for uid in dict.fromkeys(uids):
        if uid and uid != actor.get('id'):
            await create_notification(uid, tipo, msg, related_id=t['id'], related_type='tarea',
                                      actor_name=actor.get('name'), actor_avatar=actor.get('avatar_url'))


async def _subir_fotos(tarea_id: str, fotos: List[UploadFile]) -> list:
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
        path = f'{storage.APP_NAME}/tareas/{tarea_id}/{fid}.{ext}'
        try:
            await storage.put_object(path, content, ctype)
        except Exception as ex:
            logger.error(f'tarea photo upload failed: {ex}')
            raise HTTPException(status_code=502, detail='No se pudo subir una de las fotos')
        out.append({'id': fid, 'path': path, 'content_type': ctype})
    return out


def _mensaje(user: dict, texto: str, rol: str, fotos=None) -> dict:
    return {'id': new_id(), 'de_id': user.get('id'), 'de_name': user.get('name'), 'rol': rol,
            'texto': texto, 'fotos': fotos or [], 'at': now_iso()}


def _sistema(texto: str) -> dict:
    return {'id': new_id(), 'de_id': None, 'de_name': None, 'rol': 'sistema', 'texto': texto, 'fotos': [], 'at': now_iso()}


def _rol_en(user: dict, t: dict) -> str:
    return 'responsable' if mi_asignacion(user, t) else 'revisor'


def _fecha_dia(s) -> Optional[datetime]:
    try:
        return datetime.strptime(s, '%Y-%m-%d') if s else None
    except (ValueError, TypeError):
        return None


def _vencida(t: dict) -> bool:
    d = _fecha_dia(t.get('fecha_limite'))
    if not d or t.get('estado') != 'abierta':
        return False
    # vencida si pasó el día y aún falta validar alguna parte
    falta = any(a.get('estado') != EST_VALIDADA for a in (t.get('asignados') or []))
    return falta and d.date() < now_local().date()


def _estado_global(asignados: list) -> str:
    return 'cerrada' if asignados and all(a.get('estado') == EST_VALIDADA for a in asignados) else 'abierta'


def _normalizar_prioridad(p) -> str:
    p = (p or '').strip().lower()
    return p if p in PRIORIDADES else 'media'


def _validar_fecha(fl):
    if fl and not _fecha_dia(fl):
        raise HTTPException(status_code=400, detail='La fecha límite debe tener el formato AAAA-MM-DD')
    return fl or None


def _pintar(t: dict, user: dict) -> dict:
    t = dict(t)
    t['vencida'] = _vencida(t)
    t['soy_validador'] = es_validador(user, t)
    mia = mi_asignacion(user, t)
    t['mi_estado'] = mia.get('estado') if mia else None
    t['por_validar'] = sum(1 for a in t.get('asignados', []) if a.get('estado') == EST_HECHA)
    return t


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
def _filtro(user: dict) -> dict:
    if _es_supervisor(user):
        return {}
    ors = [{'asignados.id': user['id']}]
    if es_revisor_tienda(user):
        ors.append({'tienda': tienda_promos(user)})
    return {'$or': ors}


@router.get('/asignables')
async def asignables(user=Depends(get_current_user)):
    if not puede_crear(user):
        raise HTTPException(status_code=403, detail='Solo el gerente o el jefe de tienda crean tareas')
    return serialize_doc(await _asignables(user))


@router.get('/contador')
async def contador(user=Depends(get_current_user)):
    """Lo que espera algo de la persona: lo suyo por hacer (pendiente/devuelta),
    y lo que le toca validar si es gerente/jefe (partes marcadas hechas)."""
    if not puede_ver_modulo(user):
        return {'pendientes': 0}
    n = await db.tareas.count_documents(
        {'estado': 'abierta', 'asignados': {'$elemMatch': {'id': user['id'], 'estado': {'$in': [EST_PENDIENTE, EST_DEVUELTA]}}}})
    if es_revisor_tienda(user) or _es_supervisor(user):
        q = {'estado': 'abierta', 'asignados': {'$elemMatch': {'estado': EST_HECHA, 'id': {'$ne': user['id']}}}}
        if not _es_supervisor(user):
            q['tienda'] = tienda_promos(user)
        n += await db.tareas.count_documents(q)
    return {'pendientes': n}


@router.get('')
async def listar(estado: str = None, user=Depends(get_current_user)):
    if not puede_ver_modulo(user):
        raise HTTPException(status_code=403, detail='No tienes acceso a las tareas')
    q = _filtro(user)
    if estado in ESTADOS:
        q['estado'] = estado
    rows = await db.tareas.find(q, {'_id': 0}).sort('updated_at', -1).to_list(400)
    return serialize_doc([_pintar(r, user) for r in rows])


@router.get('/inicio')
async def inicio(user=Depends(get_current_user)):
    """Bloque del Inicio. Coordinador: lo suyo por hacer. Gerente/jefe: lo que
    espera su validación."""
    if es_coordinador_tienda(user):
        # Sus tareas sin cerrar (pendiente/devuelta/hecha) y las validadas hace
        # poco (últimos 7 días), para que vea que tiene tareas aunque ya las cerró.
        corte = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        rows = await db.tareas.find(
            {'estado': {'$ne': 'cancelada'}, 'asignados.id': user['id']}, {'_id': 0}).to_list(300)
        items = []
        for t in rows:
            mia = mi_asignacion(user, t)
            if not mia:
                continue
            e = mia['estado']
            activa = t['estado'] == 'abierta' and e in (EST_PENDIENTE, EST_DEVUELTA, EST_HECHA)
            reciente = e == EST_VALIDADA and (mia.get('validada_at') or '') >= corte
            if activa or reciente:
                items.append(_pintar(t, user))
        # pendientes/devueltas primero (vencidas arriba), luego en proceso, luego terminadas
        orden = {EST_PENDIENTE: 0, EST_DEVUELTA: 0, EST_HECHA: 1, EST_VALIDADA: 2}
        items.sort(key=lambda t: (orden.get(t['mi_estado'], 3), not t['vencida'], t.get('fecha_limite') or '9999-99-99'))
        return {'rol': 'coordinador', 'tareas': serialize_doc(items)}
    if es_revisor_tienda(user) or _es_supervisor(user):
        q = {'estado': 'abierta', 'asignados.estado': EST_HECHA}
        if not _es_supervisor(user):
            q['tienda'] = tienda_promos(user)
        rows = await db.tareas.find(q, {'_id': 0}).sort('updated_at', -1).to_list(100)
        return {'rol': 'revisor', 'tareas': serialize_doc([_pintar(r, user) for r in rows])}
    return {'rol': None, 'tareas': []}


@router.get('/agenda')
async def agenda(start: str, end: str, user=Depends(get_current_user)):
    """Tareas con fecha límite (abiertas) en el rango, para pintarlas como
    "todo el día" en la agenda del responsable y de quien la creó."""
    if not puede_ver_modulo(user):
        return []
    q = {'estado': {'$in': ['abierta', 'cerrada']}, 'fecha_limite': {'$gte': start, '$lte': end},
         '$or': [{'asignados.id': user['id']}, {'creado_por.id': user['id']}]}
    rows = await db.tareas.find(q, {'_id': 0}).to_list(500)
    out = []
    for t in rows:
        mia = mi_asignacion(user, t)
        out.append({'id': t['id'], 'numero': t['numero'], 'titulo': t['titulo'],
                    'fecha_limite': t['fecha_limite'], 'prioridad': t['prioridad'], 'tienda': t['tienda'],
                    'estado': t['estado'], 'vencida': _vencida(t),
                    'rol': 'responsable' if mia else 'creador',
                    'mi_estado': mia['estado'] if mia else None})
    return serialize_doc(out)


@router.get('/{tarea_id}')
async def detalle(tarea_id: str, user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver esta tarea')
    return serialize_doc(_pintar(t, user))


@router.get('/{tarea_id}/foto/{foto_id}')
async def foto(tarea_id: str, foto_id: str, user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver esta tarea')
    fotos = [f for a in t.get('asignados', []) for f in (a.get('evidencia') or [])] + \
            [f for a in t.get('asignados', []) for it in (a.get('intentos') or []) for f in (it.get('fotos') or [])] + \
            [f for m in t.get('mensajes', []) for f in (m.get('fotos') or [])]
    p = next((f for f in fotos if f['id'] == foto_id), None)
    if not p:
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    try:
        content, ctype = await storage.get_object(p['path'])
    except Exception as ex:
        logger.error(f'tarea photo download failed: {ex}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=p.get('content_type', ctype))


# --------------------------------------------------------------------------- #
#  Crear / editar / cancelar
# --------------------------------------------------------------------------- #
@router.post('')
async def crear(data: TareaCreate, user=Depends(get_current_user)):
    if not puede_crear(user):
        raise HTTPException(status_code=403, detail='Solo el gerente o el jefe de tienda crean tareas')
    tienda = tienda_promos(user)
    permitidos = {u['id']: u for u in await _asignables(user)}
    ids = list(dict.fromkeys(data.asignados))
    elegidos = [permitidos[i] for i in ids if i in permitidos]
    if not elegidos:
        raise HTTPException(status_code=400, detail='Elige al menos una persona de tu tienda para asignarle la tarea')
    if len(elegidos) != len(ids):
        raise HTTPException(status_code=400, detail='Alguien de los elegidos no es de tu tienda o no puedes asignarle')

    n = await db.counters.find_one_and_update({'_id': 'tareas'}, {'$inc': {'n': 1}},
                                              upsert=True, return_document=ReturnDocument.AFTER)
    asignados = [{'id': u['id'], 'name': u['name'], 'estado': EST_PENDIENTE, 'evidencia': [],
                  'intentos': [], 'comentario': '', 'hecho_at': None, 'validada_por_name': None,
                  'validada_at': None, 'devuelta_por_name': None, 'devuelta_at': None, 'motivo': None}
                 for u in elegidos]
    ahora = now_iso()
    t = {
        'id': new_id(), 'numero': f"TAREA-{n['n']:04d}", 'tienda': tienda,
        'titulo': data.titulo.strip(), 'descripcion': (data.descripcion or '').strip(),
        'prioridad': _normalizar_prioridad(data.prioridad), 'fecha_limite': _validar_fecha(data.fecha_limite),
        'creado_por': {'id': user['id'], 'name': user['name']},
        'asignados': asignados, 'estado': 'abierta',
        'mensajes': [_sistema(f"{user['name']} creó la tarea y la asignó a {', '.join(u['name'] for u in elegidos)}.")],
        'created_at': ahora, 'updated_at': ahora,
        'cancelada_por': None, 'cancelada_at': None, 'recordatorios': [],
    }
    await db.tareas.insert_one(t)
    t.pop('_id', None)
    await _avisar([u['id'] for u in elegidos], 'tarea_asignada',
                  f"{t['numero']}: {user['name']} te asignó \"{t['titulo']}\""
                  + (f" · vence {t['fecha_limite']}" if t['fecha_limite'] else '.'), t, user)
    return serialize_doc(_pintar(t, user))


@router.patch('/{tarea_id}')
async def editar(tarea_id: str, data: TareaUpdate, user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not es_validador(user, t):
        raise HTTPException(status_code=403, detail='Solo el gerente o el jefe de la tienda edita la tarea')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    sets = {}
    if data.titulo is not None:
        if not data.titulo.strip():
            raise HTTPException(status_code=400, detail='El título no puede quedar vacío')
        sets['titulo'] = data.titulo.strip()
    if data.descripcion is not None:
        sets['descripcion'] = data.descripcion.strip()
    if data.prioridad is not None:
        sets['prioridad'] = _normalizar_prioridad(data.prioridad)
    if data.fecha_limite is not None:
        sets['fecha_limite'] = _validar_fecha(data.fecha_limite)
        sets['recordatorios'] = []  # nueva fecha: los recordatorios vuelven a contar
    if sets:
        sets['updated_at'] = now_iso()
        await db.tareas.update_one({'id': t['id']}, {'$set': sets,
                                   '$push': {'mensajes': _sistema(f"{user['name']} editó la tarea.")}})
    return await detalle(t['id'], user)


@router.post('/{tarea_id}/cancelar')
async def cancelar(tarea_id: str, texto: str = Form(''), user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not es_validador(user, t):
        raise HTTPException(status_code=403, detail='Solo el gerente o el jefe de la tienda cancela la tarea')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    ahora = now_iso()
    msgs = ([_mensaje(user, texto.strip()[:2000], 'revisor')] if (texto or '').strip() else []) + \
        [_sistema(f"{user['name']} canceló la tarea.")]
    await db.tareas.update_one({'id': t['id'], 'estado': 'abierta'}, {
        '$set': {'estado': 'cancelada', 'cancelada_por': {'id': user['id'], 'name': user['name']},
                 'cancelada_at': ahora, 'updated_at': ahora},
        '$push': {'mensajes': {'$each': msgs}}})
    pendientes = [a['id'] for a in t['asignados'] if a['estado'] != EST_VALIDADA]
    await _avisar(pendientes, 'tarea_cancelada', f"{t['numero']}: {user['name']} canceló \"{t['titulo']}\".", t, user)
    return await detalle(t['id'], user)


# --------------------------------------------------------------------------- #
#  Acciones del responsable y del validador
# --------------------------------------------------------------------------- #
@router.post('/{tarea_id}/hecho')
async def marcar_hecho(tarea_id: str, texto: str = Form(''), fotos: List[UploadFile] = File(default=[]),
                       user=Depends(get_current_user)):
    """El responsable marca su parte como hecha. Foto de evidencia obligatoria."""
    t = await _tarea_o_404(tarea_id)
    mia = mi_asignacion(user, t)
    if not mia:
        raise HTTPException(status_code=403, detail='Esta tarea no te fue asignada')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    if mia['estado'] not in (EST_PENDIENTE, EST_DEVUELTA):
        raise HTTPException(status_code=409, detail='Tu parte ya está marcada como hecha')
    subidas = await _subir_fotos(t['id'], fotos)
    if not subidas:
        raise HTTPException(status_code=400, detail='Sube al menos una foto de cómo quedó')
    idx = next(i for i, a in enumerate(t['asignados']) if a['id'] == user['id'])
    ahora = now_iso()
    comentario = (texto or '').strip()[:2000]
    reintento = t['asignados'][idx]['estado'] == EST_DEVUELTA
    # Cada vez que marca hecho se guarda un "intento" con su foto; así la
    # evidencia anterior (aunque la hayan devuelto) queda en el historial.
    intento = {'id': new_id(), 'fotos': subidas, 'comentario': comentario, 'at': ahora,
               'motivo_previo': t['asignados'][idx].get('motivo') if reintento else None}
    msgs = [_sistema(f"{user['name']} {'reenvió su parte corregida' if reintento else 'marcó su parte como hecha'}.")]
    if comentario:
        msgs.insert(0, _mensaje(user, comentario, 'responsable', subidas))
    await db.tareas.update_one({'id': t['id']}, {'$set': {
        f'asignados.{idx}.estado': EST_HECHA, f'asignados.{idx}.evidencia': subidas,
        f'asignados.{idx}.comentario': comentario, f'asignados.{idx}.hecho_at': ahora,
        f'asignados.{idx}.devuelta_por_name': None, f'asignados.{idx}.devuelta_at': None,
        f'asignados.{idx}.motivo': None, 'updated_at': ahora},
        '$push': {f'asignados.{idx}.intentos': intento, 'mensajes': {'$each': msgs}}})
    await _avisar(await _validadores_ids(t['tienda']), 'tarea_hecha',
                  f"{t['numero']}: {user['name']} marcó hecha \"{t['titulo']}\". Está lista para validar.", t, user)
    return await detalle(t['id'], user)


async def _parte(t: dict, asignado_id: str) -> int:
    idx = next((i for i, a in enumerate(t['asignados']) if a['id'] == asignado_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail='Esa persona no está asignada a la tarea')
    return idx


@router.post('/{tarea_id}/validar')
async def validar(tarea_id: str, asignado_id: str = Form(...), user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not es_validador(user, t):
        raise HTTPException(status_code=403, detail='Solo el gerente o el jefe de la tienda valida')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    idx = await _parte(t, asignado_id)
    if t['asignados'][idx]['estado'] != EST_HECHA:
        raise HTTPException(status_code=409, detail='Esa parte no está marcada como hecha')
    ahora = now_iso()
    nuevos = [dict(a) for a in t['asignados']]
    nuevos[idx].update({'estado': EST_VALIDADA, 'validada_por_name': user['name'], 'validada_at': ahora})
    estado = _estado_global(nuevos)
    sets = {f'asignados.{idx}.estado': EST_VALIDADA, f'asignados.{idx}.validada_por_name': user['name'],
            f'asignados.{idx}.validada_at': ahora, 'estado': estado, 'updated_at': ahora}
    msgs = [_sistema(f"{user['name']} validó la parte de {t['asignados'][idx]['name']}.")]
    if estado == 'cerrada':
        msgs.append(_sistema('Todas las partes validadas: la tarea quedó cerrada.'))
    await db.tareas.update_one({'id': t['id'], 'estado': 'abierta'}, {'$set': sets, '$push': {'mensajes': {'$each': msgs}}})
    await _avisar([asignado_id], 'tarea_validada',
                  f"{t['numero']}: {user['name']} validó tu parte de \"{t['titulo']}\".", t, user)
    return await detalle(t['id'], user)


@router.post('/{tarea_id}/devolver')
async def devolver(tarea_id: str, asignado_id: str = Form(...), texto: str = Form(''), user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not es_validador(user, t):
        raise HTTPException(status_code=403, detail='Solo el gerente o el jefe de la tienda devuelve')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    idx = await _parte(t, asignado_id)
    if t['asignados'][idx]['estado'] != EST_HECHA:
        raise HTTPException(status_code=409, detail='Solo se devuelve una parte marcada como hecha')
    motivo = (texto or '').strip()[:2000]
    if not motivo:
        raise HTTPException(status_code=400, detail='Escribe qué sigue mal para devolverla')
    ahora = now_iso()
    await db.tareas.update_one({'id': t['id'], 'estado': 'abierta'}, {'$set': {
        f'asignados.{idx}.estado': EST_DEVUELTA, f'asignados.{idx}.devuelta_por_name': user['name'],
        f'asignados.{idx}.devuelta_at': ahora, f'asignados.{idx}.motivo': motivo, 'updated_at': ahora},
        '$push': {'mensajes': {'$each': [_mensaje(user, motivo, 'revisor'),
                                         _sistema(f"{user['name']} devolvió la parte de {t['asignados'][idx]['name']}.")]}}})
    await _avisar([asignado_id], 'tarea_devuelta',
                  f"{t['numero']}: {user['name']} te devolvió \"{t['titulo']}\": {motivo[:80]}", t, user)
    return await detalle(t['id'], user)


@router.post('/{tarea_id}/mensajes')
async def mensaje(tarea_id: str, texto: str = Form(''), fotos: List[UploadFile] = File(default=[]),
                  user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes escribir en esta tarea')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    texto = (texto or '').strip()[:2000]
    subidas = await _subir_fotos(t['id'], fotos)
    if not texto and not subidas:
        raise HTTPException(status_code=400, detail='Escribe un mensaje o adjunta una foto')
    rol = _rol_en(user, t)
    await db.tareas.update_one({'id': t['id']}, {'$push': {'mensajes': _mensaje(user, texto, rol, subidas)},
                                                 '$set': {'updated_at': now_iso()}})
    if rol == 'responsable':
        destino = await _validadores_ids(t['tienda'])
    else:
        destino = [a['id'] for a in t['asignados'] if a['estado'] != EST_VALIDADA]
    await _avisar(destino, 'tarea_mensaje', f"{t['numero']} · {user['name']}: {texto[:80] or 'envió una foto'}", t, user)
    return await detalle(t['id'], user)


# --------------------------------------------------------------------------- #
#  Recordatorios de fecha límite (lo llama el loop de reminders)
# --------------------------------------------------------------------------- #
async def revisar_tareas() -> None:
    """Avisa a los responsables el día antes y el día de la fecha límite (una
    vez cada uno). Lo llama reminders._loop cada POLL_SECONDS."""
    hoy = now_local().date()
    abiertas = await db.tareas.find(
        {'estado': 'abierta', 'fecha_limite': {'$ne': None}}, {'_id': 0}).to_list(500)
    for t in abiertas:
        d = _fecha_dia(t.get('fecha_limite'))
        if not d:
            continue
        dias = (d.date() - hoy).days
        clave = '0d' if dias == 0 else ('1d' if dias == 1 else None)
        if not clave or clave in (t.get('recordatorios') or []):
            continue
        r = await db.tareas.update_one(
            {'id': t['id'], 'estado': 'abierta', 'recordatorios': {'$ne': clave}},
            {'$addToSet': {'recordatorios': clave}})
        if r.modified_count == 0:
            continue
        pend = [a for a in t['asignados'] if a['estado'] in (EST_PENDIENTE, EST_DEVUELTA)]
        cuando = 'hoy' if clave == '0d' else 'mañana'
        for a in pend:
            try:
                await create_notification(
                    a['id'], 'tarea_recordatorio',
                    f"{t['numero']}: \"{t['titulo']}\" vence {cuando}.",
                    related_id=t['id'], related_type='tarea')
            except Exception as e:  # pragma: no cover
                logger.warning(f'tarea reminder failed for {a["id"]}: {e}')
