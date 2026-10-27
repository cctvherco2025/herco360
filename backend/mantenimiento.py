"""Mantenimiento preventivo de activos: checklists, planificaciones y tareas.

Igual que las planificaciones de DataScope:
  - Una planificación (db.mant_planes, número MNT-001) tiene supervisor, un
    responsable (con historial: `responsables` [{usuario_id, desde_ciclo}]),
    frecuencia, inicio y fin (nunca / fecha / N ciclos), y sus tareas
    (`definiciones`): qué checklist se hace en qué activo, qué día del ciclo y
    a qué hora, con cuántas horas de plazo, si acepta entregas tardías, cuántos
    días antes se avisa y el recordatorio antes de vencer.
  - Se repite en ciclos (db.mant_ciclos). El ciclo siguiente se crea por
    FECHA, no por avance: aunque todo esté hecho, espera a que empiece. Al
    terminar un ciclo lo pendiente queda 'incompleta' y se avisa al
    supervisor. Si el servidor estuvo apagado, al volver crea los ciclos que
    faltan (los ya pasados, cerrados y sin avisos). Al reanudar una pausada no
    se crean ciclos atrasados: sigue en el próximo.
  - Cada tarea real (db.mant_tareas, MNT-001-C3-02) guarda copia del
    checklist y de su configuración: editar la planificación o el checklist
    nunca cambia tareas ya generadas. Estados: programada → pendiente (al
    llegar su aviso; se notifica al responsable) → completada, o incompleta
    (venció sin aceptar tardías, o terminó el ciclo), o cancelada.
  - Todo es idempotente: índices únicos (plan+ciclo, ciclo+definición) y
    reclamos atómicos (update_one con condición) para no duplicar ciclos,
    tareas ni avisos aunque el ciclo de reminders corra dos veces.
Las fechas de negocio son de pared en Honduras (now_local) en texto
'YYYY-MM-DD' / 'YYYY-MM-DDTHH:MM'; el motor de fechas está en
mantenimiento_motor.py.

Permisos: planifica (crea checklists y planificaciones) quien administra
Activos o es responsable de alguna categoría, y solo con activos de sus
categorías. El supervisor de una planificación también la edita, pausa y
reasigna sus tareas. El responsable ve y llena sus tareas.
"""
import json
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from core import (db, serialize_doc, new_id, now_iso, now_local, get_current_user, can_admin_activos,
                  RETAIL, departamento_de, es_super_admin, filtro_depto, filtro_usuarios_depto)
from notifications import create_notification
import mantenimiento_motor as motor
import routes_activos
import storage

router = APIRouter(prefix='/mantenimiento', tags=['mantenimiento'])
logger = logging.getLogger('mantenimiento')

TIPOS_ITEM = {'estado': 'Bien / Falla / No aplica', 'unica': 'Selección única', 'multiple': 'Selección múltiple',
              'check': 'Casilla (check)', 'numero': 'Número', 'texto': 'Texto', 'foto': 'Foto'}
FOTOS_MODOS = ('no', 'opcional', 'obligatoria')
ANTES, DESPUES = '__antes', '__despues'  # dueños de las fotos del antes y el después


def _modo_fotos(it):
    """Fotos de una pregunta: 'no' | 'opcional' | 'obligatoria'. Las preguntas
    guardadas antes de que existiera la opción toman el comportamiento de antes."""
    if it['tipo'] == 'foto':
        return 'obligatoria'
    return it.get('fotos') or ('opcional' if it['tipo'] in ('estado', 'numero') else 'no')


def _es_falla(it, valor):
    """¿La respuesta reporta una falla? (Falla, o una opción marcada como falla)"""
    if it['tipo'] == 'estado':
        return valor == 'falla'
    fallas = {o['texto'] for o in it.get('opciones') or [] if o.get('falla')}
    if it['tipo'] == 'unica':
        return valor in fallas
    if it['tipo'] == 'multiple':
        return bool(fallas & set(valor or []))
    return False
VALORES_ESTADO = ('bien', 'falla', 'na')
MAX_FOTO = 8 * 1024 * 1024
FIN_TIPOS = ('nunca', 'fecha', 'ciclos')
ABIERTAS = ('programada', 'pendiente')


async def ensure_indexes():
    await db.mant_checklists.create_index('id', unique=True)
    await db.mant_planes.create_index('id', unique=True)
    await db.mant_ciclos.create_index('id', unique=True)
    await db.mant_ciclos.create_index([('plan_id', 1), ('numero', 1)], unique=True)
    await db.mant_tareas.create_index('id', unique=True)
    await db.mant_tareas.create_index([('ciclo_id', 1), ('definicion_id', 1)], unique=True)
    await db.mant_tareas.create_index([('responsable_id', 1), ('estado', 1)])
    await db.mant_tareas.create_index([('estado', 1), ('disponible_desde', 1)])
    await db.mant_tareas.create_index([('activo_id', 1), ('fecha', -1)])


# ── Utilidades ───────────────────────────────────────────────────
def _txt(v, limit=300) -> str:
    return ' '.join(str(v or '').split())[:limit]


def _ahora():
    return now_local().strftime(motor.FMT)


async def _usuario(uid, depto=None):
    """Usuario aprobado (y, con `depto`, de ese departamento)."""
    q = {'id': uid, 'status': 'approved', **(filtro_usuarios_depto(depto) if depto else {})}
    return await db.users.find_one(q, {'_id': 0, 'id': 1, 'name': 1, 'avatar_url': 1, 'position': 1})


def depto_plan(plan) -> str:
    return (plan or {}).get('departamento') or RETAIL


async def _depto_de_categorias(cat_ids) -> str:
    """Departamento de una planificación según las categorías de sus activos
    (todas tienen que ser del mismo)."""
    cats = await db.activo_categorias.find({'id': {'$in': list(cat_ids)}}, {'_id': 0, 'departamento': 1}).to_list(500)
    deptos = {c.get('departamento') or RETAIL for c in cats} or {RETAIL}
    if len(deptos) > 1:
        raise HTTPException(status_code=400, detail='Los activos de una planificación tienen que ser del mismo departamento')
    return deptos.pop()


async def _avisar(uids, tipo, msg, related_id, related_type='mant_tarea', actor=None):
    for uid in dict.fromkeys(u for u in uids if u):
        if actor and uid == actor.get('id'):
            continue
        try:
            await create_notification(uid, tipo, msg, related_id=related_id, related_type=related_type,
                                      actor_name=(actor or {}).get('name'), actor_avatar=(actor or {}).get('avatar_url'))
        except Exception as e:  # pragma: no cover
            logger.warning(f'aviso {tipo} a {uid} falló: {e}')


async def _contexto(user):
    """(administra Activos, ids de categorías que la persona maneja). Quien
    administra maneja todas las categorías de su departamento (los admins, todas):
    por eso el alcance siempre se mide con esos ids."""
    admin, _, editables = await routes_activos._acceso(user)
    return admin, editables


async def _puede_planificar(user):
    admin, editables = await _contexto(user)
    return admin or bool(editables)


async def _requiere_planificador(user):
    if not await _puede_planificar(user):
        raise HTTPException(status_code=403, detail='Solo quien administra activos o es responsable de una categoría puede planificar mantenimientos')


async def _puede_gestionar_plan(user, plan):
    """Editar, pausar, reasignar: admin, supervisor, quien lo creó o
    responsable de todas las categorías de sus activos."""
    _, editables = await _contexto(user)
    if es_super_admin(user) or user['id'] in (plan.get('supervisor_id'), plan.get('created_by')):
        return True
    cats = set(plan.get('categoria_ids') or [])
    return bool(cats) and cats <= editables


async def _plan_o_404(plan_id):
    plan = await db.mant_planes.find_one({'id': plan_id}, {'_id': 0})
    if not plan:
        raise HTTPException(status_code=404, detail='Planificación no encontrada')
    return plan


def _responsable_actual(plan):
    return motor.responsable_de_ciclo(plan.get('responsables'), max(1, int(plan.get('ciclo_actual') or 0) + 1)) \
        or motor.responsable_de_ciclo(plan.get('responsables'), 10 ** 6)


# ── Acceso (menú) ────────────────────────────────────────────────
@router.get('/acceso')
async def acceso(user=Depends(get_current_user)):
    planificar = await _puede_planificar(user)
    es_parte = await db.mant_planes.find_one(
        {'$or': [{'supervisor_id': user['id']}, {'responsables.usuario_id': user['id']}], 'estado': {'$ne': 'borrador'}}, {'_id': 1})
    tiene_tareas = await db.mant_tareas.find_one({'responsable_id': user['id']}, {'_id': 1})
    pendientes = await db.mant_tareas.count_documents({'responsable_id': user['id'], 'estado': 'pendiente'})
    # quien planifica siempre ve "Mis mantenimientos" (aunque todavía no tenga tareas)
    return {'planificar': planificar, 'ver_planes': planificar or bool(es_parte),
            'mis_tareas': bool(planificar or es_parte or tiene_tareas), 'pendientes': pendientes}


# ── Checklists ───────────────────────────────────────────────────
class ChecklistInput(BaseModel):
    nombre: str
    descripcion: Optional[str] = ''
    items: list = []
    antes_despues: bool = False  # pedir fotos de cómo se encontró el equipo y cómo quedó


def _limpiar_items(items):
    if not items:
        raise HTTPException(status_code=400, detail='Agrega al menos una pregunta')
    if len(items) > 80:
        raise HTTPException(status_code=400, detail='Máximo 80 preguntas por checklist')
    out = []
    for i, it in enumerate(items, start=1):
        texto = _txt(it.get('texto'), 300)
        if not texto:
            raise HTTPException(status_code=400, detail=f'La pregunta {i} está vacía')
        tipo = it.get('tipo')
        if tipo not in TIPOS_ITEM:
            raise HTTPException(status_code=400, detail=f'Pregunta {i}: tipo no válido')
        item = {'id': _txt(it.get('id'), 40) or new_id(), 'texto': texto, 'tipo': tipo,
                'obligatorio': True if tipo == 'foto' else bool(it.get('obligatorio', True)),
                'unidad': _txt(it.get('unidad'), 20) if tipo == 'numero' else '',
                'ayuda': _txt(it.get('ayuda'), 300),
                'fotos': 'obligatoria' if tipo == 'foto' else (it.get('fotos') if it.get('fotos') in FOTOS_MODOS else 'opcional')}
        if tipo in ('unica', 'multiple'):
            opciones, vistas = [], set()
            for o in it.get('opciones') or []:
                txt = _txt(o.get('texto') if isinstance(o, dict) else o, 80)
                if txt and txt.lower() not in vistas:
                    vistas.add(txt.lower())
                    opciones.append({'texto': txt, 'falla': bool(o.get('falla')) if isinstance(o, dict) else False})
            if len(opciones) < 2:
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: agrega al menos 2 opciones')
            item['opciones'] = opciones[:30]
        out.append(item)
    ids = [x['id'] for x in out]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail='Hay preguntas repetidas')
    return out


