"""Inventory module routes (Productos / Tiendas / Movimientos). Restricted access."""
import re
from fastapi import APIRouter, HTTPException, Depends
from core import db, require_inventory_access, serialize_doc, new_id, now_iso
from models import InventoryIntake, InventoryMovementInput, CatalogItemInput, SUCURSALES

router = APIRouter(prefix='/inventory', tags=['inventory'])


@router.get('/meta')
async def meta(user=Depends(require_inventory_access)):
    return {'sucursales': SUCURSALES}


# ---- Article catalog (autocomplete source) ----
@router.get('/catalog')
async def catalog(q: str = '', user=Depends(require_inventory_access)):
    query = {}
    if q and q.strip():
        query['name_key'] = {'$regex': re.escape(q.strip().lower())}
    items = await db.inventory_catalog.find(query, {'_id': 0, 'name': 1}).sort('name', 1).limit(15).to_list(15)
    return [i['name'] for i in items]


@router.post('/catalog')
async def add_catalog_item(data: CatalogItemInput, user=Depends(require_inventory_access)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail='Nombre vacío')
    await db.inventory_catalog.update_one(
        {'name_key': name.lower()},
        {'$setOnInsert': {'id': new_id(), 'name': name, 'name_key': name.lower(), 'created_at': now_iso()}},
        upsert=True)
    return {'message': 'ok', 'name': name}


# ---- Stock ----
@router.get('/stock')
async def stock(sucursal: str = None, q: str = None, user=Depends(require_inventory_access)):
    query = {'quantity': {'$gt': 0}}
    if sucursal:
        query['sucursal'] = sucursal
    if q and q.strip():
        query['article_key'] = {'$regex': re.escape(q.strip().lower())}
    items = await db.inventory_stock.find(query, {'_id': 0}).sort('article', 1).to_list(2000)
    return serialize_doc(items)


@router.get('/summary')
async def summary(user=Depends(require_inventory_access)):
    result = []
    for suc in SUCURSALES:
        rows = await db.inventory_stock.find({'sucursal': suc, 'quantity': {'$gt': 0}}, {'_id': 0, 'quantity': 1}).to_list(5000)
        result.append({
            'sucursal': suc,
            'items_count': len(rows),
            'total_qty': sum(r['quantity'] for r in rows),
        })
    return result


# ---- Intake (inventory an article) ----
@router.post('/intake')
async def intake(data: InventoryIntake, user=Depends(require_inventory_access)):
    article = (data.article or '').strip()
    if not article:
        raise HTTPException(status_code=400, detail='Indica el artículo')
    if data.sucursal not in SUCURSALES:
        raise HTTPException(status_code=400, detail='Sucursal inválida')
    if data.quantity is None or data.quantity <= 0:
        raise HTTPException(status_code=400, detail='La cantidad debe ser mayor a 0')

    key = article.lower()
    existing = await db.inventory_stock.find_one({'article_key': key, 'sucursal': data.sucursal})
    if existing:
        new_qty = existing['quantity'] + data.quantity
        await db.inventory_stock.update_one({'id': existing['id']}, {'$set': {'quantity': new_qty, 'article': article, 'updated_at': now_iso()}})
    else:
        new_qty = data.quantity
        await db.inventory_stock.insert_one({
            'id': new_id(), 'article': article, 'article_key': key,
            'sucursal': data.sucursal, 'quantity': data.quantity,
            'created_at': now_iso(), 'updated_at': now_iso(),
        })

    # keep catalog updated for autocomplete
    await db.inventory_catalog.update_one(
        {'name_key': key},
        {'$setOnInsert': {'id': new_id(), 'name': article, 'name_key': key, 'created_at': now_iso()}},
        upsert=True)

    await db.inventory_movements.insert_one({
        'id': new_id(), 'type': 'entrada', 'article': article, 'sucursal': data.sucursal,
        'quantity': data.quantity, 'description': 'Ingreso a inventario', 'solicitante': '',
        'registered_by': user['id'], 'registered_by_name': user['name'],
        'registered_by_avatar': user.get('avatar_url'), 'created_at': now_iso(),
    })
    return {'message': 'Artículo inventariado', 'article': article, 'sucursal': data.sucursal, 'stock': new_qty}


# ---- Movement (rebaja / salida) ----
@router.post('/movement')
async def movement(data: InventoryMovementInput, user=Depends(require_inventory_access)):
    article = (data.article or '').strip()
    if not article:
        raise HTTPException(status_code=400, detail='Indica el artículo')
    if data.sucursal not in SUCURSALES:
        raise HTTPException(status_code=400, detail='Sucursal inválida')
    if data.quantity is None or data.quantity <= 0:
        raise HTTPException(status_code=400, detail='La cantidad debe ser mayor a 0')
    if not (data.description or '').strip():
        raise HTTPException(status_code=400, detail='La descripción del movimiento es obligatoria')

    key = article.lower()
    existing = await db.inventory_stock.find_one({'article_key': key, 'sucursal': data.sucursal})
    available = existing['quantity'] if existing else 0
    if data.quantity > available:
        raise HTTPException(status_code=409, detail=f'Stock insuficiente en {data.sucursal}. Disponible: {available}')

    new_qty = available - data.quantity
    await db.inventory_stock.update_one({'id': existing['id']}, {'$set': {'quantity': new_qty, 'updated_at': now_iso()}})

    await db.inventory_movements.insert_one({
        'id': new_id(), 'type': 'salida', 'article': article, 'sucursal': data.sucursal,
        'quantity': data.quantity, 'description': data.description.strip(),
        'solicitante': (data.solicitante or '').strip(),
        'registered_by': user['id'], 'registered_by_name': user['name'],
        'registered_by_avatar': user.get('avatar_url'), 'created_at': now_iso(),
    })
    return {'message': 'Movimiento registrado', 'article': article, 'sucursal': data.sucursal, 'stock': new_qty}


@router.get('/movements')
async def movements(sucursal: str = None, type: str = None, user=Depends(require_inventory_access)):
    query = {}
    if sucursal:
        query['sucursal'] = sucursal
    if type:
        query['type'] = type
    items = await db.inventory_movements.find(query, {'_id': 0}).sort('created_at', -1).limit(300).to_list(300)
    return serialize_doc(items)
