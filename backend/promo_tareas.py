"""Promociones del mes: tareas por tienda × categoría.

Al publicar una publicación de Promociones (con `flujo_tareas`), se crea una
tarea por cada tienda que participa (core.PROMO_TIENDAS) y cada categoría de la
publicación. La tarea nace sin responsable: queda a nombre de quien elige esa
tienda y categoría al contestar (coordinador o jefe de tienda: hay jefes que
también coordinan una categoría), y a partir de ahí nadie más puede contestarla.
La revisan los jefes y el gerente de esa tienda (nunca quien la contestó).
Las publicaciones viejas (sin `flujo_tareas`) no tienen tareas y siguen igual.

Estados de una tarea: pendiente → enviada (etapa 3 agrega revisión y tickets);
cancelada si su categoría sale de la publicación al editarla.
"""
from fastapi import APIRouter, Depends, HTTPException

from core import (db, get_current_user, serialize_doc, new_id, now_iso, PROMO_TIENDAS,
                  JEFE_TIENDA, tienda_promos, es_revisor_tienda, es_coordinador_tienda,
                  require_promociones_mes_access)
from notifications import create_notification, notify_admins

router = APIRouter(prefix='/promo-tareas', tags=['promo-tareas'])

_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
          'septiembre', 'octubre', 'noviembre', 'diciembre']


def periodo_label(periodo: str) -> str:
    try:
        y, m = periodo.split('-')
        return f'{_MESES[int(m) - 1]} {y}'
    except Exception:
        return periodo or ''


def categorias_de(form: dict) -> list:
    return sorted({(it.get('seccion') or 'General') for it in form.get('items', [])})


async def coordinadores_tienda() -> list:
    """Coordinadores del área Tienda de las tiendas que participan."""
    users = await db.users.find(
        {'status': 'approved', 'position': 'Coordinador', 'area': 'Tienda',
         'sucursal': {'$in': list(PROMO_TIENDAS)}},
        {'_id': 0, 'id': 1, 'name': 1, 'sucursal': 1}).to_list(500)
    return users


async def quienes_contestan() -> list:
    """Coordinadores y jefes de las tiendas que participan: todos pueden
    contestar su categoría (los gerentes solo revisan)."""
    jefes = [r for rs in (await revisores_por_tienda()).values() for r in rs if r['cargo'] == JEFE_TIENDA]
    return await coordinadores_tienda() + jefes


async def revisores_por_tienda() -> dict:
    """{'Herco Max': [{'id', 'name', 'cargo'}], ...}: jefes de tienda (puede
    haber más de uno) y el gerente de cada tienda, área Tienda."""
    out = {t: [] for t in PROMO_TIENDAS.values()}
    users = await db.users.find(
        {'status': 'approved', 'sucursal': {'$in': list(PROMO_TIENDAS)},
         '$or': [{'position': JEFE_TIENDA}, {'position': 'Gerente', 'area': 'Tienda'}]},
        {'_id': 0, 'id': 1, 'name': 1, 'sucursal': 1, 'position': 1}).to_list(100)
    for u in users:
        out[PROMO_TIENDAS[u['sucursal']]].append({'id': u['id'], 'name': u['name'], 'cargo': u['position']})
    return out


async def sincronizar_tareas(form: dict) -> list:
    """Crea las tareas que falten (tienda × categoría) y cancela las pendientes
    cuya categoría ya no está en la publicación. Devuelve las creadas."""
    if not form.get('flujo_tareas') or (form.get('status') or 'publicado') != 'publicado':
        return []
    revisores = await revisores_por_tienda()
    cats = categorias_de(form)
    existentes = {(t['tienda'], t['categoria']): t
                  for t in await db.promo_tareas.find({'form_id': form['id']}, {'_id': 0}).to_list(500)}
    creadas = []
    for suc, tienda in PROMO_TIENDAS.items():
        for cat in cats:
            t = existentes.get((tienda, cat))
            if t:
                if t['estado'] == 'cancelada':  # la categoría volvió a la publicación
                    await db.promo_tareas.update_one({'id': t['id']}, {'$set': {'estado': 'pendiente'}})
                continue
            doc = {
                'id': new_id(), 'form_id': form['id'], 'form_titulo': form.get('titulo'),
                'periodo': form.get('periodo'), 'tienda': tienda, 'sucursal': suc, 'categoria': cat,
                'revisor_ids': [r['id'] for r in revisores.get(tienda, [])],
                'estado': 'pendiente', 'coordinador_id': None, 'coordinador_name': None,
                'respuesta_id': None, 'enviada_at': None, 'created_at': now_iso(),
            }
            await db.promo_tareas.insert_one(doc)
            doc.pop('_id', None)
            creadas.append(doc)
    for (tienda, cat), t in existentes.items():
        if cat not in cats and t['estado'] == 'pendiente':
            await db.promo_tareas.update_one({'id': t['id']}, {'$set': {'estado': 'cancelada'}})
    return creadas