@router.get('/checklists')
async def list_checklists(user=Depends(get_current_user)):
    await _requiere_planificador(user)
    rows = await db.mant_checklists.find({'eliminado': {'$ne': True}, **filtro_depto(user)}, {'_id': 0}).sort('nombre', 1).to_list(500)
    usos = {r['_id']: r['n'] for r in await db.mant_planes.aggregate([
        {'$match': {'estado': {'$in': ['borrador', 'activa', 'pausada']}}},
        {'$unwind': '$definiciones'}, {'$group': {'_id': '$definiciones.checklist_id', 'n': {'$sum': 1}}},
    ]).to_list(500)}
    for r in rows:
        r['en_uso'] = usos.get(r['id'], 0)
    return serialize_doc(rows)


@router.post('/checklists')
async def create_checklist(data: ChecklistInput, user=Depends(get_current_user)):
    await _requiere_planificador(user)
    nombre = _txt(data.nombre, 100)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del checklist')
    doc = {'id': new_id(), 'nombre': nombre, 'descripcion': _txt(data.descripcion, 500), 'items': _limpiar_items(data.items), 'antes_despues': bool(data.antes_despues),
           'departamento': departamento_de(user), 'version': 1, 'created_at': now_iso(), 'created_by': user['id'], 'created_by_name': user['name']}
    await db.mant_checklists.insert_one(doc)
    doc.pop('_id', None)
    return serialize_doc(doc)


@router.put('/checklists/{cid}')
async def update_checklist(cid: str, data: ChecklistInput, user=Depends(get_current_user)):
    await _requiere_planificador(user)
    actual = await db.mant_checklists.find_one({'id': cid, 'eliminado': {'$ne': True}, **filtro_depto(user)}, {'_id': 0})
    if not actual:
        raise HTTPException(status_code=404, detail='Checklist no encontrado')
    nombre = _txt(data.nombre, 100)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre del checklist')
    # las tareas ya generadas guardan su copia: el cambio aplica a las próximas
    await db.mant_checklists.update_one({'id': cid}, {
        '$set': {'nombre': nombre, 'descripcion': _txt(data.descripcion, 500), 'items': _limpiar_items(data.items), 'antes_despues': bool(data.antes_despues),
                 'updated_at': now_iso(), 'updated_by': user['name']},
        '$inc': {'version': 1}})
    return serialize_doc(await db.mant_checklists.find_one({'id': cid}, {'_id': 0}))


@router.delete('/checklists/{cid}')
async def delete_checklist(cid: str, user=Depends(get_current_user)):
    await _requiere_planificador(user)
    if not await db.mant_checklists.find_one({'id': cid, **filtro_depto(user)}, {'_id': 1}):
        raise HTTPException(status_code=404, detail='Checklist no encontrado')
    en_uso = await db.mant_planes.find_one({'definiciones.checklist_id': cid, 'estado': {'$in': ['borrador', 'activa', 'pausada']}},
                                           {'_id': 0, 'numero': 1})
    if en_uso:
        raise HTTPException(status_code=400, detail=f'Lo usa la planificación {en_uso["numero"]}: quítalo de ahí primero')
    await db.mant_checklists.update_one({'id': cid}, {'$set': {'eliminado': True, 'eliminado_at': now_iso(), 'eliminado_by': user['name']}})
    return {'message': 'Checklist eliminado'}


# ── Planificaciones ──────────────────────────────────────────────
class PlanInput(BaseModel):
    nombre: str
    descripcion: Optional[str] = ''
    supervisor_id: str
    responsable_id: str
    inicio: str
    frecuencia: str
    intervalo_dias: Optional[int] = None
    fin_tipo: str = 'nunca'
    fin_valor: Optional[str] = None
    definiciones: list = []


def _limpiar_frecuencia(data: PlanInput):
    if data.frecuencia not in motor.FRECUENCIAS:
        raise HTTPException(status_code=400, detail='Frecuencia no válida')
    intervalo = None
    if data.frecuencia == 'cada_n_dias':
        if not data.intervalo_dias or not 1 <= int(data.intervalo_dias) <= 730:
            raise HTTPException(status_code=400, detail='Indica cada cuántos días (1 a 730)')
        intervalo = int(data.intervalo_dias)
    try:
        inicio = date.fromisoformat(_txt(data.inicio, 10))
    except ValueError:
        raise HTTPException(status_code=400, detail='Fecha de inicio no válida')
    if data.fin_tipo not in FIN_TIPOS:
        raise HTTPException(status_code=400, detail='Fin no válido')
    fin_valor = None
    if data.fin_tipo == 'ciclos':
        try:
            fin_valor = int(data.fin_valor)
        except (TypeError, ValueError):
            fin_valor = 0
        if not 1 <= fin_valor <= 1000:
            raise HTTPException(status_code=400, detail='Indica cuántos ciclos (1 a 1000)')
    elif data.fin_tipo == 'fecha':
        try:
            fin = date.fromisoformat(_txt(data.fin_valor, 10))
        except ValueError:
            raise HTTPException(status_code=400, detail='Fecha de fin no válida')
        if fin < inicio:
            raise HTTPException(status_code=400, detail='La fecha de fin es anterior al inicio')
        fin_valor = fin.isoformat()
    return {'inicio': inicio.isoformat(), 'frecuencia': data.frecuencia, 'intervalo_dias': intervalo,
            'fin_tipo': data.fin_tipo, 'fin_valor': fin_valor}


async def _limpiar_definiciones(defs, user, previas=None):
    """Valida las tareas de la planificación. Devuelve (definiciones, ids de categorías)."""
    if not defs:
        raise HTTPException(status_code=400, detail='Agrega al menos una tarea (checklist + activo)')
    if len(defs) > 500:
        raise HTTPException(status_code=400, detail='Máximo 500 tareas por planificación')
    admin, editables = await _contexto(user)
    previas_ids = {d['id'] for d in previas or []}
    activos = {a['id']: a for a in await db.activos.find(
        {'id': {'$in': [_txt(d.get('activo_id'), 60) for d in defs]}}, {'_id': 0, 'id': 1, 'codigo': 1, 'categoria_id': 1, 'estado': 1}).to_list(1000)}
    checklists = {c['id'] for c in await db.mant_checklists.find(
        {'id': {'$in': [_txt(d.get('checklist_id'), 60) for d in defs]}, 'eliminado': {'$ne': True}, **filtro_depto(user)},
        {'_id': 0, 'id': 1}).to_list(1000)}
    out, cats, vistos = [], set(), set()
    for i, d in enumerate(defs, start=1):
        a = activos.get(_txt(d.get('activo_id'), 60))
        if not a:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: elige el activo')
        if a['estado'] != 'activo' and _txt(d.get('id'), 40) not in previas_ids:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: {a["codigo"]} está dado de baja')
        if a['categoria_id'] not in editables:
            raise HTTPException(status_code=403, detail=f'Tarea {i}: no eres responsable de la categoría de {a["codigo"]}')
        if _txt(d.get('checklist_id'), 60) not in checklists:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: elige el checklist')
        try:
            dia_mes = int(d['dia_mes']) if d.get('dia_mes') not in (None, '') else None
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f'Tarea {i}: día del mes no válido')
        if dia_mes is not None and not 1 <= dia_mes <= 31:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: el día del mes va de 1 a 31')
        clave = (a['id'], d.get('checklist_id'), dia_mes or 0, int(d.get('dia_ciclo') or 1))
        if clave in vistos:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: está repetida ({a["codigo"]}, mismo checklist y día)')
        vistos.add(clave)
        hora = _txt(d.get('hora'), 5) or '08:00'
        try:
            hh, mm = hora.split(':')
            assert 0 <= int(hh) < 24 and 0 <= int(mm) < 60
        except Exception:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: hora no válida')
        try:
            dia = int(d.get('dia_ciclo') or 1)
            plazo = int(d.get('horas_plazo') or 24)
            aviso = int(d.get('aviso_previo_dias') or 0)
            rec = int(d.get('recordatorio_horas') or 0)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f'Tarea {i}: revisa los números')
        if not 1 <= dia <= 366 or not 1 <= plazo <= 24 * 90 or not 0 <= aviso <= 30 or not 0 <= rec <= 24 * 30:
            raise HTTPException(status_code=400, detail=f'Tarea {i}: día del ciclo, plazo, aviso o recordatorio fuera de rango')
        cats.add(a['categoria_id'])
        out.append({'id': _txt(d.get('id'), 40) if _txt(d.get('id'), 40) in previas_ids else new_id(),
                    'checklist_id': d['checklist_id'], 'activo_id': a['id'], 'dia_ciclo': dia, 'dia_mes': dia_mes,
                    'hora': f'{int(hh):02d}:{int(mm):02d}',
                    'horas_plazo': plazo, 'acepta_tardias': bool(d.get('acepta_tardias')), 'aviso_previo_dias': aviso,
                    'recordatorio_horas': rec, 'activa': True})
    return out, sorted(cats)


def _dia_mes_segun(defs, frecuencia):
    """El día del mes solo aplica a frecuencias de meses; en las demás manda el día del ciclo."""
    if motor.FRECUENCIAS.get(frecuencia, ('dias',))[0] != 'meses':
        for d in defs:
            d['dia_mes'] = None


async def _validar_personas(supervisor_id, responsable_id, depto):
    """Supervisor y responsable: del departamento de la planificación."""
    sup = await _usuario(_txt(supervisor_id, 60), depto)
    if not sup:
        raise HTTPException(status_code=400, detail='Elige el supervisor')
    resp = await _usuario(_txt(responsable_id, 60), depto)
    if not resp:
        raise HTTPException(status_code=400, detail='Elige el responsable')
    return sup, resp


async def _cambio(plan, user, resumen, **extra):
    await db.mant_plan_cambios.insert_one({'id': new_id(), 'plan_id': plan['id'], 'user_id': user['id'], 'user_name': user['name'],
                                           'at': now_iso(), 'resumen': resumen, **extra})


