"""Promociones del mes: tareas por tienda × categoría.

Al publicar una publicación de Promociones (con `flujo_tareas`), se crea una
tarea por cada tienda que participa (core.PROMO_TIENDAS) y cada categoría de la
publicación. La tarea nace sin responsable: queda a nombre de quien elige esa
tienda y categoría al contestar (coordinador o jefe de tienda: hay jefes que
también coordinan una categoría), y a partir de ahí nadie más puede contestarla.
La revisan los jefes y el gerente de esa tienda (nunca quien la contestó).
Las publicaciones viejas (sin `flujo_tareas`) no tienen tareas y siguen igual.

Estados de una tarea:
  pendiente          nadie la ha contestado
  enviada            contestada; espera revisión (quien la contestó puede reenviar)
  con_observaciones  quien revisa marcó inconsistencias: hay un ticket abierto (tickets.py)
  validada           quien revisa confirmó en piso cada línea
  cancelada          su categoría salió de la publicación al editarla
Quien revisa recorre cada línea (Correcto / Inconsistencia con tipo y comentario).
Enviar observaciones abre un ticket con esas líneas; al cerrarlo, la categoría
queda validada.
"""
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import (db, get_current_user, serialize_doc, new_id, now_iso, PROMO_TIENDAS,
                  JEFE_TIENDA, tienda_promos, es_revisor_tienda, es_coordinador_tienda,
                  require_promociones_mes_access, can_admin_promos)
from notifications import create_notification, notify_admins
import tickets

router = APIRouter(prefix='/promo-tareas', tags=['promo-tareas'])

TIPOS_INCONSISTENCIA = [
    'Promoción sin rótulo', 'Rótulo con precio o descuento distinto', 'Rótulo vencido o de otro mes',
    'Producto sin existencia en piso', 'La foto no corresponde', 'Otro',
]

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
    previo = {k: t.get(k) for k in ('estado', 'coordinador_id', 'coordinador_name', 'enviada_at', 'revision')}
    r = await db.promo_tareas.update_one(
        {'id': t['id'], '$or': [{'estado': 'pendiente'}, {'estado': 'enviada', 'coordinador_id': user['id']}]},
        {'$set': {'estado': 'enviada', 'coordinador_id': user['id'], 'coordinador_name': user['name'],
                  'enviada_at': now_iso(), 'revision': None}})
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
    afectadas = await db.promo_tareas.find({'respuesta_id': {'$in': list(resp_ids)}}, {'_id': 0, 'id': 1}).to_list(500)
    await tickets.cancelar_de_tareas([t['id'] for t in afectadas])
    await db.promo_tareas.update_many(
        {'respuesta_id': {'$in': list(resp_ids)}},
        {'$set': {'estado': 'pendiente', 'coordinador_id': None, 'coordinador_name': None,
                  'respuesta_id': None, 'enviada_at': None, 'revision': None, 'ticket_id': None,
                  'validada_por': None, 'validada_por_name': None, 'validada_at': None}})


def puede_revisar(user: dict, tarea: dict) -> bool:
    """Jefe o gerente de esa tienda, o quien administra Promociones; nunca
    quien la contestó."""
    if tarea.get('coordinador_id') == user.get('id'):
        return False
    return (es_revisor_tienda(user) and tienda_promos(user) == tarea.get('tienda')) or can_admin_promos(user)


def puede_ver(user: dict, tarea: dict) -> bool:
    return (tarea.get('coordinador_id') == user.get('id') or puede_revisar(user, tarea)
            or (es_revisor_tienda(user) and tienda_promos(user) == tarea.get('tienda')))


# --------------------------------------------------------------------------- #
#  Consultas
# --------------------------------------------------------------------------- #
_PUBLICO = {'_id': 0, 'id': 1, 'form_id': 1, 'tienda': 1, 'categoria': 1, 'estado': 1,
            'coordinador_id': 1, 'coordinador_name': 1, 'enviada_at': 1, 'revision': 1,
            'validada_por_name': 1, 'validada_at': 1, 'ticket_id': 1}


