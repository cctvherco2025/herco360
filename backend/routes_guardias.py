"""Revisión de Guardias de Seguridad — ECCP (Experiencia al Cliente y Control
de Pérdidas).

Checklist fijo de 10 criterios, cada uno Cumple / No cumple. Lo registra un
Coordinador ECCP (o Jefe ECCP, o quien tenga el permiso 'guardias' desde
Organigrama): elige a mano la sucursal (nunca se infiere del usuario), escribe
el nombre del guardia y responde los 10 criterios. Fecha/hora y evaluador los
pone el servidor.

Permisos (core.py): registrar = can_fill_guardias; ver historial =
can_access_guardias (coordinadores ven todas, solo lectura); editar y eliminar
= can_admin_guardias (admin / Director comercial).

Trazabilidad: cada edición se agrega a `cambios` dentro de la evaluación
(quién, cuándo, qué campos) y además queda en db.guardias_auditoria junto con
las eliminaciones — esas guardan una copia completa del documento borrado.

Las fotos van a Cloudflare R2 (storage.py), igual que Rutina y FLOS; solo se
descargan autenticado.
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel

from core import (db, serialize_doc, new_id, now_iso, can_admin_guardias,
                  require_guardias_access, require_guardias_fill, require_guardias_admin)
from notifications import log_activity
import storage

router = APIRouter(prefix='/guardias', tags=['guardias'])
logger = logging.getLogger('guardias')

GUARDIAS_SUCURSALES = ['H1', 'H2', 'H4', 'H6']
MAX_PHOTO_SIZE = 8 * 1024 * 1024  # 8 MB por foto
GENERAL = '__general__'  # dueño de las fotos del paso de observaciones

CRITERIOS = [
    {'id': 'uniforme', 'titulo': 'Uniforme completo y buena presentación personal.'},
    {'id': 'puesto', 'titulo': 'Permanece en su puesto asignado.'},
    {'id': 'alerta', 'titulo': 'Mantiene una actitud alerta y vigilancia activa.'},
    {'id': 'celular', 'titulo': 'No utiliza el celular para asuntos personales.'},
    {'id': 'entradas_salidas', 'titulo': 'Cumple los protocolos de control de entradas y salidas.'},
    {'id': 'rondines', 'titulo': 'Realiza los rondines de vigilancia establecidos.'},
    {'id': 'estacionamiento', 'titulo': 'Mantiene vigilancia sobre el estacionamiento.'},
    {'id': 'equipo', 'titulo': 'Cuenta con su equipo de seguridad en buen estado.'},
    {'id': 'atencion', 'titulo': 'Mantiene una atención respetuosa hacia los clientes.'},
    {'id': 'novedades', 'titulo': 'Reporta oportunamente las novedades a ECCP.'},
]
CRITERIOS_BY_ID = {c['id']: c for c in CRITERIOS}
RESPUESTAS = ('cumple', 'no_cumple')


def _estado(pct: int) -> str:
    if pct >= 90:
        return 'excelente'
    if pct >= 70:
        return 'requiere_mejora'
    return 'deficiente'


def _clean_entries(raw_entries, prev_photos=None):
    """Valida que vengan los 10 criterios respondidos y arma las entradas
    limpias. prev_photos (edición) conserva las fotos ya guardadas."""
    by_id = {}
    for e in raw_entries or []:
        iid = str(e.get('id') or '').strip()
        if iid in CRITERIOS_BY_ID:
            by_id[iid] = e
    faltan = [c['titulo'] for c in CRITERIOS if (by_id.get(c['id']) or {}).get('respuesta') not in RESPUESTAS]
    if faltan:
        raise HTTPException(status_code=400, detail=f'Faltan {len(faltan)} criterios por responder')
    out = []
    for c in CRITERIOS:
        e = by_id[c['id']]
        resp = e['respuesta']
        out.append({
            'id': c['id'], 'titulo': c['titulo'], 'respuesta': resp,
            # la descripción solo aplica a "No cumple"
            'descripcion': (e.get('descripcion') or '').strip() if resp == 'no_cumple' else '',
            'photos': list((prev_photos or {}).get(c['id'], [])),
        })
    return out


def _totales(entries):
    cumplidos = sum(1 for e in entries if e['respuesta'] == 'cumple')
    total = len(entries)
    pct = round(cumplidos / total * 100) if total else 0
    return {
        'total_criterios': total, 'cumplidos': cumplidos, 'incumplidos': total - cumplidos,
        'percent': pct, 'estado': _estado(pct),
    }


@router.get('/criterios')
async def get_criterios(user=Depends(require_guardias_access)):
    return {'criterios': CRITERIOS, 'sucursales': GUARDIAS_SUCURSALES}


@router.post('/evaluaciones')
async def create_evaluacion(
    data: str = Form(...),
    photos: List[UploadFile] = File(default=[]),
    photo_owner: List[str] = Form(default=[]),
    user=Depends(require_guardias_fill),
):
    try:
        payload = json.loads(data)
    except Exception:
        raise HTTPException(status_code=400, detail='Datos de la evaluación inválidos')

    sucursal = (payload.get('sucursal') or '').strip()
    if sucursal not in GUARDIAS_SUCURSALES:
        raise HTTPException(status_code=400, detail='Selecciona la sucursal')
    guardia = (payload.get('guardia') or '').strip()
    if not guardia:
        raise HTTPException(status_code=400, detail='Escribe el nombre del guardia')
    entries = _clean_entries(payload.get('entries'))

    if len(photos) != len(photo_owner):
        raise HTTPException(status_code=400, detail='Las fotos no coinciden con sus criterios')

    eval_id = new_id()
    entries_by_id = {e['id']: e for e in entries}
    general_photos = []
    for f, owner in zip(photos, photo_owner):
        content = await f.read()
        if not content:
            continue
        if len(content) > MAX_PHOTO_SIZE:
            raise HTTPException(status_code=400,
                                detail=f'Una foto supera el máximo de {MAX_PHOTO_SIZE // (1024 * 1024)} MB')
        ctype = f.content_type or 'image/jpeg'
        photo_id = new_id()
        ext = 'png' if 'png' in ctype else ('webp' if 'webp' in ctype else 'jpg')
        path = f'{storage.APP_NAME}/guardias/{eval_id}/{photo_id}.{ext}'
        try:
            await storage.put_object(path, content, ctype)
        except Exception as e:
            logger.error(f'photo upload failed: {e}')
            raise HTTPException(status_code=502, detail='No se pudo subir una de las fotos')
        ph = {'id': photo_id, 'path': path, 'content_type': ctype}
        if owner in entries_by_id:
            entries_by_id[owner]['photos'].append(ph)
        else:
            general_photos.append(ph)

    doc = {
        'id': eval_id,
        'sucursal': sucursal, 'guardia': guardia,
        'evaluador_id': user['id'], 'evaluador_name': user['name'], 'evaluador_avatar': user.get('avatar_url'),
        'entries': entries,
        'observaciones': (payload.get('observaciones') or '').strip(),
        'acciones': (payload.get('acciones') or '').strip(),
        'photos': general_photos,
        **_totales(entries),
        'created_at': now_iso(),
        'cambios': [],
    }
    await db.guardias_evaluaciones.insert_one(doc)
    doc.pop('_id', None)
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'registró una revisión de guardia en', sucursal, 'guardias')
    return serialize_doc(doc)


@router.get('/evaluaciones')
async def list_evaluaciones(sucursal: Optional[str] = None, desde: Optional[str] = None,
                            hasta: Optional[str] = None, user=Depends(require_guardias_access)):
    """Todas las evaluaciones (coordinadores y admins ven las mismas). Guardia
    y coordinador se filtran en el navegador sobre este resultado."""
    q = {}
    if sucursal:
        q['sucursal'] = sucursal
    # desde/hasta: instantes ISO en UTC ya calculados por el navegador desde el
    # día local (hasta = inicio del día siguiente, exclusivo); mismo formato
    # que created_at, así que se comparan como texto.
    rango = {}
    if desde:
        rango['$gte'] = desde
    if hasta:
        rango['$lt'] = hasta
    if rango:
        q['created_at'] = rango
    rows = await db.guardias_evaluaciones.find(
        q, {'_id': 0, 'entries': 0, 'cambios': 0, 'photos': 0}
    ).sort('created_at', -1).limit(500).to_list(500)
    return serialize_doc(rows)


@router.get('/evaluaciones/{eval_id}')
async def get_evaluacion(eval_id: str, user=Depends(require_guardias_access)):
    row = await db.guardias_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    if not can_admin_guardias(user):
        row.pop('cambios', None)  # el historial de cambios solo lo ve el admin
    return serialize_doc(row)


class GuardiaEvalUpdate(BaseModel):
    sucursal: str
    guardia: str
    entries: list
    observaciones: str = ''
    acciones: str = ''


CAMPOS_LABEL = {
    'sucursal': 'Sucursal', 'guardia': 'Guardia', 'observaciones': 'Observaciones',
    'acciones': 'Acciones correctivas',
}


@router.put('/evaluaciones/{eval_id}')
async def update_evaluacion(eval_id: str, data: GuardiaEvalUpdate, user=Depends(require_guardias_admin)):
    row = await db.guardias_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    sucursal = data.sucursal.strip()
    if sucursal not in GUARDIAS_SUCURSALES:
        raise HTTPException(status_code=400, detail='Selecciona la sucursal')
    guardia = data.guardia.strip()
    if not guardia:
        raise HTTPException(status_code=400, detail='Escribe el nombre del guardia')
    prev_photos = {e['id']: e.get('photos', []) for e in row.get('entries', [])}
    entries = _clean_entries(data.entries, prev_photos)

    nuevos = {'sucursal': sucursal, 'guardia': guardia,
              'observaciones': data.observaciones.strip(), 'acciones': data.acciones.strip()}
    cambios = [CAMPOS_LABEL[k] for k, v in nuevos.items() if (row.get(k) or '') != v]
    prev_by_id = {e['id']: e for e in row.get('entries', [])}
    for e in entries:
        p = prev_by_id.get(e['id']) or {}
        if p.get('respuesta') != e['respuesta'] or (p.get('descripcion') or '') != e['descripcion']:
            cambios.append(e['titulo'].rstrip('.'))
    if not cambios:
        return serialize_doc(row)

    cambio = {'user_id': user['id'], 'user_name': user['name'], 'at': now_iso(), 'campos': cambios}
    update = {**nuevos, 'entries': entries, **_totales(entries),
              'updated_at': cambio['at'], 'updated_by': user['name']}
    await db.guardias_evaluaciones.update_one({'id': eval_id}, {'$set': update, '$push': {'cambios': cambio}})
    await db.guardias_auditoria.insert_one({
        'id': new_id(), 'accion': 'editada', 'evaluacion_id': eval_id,
        'sucursal': sucursal, 'guardia': guardia,
        'user_id': user['id'], 'user_name': user['name'], 'at': cambio['at'], 'campos': cambios,
    })
    out = await db.guardias_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    return serialize_doc(out)


@router.delete('/evaluaciones/{eval_id}')
async def delete_evaluacion(eval_id: str, user=Depends(require_guardias_admin)):
    """Elimina del historial, pero deja en db.guardias_auditoria una copia
    completa de lo borrado (quién, cuándo y el documento)."""
    row = await db.guardias_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    await db.guardias_auditoria.insert_one({
        'id': new_id(), 'accion': 'eliminada', 'evaluacion_id': eval_id,
        'sucursal': row.get('sucursal'), 'guardia': row.get('guardia'),
        'user_id': user['id'], 'user_name': user['name'], 'at': now_iso(),
        'snapshot': row,
    })
    await db.guardias_evaluaciones.delete_one({'id': eval_id})
    return {'message': 'Evaluación eliminada'}


@router.get('/auditoria')
async def list_auditoria(user=Depends(require_guardias_admin)):
    rows = await db.guardias_auditoria.find(
        {}, {'_id': 0, 'snapshot': 0}
    ).sort('at', -1).limit(300).to_list(300)
    return serialize_doc(rows)


@router.get('/evaluaciones/{eval_id}/foto/{photo_id}')
async def get_photo(eval_id: str, photo_id: str, user=Depends(require_guardias_access)):
    row = await db.guardias_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    all_photos = list(row.get('photos', []))
    for e in row.get('entries', []):
        all_photos.extend(e.get('photos', []))
    photo = next((p for p in all_photos if p['id'] == photo_id), None)
    if not photo:
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    try:
        content, ctype = await storage.get_object(photo['path'])
    except Exception as e:
        logger.error(f'photo download failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=photo.get('content_type', ctype))