@router.get('/opciones')
async def opciones(user=Depends(get_current_user)):
    """Lo necesario para armar una planificación: personas, checklists y los
    activos en uso de las categorías que maneja la persona."""
    await _requiere_planificador(user)
    admin, editables = await _contexto(user)
    cats = [c for c in await routes_activos._categorias(user) if c['id'] in editables]
    activos = await db.activos.find({'categoria_id': {'$in': [c['id'] for c in cats]}, 'estado': 'activo'},
                                    {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'sucursal': 1, 'categoria_id': 1, 'padre_id': 1, 'ubicacion': 1}
                                    ).sort('codigo', 1).to_list(5000)
    usuarios = await db.users.find({'status': 'approved', **filtro_depto(user)}, {'_id': 0, 'id': 1, 'name': 1, 'position': 1, 'area': 1, 'avatar_url': 1, 'departamento': 1}).sort('name', 1).to_list(1000)
    checklists = await db.mant_checklists.find({'eliminado': {'$ne': True}, **filtro_depto(user)}, {'_id': 0, 'id': 1, 'nombre': 1, 'items': 1}).sort('nombre', 1).to_list(500)
    return serialize_doc({
        'usuarios': usuarios, 'checklists': [{'id': c['id'], 'nombre': c['nombre'], 'preguntas': len(c['items'])} for c in checklists],
        'activos': activos, 'categorias': [{'id': c['id'], 'nombre': c['nombre'], 'icono': c.get('icono')} for c in cats],
        'frecuencias': {k: v[2] for k, v in motor.FRECUENCIAS.items()},
    })


@router.post('/vista-previa')
async def preview(data: PlanInput, user=Depends(get_current_user)):
    await _requiere_planificador(user)
    plan = _limpiar_frecuencia(data)
    defs = [{'id': str(i), 'dia_ciclo': int(d.get('dia_ciclo') or 1), 'dia_mes': int(d['dia_mes']) if d.get('dia_mes') else None,
             'hora': _txt(d.get('hora'), 5) or '08:00',
             'horas_plazo': int(d.get('horas_plazo') or 24), 'aviso_previo_dias': int(d.get('aviso_previo_dias') or 0)}
            for i, d in enumerate(data.definiciones)]
    return motor.vista_previa(plan, defs, ciclos=3)


@router.post('/planes')
async def create_plan(data: PlanInput, activar: bool = False, user=Depends(get_current_user)):
    await _requiere_planificador(user)
    nombre = _txt(data.nombre, 120)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre de la planificación')
    frecuencia = _limpiar_frecuencia(data)
    defs, cats = await _limpiar_definiciones(data.definiciones, user)
    depto = await _depto_de_categorias(cats)
    sup, resp = await _validar_personas(data.supervisor_id, data.responsable_id, depto)
    _dia_mes_segun(defs, frecuencia['frecuencia'])
    n = await db.counters.find_one_and_update({'_id': 'mant_planes'}, {'$inc': {'n': 1}}, upsert=True, return_document=ReturnDocument.AFTER)
    plan = {
        'id': new_id(), 'numero': f'MNT-{n["n"]:03d}', 'nombre': nombre, 'descripcion': _txt(data.descripcion, 1000),
        'supervisor_id': sup['id'], 'responsables': [{'usuario_id': resp['id'], 'desde_ciclo': 1}],
        **frecuencia, 'definiciones': defs, 'categoria_ids': cats, 'departamento': depto,
        'estado': 'activa' if activar else 'borrador', 'ciclo_actual': 0, 'saltar_hasta': 0,
        'created_at': now_iso(), 'created_by': user['id'], 'created_by_name': user['name'],
    }
    await db.mant_planes.insert_one(plan)
    plan.pop('_id', None)
    await _cambio(plan, user, 'Creada' + (' y activada' if activar else ' como borrador'))
    if activar:
        await _al_activar(plan, user)
        await revisar_planes(solo_plan=plan['id'])
        await revisar_tareas()  # las que ya tocan quedan pendientes al instante
    return serialize_doc(await _plan_o_404(plan['id']))


async def _al_activar(plan, user):
    await _avisar([plan['supervisor_id'], _responsable_actual(plan)], 'mant_plan_activado',
                  f'{plan["numero"]} · {plan["nombre"]}: se activó la planificación de mantenimiento.',
                  plan['id'], 'mant_plan', user)


@router.put('/planes/{plan_id}')
async def update_plan(plan_id: str, data: PlanInput, user=Depends(get_current_user)):
    """Editar. Nunca toca el ciclo en curso ni tareas ya generadas: los cambios
    de tareas, horarios y checklist aplican desde el próximo ciclo; el cambio
    de responsable también (sus tareas pendientes se pueden reasignar aparte).
    La frecuencia y el inicio solo se cambian mientras es borrador."""
    plan = await _plan_o_404(plan_id)
    if not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes editar esta planificación')
    if plan['estado'] in ('archivada', 'finalizada'):
        raise HTTPException(status_code=400, detail='La planificación ya terminó: no se puede editar')
    nombre = _txt(data.nombre, 120)
    if not nombre:
        raise HTTPException(status_code=400, detail='Escribe el nombre de la planificación')
    defs, cats = await _limpiar_definiciones(data.definiciones, user, plan.get('definiciones'))
    if await _depto_de_categorias(cats) != depto_plan(plan):
        raise HTTPException(status_code=400, detail='Los activos tienen que ser del departamento de la planificación')
    sup, resp = await _validar_personas(data.supervisor_id, data.responsable_id, depto_plan(plan))
    _dia_mes_segun(defs, data.frecuencia if plan['estado'] == 'borrador' else plan['frecuencia'])
    cambios, upd = [], {'nombre': nombre, 'descripcion': _txt(data.descripcion, 1000), 'supervisor_id': sup['id'],
                        'definiciones': defs, 'categoria_ids': cats}
    if plan['estado'] == 'borrador':
        upd.update(_limpiar_frecuencia(data))
        upd['responsables'] = [{'usuario_id': resp['id'], 'desde_ciclo': 1}]
    else:
        nueva = _limpiar_frecuencia(data)
        # fin se puede cambiar; frecuencia/inicio no (cambiarían los ciclos ya creados)
        if (nueva['frecuencia'], nueva['inicio'], nueva['intervalo_dias']) != (plan['frecuencia'], plan['inicio'], plan.get('intervalo_dias')):
            raise HTTPException(status_code=400, detail='La frecuencia y el inicio no se cambian en una planificación activa: crea otra')
        upd.update({'fin_tipo': nueva['fin_tipo'], 'fin_valor': nueva['fin_valor']})
        if resp['id'] != _responsable_actual(plan):
            siguiente = int(plan.get('ciclo_actual') or 0) + 1
            rs = [r for r in plan.get('responsables', []) if (r.get('desde_ciclo') or 1) < siguiente]
            upd['responsables'] = rs + [{'usuario_id': resp['id'], 'desde_ciclo': siguiente}]
            cambios.append(f'responsable: {resp["name"]} desde el ciclo {siguiente}')
    for k, lbl in (('nombre', 'nombre'), ('descripcion', 'descripción'), ('supervisor_id', 'supervisor'),
                   ('fin_tipo', 'fin'), ('fin_valor', 'fin'), ('frecuencia', 'frecuencia'), ('inicio', 'inicio')):
        if k in upd and plan.get(k) != upd[k] and lbl not in cambios:
            cambios.append(lbl)
    viejas = {d['id']: d for d in plan.get('definiciones', [])}
    nuevas = {d['id'] for d in defs}
    agregadas = len([d for d in defs if d['id'] not in viejas])
    quitadas = len([i for i in viejas if i not in nuevas])
    editadas = len([d for d in defs if d['id'] in viejas and {k: v for k, v in viejas[d['id']].items() if k != 'activa'} != {k: v for k, v in d.items() if k != 'activa'}])
    for n, txt in ((agregadas, 'agregada'), (quitadas, 'quitada'), (editadas, 'editada')):
        if n:
            cambios.append(f'{n} tarea{"s" if n > 1 else ""} {txt}{"s" if n > 1 else ""}')
    if not cambios:
        return serialize_doc(plan)
    await db.mant_planes.update_one({'id': plan_id}, {'$set': {**upd, 'updated_at': now_iso(), 'updated_by': user['name']}})
    aplica = '' if plan['estado'] == 'borrador' else ' (aplica desde el próximo ciclo)'
    await _cambio(plan, user, 'Editada: ' + ', '.join(cambios) + aplica,
                  antes={k: plan.get(k) for k in upd}, despues=upd)
    return serialize_doc(await _plan_o_404(plan_id))


@router.post('/planes/{plan_id}/accion/{accion}')
async def accion_plan(plan_id: str, accion: str, user=Depends(get_current_user)):
    plan = await _plan_o_404(plan_id)
    if not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes cambiar esta planificación')
    estado = plan['estado']
    if accion == 'activar':
        if estado != 'borrador':
            raise HTTPException(status_code=400, detail='Solo un borrador se activa')
        await db.mant_planes.update_one({'id': plan_id, 'estado': 'borrador'}, {'$set': {'estado': 'activa', 'activada_at': now_iso()}})
        await _cambio(plan, user, 'Activada')
        await _al_activar(plan, user)
        await revisar_planes(solo_plan=plan_id)
        await revisar_tareas()
    elif accion == 'pausar':
        if estado != 'activa':
            raise HTTPException(status_code=400, detail='Solo una planificación activa se pausa')
        await db.mant_planes.update_one({'id': plan_id}, {'$set': {'estado': 'pausada', 'pausada_at': now_iso()}})
        await _cambio(plan, user, 'Pausada: no genera ciclos nuevos (las tareas ya creadas siguen)')
    elif accion == 'reanudar':
        if estado != 'pausada':
            raise HTTPException(status_code=400, detail='Solo una planificación pausada se reanuda')
        # sin ciclos atrasados: se salta hasta el ciclo en curso y sigue en el próximo
        inicio = date.fromisoformat(plan['inicio'])
        en_curso = motor.ciclo_de_fecha(inicio, plan['frecuencia'], plan.get('intervalo_dias'), now_local().date())
        saltar = max(int(plan.get('saltar_hasta') or 0), en_curso if en_curso > int(plan.get('ciclo_actual') or 0) else 0)
        await db.mant_planes.update_one({'id': plan_id}, {'$set': {'estado': 'activa', 'saltar_hasta': saltar}})
        await _cambio(plan, user, 'Reanudada' + (f': sigue en el ciclo {saltar + 1}' if saltar > int(plan.get('ciclo_actual') or 0) else ''))
    elif accion == 'archivar':
        if estado == 'archivada':
            raise HTTPException(status_code=400, detail='Ya está archivada')
        await db.mant_planes.update_one({'id': plan_id}, {'$set': {'estado': 'archivada', 'estado_previo': estado, 'archivada_at': now_iso()}})
        await _cambio(plan, user, 'Archivada')
    elif accion == 'desarchivar':
        if estado != 'archivada':
            raise HTTPException(status_code=400, detail='No está archivada')
        previo = plan.get('estado_previo') or 'pausada'
        previo = 'pausada' if previo == 'activa' else previo  # vuelve pausada: se reanuda a mano
        await db.mant_planes.update_one({'id': plan_id}, {'$set': {'estado': previo}})
        await _cambio(plan, user, f'Desarchivada (queda {previo})')
    else:
        raise HTTPException(status_code=404, detail='Acción no válida')
    return serialize_doc(await _plan_o_404(plan_id))


