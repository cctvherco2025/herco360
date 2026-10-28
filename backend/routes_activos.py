"""Activos — registro de activos y herramientas de Herco por categorías.

Categorías (db.activo_categorias): las crea quien administra Activos
(core.can_admin_activos). Cada una define:
  - prefijo del código (HER, VEH, NVR…): cada activo recibe un correlativo
    que pone el servidor y no cambia nunca (HER-001, HER-002…). El número sale
    de db.counters y no se reutiliza aunque el activo se elimine;
  - sus campos propios (`campos`): texto, número, decimal, fecha, lista de
    opciones, sí/no o IP. Cada campo tiene una `clave` fija; al editar la
    categoría se puede renombrar, reordenar, agregar o quitar campos, y los
    valores ya guardados se conservan en el activo aunque el campo se quite;
  - sus responsables: registran, editan y dan de baja los activos de esa
    categoría (y solo ellos y los administradores la ven);
  - opcionalmente, a qué categoría pertenecen sus activos (`padre_id`): una
    cámara pertenece a un NVR. Con `posicion_label` (p. ej. "Canal") cada
    activo ocupa una posición numerada en su padre, única entre los activos
    activos, y `capacidad_campo` es el campo numérico del padre con el máximo
    (p. ej. 'canales' del NVR).
NVR y Cámara se crean solas la primera vez (ensure_defaults).

Estados del activo: 'activo' o 'baja' (con motivo; se puede reactivar).
Eliminar es solo para registros hechos por error.

Historial por activo en db.activo_historial (alta, edición, cambio de
ubicación, foto, baja, reactivación); las eliminaciones de activos y los
cambios de categorías quedan en db.activos_log. Es la base para el
mantenimiento preventivo (fase 2), que agregará sus propias entradas.
Foto de referencia en R2 (storage.py).
"""
import ipaddress
import json
import logging
import re
import unicodedata
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from pymongo import ReturnDocument

import acceso
from core import (require_modulo, puede_modulo, db, serialize_doc, new_id, now_iso, get_current_user, require_activos_admin, can_admin_activos,
                  RETAIL, LOGISTICA, departamento_de, es_retail, es_super_admin, filtro_depto, filtro_usuarios_depto)
import organizacion
from notifications import log_activity
import storage

router = APIRouter(prefix='/activos', tags=['activos'])
logger = logging.getLogger('activos')

SUCURSALES = ['H1', 'H2', 'H5', 'H6']  # ubicaciones de Ventas Retail
# Los demás departamentos tienen sus propias ubicaciones (las edita quien
# administra sus activos o el super admin).
UBICACIONES_INICIALES = ['Bodega central']


async def ubicaciones(depto):
    if (depto or RETAIL) == RETAIL:
        return list(SUCURSALES)
    doc = await db.config.find_one({'_id': f'ubicaciones:{depto}'})
    if not doc and depto == LOGISTICA:  # las que se guardaron antes de que hubiera más departamentos
        doc = await db.config.find_one({'_id': 'ubicaciones_logistica'})
    return (doc or {}).get('ubicaciones') or list(UBICACIONES_INICIALES)


def depto_cat(cat) -> str:
    """Departamento de una categoría (las de antes, sin el campo, son de Retail)."""
    return (cat or {}).get('departamento') or RETAIL
MAX_PHOTO_SIZE = 8 * 1024 * 1024
TIPOS_CAMPO = {
    'texto': 'Texto', 'numero': 'Número entero', 'decimal': 'Número con decimales', 'fecha': 'Fecha',
    'opcion': 'Lista de opciones', 'si_no': 'Sí / No', 'ip': 'Dirección IP',
}
ICONOS = ['package', 'server', 'cctv', 'wrench', 'hammer', 'drill', 'paint', 'car', 'truck', 'forklift', 'fuel',
          'monitor', 'laptop', 'printer', 'smartphone', 'router', 'cable', 'snowflake', 'zap', 'battery', 'fan',
          'lightbulb', 'refrigerator', 'armchair', 'scale', 'calculator', 'shield', 'tag', 'boxes']
MAX_CAMPOS = 40

# Categorías iniciales (las de CCTV de la fase 1).
DEFAULTS = [
    {
        'id': 'nvr', 'nombre': 'NVR', 'plural': 'NVR', 'prefijo': 'NVR', 'icono': 'server',
        'descripcion': 'Grabadores de video de CCTV',
        'nombre_label': 'Nombre', 'nombre_ejemplo': 'Ej. NVR principal',
        'ubicacion_label': 'Ubicación', 'ubicacion_ejemplo': 'Ej. Sala de monitoreo',
        'padre_id': None, 'posicion_label': '', 'capacidad_campo': '',
        'campos': [
            {'clave': 'marca', 'etiqueta': 'Marca', 'tipo': 'texto', 'obligatorio': True},
            {'clave': 'modelo', 'etiqueta': 'Modelo', 'tipo': 'texto', 'obligatorio': True},
            {'clave': 'serie', 'etiqueta': 'N° de serie', 'tipo': 'texto', 'obligatorio': True},
            {'clave': 'ip', 'etiqueta': 'Dirección IP', 'tipo': 'ip', 'obligatorio': False},
            {'clave': 'canales', 'etiqueta': 'N° de canales', 'tipo': 'numero', 'obligatorio': True},
            {'clave': 'discos', 'etiqueta': 'N° de discos', 'tipo': 'numero', 'obligatorio': False},
            {'clave': 'capacidad_tb', 'etiqueta': 'Capacidad total (TB)', 'tipo': 'decimal', 'obligatorio': False},
            {'clave': 'firmware', 'etiqueta': 'Firmware', 'tipo': 'texto', 'obligatorio': False},
            {'clave': 'fecha_instalacion', 'etiqueta': 'Fecha de instalación', 'tipo': 'fecha', 'obligatorio': False},
        ],
    },
    {
        'id': 'camara', 'nombre': 'Cámara', 'plural': 'Cámaras', 'prefijo': 'CAM', 'icono': 'cctv',
        'descripcion': 'Cámaras de CCTV conectadas a un NVR',
        'nombre_label': 'Zona que cubre', 'nombre_ejemplo': 'Ej. Entrada principal',
        'ubicacion_label': 'Área', 'ubicacion_ejemplo': 'Ej. Piso de venta, bodega, exterior',
        'padre_id': 'nvr', 'posicion_label': 'Canal', 'capacidad_campo': 'canales',
        'campos': [
            {'clave': 'tipo_camara', 'etiqueta': 'Tipo de cámara', 'tipo': 'opcion', 'obligatorio': True,
             'opciones': ['Domo', 'Bala', 'Turret', 'PTZ', 'Cubo', 'Ojo de pez']},
            {'clave': 'marca', 'etiqueta': 'Marca', 'tipo': 'texto', 'obligatorio': True},
            {'clave': 'modelo', 'etiqueta': 'Modelo', 'tipo': 'texto', 'obligatorio': True},
            {'clave': 'serie', 'etiqueta': 'N° de serie', 'tipo': 'texto', 'obligatorio': False},
            {'clave': 'ip', 'etiqueta': 'Dirección IP', 'tipo': 'ip', 'obligatorio': False},
            {'clave': 'fecha_instalacion', 'etiqueta': 'Fecha de instalación', 'tipo': 'fecha', 'obligatorio': False},
        ],
    },
]
CAMPOS_BASE = {'nombre': 'nombre', 'sucursal': 'sucursal', 'ubicacion': 'ubicación', 'padre_id': 'pertenece a',
               'posicion': 'posición', 'notas': 'notas'}
