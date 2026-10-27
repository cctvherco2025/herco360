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

Los demás departamentos (Logística y los que se creen; sin tiendas) funcionan
por mando (mando.py): el jefe del departamento (y sus admins) asigna a
cualquiera de su departamento; cada jefe o gerente de área, a quien manda
(su área y todas sus subáreas). Valida quien la creó, el jefe del
departamento o un jefe/gerente del área de la tarea o de un área superior. Nadie de otro departamento las ve (salvo el super admin).
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
                  es_revisor_tienda, es_coordinador_tienda, tienda_promos, PROMO_TIENDAS, JEFE_TIENDA,
                  RETAIL, departamento_de, es_retail, es_super_admin, es_jefe_depto, filtro_departamento)
from notifications import create_notification
import storage
import mando
import acceso

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


# ---- Departamentos que no son Retail: por mando, sin tiendas ----
NIVELES_ASIGNABLES = ('gerente', 'jefe', 'coordinador', 'colaborador')


def _de_logistica(user: dict) -> bool:
    """Persona de un departamento que trabaja por mando (no Retail)."""
    return not es_super_admin(user) and not es_retail(user)


def _mando_total(user: dict) -> bool:
    """Manda en todo su departamento: su jefe (Director comercial, Gerente de
    Logística…) y sus admins (el super admin, en el suyo)."""
    u = user or {}
    return u.get('role') == 'admin' or es_jefe_depto(u)


def _mando_area(user: dict) -> bool:
    """Jefe o gerente de un área: manda en su área y subáreas (mando.py)."""
    u = user or {}
    return bool(u.get('area_id')) and mando.es_mando(u) and not es_jefe_depto(u)


def _es_tarea_log(t: dict) -> bool:
    """Tarea por mando (sin tienda): las de los departamentos sin tiendas y,
    en Retail, las que crean el Director comercial, los admins o los jefes de
    área que no son de tienda."""
    return not (t or {}).get('tienda')


# ---- Permisos (acceso.py) ----
# Cada acción pide el permiso ('tareas.crear', 'tareas.editar'…) Y que la
# tarea sea de su gente según la estructura: su tienda en Retail; su área y
# subáreas (o todo el departamento, el jefe del departamento) en los demás.
def _gestor_estructural(user: dict) -> bool:
    """Tiene gente a cargo en Tareas: gerente/jefe de tienda, quien manda en
    todo su departamento o un jefe/gerente de área."""
    return es_revisor_tienda(user) or _es_supervisor(user) or _mando_total(user) or _mando_area(user)


def puede_crear(user: dict) -> bool:
    """Permiso de crear y alguien a quien asignar: gerente y jefe de tienda
    (a su tienda); el jefe del departamento y sus admins (a todo el
    departamento); un jefe o gerente de área (a su área y subáreas)."""
    return acceso.tiene(user, 'tareas.crear') and (es_revisor_tienda(user) or _mando_total(user) or _mando_area(user))


def _sin_avance(t: dict) -> bool:
    """Nadie la marcó hecha ni subió fotos: todavía se puede eliminar."""
    return all(a.get('estado') == EST_PENDIENTE and not a.get('intentos') and not a.get('evidencia')
               for a in (t.get('asignados') or []))


def puede(user: dict, t: dict, accion: str) -> bool:
    """editar / validar / cancelar / eliminar sobre esta tarea."""
    if not acceso.tiene(user, f'tareas.{accion}') or not es_validador(user, t):
        return False
    if accion == 'eliminar':
        return t.get('estado') == 'abierta' and _sin_avance(t)
    return True


def es_validador(user: dict, t: dict) -> bool:
    """Tarea de su gente (según la estructura; el permiso se revisa aparte):
    gerente o jefe de esa tienda, o un supervisor. En los demás
    departamentos: quien la creó, el jefe del departamento o un jefe del área."""
    u = user or {}
    if _es_tarea_log(t):
        if es_super_admin(u):
            return True
        if departamento_de(u) != (t.get('departamento') or RETAIL):
            return False
        if _mando_total(u) or (t.get('creado_por') or {}).get('id') == u.get('id'):
            return True
        if not _mando_area(u):
            return False
        if t.get('area_path') is not None:  # el área de la tarea o una de sus subáreas
            return u.get('area_id') in t['area_path']
        return bool(t.get('area')) and t.get('area') == u.get('area')  # tareas de antes
    # tareas de tienda (Retail)
    if not es_super_admin(u) and not es_retail(u):
        return False
    return _es_supervisor(u) or (es_revisor_tienda(u) and tienda_promos(u) == t.get('tienda'))