@router.delete('/planes/{plan_id}')
async def delete_plan(plan_id: str, user=Depends(get_current_user)):
    plan = await _plan_o_404(plan_id)
    if not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes eliminar esta planificación')
    if plan['estado'] != 'borrador':
        raise HTTPException(status_code=400, detail='Solo se elimina un borrador; una planificación con ciclos se archiva')
    await db.mant_planes.delete_one({'id': plan_id})
    return {'message': 'Borrador eliminado'}


async def _nombres(ids):
    return {u['id']: u for u in await db.users.find({'id': {'$in': list({i for i in ids if i})}},
                                                    {'_id': 0, 'id': 1, 'name': 1, 'avatar_url': 1}).to_list(1000)}


async def _visible(user, plan):
    if await _puede_gestionar_plan(user, plan):
        return True
    return user['id'] in [r.get('usuario_id') for r in plan.get('responsables', [])]


@router.get('/planes')
async def list_planes(user=Depends(get_current_user)):
    admin, editables = await _contexto(user)
    admin = es_super_admin(user)
    q = {} if admin else {'$or': [
        {'supervisor_id': user['id']}, {'created_by': user['id']}, {'responsables.usuario_id': user['id']},
        {'categoria_ids': {'$in': list(editables)}},
    ]}
    planes = await db.mant_planes.find(q, {'_id': 0}).sort('numero', -1).to_list(1000)
    planes = [p for p in planes if admin or await _visible(user, p)]
    ids = [p['id'] for p in planes]
    ahora = _ahora()
    vencidas = {r['_id']: r['n'] for r in await db.mant_tareas.aggregate([
        {'$match': {'plan_id': {'$in': ids}, 'estado': 'pendiente', 'vence_en': {'$lte': ahora}}},
        {'$group': {'_id': '$plan_id', 'n': {'$sum': 1}}}]).to_list(1000)}
    ciclos = {c['plan_id']: c for c in await db.mant_ciclos.find({'plan_id': {'$in': ids}, 'estado': 'abierto'}, {'_id': 0}).sort('numero', 1).to_list(1000)}
    gente = await _nombres([p['supervisor_id'] for p in planes] + [_responsable_actual(p) for p in planes])
    out = []
    for p in planes:
        c = ciclos.get(p['id'])
        out.append({
            'id': p['id'], 'numero': p['numero'], 'nombre': p['nombre'], 'estado': p['estado'], 'frecuencia': p['frecuencia'],
            'intervalo_dias': p.get('intervalo_dias'), 'inicio': p['inicio'], 'fin_tipo': p.get('fin_tipo'), 'fin_valor': p.get('fin_valor'),
            'tareas_por_ciclo': len(p.get('definiciones', [])), 'ciclo_actual': p.get('ciclo_actual', 0),
            'supervisor': gente.get(p['supervisor_id']), 'responsable': gente.get(_responsable_actual(p)),
            'ciclo': {k: c.get(k) for k in ('numero', 'inicio', 'fin', 'total', 'completadas')} if c else None,
            'vencidas': vencidas.get(p['id'], 0),
            'puede_gestionar': await _puede_gestionar_plan(user, p),
        })
    return serialize_doc(out)


@router.get('/planes/{plan_id}')
async def get_plan(plan_id: str, ciclo: Optional[int] = None, user=Depends(get_current_user)):
    plan = await _plan_o_404(plan_id)
    if not await _visible(user, plan):
        raise HTTPException(status_code=403, detail='No tienes acceso a esta planificación')
    ciclos = await db.mant_ciclos.find({'plan_id': plan_id}, {'_id': 0}).sort('numero', -1).to_list(2000)
    sel = next((c for c in ciclos if c['numero'] == ciclo), None) if ciclo else (ciclos[0] if ciclos else None)
    tareas = await db.mant_tareas.find({'ciclo_id': sel['id']}, {'_id': 0, 'respuestas': 0, 'checklist.items': 0}).sort('vence_en', 1).to_list(1000) if sel else []
    cambios = await db.mant_plan_cambios.find({'plan_id': plan_id}, {'_id': 0, 'antes': 0, 'despues': 0}).sort('at', -1).limit(200).to_list(200)
    activos = {a['id']: a for a in await db.activos.find({'id': {'$in': [d['activo_id'] for d in plan.get('definiciones', [])]}},
                                                         {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'sucursal': 1, 'estado': 1}).to_list(1000)}
    checklists = {c['id']: c for c in await db.mant_checklists.find({'id': {'$in': [d['checklist_id'] for d in plan.get('definiciones', [])]}},
                                                                   {'_id': 0, 'id': 1, 'nombre': 1, 'eliminado': 1}).to_list(500)}
    gente = await _nombres([plan['supervisor_id']] + [r['usuario_id'] for r in plan.get('responsables', [])] + [t['responsable_id'] for t in tareas])
    ini = date.fromisoformat(plan['inicio'])
    proximo = None
    if plan['estado'] == 'activa':
        n = max(int(plan.get('ciclo_actual') or 0), int(plan.get('saltar_hasta') or 0)) + 1
        ult = motor.ultimo_ciclo(ini, plan['frecuencia'], plan.get('intervalo_dias'), plan.get('fin_tipo'), plan.get('fin_valor'))
        if ult is None or n <= ult:
            proximo = {'numero': n, 'inicio': motor.inicio_ciclo(ini, plan['frecuencia'], plan.get('intervalo_dias'), n).isoformat()}
    return serialize_doc({
        'plan': plan, 'ciclos': ciclos, 'ciclo': sel, 'tareas': tareas, 'cambios': cambios, 'activos': activos,
        'checklists': checklists, 'personas': gente, 'responsable_id': _responsable_actual(plan), 'proximo_ciclo': proximo,
        'puede_gestionar': await _puede_gestionar_plan(user, plan), 'ahora': _ahora(),
    })


# ── Generación de ciclos y tareas (lo llama reminders._loop) ─────
async def _crear_ciclo(plan, n, hoy, ahora):
    ini, fin = motor.rango_ciclo(date.fromisoformat(plan['inicio']), plan['frecuencia'], plan.get('intervalo_dias'), n)
    pasado = fin <= hoy  # el servidor estuvo apagado: el ciclo ya terminó
    ciclo = {'id': new_id(), 'plan_id': plan['id'], 'numero': n, 'inicio': ini.isoformat(), 'fin': fin.isoformat(),
             'estado': 'cerrado' if pasado else 'abierto', 'total': 0, 'completadas': 0, 'a_tiempo': 0, 'tardias': 0,
             'incompletas': 0, 'created_at': now_iso(), 'atrasado': pasado}
    try:
        await db.mant_ciclos.insert_one(ciclo)
    except DuplicateKeyError:
        return  # otra vuelta ya lo creó
    responsable = motor.responsable_de_ciclo(plan.get('responsables'), n)
    activos = {a['id']: a for a in await db.activos.find({'id': {'$in': [d['activo_id'] for d in plan.get('definiciones', [])]}},
                                                         {'_id': 0}).to_list(1000)}
    checklists = {c['id']: c for c in await db.mant_checklists.find(
        {'id': {'$in': [d['checklist_id'] for d in plan.get('definiciones', [])]}}, {'_id': 0}).to_list(500)}
    total, abiertas = 0, 0
    rep = {r['definicion_id']: r for r in plan.get('reprogramaciones', []) if r.get('ciclo') == n}
    defs = sorted([d for d in plan.get('definiciones', []) if d.get('activa', True)],
                  key=lambda d: motor.tiempos_tarea(ini, fin, d, rep.get(d['id']))[1])
    for i, d in enumerate(defs, start=1):
        a, ch = activos.get(d['activo_id']), checklists.get(d['checklist_id'])
        if not a or a.get('estado') != 'activo' or not ch:
            continue  # activo dado de baja o checklist borrado: no se genera
        r = rep.get(d['id'])
        fecha, disp, vence = motor.tiempos_tarea(ini, fin, d, r)
        # un ciclo que ya pasó deja incompletas sus tareas, salvo las reprogramadas a una fecha que aún no vence
        estado = 'incompleta' if pasado and vence <= ahora else 'programada'
        abiertas += estado == 'programada'
        tarea = {
            'id': new_id(), 'numero': f'{plan["numero"]}-C{n}-{i:02d}', 'plan_id': plan['id'], 'plan_numero': plan['numero'],
            'plan_nombre': plan['nombre'], 'ciclo_id': ciclo['id'], 'ciclo_numero': n, 'definicion_id': d['id'],
            'activo_id': a['id'], 'activo_codigo': a['codigo'], 'activo_nombre': a['nombre'], 'activo_categoria_id': a['categoria_id'],
            'sucursal': a['sucursal'], 'ubicacion': a.get('ubicacion') or '',
            'responsable_id': responsable, 'supervisor_id': plan['supervisor_id'],
            'checklist': {'id': ch['id'], 'nombre': ch['nombre'], 'version': ch.get('version', 1), 'items': ch['items'],
                          'antes_despues': bool(ch.get('antes_despues'))},
            'fecha': fecha.isoformat(), 'disponible_desde': disp, 'vence_en': vence,
            'acepta_tardias': d.get('acepta_tardias', False), 'recordatorio_horas': d.get('recordatorio_horas', 0),
            'estado': estado, 'tardia': False, 'avisos': [],
            'respuestas': [], 'tiene_falla': False, 'fallas': 0, 'created_at': now_iso(),
        }
        if r:
            orig = motor.tiempos_tarea(ini, fin, d)
            tarea['reprogramaciones'] = [{'de': orig[0].isoformat(), 'de_hora': d.get('hora'), 'a': fecha.isoformat(),
                                          'a_hora': r.get('hora') or d.get('hora'), 'motivo': r.get('motivo', ''),
                                          'por': r.get('por'), 'at': r.get('at')}]
            if estado == 'incompleta':
                tarea['incompleta_motivo'] = 'Terminó el ciclo'
        try:
            await db.mant_tareas.insert_one(tarea)
            total += 1
        except DuplicateKeyError:
            pass
    await db.mant_ciclos.update_one({'id': ciclo['id']}, {'$set': {'total': total, 'incompletas': total - abiertas if pasado else 0,
                                                                  'estado': 'abierto' if (not pasado or abiertas) else 'cerrado'}})
    await db.mant_planes.update_one({'id': plan['id']}, {'$max': {'ciclo_actual': n}})


