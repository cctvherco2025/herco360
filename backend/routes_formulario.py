"""Formulario — auditorías de piso FLOS (Frenteo, Limpieza, Orden, Surtido).

El cuestionario (dimensiones, criterios, puntaje máximo y texto de acción
correctiva) vive en Mongo (db.flos_schema, documento único 'current'),
editable desde /formulario (botón "Editar puntajes") por quien tenga el
permiso 'formulario_schema' — admin/Director comercial siempre, cualquier
otro usuario solo si se le asigna desde Organigrama
(require_flos_schema_editor en core.py). DEFAULT_FLOS_SCHEMA de abajo es
solo el valor semilla la primera vez que se pide — los 16 criterios y sus
puntajes tal como estaban portados de "Auditoría FLOS Herco 2.1
(Referencias).html".

El backend guarda lo que el auditor calificó, incluyendo el texto de acción
vigente al momento de auditar (así el Plan de acción de una auditoría ya
enviada no cambia si alguien edita el esquema después). Igual que el flujo
original en HTML, el recorrido completo se guarda de un solo envío al
terminar — mientras el usuario recorre los criterios, su avance vive en el
navegador (localStorage), no en el servidor.

Las fotos van a Cloudflare R2 (storage.py), igual que los archivos de Reportes;
solo se descargan autenticado, nunca por URL pública.
"""
import json
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response

from core import db, serialize_doc, new_id, now_iso, require_formulario_access, require_flos_schema_editor
from models import FlosSchemaUpdate
from notifications import log_activity
import storage

router = APIRouter(prefix='/formulario', tags=['formulario'])
logger = logging.getLogger('formulario')

FLOS_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat']
MAX_PHOTO_SIZE = 8 * 1024 * 1024  # 8 MB por foto

DEFAULT_FLOS_SCHEMA = [
    {
        'dimension': 'FRENTEO',
        'variables': [
            {'id': 'f1', 'name': 'Presentación Visual de Producto en Góndola', 'max': 8,
             'desc': 'Alineación vertical perfecta, frentes hacia adelante y sin huecos falsos.',
             'action': 'Ejecutar frenteo inmediato arrastrando el producto hacia la línea frontal del fleje. Colocar los empaques más limpios adelante.'},
            {'id': 'f2', 'name': 'Presentación Visual de Producto en Exhibición', 'max': 8,
             'desc': 'Muestras físicas fijas (como cerraduras en paneles de madera) atornilladas y operativas.',
             'action': 'Ajustar tornillos sueltos en las muestras de exhibición, limpiar manchas de grasa y reponer las muestras dañadas.'},
            {'id': 'f3', 'name': 'Rotación Correcta de Fechas', 'max': 5,
             'desc': '> 5 articulos vencidos = 0 puntos',
             'action': 'Retirar bolsas rotas del pasillo. Reempacar la tornillería suelta y aplicar PEPS mandando el stock viejo al frente.'},
            {'id': 'f4', 'name': 'Colocación de Material POP y Promociones', 'max': 5,
             'desc': 'Rótulos de descuento vigentes, alineados y distribuidos uniformemente por cuadrante. Verificar promociones vigentes antes de comenzar evaluacion',
             'action': 'Redistribuir el material POP sobrecargado. Retirar carteles de ofertas vencidas y alinear los flejes promocionales.'},
            {'id': 'f5', 'name': 'Correcto Etiquetado del Producto', 'max': 5,
             'desc': 'Revisar 30 etiquetas — 25 a 30 correctas = 5 pts · 20 a 24 = 3 pts · menos de 20 = 0 pts',
             'action': 'Imprimir flejes de precios faltantes desde el sistema. Retirar etiquetas dañadas o escritas con marcador.'},
        ],
    },
    {
        'dimension': 'LIMPIEZA',
        'variables': [
            {'id': 'l1', 'name': 'Limpieza de los Estantes', 'max': 6,
             'desc': 'Libre de polvo, humedad y manchas',
             'action': 'Limpieza profunda con paño desengrasante en las bases de estantería. Eliminar residuos de derrame de líquidos.'},
            {'id': 'l2', 'name': 'Limpieza de los Productos', 'max': 7,
             'desc': 'Libre de polvo, humedad y manchas',
             'action': 'Pasar sacudidor de microfibra por todo el stock expuesto. Limpiar la acumulación de polvo en las caras superiores.'},
            {'id': 'l3', 'name': 'Limpieza del Pasillo', 'max': 5,
             'desc': 'Libre de polvo y objetos extraños (papeles, bolsas,etiquetas)',
             'action': 'Barrer el pasillo de inmediato y retirar residuos plásticos generados durante el desempaque matutino.'},
        ],
    },
    {
        'dimension': 'ORDEN',
        'variables': [
            {'id': 'o1', 'name': 'Góndola y Estaciones Libres de Objetos Ajenos a Ellas', 'max': 7,
             'desc': 'Botes, bebidas en bolsa, comida, golosinas, objetos personales.',
             'action': 'Retirar del piso de venta cualquier termo, botella de agua u objeto personal de los asesores. Moverlos a los casilleros.'},
            {'id': 'o2', 'name': 'Pasillos Libres de Objetos Ajenos al Mismo', 'max': 5,
             'desc': 'Tránsito fluido. Canastas, carretillas y escaleras en su ubicación correspondiente.',
             'action': 'Reubicar las escaleras logísticas y carretillas en los espacios asignados de bodega para liberar el paso del cliente.'},
            {'id': 'o3', 'name': 'Herramientas y Equipo de Trabajo en Buenas Condiciones', 'max': 6,
             'desc': 'Tenaza (1) Corta perno pequeño (1), Navaja (1) Destornillador (1Phillip y 1Plano), Ajustable (1) Cinta metrica (1)  Set de puntas Phillips (1), Tijera para lamina (1), segueta (1).',
             'action': 'Realizar cambio de herramientas de uso general en area de trabajo'},
            {'id': 'o4', 'name': 'Orden y Rotulación en Cajas y Empaques de Bodegas Aéreas', 'max': 5,
             'desc': 'Cajas estibadas de manera correcta, Rotulacion con marcador negro y letra grande y legible. Ver hoja de referencias.',
             'action': 'Girar y ordenar las cajas de sobre-stock aéreo. Escribir con marcador legible el contenido viendo de frente.'},
            {'id': 'o5', 'name': 'Góndola Libre de Producto Averiado', 'max': 5,
             'desc': 'Cero producto quebrado, abollado o abierto en el lineal. El averiado va a su estante correspondiente.',
             'action': 'Retirar del lineal el producto golpeado o abierto y trasladarlo al área de merma autorizada para trámite logístico.'},
        ],
    },
    {
        'dimension': 'SURTIDO',
        'variables': [
            {'id': 's1', 'name': 'Stock Adecuado de Producto', 'max': 8,
             'desc': 'Densidad óptima. Evitar ganchos vacíos teniendo mercancía disponible.',
             'action': 'Bajar mercancía de la bodega aérea de forma inmediata para rellenar los ganchos vacíos de alta rotación.'},
            {'id': 's2', 'name': 'Activaciones de Temporada y Promociones Mensuales', 'max': 8,
             'desc': 'Verificar activaciones de temporada y promociones vigentes antes de comenzar evaluacion.',
             'action': 'Modificar la altura de los entrepaños de la góndola para compactar el espacio y eliminar los huecos vacíos de aire.'},
            {'id': 's3', 'name': 'Góndola Frondosa de Producto', 'max': 7,
             'desc': 'Ajuste de bandejas para evitar huecos de aire masivos e infundir percepción de abundancia.',
             'action': 'Modificar la altura de los entrepaños de la góndola para compactar el espacio y eliminar los huecos vacíos de aire.'},
        ],
    },
]