UBICACION_KEYS = ('sucursal', 'ubicacion', 'padre_id', 'posicion')


async def ensure_indexes():
    await db.activos.create_index('id', unique=True)
    await db.activos.create_index('codigo', unique=True)
    await db.activos.create_index([('padre_id', 1), ('posicion', 1)])
    await db.activos.create_index('categoria_id')
    await db.activo_historial.create_index([('activo_id', 1), ('at', -1)])
    await db.activo_categorias.create_index('id', unique=True)
    await db.activo_categorias.create_index('prefijo', unique=True)


async def ensure_defaults():
    """Crea NVR y Cámara una sola vez (si después se borran, no vuelven).
    Responsables iniciales: los Jefes de ECCP."""
    marca = await db.counters.find_one_and_update({'_id': 'activos_categorias_iniciales'}, {'$setOnInsert': {'n': 1}},
                                                  upsert=True, return_document=ReturnDocument.BEFORE)
    if marca:
        return
    jefes = [u['id'] for u in await db.users.find({'area': 'ECCP', 'position': 'Jefe', 'status': 'approved'}, {'_id': 0, 'id': 1}).to_list(50)]
    for i, d in enumerate(DEFAULTS):
        if not await db.activo_categorias.find_one({'$or': [{'id': d['id']}, {'prefijo': d['prefijo']}]}):
            await db.activo_categorias.insert_one({**d, 'orden': i, 'responsables': jefes, 'created_at': now_iso(), 'created_by_name': 'Sistema'})


# ── Utilidades ───────────────────────────────────────────────────
def _txt(v, limit=200) -> str:
    return re.sub(r'\s+', ' ', str(v or '')).strip()[:limit]


def _slug(texto):
    norm = unicodedata.normalize('NFKD', texto or '')
    s = ''.join(c for c in norm if not unicodedata.combining(c)).lower()
    return re.sub(r'[^a-z0-9]+', '_', s).strip('_')[:40] or 'campo'


async def _categorias(user=None):
    """Categorías; con `user`, solo las de su departamento (los admins ven todas)."""
    q = filtro_depto(user) if user else {}
    return await db.activo_categorias.find(q, {'_id': 0}).sort([('orden', 1), ('nombre', 1)]).to_list(500)


async def _acceso(user):
    """(administra, categorías visibles, ids de categorías que puede editar).
    Quien administra lo hace sobre las categorías de su departamento. Sin el
    módulo encendido en su perfil, nada (aunque sea responsable)."""
    if not puede_modulo(user, 'activos'):
        return False, [], set()
    cats = await _categorias(user)
    if can_admin_activos(user):
        return True, cats, {c['id'] for c in cats}
    mias = [c for c in cats if user['id'] in (c.get('responsables') or [])]
    return False, mias, {c['id'] for c in mias}


async def _categoria(cat_id):
    c = await db.activo_categorias.find_one({'id': _txt(cat_id)}, {'_id': 0})
    if not c:
        raise HTTPException(status_code=400, detail='Elige una categoría válida')
    return c


def _puede_editar(editables, cat_id):
    if cat_id not in editables:
        raise HTTPException(status_code=403, detail='No eres responsable de esta categoría de activos')


def _numero(v, campo, minimo=None, maximo=None, decimales=False):
    try:
        x = float(v)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f'{campo}: escribe un número válido')
    if not decimales:
        if x != int(x):
            raise HTTPException(status_code=400, detail=f'{campo}: escribe un número entero')
        x = int(x)
    else:
        x = round(x, 2)
    if (minimo is not None and x < minimo) or (maximo is not None and x > maximo):
        raise HTTPException(status_code=400, detail=f'{campo}: debe estar entre {minimo} y {maximo}')
    return x


def _datos(cat, raw, previos=None):
    """Valida los campos de la categoría. Los valores de campos que ya no
    existen en la categoría se conservan (`previos`)."""
    raw = raw or {}
    out = {k: v for k, v in (previos or {}).items() if k not in {c['clave'] for c in cat['campos']}}
    for c in cat['campos']:
        v = raw.get(c['clave'])
        if c['tipo'] == 'si_no':
            out[c['clave']] = None if v in (None, '') else v in (True, 'true', 'si', 'sí', 1, '1')
            if c.get('obligatorio') and out[c['clave']] is None:
                raise HTTPException(status_code=400, detail=f'Completa: {c["etiqueta"]}')
            continue
        if v is None or (isinstance(v, str) and not v.strip()):
            if c.get('obligatorio'):
                raise HTTPException(status_code=400, detail=f'Completa: {c["etiqueta"]}')
            out[c['clave']] = None
            continue
        if c['tipo'] in ('numero', 'decimal'):
            out[c['clave']] = _numero(v, c['etiqueta'], 0, 10 ** 9, c['tipo'] == 'decimal')
        elif c['tipo'] == 'fecha':
            try:
                out[c['clave']] = date.fromisoformat(_txt(v, 10)).isoformat()
            except ValueError:
                raise HTTPException(status_code=400, detail=f'{c["etiqueta"]}: fecha no válida')
        elif c['tipo'] == 'opcion':
            if _txt(v) not in (c.get('opciones') or []):
                raise HTTPException(status_code=400, detail=f'{c["etiqueta"]}: elige una opción de la lista')
            out[c['clave']] = _txt(v)
        elif c['tipo'] == 'ip':
            try:
                out[c['clave']] = str(ipaddress.ip_address(_txt(v, 45)))
            except ValueError:
                raise HTTPException(status_code=400, detail=f'{c["etiqueta"]}: no es una IP válida (ej. 192.168.1.64)')
        else:
            out[c['clave']] = _txt(v, 300)
    return out