async def avisar_publicacion(form: dict, actor: dict):
    """Alerta de publicación: coordinadores de tienda (eligen su categoría al
    contestar) y quienes revisan en cada tienda (jefes y gerente). Si una tienda
    no tiene quién revise, a los admins."""
    mes = periodo_label(form.get('periodo'))
    n_cats = len(categorias_de(form))
    for c in await coordinadores_tienda():
        await create_notification(
            c['id'], 'promo_publicada',
            f'Promociones de {mes} publicadas: elige tu tienda y categoría y contesta.',
            related_id=form['id'], related_type='promociones',
            actor_name=actor.get('name'), actor_avatar=actor.get('avatar_url'))
    for tienda, revisores in (await revisores_por_tienda()).items():
        if not revisores:
            await notify_admins('promo_sin_jefe',
                                f'{tienda} no tiene jefe ni gerente de tienda: nadie revisará sus Promociones de {mes}.',
                                related_id=form['id'], related_type='promociones')
        cats_txt = f'{n_cats} categoría{"s" if n_cats != 1 else ""}'
        for r in revisores:
            extra = ('Contesta la tuya si coordinas una; te avisaremos cuando se contesten las demás.'
                     if r['cargo'] == JEFE_TIENDA else 'Te avisaremos cuando cada una se conteste para que la revises.')
            await create_notification(
                r['id'], 'promo_publicada',
                f'Promociones de {mes} publicadas para {tienda}: {cats_txt}. {extra}',
                related_id=form['id'], related_type='promociones',
                actor_name=actor.get('name'), actor_avatar=actor.get('avatar_url'))


async def tomar_tarea(form: dict, tienda: str, categoria: str, user: dict) -> tuple:
    """Deja la tarea tienda × categoría a nombre de quien contesta, de forma
    atómica: si otro coordinador ya la contestó, 409. El mismo coordinador puede
    reenviar mientras siga "enviada" (sin revisar). Devuelve (tarea, estado
    anterior) para poder deshacer si el envío falla."""
    t = await db.promo_tareas.find_one({'form_id': form['id'], 'tienda': tienda, 'categoria': categoria}, {'_id': 0})
    if not t or t['estado'] == 'cancelada':
        raise HTTPException(status_code=400, detail=f'{categoria} no está en esta publicación para {tienda}')
    previo = {k: t.get(k) for k in ('estado', 'coordinador_id', 'coordinador_name', 'enviada_at')}
    r = await db.promo_tareas.update_one(
        {'id': t['id'], '$or': [{'estado': 'pendiente'}, {'estado': 'enviada', 'coordinador_id': user['id']}]},
        {'$set': {'estado': 'enviada', 'coordinador_id': user['id'], 'coordinador_name': user['name'],
                  'enviada_at': now_iso()}})
    if r.matched_count == 0:
        actual = await db.promo_tareas.find_one({'id': t['id']}, {'_id': 0})
        if actual and actual.get('coordinador_id') == user['id']:
            raise HTTPException(status_code=409, detail=f'{categoria} de {tienda} ya fue revisada; ya no se puede reenviar')
        quien = (actual or {}).get('coordinador_name') or 'otro coordinador'
        raise HTTPException(status_code=409, detail=f'{categoria} de {tienda} ya la contestó {quien}')
    return t, previo


async def deshacer_toma(tarea_id: str, previo: dict):
    await db.promo_tareas.update_one({'id': tarea_id}, {'$set': previo})


async def liberar_por_respuesta(resp_ids: list):
    """Si se borran respuestas, sus tareas vuelven a quedar pendientes."""
    if not resp_ids:
        return
    await db.promo_tareas.update_many(
        {'respuesta_id': {'$in': list(resp_ids)}},
        {'$set': {'estado': 'pendiente', 'coordinador_id': None, 'coordinador_name': None,
                  'respuesta_id': None, 'enviada_at': None}})


# --------------------------------------------------------------------------- #
#  Consultas
# --------------------------------------------------------------------------- #
_PUBLICO = {'_id': 0, 'id': 1, 'form_id': 1, 'tienda': 1, 'categoria': 1, 'estado': 1,
            'coordinador_id': 1, 'coordinador_name': 1, 'enviada_at': 1}


@router.get('/form/{form_id}')
async def tareas_de_form(form_id: str, user=Depends(require_promociones_mes_access)):
    """Estado de cada tienda × categoría de una publicación: el formulario lo usa
    para bloquear las categorías que ya contestó otro coordinador."""
    rows = await db.promo_tareas.find({'form_id': form_id, 'estado': {'$ne': 'cancelada'}}, _PUBLICO) \
        .sort([('tienda', 1), ('categoria', 1)]).to_list(500)
    return serialize_doc(rows)


@router.get('/mias')
async def mis_tareas(user=Depends(get_current_user)):
    """Para Inicio. Coordinador de tienda: publicaciones con categorías sin
    contestar y lo que ya contestó. Jefe o gerente de tienda: cada categoría de
    su tienda. Cualquier otra persona: lista vacía."""
    rol = 'revisor' if es_revisor_tienda(user) else ('coordinador' if es_coordinador_tienda(user) else None)
    if not rol:
        return {'rol': None, 'publicaciones': []}
    forms = await db.custom_forms.find(
        {'kind': 'promociones', 'flujo_tareas': True, 'status': 'publicado'},
        {'_id': 0, 'id': 1, 'titulo': 1, 'periodo': 1, 'created_at': 1}).sort('created_at', -1).to_list(6)
    out = []
    for f in forms:
        q = {'form_id': f['id'], 'estado': {'$ne': 'cancelada'}}
        if rol == 'revisor':
            q['tienda'] = tienda_promos(user)
        tareas = await db.promo_tareas.find(q, _PUBLICO).sort([('tienda', 1), ('categoria', 1)]).to_list(200)
        if rol == 'coordinador':
            mias = [t for t in tareas if t.get('coordinador_id') == user['id']]
            pendientes = sum(1 for t in tareas if t['estado'] == 'pendiente')
            if not (mias or pendientes):
                continue
            out.append({**f, 'pendientes': pendientes, 'tareas': mias})
        else:
            out.append({**f, 'tienda': tienda_promos(user), 'tareas': tareas})
    return serialize_doc({'rol': rol, 'publicaciones': out})
