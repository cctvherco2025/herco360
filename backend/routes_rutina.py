"""Rutina Operativa — evaluación mensual de Gerentes de tienda.

El cuestionario (secciones, preguntas, opciones y sus puntos) vive en Mongo
(db.rutina_schema, documento único 'current'), editable desde /rutina-
operativa (botón "Editar puntajes") por quien tenga el permiso
'rutina_schema' — admin/Director comercial siempre, cualquier otro usuario
solo si se le asigna desde Organigrama (require_rutina_schema_editor en
core.py). DEFAULT_SCHEMA de abajo es solo el valor semilla la primera vez
que se pide — validado contra el formulario vigente en DataScope ("Rutina
Operativa Gerentes de Tienda"), 14 preguntas puntuables que suman 100 puntos.

El backend solo guarda lo que el gerente respondió (igual que
Formulario/FLOS): cada respuesta trae su propia foto de título/sección/
puntaje, así que editar el esquema después nunca altera evaluaciones ya
enviadas. Se envía completa de un solo POST al terminar el recorrido.

Las fotos van a Cloudflare R2 (storage.py), igual que Reportes y Formulario;
solo se descargan autenticado, nunca por URL pública.
"""
import json
import logging
from typing import List

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response

from core import db, serialize_doc, new_id, now_iso, require_rutina_access, can_fill_rutina, require_rutina_schema_editor
from models import RutinaSchemaUpdate
from notifications import log_activity
import storage

router = APIRouter(prefix='/rutina', tags=['rutina'])
logger = logging.getLogger('rutina')

RUTINA_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat']
MAX_PHOTO_SIZE = 8 * 1024 * 1024  # 8 MB por foto