def _sin_revision_ajena(tareas: list, user: dict) -> list:
    """El detalle de la revisión solo lo ven quien contestó y quien revisa;
    al resto le queda quién la está revisando."""
    for t in tareas:
        rev = t.get('revision')
        if rev and not puede_ver(user, t):
            t['revision'] = {'revisor_name': rev.get('revisor_name')}
    return tareas


@router.get('/form/{form_id}')
async def tareas_de_form(form_id: str, user=Depends(require_promociones_mes_access)):
    """Estado de cada tienda × categoría de una publicación: el formulario lo usa
    para bloquear las categorías que ya contestó otro coordinador."""
    rows = await db.promo_tareas.find({'form_id': form_id, 'estado': {'$ne': 'cancelada'}}, _PUBLICO) \
        .sort([('tienda', 1), ('categoria', 1)]).to_list(500)
    return serialize_doc(_sin_revision_ajena(rows, user))


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
        tareas = _sin_revision_ajena(
            await db.promo_tareas.find(q, _PUBLICO).sort([('tienda', 1), ('categoria', 1)]).to_list(200), user)
        if rol == 'coordinador':
            mias = [t for t in tareas if t.get('coordinador_id') == user['id']]
            pendientes = sum(1 for t in tareas if t['estado'] == 'pendiente')
            if not (mias or pendientes):
                continue
            out.append({**f, 'pendientes': pendientes, 'tareas': mias})
        else:
            por_revisar = sum(1 for t in tareas if t['estado'] == 'enviada' and t.get('coordinador_id') != user['id'])
            out.append({**f, 'tienda': tienda_promos(user), 'tareas': tareas, 'por_revisar': por_revisar})
    return serialize_doc({'rol': rol, 'publicaciones': out})


# --------------------------------------------------------------------------- #
#  Revisión (jefe o gerente de la tienda)
# --------------------------------------------------------------------------- #
async def _tarea_o_404(tarea_id: str) -> dict:
    t = await db.promo_tareas.find_one({'id': tarea_id}, {'_id': 0})
    if not t or t['estado'] == 'cancelada':
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    return t


@router.get('/{tarea_id}')
async def detalle(tarea_id: str, user=Depends(get_current_user)):
    """Lo que necesita la pantalla de revisión: la tarea (con su revisión), la
    respuesta del coordinador y las preguntas de la publicación."""
    t = await _tarea_o_404(tarea_id)
    if not puede_ver(user, t):
        raise HTTPException(status_code=403, detail='No puedes ver esta tarea')
    resp = None
    if t.get('respuesta_id'):
        resp = await db.custom_form_responses.find_one({'id': t['respuesta_id']}, {'_id': 0})
    form = await db.custom_forms.find_one({'id': t['form_id']}, {'_id': 0, 'items': 1, 'titulo': 1, 'periodo': 1})
    items = {it['id']: {k: it.get(k) for k in ('titulo', 'pregunta', 'tipo', 'estrategia', 'etiqueta', 'opciones')}
             for it in (form or {}).get('items', [])}
    ticket = None
    if t.get('ticket_id'):
        ticket = await db.tickets.find_one({'id': t['ticket_id']}, {'_id': 0, 'id': 1, 'numero': 1, 'estado': 1})
    return serialize_doc({
        'tarea': t, 'respuesta': resp, 'items': items, 'ticket': ticket,
        'form': {'titulo': (form or {}).get('titulo'), 'periodo': (form or {}).get('periodo')},
        # con un ticket abierto, la categoría se atiende desde el ticket
        'puede_revisar': puede_revisar(user, t) and t['estado'] == 'enviada',
        'es_propia': t.get('coordinador_id') == user['id'],
        'tipos': TIPOS_INCONSISTENCIA,
    })


class LineaRevision(BaseModel):
    v: str  # 'ok' | 'mal'
    tipo: Optional[str] = None
    comentario: Optional[str] = ''


class RevisionInput(BaseModel):
    lineas: Dict[str, LineaRevision] = {}
    accion: str = 'guardar'  # 'guardar' | 'observaciones' | 'validar'


