"""Formulario — auditorías de piso FLOS (Frenteo, Limpieza, Orden, Surtido).

El cuestionario (los criterios, sus puntajes máximos y el texto de acción)
vive en el frontend (src/lib/flosSchema.js); el backend no necesita conocerlo,
solo guarda lo que el auditor calificó. Igual que el flujo original en HTML,
el recorrido completo se guarda de un solo envío al terminar — mientras el
usuario recorre los criterios, su avance vive en el navegador (localStorage),
no en el servidor.

Las fotos van a Cloudflare R2 (storage.py), igual que los archivos de Reportes;
solo se descargan autenticado, nunca por URL pública.
"""
import json
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response

from core import db, serialize_doc, new_id, now_iso, require_formulario_access
import storage

router = APIRouter(prefix='/formulario', tags=['formulario'])
logger = logging.getLogger('formulario')

FLOS_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat']
MAX_PHOTO_SIZE = 8 * 1024 * 1024  # 8 MB por foto


@router.get('/meta')
async def meta(user=Depends(require_formulario_access)):
    return {'sucursales': FLOS_SUCURSALES}


@router.post('/auditorias')
async def create_audit(
    data: str = Form(...),
    photos: List[UploadFile] = File(default=[]),
    photo_owner: List[str] = Form(default=[]),
    user=Depends(require_formulario_access),
):
    try:
        payload = json.loads(data)
    except Exception:
        raise HTTPException(status_code=400, detail='Datos de la auditoría inválidos')

    sucursal = (payload.get('sucursal') or '').strip()
    if sucursal not in FLOS_SUCURSALES:
        raise HTTPException(status_code=400, detail='Sucursal inválida')
    linea = (payload.get('linea') or '').strip()
    fecha = (payload.get('fecha') or '').strip()
    if not fecha:
        raise HTTPException(status_code=400, detail='Indica la fecha de la auditoría')
    entries = payload.get('entries') or []
    if not entries:
        raise HTTPException(status_code=400, detail='La auditoría no tiene criterios calificados')
    general_comment = (payload.get('general_comment') or '').strip()

    # El cliente manda el máximo de cada criterio junto con el puntaje, así el
    # total es confiable sin que el backend tenga que conocer el cuestionario.
    clean_entries = []
    total_score, total_max = 0, 0
    dim_totals = {}
    for e in entries:
        vid = str(e.get('id') or '').strip()
        if not vid:
            continue
        vmax = max(0, int(e.get('max') or 0))
        score = max(0, min(int(e.get('score') or 0), vmax))
        dim = str(e.get('dim') or '').strip() or 'General'
        clean_entries.append({
            'id': vid, 'name': e.get('name') or vid, 'dim': dim,
            'score': score, 'max': vmax, 'comment': (e.get('comment') or '').strip(),
            'photos': [],
        })
        total_score += score
        total_max += vmax
        dt = dim_totals.setdefault(dim, {'score': 0, 'max': 0})
        dt['score'] += score
        dt['max'] += vmax

    if len(photos) != len(photo_owner):
        raise HTTPException(status_code=400, detail='Las fotos no coinciden con sus criterios')

    audit_id = new_id()
    entries_by_id = {e['id']: e for e in clean_entries}
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
        path = f'{storage.APP_NAME}/formulario/{audit_id}/{photo_id}.{ext}'
        try:
            await storage.put_object(path, content, ctype)
        except Exception as e:
            logger.error(f'photo upload failed: {e}')
            raise HTTPException(status_code=502, detail='No se pudo subir una de las fotos')
        photo_meta = {'id': photo_id, 'path': path, 'content_type': ctype}
        if owner == '__general__':
            general_photos.append(photo_meta)
        elif owner in entries_by_id:
            entries_by_id[owner]['photos'].append(photo_meta)

    pct = round(total_score / total_max * 100) if total_max else 0
    doc = {
        'id': audit_id,
        'sucursal': sucursal, 'linea': linea, 'fecha': fecha,
        'auditor_id': user['id'], 'auditor_name': user['name'], 'auditor_avatar': user.get('avatar_url'),
        'entries': clean_entries,
        'general_comment': general_comment,
        'general_photos': general_photos,
        'total_score': total_score, 'total_max': total_max, 'percent': pct,
        'dimension_totals': dim_totals,
        'created_at': now_iso(),
    }
    await db.flos_audits.insert_one(doc)
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.get('/auditorias')
async def list_audits(sucursal: str = None, start: str = None, end: str = None,
                      user=Depends(require_formulario_access)):
    q = {}
    if sucursal:
        q['sucursal'] = sucursal
    if start and end:
        q['fecha'] = {'$gte': start, '$lte': end}
    rows = await db.flos_audits.find(
        q, {'_id': 0, 'entries': 0, 'general_photos': 0}
    ).sort('fecha', -1).limit(300).to_list(300)
    return serialize_doc(rows)


@router.get('/auditorias/{audit_id}')
async def get_audit(audit_id: str, user=Depends(require_formulario_access)):
    row = await db.flos_audits.find_one({'id': audit_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Auditoría no encontrada')
    return serialize_doc(row)


@router.get('/auditorias/{audit_id}/foto/{photo_id}')
async def get_photo(audit_id: str, photo_id: str, user=Depends(require_formulario_access)):
    row = await db.flos_audits.find_one({'id': audit_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Auditoría no encontrada')
    photo = None
    for e in row.get('entries', []):
        for p in e.get('photos', []):
            if p['id'] == photo_id:
                photo = p
    for p in row.get('general_photos', []):
        if p['id'] == photo_id:
            photo = p
    if not photo:
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    try:
        content, ctype = await storage.get_object(photo['path'])
    except Exception as e:
        logger.error(f'photo download failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=photo.get('content_type', ctype))