DEFAULT_RUTINA_SCHEMA = [
    {
        'seccion': 'Gestión de Categorías y Auditoría',
        'items': [
            {
                'id': 'ventas_rentabilidad', 'titulo': 'Evaluación de Ventas y Rentabilidad',
                'pregunta': 'Seleccione el nivel alcanzado según metas de volumen y rentabilidad',
                'opciones': [
                    {'label': 'Meta de volumen y rentabilidad superadas', 'pts': 12},
                    {'label': 'Se alcanzó solo volumen o solo rentabilidad', 'pts': 6},
                    {'label': '<90% de cumplimiento en ambas metas', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte captura del reporte de ventas y margen/rentabilidad del mes'},
            },
            {
                'id': 'flos_ejecucion', 'titulo': 'Ejecución de evaluación FLOS',
                'pregunta': '¿Ejecutó la Evaluación FLOS?',
                'opciones': [{'label': 'Sí', 'pts': 7}, {'label': 'No', 'pts': 0}],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte captura de Chat de FLOS'},
            },
            {
                'id': 'recorrido_categorias', 'titulo': 'Recorrido de Categorías',
                'pregunta': 'Seleccione su respuesta',
                'opciones': [{'label': 'Sí', 'pts': 5}, {'label': 'No', 'pts': 0}],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte evidencia del recorrido por categorías (opcional)'},
            },
        ],
    },
    {
        'seccion': 'Inventario, Abastecimiento y Sistemas',
        'items': [
            {
                'id': 'sobrestock', 'titulo': 'Gestión de Sobrestock',
                'pregunta': '¿Realizó análisis de Requerimiento de Sobrestock?',
                'opciones': [{'label': 'Sí', 'pts': 5}, {'label': 'No', 'pts': 0}],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte documento de traslado o de reunión realizada con coordinador si aplica'},
            },
            {
                'id': 'ubicacion_averiado', 'titulo': 'Ubicación Averiado',
                'pregunta': '¿Realizó carpa de Liquidación de Averiados?',
                'opciones': [
                    {'label': 'Dos o más carpas al mes', 'pts': 10},
                    {'label': 'Una carpa al mes', 'pts': 5},
                    {'label': 'No se sacó carpa', 'pts': 0},
                ],
                'evidencia': {'tipo': 'texto', 'prompt': 'Ingrese fechas de realización de carpa'},
            },
            {
                'id': 'herramientas_generales', 'titulo': 'Herramientas de Uso General',
                'pregunta': 'Seleccione el estado de las herramientas',
                'opciones': [{'label': 'Completas y funcionales', 'pts': 5}, {'label': 'Incompletas o en mal estado', 'pts': 0}],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte fotografía de herramientas por categoría'},
            },
            {
                'id': 'local_quest', 'titulo': 'Actualización de Local Quest',
                'pregunta': 'Seleccione el nivel de actualización de Local Quest',
                'opciones': [
                    {'label': 'Actualizado 3 veces x semana / 12 al mes', 'pts': 5},
                    {'label': 'No se completó la actualización de todas las semanas', 'pts': 2},
                    {'label': 'Actualización deficiente', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte captura de versión del sistema'},
            },
            {
                'id': 'matriz_inventarios', 'titulo': 'Matriz de inventarios',
                'pregunta': 'Seleccione el rango de la nota obtenida',
                'opciones': [
                    {'label': 'Mayor que 95', 'pts': 5},
                    {'label': 'Entre 90 y 95', 'pts': 2},
                    {'label': 'Menor que 90', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte evidencia (opcional)'},
            },
            {
                'id': 'exactitud_inventarios', 'titulo': 'Exactitud de inventarios',
                'pregunta': 'Seleccione el rango de la nota obtenida',
                'opciones': [
                    {'label': 'Mayor que 99%', 'pts': 5},
                    {'label': 'Entre 98% y 99%', 'pts': 2},
                    {'label': 'Menor que 98%', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte evidencia (opcional)'},
            },
        ],
    },
    {
        'seccion': 'Operación, Entregas y Equipo',
        'items': [
            {
                'id': 'tiempos_bodega', 'titulo': 'Tiempos de Bodega',
                'pregunta': 'Retroalimente el porcentaje de Tiempos de sacado',
                'opciones': [
                    {'label': 'Mayor que 98%', 'pts': 5},
                    {'label': 'Entre 95% y 98%', 'pts': 2},
                    {'label': 'Menor que 95%', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte evidencia (opcional)'},
            },
            {
                'id': 'pendientes_entrega', 'titulo': 'Pendientes de Entrega',
                'pregunta': 'Seleccione el estado de los pendientes de entrega',
                'opciones': [
                    {'label': 'Pendientes menores a dos meses', 'pts': 10},
                    {'label': 'Pendientes mayor a dos meses', 'pts': 5},
                    {'label': 'Pendientes mayores a seis meses', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte captura de pantalla de la bandeja de entregas'},
            },
            {
                'id': 'reunion_coordinador', 'titulo': 'Reunión uno a uno con coordinador',
                'pregunta': 'Seleccione el nivel de ejecución',
                'opciones': [
                    {'label': 'Reuniones 1:1 ejecutadas', 'pts': 11},
                    {'label': 'Ejecución parcial', 'pts': 8},
                    {'label': 'No realizadas', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte fotografías de reuniones ejecutadas'},
            },
            {
                'id': 'clima_laboral', 'titulo': 'Clima Laboral (Calendario de Vacaciones)',
                'pregunta': '¿Realizó calendarización de vacaciones del mes?',
                'opciones': [{'label': 'Sí', 'pts': 5}, {'label': 'No', 'pts': 0}],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte calendario de vacaciones programadas'},
            },
            {
                'id': 'limpieza_general', 'titulo': 'Limpieza general de Tienda',
                'pregunta': 'Seleccione las áreas revisadas durante el mes',
                'opciones': [
                    {'label': 'Se ejecutó en su totalidad', 'pts': 10},
                    {'label': 'La limpieza es parcial', 'pts': 6},
                    {'label': 'No hubo limpieza', 'pts': 0},
                ],
                'evidencia': {'tipo': 'foto', 'prompt': 'Adjunte evidencia (opcional)'},
            },
        ],
    },
]


async def require_rutina_fill(user=Depends(require_rutina_access)):
    """Puede consultar (require_rutina_access) pero además puede crear."""
    if not can_fill_rutina(user):
        raise HTTPException(status_code=403, detail='Solo el Gerente de la tienda puede registrar la Rutina Operativa')
    return user


@router.get('/meta')
async def meta(user=Depends(require_rutina_access)):
    return {'sucursales': RUTINA_SUCURSALES, 'can_fill': can_fill_rutina(user)}


async def _get_rutina_schema_doc():
    doc = await db.rutina_schema.find_one({'id': 'current'}, {'_id': 0})
    if not doc:
        doc = {'id': 'current', 'secciones': DEFAULT_RUTINA_SCHEMA, 'updated_at': now_iso(), 'updated_by': None}
        await db.rutina_schema.insert_one(dict(doc))
    return doc


@router.get('/schema')
async def get_schema(user=Depends(require_rutina_access)):
    doc = await _get_rutina_schema_doc()
    return {'secciones': doc['secciones']}


@router.put('/schema')
async def update_schema(data: RutinaSchemaUpdate, manager=Depends(require_rutina_schema_editor)):
    if not data.secciones:
        raise HTTPException(status_code=400, detail='El esquema necesita al menos una sección')
    secciones = []
    for s in data.secciones:
        seccion_name = s.seccion.strip()
        if not seccion_name:
            raise HTTPException(status_code=400, detail='Cada sección necesita un nombre')
        if not s.items:
            raise HTTPException(status_code=400, detail=f'La sección "{seccion_name}" necesita al menos una pregunta')
        items = []
        for it in s.items:
            titulo = it.titulo.strip()
            if not titulo:
                raise HTTPException(status_code=400, detail='Cada pregunta necesita un título')
            opciones = []
            for o in it.opciones:
                label = o.label.strip()
                if not label:
                    continue
                opciones.append({'label': label, 'pts': max(0, int(o.pts))})
            if not opciones:
                raise HTTPException(status_code=400, detail=f'"{titulo}" necesita al menos una opción')
            items.append({
                'id': it.id or new_id(),
                'titulo': titulo,
                'pregunta': (it.pregunta or '').strip(),
                'opciones': opciones,
                'evidencia': it.evidencia.model_dump() if it.evidencia else None,
            })
        secciones.append({'seccion': seccion_name, 'items': items})

    doc = {'id': 'current', 'secciones': secciones, 'updated_at': now_iso(), 'updated_by': manager['id']}
    await db.rutina_schema.replace_one({'id': 'current'}, doc, upsert=True)
    await log_activity(manager['id'], manager['name'], manager.get('avatar_url'),
                       'editó el esquema de', 'Rutina Operativa', 'rutina_schema')
    return {'secciones': secciones}


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


@router.delete('/evaluaciones/{eval_id}')
async def delete_evaluacion(eval_id: str, user=Depends(require_rutina_access)):
    """Eliminar una evaluación del historial. Puede el admin, el Director
    comercial, o el gerente que la registró. Las fotos quedan huérfanas en el
    almacenamiento de objetos pero ya no son accesibles (la descarga exige que
    la evaluación exista)."""
    row = await db.rutina_evaluaciones.find_one({'id': eval_id}, {'_id': 0, 'gerente_id': 1})
    if not row:
        raise HTTPException(status_code=404, detail='Evaluación no encontrada')
    if not (user.get('role') == 'admin'
            or (user.get('position') or '').strip() == 'Director comercial'
            or row.get('gerente_id') == user['id']):
        raise HTTPException(status_code=403, detail='Solo el gerente que la registró (o un admin) puede eliminarla')
    await db.rutina_evaluaciones.delete_one({'id': eval_id})
    return {'message': 'Evaluación eliminada'}


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