@router.post('/{tarea_id}/revision')
async def revisar(tarea_id: str, data: RevisionInput, user=Depends(get_current_user)):
    """Guardar el avance de la revisión, mandar las observaciones a quien
    contestó, o validar (todas las líneas correctas)."""
    t = await _tarea_o_404(tarea_id)
    if t.get('coordinador_id') == user['id']:
        raise HTTPException(status_code=403, detail='No puedes revisar tu propia respuesta')
    if not puede_revisar(user, t):
        raise HTTPException(status_code=403, detail='Solo el jefe o el gerente de la tienda revisan esta categoría')
    if t['estado'] == 'con_observaciones':
        raise HTTPException(status_code=409, detail='Esta categoría tiene un ticket abierto: atiéndela desde el ticket')
    if t['estado'] != 'enviada':
        raise HTTPException(status_code=409, detail='Esta categoría no está esperando revisión')
    if data.accion not in ('guardar', 'observaciones', 'validar'):
        raise HTTPException(status_code=400, detail='Acción inválida')
    resp = await db.custom_form_responses.find_one({'id': t.get('respuesta_id')}, {'_id': 0, 'entries': 1})
    if not resp:
        raise HTTPException(status_code=409, detail='La respuesta de esta categoría ya no existe')
    ids = [e['id'] for e in resp.get('entries', [])]
    lineas = {}
    for iid, ln in data.lineas.items():
        if iid not in ids:
            continue
        if ln.v not in ('ok', 'mal'):
            raise HTTPException(status_code=400, detail='Cada línea es Correcta o Inconsistencia')
        linea = {'v': ln.v}
        if ln.v == 'mal':
            linea['tipo'] = ln.tipo if ln.tipo in TIPOS_INCONSISTENCIA else 'Otro'
            linea['comentario'] = ' '.join((ln.comentario or '').split())[:500]
        lineas[iid] = linea
    malas = [i for i in ids if lineas.get(i, {}).get('v') == 'mal']
    if data.accion != 'guardar':
        faltan = [i for i in ids if i not in lineas]
        if faltan:
            raise HTTPException(status_code=400, detail=f'Revisa todas las líneas: faltan {len(faltan)}')
    if data.accion == 'validar' and malas:
        raise HTTPException(status_code=400, detail='Hay líneas con inconsistencias: no se puede validar')
    if data.accion == 'observaciones':
        if not malas:
            raise HTTPException(status_code=400, detail='No hay inconsistencias: valida la categoría')
        if any(not lineas[i]['comentario'] for i in malas):
            raise HTTPException(status_code=400, detail='Describe cada inconsistencia')

    ahora = now_iso()
    updates = {'revision': {'lineas': lineas, 'revisor_id': user['id'], 'revisor_name': user['name'],
                            'actualizada_at': ahora}}
    if data.accion == 'validar':
        updates.update({'estado': 'validada', 'validada_por': user['id'], 'validada_por_name': user['name'],
                        'validada_at': ahora})
    elif data.accion == 'observaciones':
        updates['estado'] = 'con_observaciones'
    r = await db.promo_tareas.update_one({'id': t['id'], 'estado': t['estado']}, {'$set': updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=409, detail='Alguien más cambió esta categoría; vuelve a abrirla')

    mes = periodo_label(t.get('periodo'))
    if data.accion == 'observaciones':
        form = await db.custom_forms.find_one({'id': t['form_id']}, {'_id': 0, 'items': 1})
        titulos = {it['id']: it.get('titulo') for it in (form or {}).get('items', [])}
        ticket = await tickets.crear_ticket_promo(
            t, [{'item_id': i, 'titulo': titulos.get(i) or 'Promoción', 'tipo': lineas[i]['tipo'],
                 'comentario': lineas[i]['comentario']} for i in malas], user, mes)
        await db.promo_tareas.update_one({'id': t['id']}, {'$set': {'ticket_id': ticket['id']}})
    if data.accion == 'validar' and t.get('coordinador_id'):
        await create_notification(
            t['coordinador_id'], 'promo_validada',
            f"{user['name']} validó {t['categoria']} de {t['tienda']} ({mes}). Todo en orden.",
            related_id=t['form_id'], related_type='promociones',
            actor_name=user['name'], actor_avatar=user.get('avatar_url'))
    return serialize_doc(await db.promo_tareas.find_one({'id': t['id']}, {'_id': 0}))