async def _padre_y_posicion(cat, padre_id, posicion, excluir_id=None):
    """Valida el activo al que pertenece y su posición. Devuelve (padre, posicion)."""
    if not cat.get('padre_id'):
        return None, None
    cat_padre = await db.activo_categorias.find_one({'id': cat['padre_id']}, {'_id': 0}) or {}
    nombre_padre = cat_padre.get('nombre', 'activo')
    padre = await db.activos.find_one({'id': _txt(padre_id), 'categoria_id': cat['padre_id']}, {'_id': 0})
    if not padre:
        raise HTTPException(status_code=400, detail=f'Elige el {nombre_padre} al que pertenece')
    if padre.get('estado') != 'activo':
        raise HTTPException(status_code=400, detail=f'{padre["codigo"]} está dado de baja')
    label = cat.get('posicion_label')
    if not label:
        return padre, None
    maximo = (padre.get('datos') or {}).get(cat.get('capacidad_campo') or '') or 999
    if posicion in (None, ''):
        raise HTTPException(status_code=400, detail=f'Indica el {label.lower()}')
    posicion = _numero(posicion, label, 1, maximo)
    q = {'padre_id': padre['id'], 'categoria_id': cat['id'], 'posicion': posicion, 'estado': 'activo'}
    if excluir_id:
        q['id'] = {'$ne': excluir_id}
    ocupado = await db.activos.find_one(q, {'_id': 0, 'codigo': 1, 'nombre': 1})
    if ocupado:
        raise HTTPException(status_code=400, detail=f'El {label.lower()} {posicion} de {padre["codigo"]} ya lo tiene {ocupado["codigo"]} ({ocupado["nombre"]})')
    return padre, posicion


async def _codigo(cat):
    n = await db.counters.find_one_and_update({'_id': f'activos_{cat["prefijo"]}'}, {'$inc': {'n': 1}},
                                              upsert=True, return_document=ReturnDocument.AFTER)
    return f'{cat["prefijo"]}-{n["n"]:03d}'


async def _historial(activo, tipo, resumen, user, **extra):
    await db.activo_historial.insert_one({
        'id': new_id(), 'activo_id': activo['id'], 'tipo': tipo, 'resumen': resumen,
        'user_id': user['id'], 'user_name': user['name'], 'at': now_iso(), **extra,
    })


async def _subir_foto(activo_id, f: UploadFile):
    content = await f.read()
    if not content:
        return None
    if len(content) > MAX_PHOTO_SIZE:
        raise HTTPException(status_code=400, detail=f'La foto supera el máximo de {MAX_PHOTO_SIZE // (1024 * 1024)} MB')
    ctype = f.content_type or 'image/jpeg'
    if not ctype.startswith('image/'):
        raise HTTPException(status_code=400, detail='El archivo debe ser una imagen')
    photo_id = new_id()
    ext = 'png' if 'png' in ctype else ('webp' if 'webp' in ctype else 'jpg')
    path = f'{storage.APP_NAME}/activos/{activo_id}/{photo_id}.{ext}'
    try:
        await storage.put_object(path, content, ctype)
    except Exception as e:
        logger.error(f'photo upload failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo subir la foto')
    return {'id': photo_id, 'path': path, 'content_type': ctype, 'at': now_iso()}


def _base(payload, cat, padre, ubic):
    nombre = _txt(payload.get('nombre'), 120)
    if not nombre:
        raise HTTPException(status_code=400, detail=f'Completa: {cat.get("nombre_label") or "Nombre"}')
    if padre:
        sucursal = padre['sucursal']
    else:
        sucursal = _txt(payload.get('sucursal'))
        if sucursal not in ubic:
            raise HTTPException(status_code=400, detail='Selecciona la sucursal o ubicación')
    return {'nombre': nombre, 'sucursal': sucursal, 'ubicacion': _txt(payload.get('ubicacion'), 120),
            'notas': _txt(payload.get('notas'), 1000)}


# ── Acceso y catálogo ────────────────────────────────────────────
@router.get('/acceso')
async def acceso(user=Depends(get_current_user)):
    """Para el menú: si la persona ve Activos y si los administra."""
    admin, visibles, _ = await _acceso(user)
    return {'ver': admin or bool(visibles), 'admin': admin}


@router.get('/meta')
async def meta(user=Depends(require_modulo('activos'))):
    admin, visibles, editables = await _acceso(user)
    if not admin and not visibles:
        raise HTTPException(status_code=403, detail='No tienes acceso a Activos')
    todas = {c['id']: c for c in await _categorias(user)}
    cats = []
    for c in visibles:
        padre = todas.get(c.get('padre_id'))
        cats.append({**c, 'puede_editar': c['id'] in editables,
                     'padre': {'id': padre['id'], 'nombre': padre['nombre']} if padre else None,
                     'hijas': [{'id': h['id'], 'nombre': h['nombre'], 'plural': h.get('plural') or h['nombre'],
                                'posicion_label': h.get('posicion_label'), 'capacidad_campo': h.get('capacidad_campo'),
                                'puede_editar': h['id'] in editables}
                               for h in todas.values() if h.get('padre_id') == c['id'] and h['id'] in {v['id'] for v in visibles}]})
    # ubicaciones de cada departamento; `sucursales` = las de la persona (los
    # admins, las de los dos) para filtrar la lista
    deptos = [d['id'] for d in await organizacion.departamentos()] if es_super_admin(user) else [departamento_de(user)]
    ubic = {d: await ubicaciones(d) for d in deptos}
    mias = [u for d in deptos for u in ubic[d]]
    for c in cats:
        c['departamento'] = depto_cat(c)
    return serialize_doc({'categorias': cats, 'sucursales': mias, 'ubicaciones': ubic, 'admin': admin,
                          'departamento': departamento_de(user), 'es_admin_sistema': es_super_admin(user),
                          'departamentos': [{'id': d['id'], 'nombre': d['nombre']} for d in await organizacion.departamentos()
                                            if d['id'] in deptos],
                          'tipos_campo': TIPOS_CAMPO, 'iconos': ICONOS})