def mi_asignacion(user: dict, t: dict) -> Optional[dict]:
    return next((a for a in (t.get('asignados') or []) if a.get('id') == user.get('id')), None)


def puede_ver(user: dict, t: dict) -> bool:
    """Asignado, quien la creó, o quien ve las tareas de su equipo."""
    if mi_asignacion(user, t) is not None or (t.get('creado_por') or {}).get('id') == user.get('id'):
        return True
    return acceso.tiene(user, 'tareas.ver_equipo') and es_validador(user, t)


def puede_ver_modulo(user: dict) -> bool:
    return (es_revisor_tienda(user) or es_coordinador_tienda(user) or _es_supervisor(user) or _de_logistica(user)
            or any(acceso.tiene(user, a) for a in ('tareas.ver_equipo', 'tareas.crear')))


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


async def _validadores_ids(t: dict) -> list:
    """Gerentes y jefes de la tienda (a quienes se avisa cuando se marca hecha).
    En Logística: quien la creó, el Gerente de Logística y el Jefe del área."""
    if _es_tarea_log(t):
        if t.get('area_path'):
            ors = [{'nivel': 'jefe_depto'}, {'nivel': {'$in': ['jefe', 'gerente']}, 'area_id': {'$in': t['area_path']}}]
        else:
            ors = [{'nivel': 'jefe_depto'}] + ([{'nivel': {'$in': ['jefe', 'gerente']}, 'area': t['area']}] if t.get('area') else [])
        users = await db.users.find({'status': 'approved', **filtro_departamento(t.get('departamento') or RETAIL), '$or': ors},
                                    {'_id': 0, 'id': 1}).to_list(50)
        return list(dict.fromkeys([(t.get('creado_por') or {}).get('id')] + [u['id'] for u in users]))
    tienda = t.get('tienda')
    users = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': _sucursales_de(tienda)},
         '$or': [{'position': JEFE_TIENDA}, {'position': 'Gerente', 'area': 'Tienda'}]},
        {'_id': 0, 'id': 1}).to_list(50)
    return [u['id'] for u in users]


async def _asignables(user: dict) -> list:
    """A quién puede asignar quien crea: coordinadores de su tienda y, si quien
    crea es el gerente, también el jefe de tienda. Nunca a sí mismo.
    Logística: el Gerente, a Jefes, Coordinadores y Auxiliares; un Jefe, a los
    Coordinadores y Auxiliares de su área."""
    if not es_revisor_tienda(user):
        if _mando_total(user):
            q = {'status': 'approved', **filtro_departamento(departamento_de(user)), 'id': {'$ne': user['id']},
                 'nivel': {'$in': list(NIVELES_ASIGNABLES)}}
            users = await db.users.find(q, {'_id': 0, 'id': 1, 'name': 1, 'position': 1, 'area': 1, 'nivel': 1}).to_list(1000)
        elif not _mando_area(user):
            return []
        else:
            # un jefe o gerente de área: a quien manda (su área y subáreas)
            users = [{k: p.get(k) for k in ('id', 'name', 'position', 'area', 'nivel')}
                     for p in await mando.subordinados(user)]
        users.sort(key=lambda u: (u.get('area') or '', NIVELES_ASIGNABLES.index(u['nivel']) if u.get('nivel') in NIVELES_ASIGNABLES else 9, u['name']))
        return users
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
    t['soy_validador'] = puede(user, t, 'validar')
    # lo que la persona puede hacer con esta tarea (botones de la pantalla)
    t['puedo'] = {a: puede(user, t, a) for a in ('editar', 'validar', 'cancelar', 'eliminar')}
    mia = mi_asignacion(user, t)
    t['mi_estado'] = mia.get('estado') if mia else None
    t['por_validar'] = sum(1 for a in t.get('asignados', []) if a.get('estado') == EST_HECHA)
    return t


# --------------------------------------------------------------------------- #
#  Lectura
# --------------------------------------------------------------------------- #
def _filtro_validar(user: dict) -> dict:
    """Tareas que la persona valida (gerente/jefe de tienda, supervisor, o
    Gerente/Jefe de Logística)."""
    if es_super_admin(user):
        return {}
    depto = filtro_departamento(departamento_de(user))
    if _mando_total(user):
        return depto  # todo su departamento (en Retail: también las de tienda)
    ors = [{'creado_por.id': user['id']}]
    if es_revisor_tienda(user):
        ors.append({'tienda': tienda_promos(user)})
    if _mando_area(user):
        ors += [{'area_path': user.get('area_id')},
                {'area_path': {'$exists': False}, 'tienda': None, 'area': user.get('area')}]
    return {**depto, '$or': ors}