async def _cerrar_ciclo(ciclo):
    # reclamo atómico: solo una vuelta cierra el ciclo y avisa
    r = await db.mant_ciclos.update_one({'id': ciclo['id'], 'estado': 'abierto'}, {'$set': {'estado': 'cerrado', 'cerrado_at': now_iso()}})
    if not r.modified_count:
        return
    await db.mant_tareas.update_many({'ciclo_id': ciclo['id'], 'estado': {'$in': list(ABIERTAS)}},
                                     {'$set': {'estado': 'incompleta', 'incompleta_motivo': 'Terminó el ciclo'}})
    await _recontar(ciclo['id'])
    c = await db.mant_ciclos.find_one({'id': ciclo['id']}, {'_id': 0})
    if c.get('incompletas'):
        plan = await db.mant_planes.find_one({'id': c['plan_id']}, {'_id': 0, 'id': 1, 'numero': 1, 'nombre': 1, 'supervisor_id': 1})
        if plan:
            await _avisar([plan['supervisor_id']], 'mant_ciclo_incompleto',
                          f'{plan["numero"]} · {plan["nombre"]}: el ciclo {c["numero"]} cerró con {c["incompletas"]} de {c["total"]} tareas incompletas.',
                          plan['id'], 'mant_plan')


async def _recontar(ciclo_id):
    tareas = await db.mant_tareas.find({'ciclo_id': ciclo_id, 'estado': {'$ne': 'cancelada'}}, {'_id': 0, 'estado': 1, 'tardia': 1}).to_list(1000)
    comp = [t for t in tareas if t['estado'] == 'completada']
    await db.mant_ciclos.update_one({'id': ciclo_id}, {'$set': {
        'total': len(tareas), 'completadas': len(comp), 'tardias': len([t for t in comp if t.get('tardia')]),
        'a_tiempo': len([t for t in comp if not t.get('tardia')]), 'incompletas': len([t for t in tareas if t['estado'] == 'incompleta'])}})


async def revisar_planes(solo_plan=None):
    """Crea los ciclos que tocan (por fecha), cierra los que terminaron y da
    por finalizadas las planificaciones que llegaron a su fin."""
    hoy, ahora = now_local().date(), _ahora()
    q = {'estado': 'activa'}
    if solo_plan:
        q['id'] = solo_plan
    for plan in await db.mant_planes.find(q, {'_id': 0}).to_list(1000):
        for n in motor.ciclos_pendientes(plan, hoy):
            await _crear_ciclo(plan, n, hoy, ahora)
            plan['ciclo_actual'] = n
    for c in await db.mant_ciclos.find({'estado': 'abierto', 'fin': {'$lte': hoy.isoformat()}}, {'_id': 0}).to_list(1000):
        if await db.mant_tareas.find_one({'ciclo_id': c['id'], 'estado': {'$in': list(ABIERTAS)}, 'vence_en': {'$gt': ahora}}, {'_id': 1}):
            continue  # tiene una tarea reprogramada más allá del fin del ciclo
        await _cerrar_ciclo(c)
    # finalizar: llegó al último ciclo y ya no tiene ciclos abiertos
    for plan in await db.mant_planes.find({**q, 'fin_tipo': {'$in': ['fecha', 'ciclos']}}, {'_id': 0}).to_list(1000):
        ult = motor.ultimo_ciclo(date.fromisoformat(plan['inicio']), plan['frecuencia'], plan.get('intervalo_dias'),
                                 plan.get('fin_tipo'), plan.get('fin_valor'))
        if ult is not None and int(plan.get('ciclo_actual') or 0) >= ult \
                and not await db.mant_ciclos.find_one({'plan_id': plan['id'], 'estado': 'abierto'}, {'_id': 1}):
            r = await db.mant_planes.update_one({'id': plan['id'], 'estado': 'activa'}, {'$set': {'estado': 'finalizada', 'finalizada_at': now_iso()}})
            if r.modified_count:
                await _avisar([plan['supervisor_id']], 'mant_plan_finalizado',
                              f'{plan["numero"]} · {plan["nombre"]}: terminó su último ciclo.', plan['id'], 'mant_plan')


async def revisar_tareas():
    """Disponibles → pendiente (aviso al responsable), recordatorio antes de
    vencer, y al vencer: incompleta (si no acepta tardías) o aviso de vencida."""
    ahora = _ahora()
    for t in await db.mant_tareas.find({'estado': 'programada', 'disponible_desde': {'$lte': ahora}}, {'_id': 0}).to_list(2000):
        r = await db.mant_tareas.update_one({'id': t['id'], 'estado': 'programada'}, {'$set': {'estado': 'pendiente', 'asignada_at': now_iso()}})
        if r.modified_count:
            await _avisar([t['responsable_id']], 'mant_tarea_asignada',
                          f'{t["numero"]}: {t["checklist"]["nombre"]} en {t["activo_codigo"]} · {t["activo_nombre"]} ({t["sucursal"]}).', t['id'])
    for t in await db.mant_tareas.find({'estado': 'pendiente', 'recordatorio_horas': {'$gt': 0}, 'avisos': {'$ne': 'recordatorio'},
                                        'vence_en': {'$gt': ahora}}, {'_id': 0}).to_list(2000):
        y, mo, d = map(int, t['vence_en'][:10].split('-'))
        hh, mi = map(int, t['vence_en'][11:16].split(':'))
        aviso = (datetime(y, mo, d, hh, mi) - timedelta(hours=t['recordatorio_horas'])).strftime(motor.FMT)
        if ahora < aviso:
            continue
        r = await db.mant_tareas.update_one({'id': t['id'], 'avisos': {'$ne': 'recordatorio'}}, {'$addToSet': {'avisos': 'recordatorio'}})
        if r.modified_count:
            await _avisar([t['responsable_id']], 'mant_tarea_recordatorio',
                          f'{t["numero"]}: {t["checklist"]["nombre"]} en {t["activo_codigo"]} vence pronto.', t['id'])
    for t in await db.mant_tareas.find({'estado': 'pendiente', 'vence_en': {'$lte': ahora}, 'avisos': {'$ne': 'vencida'}}, {'_id': 0}).to_list(2000):
        cambio = {'$addToSet': {'avisos': 'vencida'}}
        if not t.get('acepta_tardias'):
            cambio['$set'] = {'estado': 'incompleta', 'incompleta_motivo': 'Venció el plazo'}
        r = await db.mant_tareas.update_one({'id': t['id'], 'estado': 'pendiente', 'avisos': {'$ne': 'vencida'}}, cambio)
        if not r.modified_count:
            continue
        if not t.get('acepta_tardias'):
            await _recontar(t['ciclo_id'])
            msg = f'{t["numero"]}: venció sin hacerse y quedó incompleta ({t["activo_codigo"]} · {t["checklist"]["nombre"]}).'
        else:
            msg = f'{t["numero"]}: venció el plazo; todavía se puede hacer, quedará como tardía ({t["activo_codigo"]}).'
        await _avisar([t['responsable_id'], t['supervisor_id']], 'mant_tarea_vencida', msg, t['id'])


async def revisar():
    await revisar_planes()
    await revisar_tareas()


# ── Tareas ───────────────────────────────────────────────────────
def _resumen_tarea(t):
    base = {k: t.get(k) for k in ('id', 'numero', 'plan_id', 'plan_numero', 'plan_nombre', 'ciclo_numero', 'activo_id', 'activo_codigo',
                                  'activo_nombre', 'activo_categoria_id', 'sucursal', 'ubicacion', 'fecha', 'disponible_desde', 'vence_en',
                                  'acepta_tardias', 'estado', 'tardia', 'completada_en', 'tiene_falla', 'fallas', 'responsable_id')}
    return {**base, 'checklist_nombre': t['checklist']['nombre'], 'preguntas': len(t['checklist'].get('items') or [])}


@router.get('/mis-tareas')
async def mis_tareas(user=Depends(get_current_user)):
    ahora = _ahora()
    en_7 = (now_local() + timedelta(days=7)).strftime(motor.FMT)
    abiertas = await db.mant_tareas.find({'responsable_id': user['id'], 'estado': {'$in': list(ABIERTAS)}}, {'_id': 0, 'respuestas': 0}).sort('vence_en', 1).to_list(1000)
    hechas = await db.mant_tareas.find({'responsable_id': user['id'], 'estado': {'$in': ['completada', 'incompleta']}},
                                       {'_id': 0, 'respuestas': 0}).sort('fecha', -1).limit(30).to_list(30)
    pend = [t for t in abiertas if t['estado'] == 'pendiente']
    return serialize_doc({
        'ahora': ahora,
        'vencidas': [_resumen_tarea(t) for t in pend if t['vence_en'] <= ahora],
        'pendientes': [_resumen_tarea(t) for t in pend if t['vence_en'] > ahora],
        'proximas': [_resumen_tarea(t) for t in abiertas if t['estado'] == 'programada' and t['disponible_desde'] <= en_7],
        'historial': [_resumen_tarea(t) for t in hechas],
    })


async def _tarea_visible(user, t):
    if user['id'] in (t.get('responsable_id'), t.get('supervisor_id'), t.get('completada_por')):
        return True
    plan = await db.mant_planes.find_one({'id': t['plan_id']}, {'_id': 0})
    return bool(plan) and await _puede_gestionar_plan(user, plan)