class UbicacionesInput(BaseModel):
    ubicaciones: list
    departamento: Optional[str] = None  # solo lo elige el super admin


@router.put('/ubicaciones')
async def guardar_ubicaciones(data: UbicacionesInput, user=Depends(require_activos_admin)):
    """Ubicaciones de los activos de un departamento que no es Retail (Retail
    usa sus sucursales): las edita quien administra sus Activos o el super admin."""
    depto = (data.departamento or departamento_de(user)) if es_super_admin(user) else departamento_de(user)
    if depto == RETAIL:
        raise HTTPException(status_code=400, detail='Ventas Retail usa sus sucursales (H1, H2, H5, H6)')
    lista = []
    for u in data.ubicaciones:
        u = _txt(u, 40)
        if u and u.lower() not in {x.lower() for x in lista}:
            lista.append(u)
    if not lista:
        raise HTTPException(status_code=400, detail='Deja al menos una ubicación')
    # no se quita una ubicación que todavía tiene activos
    cats_log = [c['id'] for c in await db.activo_categorias.find({'departamento': depto}, {'_id': 0, 'id': 1}).to_list(500)]
    for quitada in set(await ubicaciones(depto)) - set(lista):
        n = await db.activos.count_documents({'categoria_id': {'$in': cats_log}, 'sucursal': quitada})
        if n:
            raise HTTPException(status_code=400, detail=f'{quitada} tiene {n} activo(s): muévelos antes de quitarla')
    await db.config.update_one({'_id': f'ubicaciones:{depto}'}, {'$set': {'ubicaciones': lista}}, upsert=True)
    return {'ubicaciones': lista}


# ── Categorías (administrador) ───────────────────────────────────
@router.get('/categorias')
async def list_categorias(user=Depends(require_activos_admin)):
    cats = await _categorias(user)
    conteo = {r['_id']: r for r in await db.activos.aggregate([
        {'$group': {'_id': '$categoria_id', 'total': {'$sum': 1},
                    'activos': {'$sum': {'$cond': [{'$eq': ['$estado', 'activo']}, 1, 0]}}}},
    ]).to_list(500)}
    ids = {u for c in cats for u in (c.get('responsables') or [])}
    users = {u['id']: u for u in await db.users.find({'id': {'$in': list(ids)}}, {'_id': 0, 'id': 1, 'name': 1, 'avatar_url': 1, 'position': 1, 'area': 1}).to_list(500)}
    for c in cats:
        c['conteo'] = {'total': conteo.get(c['id'], {}).get('total', 0), 'activos': conteo.get(c['id'], {}).get('activos', 0)}
        c['responsables_info'] = [users[u] for u in (c.get('responsables') or []) if u in users]
        c['departamento'] = depto_cat(c)
    return serialize_doc(cats)


@router.get('/usuarios')
async def list_usuarios(departamento: Optional[str] = None, user=Depends(require_activos_admin)):
    """Posibles responsables: gente del departamento (un admin elige cuál)."""
    depto = departamento if (es_super_admin(user) and departamento) else departamento_de(user)
    rows = await db.users.find({'status': 'approved', **filtro_usuarios_depto(depto)},
                               {'_id': 0, 'id': 1, 'name': 1, 'avatar_url': 1, 'position': 1, 'area': 1}).sort('name', 1).to_list(1000)
    con = await acceso.con_modulo([r['id'] for r in rows], 'activos')  # sin Activos no se le nombra responsable
    return serialize_doc([r for r in rows if r['id'] in con])


class CategoriaInput(BaseModel):
    nombre: str
    plural: Optional[str] = ''
    prefijo: str
    icono: Optional[str] = 'package'
    descripcion: Optional[str] = ''
    nombre_label: Optional[str] = ''
    nombre_ejemplo: Optional[str] = ''
    ubicacion_label: Optional[str] = ''
    ubicacion_ejemplo: Optional[str] = ''
    padre_id: Optional[str] = None
    posicion_label: Optional[str] = ''
    capacidad_campo: Optional[str] = ''
    campos: list = []
    responsables: list = []
    departamento: Optional[str] = None  # solo lo elige un admin


