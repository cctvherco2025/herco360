"""Grupos de usuarios — SOLO para facilitar agregar participantes en la Agenda.

No dan permisos, no cambian jerarquías ni afectan nada más: un grupo es un
nombre, un color y una lista de ids de usuario. Al elegir un grupo en "Nueva
actividad" se agregan sus integrantes como participantes individuales, así
que eliminar o editar un grupo no toca actividades ya creadas.

- Ver (listar): solo los integrantes del grupo, quien lo creó y los admins.
- Crear: cualquier usuario logueado.
- Editar / eliminar: solo quien lo creó y los admins.
- El nombre es único entre los grupos que cada usuario puede ver (no entre
  grupos ajenos que ni siquiera ve).
- Si un usuario se elimina o se rechaza, sale de todos los grupos
  (quitar_de_grupos). Además, al listar solo se devuelven integrantes
  aprobados, por si quedara alguno viejo.
"""
import re
import unicodedata
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core import db, get_current_user, serialize_doc, new_id, now_iso

router = APIRouter(prefix='/groups', tags=['groups'])

MAX_NOMBRE = 50
MAX_DESCRIPCION = 80
HEX_COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
COLOR_DEFAULT = '#00a5df'


class GroupInput(BaseModel):
    nombre: str
    descripcion: Optional[str] = ''
    color: Optional[str] = COLOR_DEFAULT
    miembros: List[str] = []


def _nombre_key(nombre: str) -> str:
    """Clave para 'único sin importar mayúsculas/tildes/espacios'."""
    t = unicodedata.normalize('NFD', nombre).encode('ascii', 'ignore').decode('ascii')
    return ' '.join(t.lower().split())


def _es_admin(user) -> bool:
    return user.get('role') == 'admin'


def puede_ver(user, g: dict) -> bool:
    """Integrantes, quien lo creó y admins."""
    return _es_admin(user) or g.get('creado_por') == user['id'] or user['id'] in (g.get('miembros') or [])


def puede_editar(user, g: dict) -> bool:
    """Solo quien lo creó y admins."""
    return _es_admin(user) or g.get('creado_por') == user['id']


async def quitar_de_grupos(user_id: str) -> None:
    """Saca a un usuario de todos los grupos (al eliminarlo o rechazarlo)."""
    await db.user_groups.update_many({'miembros': user_id},
                                     {'$pull': {'miembros': user_id}, '$set': {'fecha_actualizacion': now_iso()}})


async def _validar(data: GroupInput, user: dict, group_id: Optional[str] = None) -> dict:
    nombre = ' '.join((data.nombre or '').split())
    if not nombre:
        raise HTTPException(status_code=400, detail='Indica el nombre del grupo')
    if len(nombre) > MAX_NOMBRE:
        raise HTTPException(status_code=400, detail=f'El nombre admite máximo {MAX_NOMBRE} caracteres')
    descripcion = ' '.join((data.descripcion or '').split())
    if len(descripcion) > MAX_DESCRIPCION:
        raise HTTPException(status_code=400, detail=f'La descripción admite máximo {MAX_DESCRIPCION} caracteres')
    color = (data.color or COLOR_DEFAULT).strip()
    if not HEX_COLOR.match(color):
        raise HTTPException(status_code=400, detail='Color inválido')

    # único entre los grupos que este usuario puede ver
    key = _nombre_key(nombre)
    mismos = await db.user_groups.find({'nombre_key': key, **({'id': {'$ne': group_id}} if group_id else {})},
                                       {'_id': 0, 'id': 1, 'creado_por': 1, 'miembros': 1}).to_list(100)
    if any(puede_ver(user, g) for g in mismos):
        raise HTTPException(status_code=409, detail='Ya existe un grupo con ese nombre')

    # solo usuarios aprobados que existen; sin repetidos, en el orden recibido
    pedidos = list(dict.fromkeys(i for i in data.miembros if i))
    validos = {u['id'] for u in await db.users.find({'id': {'$in': pedidos}, 'status': 'approved'}, {'_id': 0, 'id': 1}).to_list(2000)}
    miembros = [i for i in pedidos if i in validos]
    if not miembros:
        raise HTTPException(status_code=400, detail='Agrega al menos un integrante')
    return {'nombre': nombre, 'nombre_key': key, 'descripcion': descripcion, 'color': color, 'miembros': miembros}


def _publico(g: dict, aprobados: set, user: dict) -> dict:
    out = {k: v for k, v in g.items() if k not in ('_id', 'nombre_key')}
    out['miembros'] = [i for i in g.get('miembros', []) if i in aprobados]
    out['puede_editar'] = puede_editar(user, g)  # para mostrar Editar/Eliminar
    return out


async def _grupo_visible_o_404(group_id: str, user: dict) -> dict:
    """Un grupo que el usuario no puede ver se trata como inexistente."""
    g = await db.user_groups.find_one({'id': group_id}, {'_id': 0})
    if not g or not puede_ver(user, g):
        raise HTTPException(status_code=404, detail='Grupo no encontrado')
    return g


@router.get('')
async def list_groups(user=Depends(get_current_user)):
    """Solo los grupos que el usuario puede ver: donde es integrante, los que
    creó, o todos si es admin."""
    q = {} if _es_admin(user) else {'$or': [{'miembros': user['id']}, {'creado_por': user['id']}]}
    grupos = await db.user_groups.find(q, {'_id': 0}).to_list(500)
    aprobados = {u['id'] for u in await db.users.find({'status': 'approved'}, {'_id': 0, 'id': 1}).to_list(5000)}
    out = [_publico(g, aprobados, user) for g in grupos if puede_ver(user, g)]
    out.sort(key=lambda g: _nombre_key(g['nombre']))
    return serialize_doc(out)


@router.post('')
async def create_group(data: GroupInput, user=Depends(get_current_user)):
    campos = await _validar(data, user)
    ts = now_iso()
    doc = {'id': new_id(), **campos, 'creado_por': user['id'], 'creado_por_nombre': user.get('name'),
           'fecha_creacion': ts, 'fecha_actualizacion': ts}
    await db.user_groups.insert_one(doc)
    return serialize_doc(_publico(doc, set(campos['miembros']), user))


@router.put('/{group_id}')
async def update_group(group_id: str, data: GroupInput, user=Depends(get_current_user)):
    g = await _grupo_visible_o_404(group_id, user)
    if not puede_editar(user, g):
        raise HTTPException(status_code=403, detail='Solo quien creó el grupo o un administrador puede editarlo')
    campos = await _validar(data, user, group_id)
    await db.user_groups.update_one({'id': group_id}, {'$set': {**campos, 'fecha_actualizacion': now_iso()}})
    g = await db.user_groups.find_one({'id': group_id}, {'_id': 0})
    return serialize_doc(_publico(g, set(campos['miembros']), user))


@router.delete('/{group_id}')
async def delete_group(group_id: str, user=Depends(get_current_user)):
    """Solo borra el grupo: los usuarios y las actividades no se tocan."""
    g = await _grupo_visible_o_404(group_id, user)
    if not puede_editar(user, g):
        raise HTTPException(status_code=403, detail='Solo quien creó el grupo o un administrador puede eliminarlo')
    await db.user_groups.delete_one({'id': group_id})
    return {'message': 'Grupo eliminado'}