@router.get('/tareas/{tid}')
async def get_tarea(tid: str, user=Depends(get_current_user)):
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    if not await _tarea_visible(user, t):
        raise HTTPException(status_code=403, detail='No tienes acceso a esta tarea')
    activo = await db.activos.find_one({'id': t['activo_id']}, {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'foto': 1, 'ubicacion': 1, 'sucursal': 1})
    gente = await _nombres([t['responsable_id'], t['supervisor_id'], t.get('completada_por')])
    plan = await db.mant_planes.find_one({'id': t['plan_id']}, {'_id': 0})
    gestiona = bool(plan) and await _puede_gestionar_plan(user, plan)
    usuarios = await db.users.find({'status': 'approved', **filtro_usuarios_depto(depto_plan(plan))},
                                   {'_id': 0, 'id': 1, 'name': 1, 'position': 1, 'area': 1}).sort('name', 1).to_list(1000) \
        if gestiona and t['estado'] in ABIERTAS else []
    return serialize_doc({'tarea': t, 'activo': activo, 'personas': gente, 'ahora': _ahora(), 'usuarios': usuarios,
                          'puede_hacer': t['responsable_id'] == user['id'] and t['estado'] in ABIERTAS,
                          'puede_gestionar': gestiona})


async def _subir(tid, f: UploadFile):
    content = await f.read()
    if not content:
        return None
    if len(content) > MAX_FOTO:
        raise HTTPException(status_code=400, detail=f'Una foto supera el máximo de {MAX_FOTO // (1024 * 1024)} MB')
    ctype = f.content_type or 'image/jpeg'
    pid = new_id()
    ext = 'png' if 'png' in ctype else ('webp' if 'webp' in ctype else 'jpg')
    path = f'{storage.APP_NAME}/mantenimiento/{tid}/{pid}.{ext}'
    try:
        await storage.put_object(path, content, ctype)
    except Exception as e:
        logger.error(f'mant photo upload failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo subir una de las fotos')
    return {'id': pid, 'path': path, 'content_type': ctype}


@router.post('/tareas/{tid}/completar')
async def completar(tid: str, data: str = Form(...), photos: List[UploadFile] = File(default=[]),
                    photo_owner: List[str] = Form(default=[]), user=Depends(get_current_user)):
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    if t['responsable_id'] != user['id']:
        raise HTTPException(status_code=403, detail='Esta tarea está asignada a otra persona')
    # 'programada' = todavía no le llega el aviso, pero el responsable puede adelantarla
    if t['estado'] not in ABIERTAS:
        raise HTTPException(status_code=400, detail={'completada': 'Esta tarea ya se completó',
                                                     'incompleta': 'Esta tarea venció y quedó incompleta',
                                                     'cancelada': 'Esta tarea fue cancelada'}.get(t['estado'], 'La tarea no se puede completar'))
    try:
        payload = json.loads(data)
    except Exception:
        raise HTTPException(status_code=400, detail='Respuestas inválidas')
    if len(photos) != len(photo_owner):
        raise HTTPException(status_code=400, detail='Las fotos no coinciden con sus preguntas')
    raw = {r.get('item_id'): r for r in payload.get('respuestas') or []}
    fotos_de = {}
    for o in photo_owner:
        fotos_de[o] = fotos_de.get(o, 0) + 1
    respuestas, fallas = [], []
    for i, it in enumerate(t['checklist']['items'], start=1):
        r = raw.get(it['id']) or {}
        valor, comentario = r.get('valor'), _txt(r.get('comentario'), 1000)
        n_fotos = fotos_de.get(it['id'], 0)
        vacio = valor in (None, '', [])
        if it['tipo'] == 'estado':
            if not vacio and valor not in VALORES_ESTADO:
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: respuesta no válida')
        elif it['tipo'] == 'unica':
            if not vacio and valor not in {o['texto'] for o in it.get('opciones') or []}:
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: elige una de las opciones')
        elif it['tipo'] == 'multiple':
            validas = [o['texto'] for o in it.get('opciones') or []]
            if not isinstance(valor or [], list) or any(v not in validas for v in valor or []):
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: opciones no válidas')
            valor = [v for v in validas if v in (valor or [])]  # en el orden del checklist
            vacio = not valor
        elif it['tipo'] == 'check':
            valor = valor in (True, 'true', 1, '1')
            vacio = not valor  # obligatoria = hay que marcarla
        elif it['tipo'] == 'numero' and not vacio:
            try:
                valor = round(float(valor), 2)
            except (TypeError, ValueError):
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: escribe un número')
        elif it['tipo'] == 'texto':
            valor = _txt(valor, 2000) or None
            vacio = valor is None
        elif it['tipo'] == 'foto':
            valor = None
            vacio = not n_fotos
        if it.get('obligatorio') and vacio:
            raise HTTPException(status_code=400, detail=f'Pregunta {i}: ' + (
                'agrega la foto' if it['tipo'] == 'foto' else 'márcala' if it['tipo'] == 'check' else 'falta la respuesta'))
        if _es_falla(it, valor):
            if not comentario:
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: describe la falla')
            if not n_fotos:
                raise HTTPException(status_code=400, detail=f'Pregunta {i}: agrega una foto de la falla')
            fallas.append(it)
        elif _modo_fotos(it) == 'obligatoria' and it['tipo'] != 'foto' and not n_fotos:
            raise HTTPException(status_code=400, detail=f'Pregunta {i}: agrega al menos una foto')
        respuestas.append({'item_id': it['id'], 'valor': valor, 'comentario': comentario, 'fotos': []})
    # antes y después (si el checklist lo pide)
    extremos = {}
    if t['checklist'].get('antes_despues'):
        for clave, nombre in ((ANTES, 'cómo encontraste el equipo'), (DESPUES, 'cómo quedó el equipo')):
            if not fotos_de.get(clave):
                raise HTTPException(status_code=400, detail=f'Agrega al menos una foto de {nombre}')
            extremos[clave] = {'comentario': _txt((raw.get(clave) or {}).get('comentario'), 1000), 'fotos': []}
    por_item = {r['item_id']: r for r in respuestas}
    destino = {**por_item, **extremos}
    for f, owner in zip(photos, photo_owner):
        if owner in destino:
            ph = await _subir(tid, f)
            if ph:
                destino[owner]['fotos'].append(ph)

    ahora = _ahora()
    tardia = ahora > t['vence_en']
    r = await db.mant_tareas.update_one({'id': tid, 'estado': {'$in': list(ABIERTAS)}}, {'$set': {
        'adelantada': t['estado'] == 'programada',
        'estado': 'completada', 'tardia': tardia, 'completada_en': ahora, 'completada_at': now_iso(),
        'completada_por': user['id'], 'completada_por_nombre': user['name'], 'respuestas': respuestas,
        'observaciones': _txt(payload.get('observaciones'), 2000), 'tiene_falla': bool(fallas), 'fallas': len(fallas),
        'antes': extremos.get(ANTES), 'despues': extremos.get(DESPUES)}})
    if not r.modified_count:
        raise HTTPException(status_code=409, detail='La tarea cambió mientras la llenabas; recarga la página')
    await _recontar(t['ciclo_id'])
    # historial del activo
    n_bien = len([x for x in respuestas if x['valor'] == 'bien'])
    resumen = f'Mantenimiento {t["numero"]} · {t["checklist"]["nombre"]}' + (' (tardío)' if tardia else '')
    detalle = ', '.join(x for x in [f'{n_bien} bien' if n_bien else '', f'{len(fallas)} con falla' if fallas else ''] if x)
    activo = {'id': t['activo_id']}
    await routes_activos._historial(activo, 'mantenimiento', resumen + (f': {detalle}' if detalle else ''), user, tarea_id=tid)
    for it in fallas:
        v = por_item[it['id']]['valor']
        eleccion = f' ({", ".join(v) if isinstance(v, list) else v})' if it['tipo'] in ('unica', 'multiple') else ''
        await routes_activos._historial(activo, 'falla', f'Falla en {t["numero"]}: {it["texto"]}{eleccion} — {por_item[it["id"]]["comentario"]}', user, tarea_id=tid)
    if fallas:
        await _avisar([t['supervisor_id']], 'mant_falla',
                      f'{t["numero"]}: {len(fallas)} falla{"s" if len(fallas) > 1 else ""} en {t["activo_codigo"]} · {t["activo_nombre"]} ({t["sucursal"]}).',
                      tid, actor=user)
    return serialize_doc(await db.mant_tareas.find_one({'id': tid}, {'_id': 0}))


class ReprogramarInput(BaseModel):
    fecha: Optional[str] = None  # None = volver a la fecha que toca en el ciclo
    hora: Optional[str] = None
    motivo: Optional[str] = ''


def _fecha_hora(data: ReprogramarInput, hora_def):
    try:
        fecha = date.fromisoformat(_txt(data.fecha, 10))
    except ValueError:
        raise HTTPException(status_code=400, detail='Fecha no válida')
    hora = _txt(data.hora, 5) or hora_def or '08:00'
    try:
        hh, mm = hora.split(':')
        assert 0 <= int(hh) < 24 and 0 <= int(mm) < 60
    except Exception:
        raise HTTPException(status_code=400, detail='Hora no válida')
    return fecha, f'{int(hh):02d}:{int(mm):02d}'


async def _reprogramar_tarea(t, plan, data: ReprogramarInput, user):
    if t['estado'] not in ABIERTAS:
        raise HTTPException(status_code=400, detail='Solo se cambia la fecha de una tarea programada o pendiente')
    d = next((x for x in plan.get('definiciones', []) if x['id'] == t['definicion_id']), None) or {
        'aviso_previo_dias': 0, 'horas_plazo': 24, 'hora': t['vence_en'][11:16]}
    ciclo = await db.mant_ciclos.find_one({'id': t['ciclo_id']}, {'_id': 0})
    if data.fecha:
        fecha, hora = _fecha_hora(data, d.get('hora'))
        fecha, disp, vence = motor.tiempos_en(fecha, hora, d)
    else:  # volver a la fecha del ciclo
        fecha, disp, vence = motor.tiempos_tarea(date.fromisoformat(ciclo['inicio']), date.fromisoformat(ciclo['fin']), d)
        hora = d.get('hora')
    ahora = _ahora()
    if vence <= ahora:
        raise HTTPException(status_code=400, detail='Con esa fecha la tarea ya estaría vencida: elige una fecha posterior')
    estado = 'pendiente' if disp <= ahora else 'programada'
    reg = {'de': t['fecha'], 'de_hora': t['vence_en'][11:16], 'a': fecha.isoformat(), 'a_hora': hora,
           'motivo': _txt(data.motivo, 500), 'por': user['name'], 'at': now_iso()}
    await db.mant_tareas.update_one({'id': t['id'], 'estado': {'$in': list(ABIERTAS)}}, {
        '$set': {'fecha': fecha.isoformat(), 'disponible_desde': disp, 'vence_en': vence, 'estado': estado, 'avisos': []},
        '$push': {'reprogramaciones': reg}})
    await _cambio(plan, user, f'Tarea {t["numero"]} ({t["activo_codigo"]}) pasa del {t["fecha"]} al {fecha.isoformat()} {hora}'
                  + (f': {reg["motivo"]}' if reg['motivo'] else ''))
    await _avisar([t['responsable_id']], 'mant_tarea_reprogramada',
                  f'{t["numero"]}: {t["checklist"]["nombre"]} en {t["activo_codigo"]} ahora es el {fecha.isoformat()} a las {hora}.', t['id'], actor=user)
    if estado == 'pendiente' and t['estado'] == 'programada':
        await _avisar([t['responsable_id']], 'mant_tarea_asignada',
                      f'{t["numero"]}: {t["checklist"]["nombre"]} en {t["activo_codigo"]} · {t["activo_nombre"]} ({t["sucursal"]}).', t['id'])
    return await db.mant_tareas.find_one({'id': t['id']}, {'_id': 0})