async def _limpiar_categoria(data: CategoriaInput, user, actual=None):
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre de la categoría')
    prefijo = _txt(data.prefijo, 10).upper()
    if not re.fullmatch(r'[A-Z]{2,5}', prefijo):
        raise HTTPException(status_code=400, detail='El prefijo debe tener de 2 a 5 letras (ej. HER, VEH)')
    # departamento: el de quien la crea; un admin lo elige (y lo cambia solo si no tiene activos)
    if es_super_admin(user) and await organizacion.existe_departamento(data.departamento):
        depto = data.departamento
    else:
        depto = depto_cat(actual) if actual else departamento_de(user)
    if actual and depto != depto_cat(actual) and await db.activos.count_documents({'categoria_id': actual['id']}):
        raise HTTPException(status_code=400, detail='No se puede cambiar de departamento: ya tiene activos')
    q_dup = {'id': {'$ne': actual['id']}} if actual else {}
    otras = await db.activo_categorias.find(q_dup, {'_id': 0, 'id': 1, 'nombre': 1, 'prefijo': 1, 'padre_id': 1, 'departamento': 1}).to_list(500)
    if any(o['nombre'].lower() == nombre.lower() for o in otras):
        raise HTTPException(status_code=400, detail=f'Ya existe la categoría {nombre}')
    if any(o['prefijo'] == prefijo for o in otras):
        raise HTTPException(status_code=400, detail=f'El prefijo {prefijo} ya lo usa otra categoría')
    if actual and prefijo != actual['prefijo'] and await db.activos.count_documents({'categoria_id': actual['id']}):
        raise HTTPException(status_code=400, detail='El prefijo no se puede cambiar: ya hay activos con códigos de esta categoría')
    icono = data.icono if data.icono in ICONOS else 'package'

    # Campos: se conserva la clave de los existentes (por id = clave); los nuevos la generan de la etiqueta.
    previas = {c['clave'] for c in (actual or {}).get('campos', [])}
    if len(data.campos) > MAX_CAMPOS:
        raise HTTPException(status_code=400, detail=f'Máximo {MAX_CAMPOS} campos por categoría')
    campos, usadas = [], set()
    for raw in data.campos:
        etiqueta = _txt(raw.get('etiqueta'), 60)
        if not etiqueta:
            raise HTTPException(status_code=400, detail='Hay un campo sin nombre')
        tipo = raw.get('tipo')
        if tipo not in TIPOS_CAMPO:
            raise HTTPException(status_code=400, detail=f'{etiqueta}: tipo de campo no válido')
        clave = raw.get('clave') if raw.get('clave') in previas else None
        if not clave:
            base = _slug(etiqueta)
            clave, n = base, 2
            while clave in usadas or clave in previas:
                clave, n = f'{base}_{n}', n + 1
        if clave in usadas:
            raise HTTPException(status_code=400, detail=f'El campo {etiqueta} está repetido')
        usadas.add(clave)
        campo = {'clave': clave, 'etiqueta': etiqueta, 'tipo': tipo, 'obligatorio': bool(raw.get('obligatorio'))}
        if tipo == 'opcion':
            opciones = []
            for o in raw.get('opciones') or []:
                o = _txt(o, 60)
                if o and o not in opciones:
                    opciones.append(o)
            if not opciones:
                raise HTTPException(status_code=400, detail=f'{etiqueta}: agrega al menos una opción')
            campo['opciones'] = opciones[:50]
        campos.append(campo)
    etiquetas = [c['etiqueta'].lower() for c in campos]
    if len(set(etiquetas)) != len(etiquetas):
        raise HTTPException(status_code=400, detail='Hay dos campos con el mismo nombre')

    # Pertenece a otra categoría (un solo nivel: la madre no puede tener madre)
    padre_id = _txt(data.padre_id) or None
    posicion_label, capacidad_campo = '', ''
    if padre_id:
        madre = next((o for o in otras if o['id'] == padre_id), None)
        if not madre:
            raise HTTPException(status_code=400, detail='La categoría a la que pertenece no existe')
        if madre.get('padre_id'):
            raise HTTPException(status_code=400, detail=f'{madre["nombre"]} ya pertenece a otra categoría: solo se permite un nivel')
        if depto_cat(madre) != depto:
            raise HTTPException(status_code=400, detail=f'{madre["nombre"]} es de otro departamento')
        if actual and any(o.get('padre_id') == actual['id'] for o in otras):
            raise HTTPException(status_code=400, detail='Otras categorías pertenecen a esta: no puede pertenecer a otra')
        posicion_label = _txt(data.posicion_label, 30)
        if posicion_label:
            madre_full = await db.activo_categorias.find_one({'id': padre_id}, {'_id': 0, 'campos': 1})
            numericos = {c['clave'] for c in madre_full.get('campos', []) if c['tipo'] == 'numero'}
            capacidad_campo = data.capacidad_campo if data.capacidad_campo in numericos else ''
    if actual and (actual.get('padre_id') or None) != padre_id and await db.activos.count_documents({'categoria_id': actual['id']}):
        raise HTTPException(status_code=400, detail='No se puede cambiar a qué pertenece: ya hay activos en esta categoría')

    ids = [u for u in dict.fromkeys(_txt(u) for u in data.responsables) if u]
    # responsables: solo gente del departamento de la categoría
    validos = {u['id'] for u in await db.users.find({'id': {'$in': ids}, **filtro_usuarios_depto(depto)}, {'_id': 0, 'id': 1}).to_list(500)}
    validos &= await acceso.con_modulo(ids, 'activos')
    return {
        'departamento': depto,
        'nombre': nombre, 'plural': _txt(data.plural, 60) or nombre, 'prefijo': prefijo, 'icono': icono,
        'descripcion': _txt(data.descripcion, 300),
        'nombre_label': _txt(data.nombre_label, 40) or 'Nombre', 'nombre_ejemplo': _txt(data.nombre_ejemplo, 80),
        'ubicacion_label': _txt(data.ubicacion_label, 40) or 'Ubicación', 'ubicacion_ejemplo': _txt(data.ubicacion_ejemplo, 80),
        'padre_id': padre_id, 'posicion_label': posicion_label, 'capacidad_campo': capacidad_campo,
        'campos': campos, 'responsables': [u for u in ids if u in validos],
    }


async def _log_cat(accion, cat, user, **extra):
    await db.activos_log.insert_one({
        'id': new_id(), 'accion': accion, 'categoria_id': cat['id'], 'categoria': cat['nombre'],
        'user_id': user['id'], 'user_name': user['name'], 'at': now_iso(), **extra,
    })


async def _categoria_mia(cat_id, user):
    """Categoría del departamento de quien la administra (404 si es de otro)."""
    actual = await db.activo_categorias.find_one({'id': cat_id, **filtro_depto(user)}, {'_id': 0})
    if not actual:
        raise HTTPException(status_code=404, detail='Categoría no encontrada')
    return actual


@router.post('/categorias')
async def create_categoria(data: CategoriaInput, user=Depends(require_activos_admin)):
    doc = {'id': new_id(), **await _limpiar_categoria(data, user), 'orden': await db.activo_categorias.count_documents({}),
           'created_at': now_iso(), 'created_by_name': user['name']}
    await db.activo_categorias.insert_one(doc)
    doc.pop('_id', None)
    await _log_cat('categoria_creada', doc, user)
    return serialize_doc(doc)


@router.put('/categorias/{cat_id}')
async def update_categoria(cat_id: str, data: CategoriaInput, user=Depends(require_activos_admin)):
    actual = await _categoria_mia(cat_id, user)
    nuevo = await _limpiar_categoria(data, user, actual)
    cambios = [k for k in nuevo if actual.get(k) != nuevo[k]]
    if not cambios:
        return serialize_doc(actual)
    await db.activo_categorias.update_one({'id': cat_id}, {'$set': {**nuevo, 'updated_at': now_iso(), 'updated_by': user['name']}})
    await _log_cat('categoria_editada', {**actual, **nuevo}, user, campos=cambios, antes=actual)
    return serialize_doc(await db.activo_categorias.find_one({'id': cat_id}, {'_id': 0}))


