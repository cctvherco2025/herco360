"""Diagnóstico desde el dispositivo del usuario.

La app puede grabar, en el celular de quien tiene un problema, qué pasa con
cada toque en pantalla (qué elemento lo recibe, si algo lo bloquea, estado de
los campos, versión de la app cargada…) y mandarlo aquí. Se guarda tal cual
en `diagnosticos` para revisarlo después — sirve para fallas que solo pasan
en ciertos teléfonos y no se pueden reproducir desde una computadora.
"""
import json

from fastapi import APIRouter, HTTPException, Depends

from core import db, get_current_user, require_admin, serialize_doc, new_id, now_iso

router = APIRouter(prefix='/diagnostico', tags=['diagnostico'])

MAX_BYTES = 300 * 1024  # un reporte trae algunos cientos de eventos, nunca fotos


@router.post('')
async def save_report(payload: dict, user=Depends(get_current_user)):
    size = len(json.dumps(payload, default=str))
    if size > MAX_BYTES:
        raise HTTPException(status_code=413, detail='Reporte de diagnóstico demasiado grande')
    doc = {
        'id': new_id(),
        'contexto': str(payload.get('contexto') or '')[:80],
        'user_id': user['id'], 'user_name': user.get('name'),
        'created_at': now_iso(),
        'data': payload,
    }
    await db.diagnosticos.insert_one(doc)
    return {'id': doc['id'], 'codigo': doc['id'][:6].upper()}


@router.get('')
async def list_reports(user=Depends(require_admin)):
    rows = await db.diagnosticos.find({}, {'_id': 0}).sort('created_at', -1).limit(50).to_list(50)
    return serialize_doc(rows)