@router.post('/tareas/{tid}/reprogramar')
async def reprogramar_tarea(tid: str, data: ReprogramarInput, user=Depends(get_current_user)):
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    plan = await db.mant_planes.find_one({'id': t['plan_id']}, {'_id': 0})
    if not plan or not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes cambiar la fecha de esta tarea')
    return serialize_doc(await _reprogramar_tarea(t, plan, data, user))


@router.get('/planes/{plan_id}/proximos')
async def proximos(plan_id: str, ciclos: int = 3, user=Depends(get_current_user)):
    """Los mantenimientos que vienen: las tareas abiertas ya creadas y las de
    los próximos `ciclos` ciclos (calculadas, con sus reprogramaciones)."""
    plan = await _plan_o_404(plan_id)
    if not await _visible(user, plan):
        raise HTTPException(status_code=403, detail='No tienes acceso a esta planificación')
    activos = {a['id']: a for a in await db.activos.find({'id': {'$in': [d['activo_id'] for d in plan.get('definiciones', [])]}},
                                                         {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'estado': 1}).to_list(1000)}
    checklists = {c['id']: c['nombre'] for c in await db.mant_checklists.find(
        {'id': {'$in': [d['checklist_id'] for d in plan.get('definiciones', [])]}}, {'_id': 0, 'id': 1, 'nombre': 1}).to_list(500)}
    out = []
    for t in await db.mant_tareas.find({'plan_id': plan_id, 'estado': {'$in': list(ABIERTAS)}},
                                       {'_id': 0, 'respuestas': 0, 'checklist.items': 0}).to_list(1000):
        out.append({'ciclo': t['ciclo_numero'], 'definicion_id': t['definicion_id'], 'tarea_id': t['id'], 'numero': t['numero'],
                    'activo_codigo': t['activo_codigo'], 'activo_nombre': t['activo_nombre'], 'checklist': t['checklist']['nombre'],
                    'fecha': t['fecha'], 'disponible_desde': t['disponible_desde'],
                    'vence_en': t['vence_en'], 'estado': t['estado'], 'reprogramada': bool(t.get('reprogramaciones')),
                    'fecha_original': (t.get('reprogramaciones') or [{}])[0].get('de')})
    if plan['estado'] in ('activa', 'pausada', 'borrador'):
        ini = date.fromisoformat(plan['inicio'])
        ult = motor.ultimo_ciclo(ini, plan['frecuencia'], plan.get('intervalo_dias'), plan.get('fin_tipo'), plan.get('fin_valor'))
        desde = max(int(plan.get('ciclo_actual') or 0), int(plan.get('saltar_hasta') or 0)) + 1
        rep = {(r['ciclo'], r['definicion_id']): r for r in plan.get('reprogramaciones', [])}
        for n in range(desde, desde + max(1, min(ciclos, 12))):
            if ult is not None and n > ult:
                break
            a_ini, a_fin = motor.rango_ciclo(ini, plan['frecuencia'], plan.get('intervalo_dias'), n)
            for d in plan.get('definiciones', []):
                a = activos.get(d['activo_id'])
                if not a or a.get('estado') != 'activo':
                    continue
                r = rep.get((n, d['id']))
                fecha, disp, vence = motor.tiempos_tarea(a_ini, a_fin, d, r)
                out.append({'ciclo': n, 'definicion_id': d['id'], 'tarea_id': None, 'numero': None,
                            'activo_codigo': a['codigo'], 'activo_nombre': a['nombre'], 'checklist': checklists.get(d['checklist_id'], '—'),
                            'fecha': fecha.isoformat(), 'disponible_desde': disp, 'vence_en': vence, 'estado': 'futura',
                            'reprogramada': bool(r),
                            'fecha_original': motor.tiempos_tarea(a_ini, a_fin, d)[0].isoformat() if r else None})
    out.sort(key=lambda x: (x['disponible_desde'], x['activo_codigo']))
    return serialize_doc({'proximos': out, 'puede_gestionar': await _puede_gestionar_plan(user, plan)})


class ReprogramarPlanInput(ReprogramarInput):
    ciclo: int
    definicion_id: str


@router.post('/planes/{plan_id}/reprogramar')
async def reprogramar_plan(plan_id: str, data: ReprogramarPlanInput, user=Depends(get_current_user)):
    """Cambia la fecha de un mantenimiento de un ciclo. Si su tarea ya existe,
    se mueve la tarea; si es de un ciclo futuro, queda guardado y la tarea se
    crea con esa fecha. Sin `fecha` vuelve a la fecha que toca en el ciclo."""
    plan = await _plan_o_404(plan_id)
    if not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes cambiar fechas en esta planificación')
    if plan['estado'] in ('archivada', 'finalizada'):
        raise HTTPException(status_code=400, detail='La planificación ya terminó')
    d = next((x for x in plan.get('definiciones', []) if x['id'] == data.definicion_id), None)
    if not d:
        raise HTTPException(status_code=400, detail='Tarea no encontrada en la planificación')
    ciclo = await db.mant_ciclos.find_one({'plan_id': plan_id, 'numero': data.ciclo}, {'_id': 0, 'id': 1})
    if ciclo:
        t = await db.mant_tareas.find_one({'ciclo_id': ciclo['id'], 'definicion_id': d['id']}, {'_id': 0})
        if not t:
            raise HTTPException(status_code=400, detail='Ese mantenimiento no se generó en su ciclo')
        return serialize_doc({'tarea': await _reprogramar_tarea(t, plan, data, user)})
    if data.ciclo <= int(plan.get('ciclo_actual') or 0) or data.ciclo <= int(plan.get('saltar_hasta') or 0):
        raise HTTPException(status_code=400, detail='Ese ciclo ya pasó')
    ini = date.fromisoformat(plan['inicio'])
    a_ini, a_fin = motor.rango_ciclo(ini, plan['frecuencia'], plan.get('intervalo_dias'), data.ciclo)
    original = motor.tiempos_tarea(a_ini, a_fin, d)
    resto = [r for r in plan.get('reprogramaciones', []) if (r['ciclo'], r['definicion_id']) != (data.ciclo, d['id'])]
    activo = await db.activos.find_one({'id': d['activo_id']}, {'_id': 0, 'codigo': 1}) or {}
    if data.fecha:
        fecha, hora = _fecha_hora(data, d.get('hora'))
        if motor.tiempos_en(fecha, hora, d)[2] <= _ahora():
            raise HTTPException(status_code=400, detail='Con esa fecha ya estaría vencido: elige una fecha posterior')
        resto.append({'ciclo': data.ciclo, 'definicion_id': d['id'], 'fecha': fecha.isoformat(), 'hora': hora,
                      'motivo': _txt(data.motivo, 500), 'por': user['name'], 'at': now_iso()})
        resumen = f'Ciclo {data.ciclo}, {activo.get("codigo", "")}: del {original[0].isoformat()} al {fecha.isoformat()} {hora}'
    else:
        resumen = f'Ciclo {data.ciclo}, {activo.get("codigo", "")}: vuelve a su fecha del ciclo ({original[0].isoformat()})'
    await db.mant_planes.update_one({'id': plan_id}, {'$set': {'reprogramaciones': resto}})
    await _cambio(plan, user, 'Fecha cambiada · ' + resumen + (f': {_txt(data.motivo, 500)}' if data.motivo else ''))
    return serialize_doc({'ok': True})


class ReasignarInput(BaseModel):
    usuario_id: str


@router.post('/tareas/{tid}/reasignar')
async def reasignar(tid: str, data: ReasignarInput, user=Depends(get_current_user)):
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    plan = await db.mant_planes.find_one({'id': t['plan_id']}, {'_id': 0})
    if not plan or not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes reasignar esta tarea')
    if t['estado'] not in ABIERTAS:
        raise HTTPException(status_code=400, detail='Solo se reasigna una tarea programada o pendiente')
    nuevo = await _usuario(_txt(data.usuario_id, 60), depto_plan(plan))
    if not nuevo:
        raise HTTPException(status_code=400, detail='Elige a quién reasignar (alguien del mismo departamento)')
    if nuevo['id'] == t['responsable_id']:
        return serialize_doc(t)
    await db.mant_tareas.update_one({'id': tid}, {'$set': {'responsable_id': nuevo['id']},
                                                  '$push': {'reasignaciones': {'de': t['responsable_id'], 'a': nuevo['id'], 'por': user['name'], 'at': now_iso()}}})
    await _cambio(plan, user, f'Tarea {t["numero"]} reasignada a {nuevo["name"]}')
    if t['estado'] == 'pendiente':
        await _avisar([nuevo['id']], 'mant_tarea_asignada',
                      f'{t["numero"]}: {t["checklist"]["nombre"]} en {t["activo_codigo"]} · {t["activo_nombre"]} ({t["sucursal"]}).', tid, actor=user)
    return serialize_doc(await db.mant_tareas.find_one({'id': tid}, {'_id': 0}))


class CancelarInput(BaseModel):
    motivo: str