@router.delete('/categorias/{cat_id}')
async def delete_categoria(cat_id: str, user=Depends(require_activos_admin)):
    actual = await _categoria_mia(cat_id, user)
    n = await db.activos.count_documents({'categoria_id': cat_id})
    if n:
        raise HTTPException(status_code=400, detail=f'Tiene {n} activo(s) registrados: no se puede eliminar')
    hija = await db.activo_categorias.find_one({'padre_id': cat_id}, {'_id': 0, 'nombre': 1})
    if hija:
        raise HTTPException(status_code=400, detail=f'La categoría {hija["nombre"]} pertenece a esta: cámbiala primero')
    await _log_cat('categoria_eliminada', actual, user, snapshot=actual)
    await db.activo_categorias.delete_one({'id': cat_id})
    return {'message': f'Categoría {actual["nombre"]} eliminada'}


# ── Lista ────────────────────────────────────────────────────────
@router.get('')
async def list_activos(categoria: Optional[str] = None, sucursal: Optional[str] = None, estado: Optional[str] = None,
                       padre_id: Optional[str] = None, user=Depends(require_modulo('activos'))):
    admin, visibles, _ = await _acceso(user)
    ver = {c['id'] for c in visibles}
    query = {'categoria_id': {'$in': list(ver)}}
    if categoria:
        query['categoria_id'] = categoria if categoria in ver else '__ninguna__'
    if sucursal:
        query['sucursal'] = sucursal
    if estado:
        query['estado'] = estado
    if padre_id:
        query['padre_id'] = padre_id
    rows = await db.activos.find(query, {'_id': 0}).to_list(5000)
    padres_ids = list({r['padre_id'] for r in rows if r.get('padre_id')})
    padres = {p['id']: p for p in await db.activos.find({'id': {'$in': padres_ids}}, {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1}).to_list(len(padres_ids) or 1)}
    conteo = {r['_id']: r['n'] for r in await db.activos.aggregate([
        {'$match': {'padre_id': {'$in': [r['id'] for r in rows]}, 'estado': 'activo'}},
        {'$group': {'_id': '$padre_id', 'n': {'$sum': 1}}},
    ]).to_list(5000)}
    for r in rows:
        p = padres.get(r.get('padre_id'))
        r['padre'] = {'id': p['id'], 'codigo': p['codigo'], 'nombre': p['nombre']} if p else None
        r['hijos'] = conteo.get(r['id'], 0)
    # por sucursal, cada activo seguido de los que le pertenecen (por posición)
    rows.sort(key=lambda r: (r['sucursal'], (r['padre'] or {}).get('codigo') or r['codigo'],
                             0 if not r.get('padre_id') else 1, r.get('posicion') or 0, r['codigo']))
    return serialize_doc(rows)


@router.get('/resumen')
async def resumen(user=Depends(require_modulo('activos'))):
    """Activos en uso por categoría y sucursal (tarjetas de arriba)."""
    _, visibles, _ = await _acceso(user)
    ver = [c['id'] for c in visibles]
    rows = await db.activos.aggregate([
        {'$match': {'categoria_id': {'$in': ver}, 'estado': 'activo'}},
        {'$group': {'_id': {'c': '$categoria_id', 's': '$sucursal'}, 'n': {'$sum': 1}}},
    ]).to_list(2000)
    out = {c: {'total': 0, 'por_sucursal': {}} for c in ver}
    for r in rows:
        t = out[r['_id']['c']]
        t['total'] += r['n']
        t['por_sucursal'][r['_id']['s']] = r['n']
    bajas = await db.activos.count_documents({'categoria_id': {'$in': ver}, 'estado': 'baja'})
    return {'categorias': out, 'bajas': bajas}


@router.get('/padres/{cat_id}')
async def list_padres(cat_id: str, user=Depends(require_modulo('activos'))):
    """Activos en uso de la categoría madre, para elegir a cuál pertenece uno
    nuevo (aunque la persona no sea responsable de la categoría madre)."""
    _, _, editables = await _acceso(user)
    _puede_editar(editables, cat_id)
    cat = await _categoria(cat_id)
    if not cat.get('padre_id'):
        return []
    rows = await db.activos.find({'categoria_id': cat['padre_id'], 'estado': 'activo'},
                                 {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'sucursal': 1, 'datos': 1}).sort('codigo', 1).to_list(2000)
    ocupadas = {}
    async for h in db.activos.find({'categoria_id': cat_id, 'estado': 'activo', 'padre_id': {'$in': [r['id'] for r in rows]}},
                                   {'_id': 0, 'id': 1, 'padre_id': 1, 'posicion': 1}):
        ocupadas.setdefault(h['padre_id'], []).append({'id': h['id'], 'posicion': h.get('posicion')})
    for r in rows:
        r['capacidad'] = (r.get('datos') or {}).get(cat.get('capacidad_campo') or '') if cat.get('capacidad_campo') else None
        r['ocupadas'] = ocupadas.get(r['id'], [])
        r.pop('datos', None)
    return serialize_doc(rows)


# ── Registrar ────────────────────────────────────────────────────
@router.post('')
async def create_activo(data: str = Form(...), foto: Optional[UploadFile] = File(default=None),
                        user=Depends(require_modulo('activos'))):
    try:
        payload = json.loads(data)
    except Exception:
        raise HTTPException(status_code=400, detail='Datos del activo inválidos')
    _, _, editables = await _acceso(user)
    cat = await _categoria(payload.get('categoria_id'))
    _puede_editar(editables, cat['id'])
    padre, posicion = await _padre_y_posicion(cat, payload.get('padre_id'), payload.get('posicion'))
    doc = {
        'id': new_id(), 'categoria_id': cat['id'], **_base(payload, cat, padre, await ubicaciones(depto_cat(cat))),
        'padre_id': padre['id'] if padre else None, 'posicion': posicion,
        'datos': _datos(cat, payload.get('datos')), 'estado': 'activo', 'foto': None,
        'created_at': now_iso(), 'created_by': user['id'], 'created_by_name': user['name'],
    }
    if foto is not None:
        doc['foto'] = await _subir_foto(doc['id'], foto)
    doc['codigo'] = await _codigo(cat)
    await db.activos.insert_one(doc)
    doc.pop('_id', None)
    donde = f' en {padre["codigo"]}' + (f' {cat["posicion_label"].lower()} {posicion}' if posicion else '') if padre else ''
    await _historial(doc, 'alta', f'Registrado {doc["codigo"]} · {doc["nombre"]}{donde}', user)
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       'registró el activo', f'{doc["codigo"]} · {doc["nombre"]} ({doc["sucursal"]})', 'activos')
    return serialize_doc(doc)