@router.get('/meta')
async def meta(user=Depends(require_formulario_access)):
    return {'sucursales': FLOS_SUCURSALES}


async def _get_flos_schema_doc():
    doc = await db.flos_schema.find_one({'id': 'current'}, {'_id': 0})
    if not doc:
        doc = {'id': 'current', 'dimensiones': DEFAULT_FLOS_SCHEMA, 'updated_at': now_iso(), 'updated_by': None}
        await db.flos_schema.insert_one(dict(doc))
    return doc


@router.get('/schema')
async def get_schema(user=Depends(require_formulario_access)):
    doc = await _get_flos_schema_doc()
    return {'dimensiones': doc['dimensiones']}


@router.put('/schema')
async def update_schema(data: FlosSchemaUpdate, manager=Depends(require_flos_schema_editor)):
    if not data.dimensiones:
        raise HTTPException(status_code=400, detail='El esquema necesita al menos una dimensión')
    dimensiones = []
    for d in data.dimensiones:
        dim_name = d.dimension.strip()
        if not dim_name:
            raise HTTPException(status_code=400, detail='Cada dimensión necesita un nombre')
        if not d.variables:
            raise HTTPException(status_code=400, detail=f'La dimensión "{dim_name}" necesita al menos un criterio')
        variables = []
        for v in d.variables:
            name = v.name.strip()
            if not name:
                raise HTTPException(status_code=400, detail='Cada criterio necesita un nombre')
            variables.append({
                'id': v.id or new_id(),
                'name': name,
                'desc': (v.desc or '').strip(),
                'action': (v.action or '').strip(),
                'max': max(0, int(v.max)),
            })
        dimensiones.append({'dimension': dim_name, 'variables': variables})

    doc = {'id': 'current', 'dimensiones': dimensiones, 'updated_at': now_iso(), 'updated_by': manager['id']}
    await db.flos_schema.replace_one({'id': 'current'}, doc, upsert=True)
    await log_activity(manager['id'], manager['name'], manager.get('avatar_url'),
                       'editó el esquema de', 'Formulario FLOS', 'flos_schema')
    return {'dimensiones': dimensiones}


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
            'action': (e.get('action') or '').strip(),
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


@router.delete('/auditorias/{audit_id}')
async def delete_audit(audit_id: str, user=Depends(require_formulario_access)):
    """Eliminar una auditoría del historial. Puede el admin, el Director
    comercial, o el auditor que la registró. Las fotos quedan huérfanas en el
    almacenamiento de objetos pero ya no son accesibles (la descarga exige que
    la auditoría exista)."""
    row = await db.flos_audits.find_one({'id': audit_id}, {'_id': 0, 'auditor_id': 1})
    if not row:
        raise HTTPException(status_code=404, detail='Auditoría no encontrada')
    if not (user.get('role') == 'admin'
            or (user.get('position') or '').strip() == 'Director comercial'
            or row.get('auditor_id') == user['id']):
        raise HTTPException(status_code=403, detail='Solo el auditor que la registró (o un admin) puede eliminarla')
    await db.flos_audits.delete_one({'id': audit_id})
    return {'message': 'Auditoría eliminada'}


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
