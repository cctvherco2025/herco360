"""Rutina Operativa — evaluación mensual de Gerentes de tienda.

Portada de "Esquema de calificación rutina operativa gerentes.xlsx". El
cuestionario (secciones, preguntas, opciones y sus puntos) vive en el
frontend (src/lib/rutinaSchema.js); el backend solo guarda lo que el gerente
respondió, igual que Formulario/FLOS. Se envía completa de un solo POST al
terminar el recorrido.

Las fotos van a Cloudflare R2 (storage.py), igual que Reportes y Formulario;
solo se descargan autenticado, nunca por URL pública.
"""
import json
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response

from core import db, serialize_doc, new_id, now_iso, require_rutina_access, can_fill_rutina
import storage

router = APIRouter(prefix='/rutina', tags=['rutina'])
logger = logging.getLogger('rutina')

RUTINA_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat']
MAX_PHOTO_SIZE = 8 * 1024 * 1024  # 8 MB por foto


async def require_rutina_fill(user=Depends(require_rutina_access)):
    """Puede consultar (require_rutina_access) pero además puede crear."""
    if not can_fill_rutina(user):
        raise HTTPException(status_code=403, detail='Solo el Gerente de la tienda puede registrar la Rutina Operativa')
    return user


@router.get('/meta')
async def meta(user=Depends(require_rutina_access)):
    return {'sucursales': RUTINA_SUCURSALES, 'can_fill': can_fill_rutina(user)}


@router.post('/evaluaciones')
async def create_evaluacion(
    data: str = Form(...),
    photos: List[UploadFile] = File(default=[]),
    photo_owner: List[str] = Form(default=[]),
    user=Depends(require_rutina_fill),
):
    try:
        payload = json.loads(data)
    except Exception:
        raise HTTPException(status_code=400, detail='Datos de la evaluación inválidos')

    sucursal = (payload.get('sucursal') or '').strip()
    if sucursal not in RUTINA_SUCURSALES:
        raise HTTPException(status_code=400, detail='Sucursal inválida')
    mes = (payload.get('mes') or '').strip()  # 'YYYY-MM'
    if not mes:
        raise HTTPException(status_code=400, detail='Indica el mes a evaluar')
    fecha = (payload.get('fecha') or '').strip()
    if not fecha:
        raise HTTPException(status_code=400, detail='Indica la fecha de evaluación')
    entries = payload.get('entries') or []
    if not entries:
        raise HTTPException(status_code=400, detail='La evaluación no tiene preguntas respondidas')

    clean_entries = []
    total_score, total_max = 0, 0
    section_totals = {}
    for e in entries:
        iid = str(e.get('id') or '').strip()
        if not iid:
            continue
        vmax = max(0, int(e.get('max') or 0))
        score = max(0, min(int(e.get('score') or 0), vmax))
        seccion = str(e.get('seccion') or '').strip() or 'General'
        clean_entries.append({
            'id': iid, 'titulo': e.get('titulo') or iid, 'seccion': seccion,
            'pregunta': e.get('pregunta') or '', 'opcion': (e.get('opcion') or '').strip(),
            'score': score, 'max': vmax, 'note': (e.get('note') or '').strip(),
            'photos': [],
        })
        total_score += score
        total_max += vmax
        st = section_totals.setdefault(seccion, {'score': 0, 'max': 0})
        st['score'] += score
        st['max'] += vmax

    if len(photos) != len(photo_owner):
        raise HTTPException(status_code=400, detail='Las fotos no coinciden con sus preguntas')

    eval_id = new_id()
    entries_by_id = {e['id']: e for e in clean_entries}

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
        path = f'{storage.APP_NAME}/rutina/{eval_id}/{photo_id}.{ext}'
        try:
            await storage.put_object(path, content, ctype)
        except Exception as e:
            logger.error(f'photo upload failed: {e}')
            raise HTTPException(status_code=502, detail='No se pudo subir una de las fotos')
        if owner in entries_by_id:
            entries_by_id[owner]['photos'].append({'id': photo_id, 'path': path, 'content_type': ctype})

    pct = round(total_score / total_max * 100) if total_max else 0
    doc = {
        'id': eval_id,
        'sucursal': sucursal, 'mes': mes, 'fecha': fecha,
        'gerente_id': user['id'], 'gerente_name': user['name'], 'gerente_avatar': user.get('avatar_url'),
        'entries': clean_entries,
        'total_score': total_score, 'total_max': total_max, 'percent': pct,
        'section_totals': section_totals,
        'created_at': now_iso(),
    }
    await db.rutina_evaluaciones.insert_one(doc)
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.get('/evaluaciones')
async def list_evaluaciones(sucursal: str = None, mes: str = None, user=Depends(require_rutina_access)):
    q = {}
    if sucursal:
        q['sucursal'] = sucursal
    if mes:
        q['mes'] = mes
    rows = await db.rutina_evaluaciones.find(
        q, {'_id': 0, 'entries': 0}
    ).sort('mes', -1).limit(300).to_list(300)
    return serialize_doc(rows)


@router.get('/evaluaciones/{eval_id}')
async def get_evaluacion(eval_id: str, user=Depends(require_rutina_access)):
    row = await db.rutina_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    return serialize_doc(row)


@router.get('/evaluaciones/{eval_id}/foto/{photo_id}')
async def get_photo(eval_id: str, photo_id: str, user=Depends(require_rutina_access)):
    row = await db.rutina_evaluaciones.find_one({'id': eval_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    photo = None
    for e in row.get('entries', []):
        for p in e.get('photos', []):
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