class LoteInput(BaseModel):
    categoria_id: str
    padre_id: str
    datos: dict  # campos comunes
    items: list  # [{posicion, nombre, ubicacion, datos: {...}}]


@router.post('/lote')
async def create_lote(data: LoteInput, user=Depends(require_modulo('activos'))):
    """Registra varios activos que pertenecen a un mismo activo, uno por
    posición (p. ej. las cámaras de un NVR, una por canal)."""
    _, _, editables = await _acceso(user)
    cat = await _categoria(data.categoria_id)
    _puede_editar(editables, cat['id'])
    if not cat.get('padre_id') or not cat.get('posicion_label'):
        raise HTTPException(status_code=400, detail='Esta categoría no se registra por posiciones')
    if not data.items:
        raise HTTPException(status_code=400, detail='Agrega al menos uno')
    if len(data.items) > 256:
        raise HTTPException(status_code=400, detail='Demasiados en un solo registro')
    posiciones = [str(i.get('posicion')) for i in data.items]
    if len(set(posiciones)) != len(posiciones):
        raise HTTPException(status_code=400, detail=f'Hay posiciones repetidas en la lista ({cat["posicion_label"].lower()})')
    label = cat['posicion_label']
    docs = []
    for it in data.items:  # validar todo antes de guardar nada
        padre, posicion = await _padre_y_posicion(cat, data.padre_id, it.get('posicion'))
        try:
            base = _base(it, cat, padre, await ubicaciones(depto_cat(cat)))
            datos = _datos(cat, {**data.datos, **(it.get('datos') or {})})
        except HTTPException as e:
            raise HTTPException(status_code=400, detail=f'{label} {posicion}: {e.detail}')
        docs.append({
            'id': new_id(), 'categoria_id': cat['id'], **base, 'padre_id': padre['id'], 'posicion': posicion,
            'datos': datos, 'estado': 'activo', 'foto': None,
            'created_at': now_iso(), 'created_by': user['id'], 'created_by_name': user['name'],
        })
    docs.sort(key=lambda d: d['posicion'])
    for d in docs:
        d['codigo'] = await _codigo(cat)
        await db.activos.insert_one(d)
        d.pop('_id', None)
        await _historial(d, 'alta', f'Registrado {d["codigo"]} · {d["nombre"]} en {padre["codigo"]} {label.lower()} {d["posicion"]}', user)
    await log_activity(user['id'], user['name'], user.get('avatar_url'),
                       f'registró {len(docs)} {cat.get("plural") or cat["nombre"]} en', f'{padre["codigo"]} · {padre["nombre"]} ({padre["sucursal"]})', 'activos')
    return serialize_doc(docs)