def _valida(user: dict) -> bool:
    """Ve las tareas de su equipo (permiso y gente a cargo)."""
    return _gestor_estructural(user) and acceso.tiene(user, 'tareas.ver_equipo')


def _filtro(user: dict) -> dict:
    if _valida(user):
        return {'$or': [{'asignados.id': user['id']}, {'creado_por.id': user['id']}, _filtro_validar(user)]}
    ors = [{'asignados.id': user['id']}]
    if es_revisor_tienda(user):
        ors.append({'tienda': tienda_promos(user)})
    return {'$or': ors}


@router.get('/asignables')
async def asignables(user=Depends(get_current_user)):
    # la usan quien crea y quien edita (para cambiar a las personas asignadas)
    if not (puede_crear(user) or (acceso.tiene(user, 'tareas.editar') and _gestor_estructural(user))):
        raise HTTPException(status_code=403, detail='No tienes permiso para crear tareas')
    return serialize_doc(await _asignables(user))


@router.get('/contador')
async def contador(user=Depends(get_current_user)):
    """Lo que espera algo de la persona: lo suyo por hacer (pendiente/devuelta),
    y lo que le toca validar si es gerente/jefe (partes marcadas hechas)."""
    if not puede_ver_modulo(user):
        return {'pendientes': 0}
    n = await db.tareas.count_documents(
        {'estado': 'abierta', 'asignados': {'$elemMatch': {'id': user['id'], 'estado': {'$in': [EST_PENDIENTE, EST_DEVUELTA]}}}})
    if _gestor_estructural(user) and acceso.tiene(user, 'tareas.validar'):
        q = {'estado': 'abierta', 'asignados': {'$elemMatch': {'estado': EST_HECHA, 'id': {'$ne': user['id']}}},
             **_filtro_validar(user)}
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
    if not (_valida(user) and acceso.tiene(user, 'tareas.validar')):
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
    q = {'estado': 'abierta', 'asignados.estado': EST_HECHA, **_filtro_validar(user)}
    rows = await db.tareas.find(q, {'_id': 0}).sort('updated_at', -1).to_list(100)
    return {'rol': 'revisor', 'tareas': serialize_doc([_pintar(r, user) for r in rows])}


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
        raise HTTPException(status_code=403, detail='No tienes permiso para crear tareas')
    # por tienda (gerente/jefe de tienda) o por mando (los demás)
    log = not es_revisor_tienda(user)
    tienda = None if log else tienda_promos(user)
    permitidos = {u['id']: u for u in await _asignables(user)}
    ids = list(dict.fromkeys(data.asignados))
    elegidos = [permitidos[i] for i in ids if i in permitidos]
    if not elegidos:
        raise HTTPException(status_code=400, detail='Elige al menos una persona de tu equipo para asignarle la tarea')
    if len(elegidos) != len(ids):
        raise HTTPException(status_code=400, detail='Alguien de los elegidos no es de tu equipo o no puedes asignarle')

    n = await db.counters.find_one_and_update({'_id': 'tareas'}, {'$inc': {'n': 1}},
                                              upsert=True, return_document=ReturnDocument.AFTER)
    asignados = [{'id': u['id'], 'name': u['name'], 'estado': EST_PENDIENTE, 'evidencia': [],
                  'intentos': [], 'comentario': '', 'hecho_at': None, 'validada_por_name': None,
                  'validada_at': None, 'devuelta_por_name': None, 'devuelta_at': None, 'motivo': None}
                 for u in elegidos]
    ahora = now_iso()
    t = {
        'id': new_id(), 'numero': f"TAREA-{n['n']:04d}", 'tienda': tienda,
        # Logística: sin tienda; el área es la del Jefe que la creó (el Gerente: todas)
        'departamento': (departamento_de(user) if not es_retail(user) else None) if log else None,
        # el área de la tarea y su camino: la validan los jefes de esa área y de las de arriba
        'area': user.get('area') if (log and _mando_area(user) and not _mando_total(user)) else None,
        'area_id': user.get('area_id') if (log and _mando_area(user) and not _mando_total(user)) else None,
        'area_path': list(user.get('area_path') or []) if (log and _mando_area(user) and not _mando_total(user)) else None,
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
    if not puede(user, t, 'editar'):
        raise HTTPException(status_code=403, detail='No tienes permiso para editar esta tarea')
    if t['estado'] != 'abierta':
        raise HTTPException(status_code=409, detail='La tarea ya está cerrada o cancelada')
    sets = {}
    nuevos_ids, quitados = [], []
    if data.asignados is not None:
        # personas asignadas: se agregan de quien la persona puede asignar; se
        # quitan solo las que todavía no avanzaron (para no perder evidencia)
        pedidos = list(dict.fromkeys(i for i in data.asignados if i))
        if not pedidos:
            raise HTTPException(status_code=400, detail='La tarea necesita al menos una persona asignada')
        actuales = {a['id']: a for a in t['asignados']}
        permitidos = {u['id']: u for u in await _asignables(user)}
        for a in t['asignados']:
            if a['id'] not in pedidos:
                if a['estado'] != EST_PENDIENTE or a.get('intentos'):
                    raise HTTPException(status_code=400, detail=f"{a['name']} ya avanzó en su parte: no se puede quitar")
                quitados.append(a)
        lista = []
        for i in pedidos:
            if i in actuales:
                lista.append(actuales[i])
            elif i in permitidos:
                u = permitidos[i]
                lista.append({'id': u['id'], 'name': u['name'], 'estado': EST_PENDIENTE, 'evidencia': [],
                              'intentos': [], 'comentario': '', 'hecho_at': None, 'validada_por_name': None,
                              'validada_at': None, 'devuelta_por_name': None, 'devuelta_at': None, 'motivo': None})
                nuevos_ids.append(u['id'])
            else:
                raise HTTPException(status_code=400, detail='Alguien de los elegidos no es de tu equipo o no puedes asignarle')
        if nuevos_ids or quitados:
            sets['asignados'] = lista
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
        cambios = []
        if nuevos_ids:
            cambios.append('agregó a ' + ', '.join(a['name'] for a in sets['asignados'] if a['id'] in nuevos_ids))
        if quitados:
            cambios.append('quitó a ' + ', '.join(a['name'] for a in quitados))
        texto = f"{user['name']} editó la tarea" + (f" ({'; '.join(cambios)})" if cambios else '') + '.'
        await db.tareas.update_one({'id': t['id']}, {'$set': sets, '$push': {'mensajes': _sistema(texto)}})
        if nuevos_ids:
            await _avisar(nuevos_ids, 'tarea_asignada', f"{t['numero']}: {user['name']} te asignó \"{sets.get('titulo', t['titulo'])}\".", t, user)
    return await detalle(t['id'], user)


@router.post('/{tarea_id}/cancelar')
async def cancelar(tarea_id: str, texto: str = Form(''), user=Depends(get_current_user)):
    t = await _tarea_o_404(tarea_id)
    if not puede(user, t, 'cancelar'):
        raise HTTPException(status_code=403, detail='No tienes permiso para cancelar esta tarea')
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


@router.delete('/{tarea_id}')
async def eliminar(tarea_id: str, user=Depends(get_current_user)):
    """Borra la tarea por completo. Solo mientras nadie la haya marcado hecha
    (sin fotos ni validaciones); después solo se cancela, para no perder la
    evidencia."""
    t = await _tarea_o_404(tarea_id)
    if not acceso.tiene(user, 'tareas.eliminar') or not es_validador(user, t):
        raise HTTPException(status_code=403, detail='No tienes permiso para eliminar esta tarea')
    if t.get('estado') != 'abierta' or not _sin_avance(t):
        raise HTTPException(status_code=409, detail='Alguien ya avanzó en esta tarea: no se puede eliminar, solo cancelar')
    # (como en el resto de la app, las fotos de los mensajes quedan en el almacenamiento)
    await db.tareas.delete_one({'id': t['id']})
    await _avisar([a['id'] for a in t['asignados']], 'tarea_cancelada',
                  f"{t['numero']}: {user['name']} eliminó \"{t['titulo']}\".", t, user)
    return {'message': f"Tarea {t['numero']} eliminada"}


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
    await _avisar(await _validadores_ids(t), 'tarea_hecha',
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
    if not puede(user, t, 'validar'):
        raise HTTPException(status_code=403, detail='No tienes permiso para validar esta tarea')
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
    if not puede(user, t, 'validar'):
        raise HTTPException(status_code=403, detail='No tienes permiso para devolver esta tarea')
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
        destino = await _validadores_ids(t)
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