@router.post('/tareas/{tid}/cancelar')
async def cancelar(tid: str, data: CancelarInput, user=Depends(get_current_user)):
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    plan = await db.mant_planes.find_one({'id': t['plan_id']}, {'_id': 0})
    if not plan or not await _puede_gestionar_plan(user, plan):
        raise HTTPException(status_code=403, detail='No puedes cancelar esta tarea')
    motivo = _txt(data.motivo, 500)
    if not motivo:
        raise HTTPException(status_code=400, detail='Escribe el motivo')
    r = await db.mant_tareas.update_one({'id': tid, 'estado': {'$in': list(ABIERTAS)}}, {'$set': {
        'estado': 'cancelada', 'cancelada_motivo': motivo, 'cancelada_por': user['name'], 'cancelada_at': now_iso()}})
    if not r.modified_count:
        raise HTTPException(status_code=400, detail='Solo se cancela una tarea programada o pendiente')
    await _recontar(t['ciclo_id'])
    await _cambio(plan, user, f'Tarea {t["numero"]} cancelada: {motivo}')
    if t['estado'] == 'pendiente':
        await _avisar([t['responsable_id']], 'mant_tarea_cancelada', f'{t["numero"]}: se canceló ({motivo}).', tid, actor=user)
    return serialize_doc(await db.mant_tareas.find_one({'id': tid}, {'_id': 0}))


@router.get('/tareas/{tid}/foto/{pid}')
async def foto(tid: str, pid: str, user=Depends(get_current_user)):
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tarea no encontrada')
    if not await _tarea_visible(user, t):
        # quien ve el activo también ve las fotos de sus mantenimientos
        try:
            await routes_activos._get(t['activo_id'], user)
        except HTTPException:
            raise HTTPException(status_code=403, detail='No tienes acceso a esta foto')
    grupos = t.get('respuestas', []) + [x for x in (t.get('antes'), t.get('despues')) if x]
    ph = next((p for r in grupos for p in r.get('fotos', []) if p['id'] == pid), None)
    if not ph:
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    try:
        content, ctype = await storage.get_object(ph['path'])
    except Exception as e:
        logger.error(f'mant photo download failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=ph.get('content_type', ctype))


@router.get('/tareas/{tid}/foto-activo')
async def foto_activo(tid: str, user=Depends(get_current_user)):
    """Foto de referencia del activo, para quien hace la tarea (aunque no sea
    responsable de la categoría): sirve para comparar el encuadre."""
    t = await db.mant_tareas.find_one({'id': tid}, {'_id': 0})
    if not t or not await _tarea_visible(user, t):
        raise HTTPException(status_code=404, detail='Foto no encontrada')
    a = await db.activos.find_one({'id': t['activo_id']}, {'_id': 0, 'foto': 1})
    ph = (a or {}).get('foto')
    if not ph:
        raise HTTPException(status_code=404, detail='El activo no tiene foto')
    try:
        content, ctype = await storage.get_object(ph['path'])
    except Exception as e:
        logger.error(f'activo photo download failed: {e}')
        raise HTTPException(status_code=502, detail='No se pudo descargar la foto')
    return Response(content=content, media_type=ph.get('content_type', ctype))


# ── Agenda ───────────────────────────────────────────────────────
@router.get('/agenda')
async def agenda(start: str, end: str, user=Depends(get_current_user)):
    """Mantenimientos de la persona entre start y end (YYYY-MM-DD) para la
    Agenda: los que le toca hacer y los de las planificaciones que supervisa.
    Incluye las tareas ya creadas y las de los próximos ciclos, calculadas
    ('proyectada': todavía no existen; se crean al empezar su ciclo)."""
    try:
        d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail='Rango de fechas no válido')
    if (d1 - d0).days > 400:
        raise HTTPException(status_code=400, detail='Rango demasiado largo')
    uid = user['id']
    out = []
    for t in await db.mant_tareas.find(
            {'$or': [{'responsable_id': uid}, {'supervisor_id': uid}], 'estado': {'$ne': 'cancelada'},
             'fecha': {'$gte': start, '$lte': end}},
            {'_id': 0, 'respuestas': 0, 'antes': 0, 'despues': 0, 'checklist.items': 0}).to_list(2000):
        out.append({'id': t['id'], 'tarea_id': t['id'], 'numero': t['numero'], 'plan_id': t['plan_id'], 'plan_numero': t['plan_numero'],
                    'checklist': t['checklist']['nombre'], 'activo_codigo': t['activo_codigo'], 'activo_nombre': t['activo_nombre'],
                    'sucursal': t['sucursal'], 'fecha': t['fecha'], 'hora': t['disponible_desde'][11:16], 'vence_en': t['vence_en'],
                    'estado': t['estado'], 'tardia': t.get('tardia', False), 'proyectada': False,
                    'rol': 'responsable' if t['responsable_id'] == uid else 'supervisor'})
    # próximos ciclos (calculados) de las planificaciones activas en que participa
    planes = await db.mant_planes.find({'estado': 'activa', '$or': [{'supervisor_id': uid}, {'responsables.usuario_id': uid}]},
                                       {'_id': 0}).to_list(500)
    ids_activos = list({d['activo_id'] for p in planes for d in p.get('definiciones', [])})
    activos = {a['id']: a for a in await db.activos.find({'id': {'$in': ids_activos}},
                                                         {'_id': 0, 'id': 1, 'codigo': 1, 'nombre': 1, 'sucursal': 1, 'estado': 1}).to_list(2000)}
    ids_chk = list({d['checklist_id'] for p in planes for d in p.get('definiciones', [])})
    checklists = {c['id']: c['nombre'] for c in await db.mant_checklists.find({'id': {'$in': ids_chk}}, {'_id': 0, 'id': 1, 'nombre': 1}).to_list(1000)}
    for p in planes:
        ini = date.fromisoformat(p['inicio'])
        ult = motor.ultimo_ciclo(ini, p['frecuencia'], p.get('intervalo_dias'), p.get('fin_tipo'), p.get('fin_valor'))
        rep = {(r['ciclo'], r['definicion_id']): r for r in p.get('reprogramaciones', [])}
        n = max(int(p.get('ciclo_actual') or 0), int(p.get('saltar_hasta') or 0)) + 1
        for _ in range(400):
            if ult is not None and n > ult:
                break
            a_ini, a_fin = motor.rango_ciclo(ini, p['frecuencia'], p.get('intervalo_dias'), n)
            if a_ini > d1 and not any(k[0] == n for k in rep):
                break
            responsable = motor.responsable_de_ciclo(p.get('responsables'), n)
            if uid in (responsable, p['supervisor_id']):
                for d in p.get('definiciones', []):
                    a = activos.get(d['activo_id'])
                    if not a or a.get('estado') != 'activo' or d['checklist_id'] not in checklists:
                        continue
                    fecha, disp, vence = motor.tiempos_tarea(a_ini, a_fin, d, rep.get((n, d['id'])))
                    if d0 <= fecha <= d1:
                        out.append({'id': f'{p["id"]}-{n}-{d["id"]}', 'tarea_id': None, 'numero': f'{p["numero"]}-C{n}',
                                    'plan_id': p['id'], 'plan_numero': p['numero'], 'checklist': checklists[d['checklist_id']],
                                    'activo_codigo': a['codigo'], 'activo_nombre': a['nombre'], 'sucursal': a['sucursal'],
                                    'fecha': fecha.isoformat(), 'hora': disp[11:16], 'vence_en': vence, 'estado': 'proyectada',
                                    'tardia': False, 'proyectada': True, 'rol': 'responsable' if responsable == uid else 'supervisor'})
            n += 1
    out.sort(key=lambda x: (x['fecha'], x['hora'], x['activo_codigo']))
    return serialize_doc({'ahora': _ahora(), 'mantenimientos': out})


# ── Mantenimiento de un activo (para su ficha) ───────────────────
@router.get('/activo/{activo_id}')
async def de_activo(activo_id: str, user=Depends(get_current_user)):
    await routes_activos._get(activo_id, user)  # valida que lo pueda ver
    planes = await db.mant_planes.find({'definiciones.activo_id': activo_id, 'estado': {'$in': ['activa', 'pausada']}},
                                       {'_id': 0, 'id': 1, 'numero': 1, 'nombre': 1, 'estado': 1, 'frecuencia': 1, 'intervalo_dias': 1}).to_list(100)
    proxima = await db.mant_tareas.find_one({'activo_id': activo_id, 'estado': {'$in': list(ABIERTAS)}},
                                            {'_id': 0, 'respuestas': 0}, sort=[('vence_en', 1)])
    ultimas = await db.mant_tareas.find({'activo_id': activo_id, 'estado': {'$in': ['completada', 'incompleta']}},
                                        {'_id': 0, 'respuestas': 0}).sort('fecha', -1).limit(10).to_list(10)
    return serialize_doc({'planes': planes, 'proxima': _resumen_tarea(proxima) if proxima else None,
                          'ultimas': [_resumen_tarea(t) for t in ultimas], 'ahora': _ahora()})


# ── Cumplimiento ─────────────────────────────────────────────────
@router.get('/cumplimiento')
async def cumplimiento(desde: str, hasta: str, user=Depends(get_current_user)):
    """% a tiempo, tardías e incompletas por planificación y por responsable
    (tareas con fecha entre desde y hasta que ya se cerraron)."""
    await _requiere_planificador(user)
    admin, editables = await _contexto(user)
    q = {'fecha': {'$gte': desde, '$lte': hasta}, 'estado': {'$in': ['completada', 'incompleta']}}
    if not es_super_admin(user):
        q['activo_categoria_id'] = {'$in': list(editables)}
    tareas = await db.mant_tareas.find(q, {'_id': 0, 'plan_id': 1, 'plan_numero': 1, 'plan_nombre': 1, 'responsable_id': 1, 'estado': 1, 'tardia': 1, 'fecha': 1}).to_list(20000)

    def agrupar(clave):
        g = {}
        for t in tareas:
            k = t.get(clave)
            x = g.setdefault(k, {'total': 0, 'a_tiempo': 0, 'tardias': 0, 'incompletas': 0})
            x['total'] += 1
            if t['estado'] == 'incompleta':
                x['incompletas'] += 1
            elif t.get('tardia'):
                x['tardias'] += 1
            else:
                x['a_tiempo'] += 1
        for x in g.values():
            x['cumplimiento'] = round((x['a_tiempo'] + x['tardias']) / x['total'] * 100, 1) if x['total'] else None
        return g
    gente = await _nombres([t['responsable_id'] for t in tareas])
    planes = {t['plan_id']: f'{t["plan_numero"]} · {t["plan_nombre"]}' for t in tareas}
    return serialize_doc({
        'total': agrupar('__todo__').get(None, {'total': 0, 'a_tiempo': 0, 'tardias': 0, 'incompletas': 0, 'cumplimiento': None}),
        'por_plan': [{'id': k, 'nombre': planes.get(k), **v} for k, v in agrupar('plan_id').items()],
        'por_responsable': [{'id': k, 'nombre': (gente.get(k) or {}).get('name', '—'), **v} for k, v in agrupar('responsable_id').items()],
    })