# ── Ficha ────────────────────────────────────────────────────────
async def _get(activo_id, user, editar=False):
    row = await db.activos.find_one({'id': activo_id}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Activo no encontrado')
    admin, visibles, editables = await _acceso(user)
    if row['categoria_id'] not in {c['id'] for c in visibles}:
        raise HTTPException(status_code=403, detail='No tienes acceso a esta categoría de activos')
    if editar:
        _puede_editar(editables, row['categoria_id'])
    return row


@router.get('/{activo_id}')
async def get_activo(activo_id: str, user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user)
    padre = None
    if row.get('padre_id'):
        padre = await db.activos.find_one({'id': row['padre_id']}, {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'sucursal': 1, 'categoria_id': 1, 'estado': 1})
    hijos = await db.activos.find({'padre_id': activo_id}, {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'ubicacion': 1, 'categoria_id': 1,
                                                            'posicion': 1, 'estado': 1, 'datos': 1}).sort([('estado', 1), ('posicion', 1), ('codigo', 1)]).to_list(1000)
    historial = await db.activo_historial.find({'activo_id': activo_id}, {'_id': 0}).sort('at', -1).limit(300).to_list(300)
    return serialize_doc({'activo': row, 'padre': padre, 'hijos': hijos, 'historial': historial})


# ── Editar ───────────────────────────────────────────────────────
class ActivoUpdate(BaseModel):
    nombre: str
    sucursal: Optional[str] = None
    ubicacion: Optional[str] = ''
    padre_id: Optional[str] = None
    posicion: Optional[int] = None
    notas: Optional[str] = ''
    datos: dict = {}


def _fmt(v):
    return '—' if v in (None, '') else str(v)


@router.put('/{activo_id}')
async def update_activo(activo_id: str, data: ActivoUpdate, user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user, editar=True)
    if row['estado'] != 'activo':
        raise HTTPException(status_code=400, detail='Reactiva el activo antes de editarlo')
    cat = await _categoria(row['categoria_id'])
    payload = data.dict()
    padre, posicion = await _padre_y_posicion(cat, payload.get('padre_id'), payload.get('posicion'), excluir_id=activo_id)
    nuevo = {**_base(payload, cat, padre, await ubicaciones(depto_cat(cat))), 'padre_id': padre['id'] if padre else None, 'posicion': posicion,
             'datos': _datos(cat, payload.get('datos'), row.get('datos'))}
    # Si es madre con posiciones numeradas, no puede quedar con menos capacidad que las ocupadas
    for hija in await db.activo_categorias.find({'padre_id': cat['id'], 'capacidad_campo': {'$nin': ['', None]}}, {'_id': 0}).to_list(50):
        maximo = nuevo['datos'].get(hija['capacidad_campo']) or 0
        fuera = await db.activos.find_one({'padre_id': activo_id, 'categoria_id': hija['id'], 'estado': 'activo', 'posicion': {'$gt': maximo}},
                                          {'_id': 0, 'codigo': 1, 'posicion': 1})
        if fuera:
            raise HTTPException(status_code=400, detail=f'{fuera["codigo"]} está en el {hija["posicion_label"].lower()} {fuera["posicion"]}: no puede quedar con menos')

    campos, ubic = [], []
    for k, lbl in CAMPOS_BASE.items():
        if row.get(k) != nuevo.get(k):
            (ubic if k in UBICACION_KEYS else campos).append(lbl)
    for c in cat['campos']:
        if (row.get('datos') or {}).get(c['clave']) != nuevo['datos'].get(c['clave']):
            campos.append(c['etiqueta'] if c['etiqueta'].startswith('N°') else c['etiqueta'].lower())
    if not campos and not ubic:
        return serialize_doc(row)

    await db.activos.update_one({'id': activo_id}, {'$set': {**nuevo, 'updated_at': now_iso(), 'updated_by': user['name']}})
    if nuevo['sucursal'] != row['sucursal']:
        # los activos que le pertenecen se mueven de sucursal con él (y queda en su historial)
        for h in await db.activos.find({'padre_id': activo_id}, {'_id': 0, 'id': 1}).to_list(1000):
            await _historial(h, 'cambio_ubicacion', f'Cambio de sucursal con {row["codigo"]}: {row["sucursal"]} → {nuevo["sucursal"]}',
                             user, campos=['sucursal'])
        await db.activos.update_many({'padre_id': activo_id}, {'$set': {'sucursal': nuevo['sucursal']}})
    if ubic:
        antes = ' · '.join(x for x in [row['sucursal'], row.get('ubicacion')] if x)
        despues = ' · '.join(x for x in [nuevo['sucursal'], nuevo.get('ubicacion')] if x)
        if padre and (row.get('padre_id') != nuevo['padre_id'] or row.get('posicion') != posicion):
            despues += f' · {padre["codigo"]}' + (f' {cat["posicion_label"].lower()} {posicion}' if posicion else '')
        await _historial(row, 'cambio_ubicacion', f'Cambio de ubicación: {_fmt(antes)} → {_fmt(despues)}', user, campos=ubic)
    if campos:
        await _historial(row, 'edicion', 'Datos editados: ' + ', '.join(campos), user, campos=campos)
    return serialize_doc(await db.activos.find_one({'id': activo_id}, {'_id': 0}))


@router.put('/{activo_id}/foto')
async def put_foto(activo_id: str, foto: UploadFile = File(...), user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user, editar=True)
    ph = await _subir_foto(activo_id, foto)
    if not ph:
        raise HTTPException(status_code=400, detail='La foto está vacía')
    cambio = {'$set': {'foto': ph, 'updated_at': now_iso(), 'updated_by': user['name']}}
    if row.get('foto'):
        # la anterior se conserva
        cambio['$push'] = {'fotos_anteriores': row['foto']}
    await db.activos.update_one({'id': activo_id}, cambio)
    await _historial(row, 'foto', 'Foto actualizada' if row.get('foto') else 'Foto agregada', user, foto=ph)
    return serialize_doc(await db.activos.find_one({'id': activo_id}, {'_id': 0}))


@router.get('/{activo_id}/foto/{photo_id}')
async def get_foto(activo_id: str, photo_id: str, user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user)
    fotos = [row.get('foto')] + (row.get('fotos_anteriores') or [])
    photo = next((p for p in fotos if p and p['id'] == photo_id), None)
    if not photo:
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    try:
        content, ctype = await storage.get_object(photo['path'])
    except Exception as e:
        logger.error(f'photo download failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=photo.get('content_type', ctype))


# ── Baja, reactivar, eliminar ────────────────────────────────────
class BajaInput(BaseModel):
    motivo: str


@router.post('/{activo_id}/baja')
async def dar_baja(activo_id: str, data: BajaInput, user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user, editar=True)
    motivo = _txt(data.motivo, 500)
    if not motivo:
        raise HTTPException(status_code=400, detail='Escribe el motivo de la baja')
    if row['estado'] == 'baja':
        raise HTTPException(status_code=400, detail='El activo ya está dado de baja')
    n = await db.activos.count_documents({'padre_id': activo_id, 'estado': 'activo'})
    if n:
        raise HTTPException(status_code=400, detail=f'Tiene {n} activo(s) en uso que le pertenecen: dalos de baja o muévelos primero')
    await db.activos.update_one({'id': activo_id}, {'$set': {
        'estado': 'baja', 'baja_motivo': motivo, 'baja_at': now_iso(), 'baja_by': user['name']}})
    await _historial(row, 'baja', f'Dado de baja: {motivo}', user)
    return serialize_doc(await db.activos.find_one({'id': activo_id}, {'_id': 0}))


@router.post('/{activo_id}/reactivar')
async def reactivar(activo_id: str, user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user, editar=True)
    if row['estado'] == 'activo':
        raise HTTPException(status_code=400, detail='El activo ya está en uso')
    if row.get('padre_id'):
        # revalida que el padre siga activo y la posición libre
        await _padre_y_posicion(await _categoria(row['categoria_id']), row['padre_id'], row.get('posicion'), excluir_id=activo_id)
    await db.activos.update_one({'id': activo_id}, {'$set': {'estado': 'activo'},
                                                    '$unset': {'baja_motivo': '', 'baja_at': '', 'baja_by': ''}})
    await _historial(row, 'reactivacion', 'Reactivado', user)
    return serialize_doc(await db.activos.find_one({'id': activo_id}, {'_id': 0}))


@router.delete('/{activo_id}')
async def delete_activo(activo_id: str, user=Depends(require_modulo('activos'))):
    row = await _get(activo_id, user, editar=True)
    if await db.activos.count_documents({'padre_id': activo_id}):
        raise HTTPException(status_code=400, detail='No se puede eliminar: tiene activos que le pertenecen')
    await db.activos_log.insert_one({
        'id': new_id(), 'accion': 'eliminado', 'activo_id': activo_id, 'codigo': row['codigo'],
        'user_id': user['id'], 'user_name': user['name'], 'at': now_iso(), 'snapshot': row,
    })
    await db.activos.delete_one({'id': activo_id})
    return {'message': f'{row["codigo"]} eliminado'}
