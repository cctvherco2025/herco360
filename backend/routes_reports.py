"""Reportes module: ECCP coordinators upload monthly reports (Excel/Word) to a
store; store managers receive, download and mark them as reviewed.

Access is restricted to the same group as Inventario (Tienda staff, managers,
Jefe ECCP, Director comercial, admins).
"""
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from core import db, require_inventory_access, serialize_doc, new_id, now_iso
from models import REPORT_TYPES, SUCURSALES, ReportReviewInput
import storage

router = APIRouter(prefix='/reports', tags=['reports'])
logger = logging.getLogger("reports")

MAX_SIZE = 100 * 1024 * 1024  # 100 MB
ALLOWED_EXT = {'xlsx', 'xls', 'docx', 'doc'}
EXT_MIME = {
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'xls': 'application/vnd.ms-excel',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
}
REPORT_TYPE_IDS = {t['id'] for t in REPORT_TYPES}
REPORT_TYPE_LABEL = {t['id']: t['label'] for t in REPORT_TYPES}


def _can_review(user) -> bool:
    """Managers / commercial director / admins can mark reports as reviewed."""
    if user.get('role') == 'admin':
        return True
    cargo = (user.get('position') or '').strip()
    return cargo in ('Gerente', 'Director comercial')


def _sees_all(user) -> bool:
    return user.get('role') == 'admin' or (user.get('position') or '').strip() == 'Director comercial'


@router.get('/meta')
async def meta(user=Depends(require_inventory_access)):
    return {
        'types': REPORT_TYPES,
        'sucursales': SUCURSALES,
        'can_review': _can_review(user),
        'sees_all': _sees_all(user),
        'my_sucursal': user.get('sucursal') or '',
    }


@router.post('')
async def upload_report(
    file: UploadFile = File(...),
    type: str = Form(...),
    period_month: str = Form(...),
    sucursal: str = Form(...),
    notes: str = Form(''),
    user=Depends(require_inventory_access),
):
    if type not in REPORT_TYPE_IDS:
        raise HTTPException(status_code=400, detail='Tipo de informe inválido')
    if sucursal not in SUCURSALES:
        raise HTTPException(status_code=400, detail='Tienda destino inválida')
    if not (period_month or '').strip():
        raise HTTPException(status_code=400, detail='Indica el mes/período')

    fname = file.filename or 'archivo'
    ext = fname.rsplit('.', 1)[-1].lower() if '.' in fname else ''
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail='Formato no permitido. Sube Excel (.xlsx/.xls) o Word (.docx/.doc)')

    data = await file.read()
    size = len(data)
    if size == 0:
        raise HTTPException(status_code=400, detail='El archivo está vacío')
    if size > MAX_SIZE:
        raise HTTPException(status_code=400, detail='El archivo supera el máximo de 100 MB')

    content_type = file.content_type or EXT_MIME.get(ext, 'application/octet-stream')
    path = f"{storage.APP_NAME}/reports/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = await storage.put_object(path, data, content_type)
    except Exception as e:
        logger.error(f'upload failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo subir el archivo al almacenamiento')

    doc = {
        'id': new_id(),
        'type': type,
        'type_label': REPORT_TYPE_LABEL.get(type, type),
        'period_month': period_month.strip(),
        'sucursal': sucursal,
        'notes': (notes or '').strip(),
        'storage_path': result.get('path', path),
        'original_filename': fname,
        'content_type': content_type,
        'ext': ext,
        'size': result.get('size', size),
        'status': 'entregado',
        'uploaded_by': user['id'],
        'uploaded_by_name': user['name'],
        'uploaded_by_avatar': user.get('avatar_url'),
        'reviewed_by': None,
        'reviewed_by_name': None,
        'reviewed_at': None,
        'review_comment': '',
        'is_deleted': False,
        'created_at': now_iso(),
    }
    await db.reports.insert_one(doc)
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.get('')
async def list_reports(box: str = 'sent', type: str = None, sucursal: str = None,
                       period_month: str = None, user=Depends(require_inventory_access)):
    query = {'is_deleted': False}
    if box == 'sent':
        query['uploaded_by'] = user['id']
    else:  # received
        if _sees_all(user):
            pass  # all stores
        else:
            # Managers see their store; if no store set, fall back to nothing.
            query['sucursal'] = user.get('sucursal') or '__none__'
    if type:
        query['type'] = type
    if sucursal:
        query['sucursal'] = sucursal
    if period_month:
        query['period_month'] = period_month
    items = await db.reports.find(query, {'_id': 0}).sort('created_at', -1).limit(500).to_list(500)
    return serialize_doc(items)


@router.get('/stats')
async def stats(user=Depends(require_inventory_access)):
    base = {'is_deleted': False}
    if _sees_all(user):
        recv = base
    else:
        recv = {**base, 'sucursal': user.get('sucursal') or '__none__'}
    total_recv = await db.reports.count_documents(recv)
    pending_recv = await db.reports.count_documents({**recv, 'status': 'entregado'})
    sent = await db.reports.count_documents({**base, 'uploaded_by': user['id']})
    return {'received': total_recv, 'pending': pending_recv, 'sent': sent}


@router.get('/{report_id}/download')
async def download_report(report_id: str, user=Depends(require_inventory_access)):
    rep = await db.reports.find_one({'id': report_id, 'is_deleted': False}, {'_id': 0})
    if not rep:
        raise HTTPException(status_code=404, detail='Informe no encontrado')
    # Visibility: uploader, manager of that store, director, or admin.
    if not (_sees_all(user) or rep['uploaded_by'] == user['id'] or rep['sucursal'] == user.get('sucursal')):
        raise HTTPException(status_code=403, detail='No tienes acceso a este informe')
    try:
        content, ctype = await storage.get_object(rep['storage_path'])
    except Exception as e:
        logger.error(f'download failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo descargar el archivo')
    fname = rep.get('original_filename', f'informe.{rep.get("ext", "bin")}')
    return Response(content=content, media_type=rep.get('content_type', ctype),
                    headers={'Content-Disposition': f'attachment; filename="{fname}"'})


@router.post('/{report_id}/review')
async def review_report(report_id: str, data: ReportReviewInput, user=Depends(require_inventory_access)):
    if not _can_review(user):
        raise HTTPException(status_code=403, detail='Solo el gerente puede marcar como revisado')
    rep = await db.reports.find_one({'id': report_id, 'is_deleted': False})
    if not rep:
        raise HTTPException(status_code=404, detail='Informe no encontrado')
    if not (_sees_all(user) or rep['sucursal'] == user.get('sucursal')):
        raise HTTPException(status_code=403, detail='Este informe no pertenece a tu tienda')
    await db.reports.update_one({'id': report_id}, {'$set': {
        'status': 'revisado',
        'reviewed_by': user['id'],
        'reviewed_by_name': user['name'],
        'reviewed_at': now_iso(),
        'review_comment': (data.comment or '').strip(),
    }})
    updated = await db.reports.find_one({'id': report_id}, {'_id': 0})
    return serialize_doc(updated)


@router.delete('/{report_id}')
async def delete_report(report_id: str, user=Depends(require_inventory_access)):
    rep = await db.reports.find_one({'id': report_id, 'is_deleted': False})
    if not rep:
        raise HTTPException(status_code=404, detail='Informe no encontrado')
    if not (user.get('role') == 'admin' or rep['uploaded_by'] == user['id']):
        raise HTTPException(status_code=403, detail='Solo quien lo subió puede eliminarlo')
    await db.reports.update_one({'id': report_id}, {'$set': {'is_deleted': True, 'deleted_at': now_iso()}})
    return {'message': 'Informe eliminado'}
