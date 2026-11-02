"""Constructor de formularios: a quién le toca, cada cuándo, Mis formularios y
supervisión. Lo que aquí se configura (`asignacion`, `supervision`, `permisos`,
`reglas` en db.custom_forms) no es parte del contenido: se aplica al guardar,
sin volver a publicar.

db.form_asignaciones guarda una fila por entrega, con su estado y sus fechas:
  tipo persona    a quien le toca (`user_id`)
  tipo sucursal   una por tienda: la llena cualquiera de `miembros`
  tipo libre      formularios «disponibles»: se crea cuando alguien lo empieza

  pendiente → proceso → (revision → completado | devuelto) | completado
  vencido     pasó la fecha sin entregarse (si `permite_tarde`, se puede entregar)

`ciclo`: cada repetición crea sus filas al abrir (formularios_repeticion.py) y
lo anterior sin entregar queda vencido. Se numera desde `ciclo_base` del
formulario: si cambia el calendario, sigue contando sin chocar con lo ya creado;
`ciclo_max` es hasta dónde va. Lo de una sola vez usa `ciclo_base` tal cual. Lo
empezado (`avance`: respuestas, observaciones y archivos ya subidos) vive aquí,
así se puede seguir desde otro equipo.

Criterios (Asignaciones y Permisos): cargo, área (con sus subáreas) y sucursal
se cruzan; grupos y personas se suman. Se resuelven a ids en
`audiencia_resueltos` y `permisos_resueltos`, y `revisar()` los mantiene al día
para quien entra o sale de un cargo. Manda el interruptor: sin el módulo
«Mis formularios» en su perfil no se le asigna nada.
"""
import logging
import re
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from core import (db, get_current_user, require_modulo, puede_modulo, serialize_doc, new_id, now_iso, now_local,
                  es_super_admin, departamento_de, filtro_usuarios_depto, RETAIL)
from models import SUCURSALES
from notifications import create_notification
import acceso
import formularios_acceso as fa
import formularios_automatizaciones as automatizaciones
import formularios_repeticion as repeticion
import mando
import mantenimiento_motor as motor
import storage

router = APIRouter(prefix='/formularios-v2', tags=['formularios-v2'])
logger = logging.getLogger('formularios_asignaciones')

FMT = '%Y-%m-%dT%H:%M'
MODULO = 'mis_formularios'
MODOS = ('persona', 'sucursal', 'disponible')
QUIENES = ('jefe', 'tienda', 'personas')
EN_CURSO = ('pendiente', 'proceso', 'devuelto')
PLAZOS_REVISION = (0, 24, 48, 72)
MAX_FOTO = 8 * 1024 * 1024
MAX_ARCHIVO = 10 * 1024 * 1024
MINUTOS_SINCRONIZAR = 10
RE_DUENO = re.compile(r'^(ev:[\w-]{1,64}|[\w-]{1,64}(:[\w-]{1,64}:[\w-]{1,64})?)$')  # va en la ruta de `avance.archivos`


# --------------------------------------------------------------------------- #
#  Limpiar lo que manda la pantalla
# --------------------------------------------------------------------------- #
def _ids(v, n=500) -> list:
    return list(dict.fromkeys(str(x)[:64] for x in (v or []) if x))[:n]


def limpiar_criterio(c) -> dict:
    c = c if isinstance(c, dict) else {}
    return {'todos': bool(c.get('todos')), **{k: _ids(c.get(k)) for k in ('cargos', 'areas', 'sucursales', 'grupos', 'personas')}}


def _fecha(v) -> Optional[str]:
    try:
        return datetime.strptime(str(v or '')[:16], FMT).strftime(FMT)
    except ValueError:
        return None


def limpiar_asignacion(a) -> dict:
    a = a if isinstance(a, dict) else {}
    modo = a.get('modo') if a.get('modo') in MODOS else 'persona'
    try:
        recordar = int(a.get('recordar_horas') or 0)
    except (TypeError, ValueError):
        recordar = 0
    con_fecha = modo != 'disponible'
    rep = repeticion.limpiar(a.get('repeticion') if con_fecha else None, now_local().date())
    return {'modo': modo, **limpiar_criterio(a), 'repeticion': rep,
            'fecha_limite': _fecha(a.get('fecha_limite')) if con_fecha and rep['frecuencia'] == repeticion.UNA else None,
            'recordar_horas': recordar if recordar in (0, 1, 24, 48) and con_fecha else 0,
            'permite_tarde': bool(a.get('permite_tarde')) and con_fecha}


def limpiar_supervision(s) -> dict:
    s = s if isinstance(s, dict) else {}
    try:
        plazo = int(s.get('plazo_horas') or 0)
    except (TypeError, ValueError):
        plazo = 0
    return {'activa': bool(s.get('activa')), 'quien': s.get('quien') if s.get('quien') in QUIENES else 'jefe',
            'personas': _ids(s.get('personas'), 50), 'plazo_horas': plazo if plazo in PLAZOS_REVISION else 0}


def limpiar_permisos(p) -> dict:
    p = p if isinstance(p, dict) else {}
    return {a: limpiar_criterio(p.get(a)) for a in fa.ACCIONES}


def asignacion_de(f: dict) -> dict:
    """La configuración del formulario; los pasados del formato de antes que
    todavía no la tienen siguen como estaban: disponibles para su audiencia."""
    if f.get('asignacion'):
        return limpiar_asignacion(f['asignacion'])
    aud = f.get('audiencia') or {}
    return limpiar_asignacion({'modo': 'disponible', 'todos': aud.get('todos', True), 'personas': aud.get('user_ids')})


def supervision_de(f: dict) -> dict:
    return limpiar_supervision(f.get('supervision'))


def permisos_de(f: dict) -> dict:
    return limpiar_permisos(f.get('permisos'))


# --------------------------------------------------------------------------- #
#  Resolver criterios y mantener las asignaciones
# --------------------------------------------------------------------------- #
async def _con_subareas(ids: list, depto: str) -> list:
    areas = await db.org_areas.find({'departamento': depto}, {'_id': 0, 'id': 1, 'padre_id': 1}).to_list(3000)
    hijas = {}
    for a in areas:
        hijas.setdefault(a.get('padre_id'), []).append(a['id'])
    out, pila = set(), list(ids)
    while pila:
        x = pila.pop()
        if x not in out:
            out.add(x)
            pila += hijas.get(x, [])
    return list(out)


async def resolver_criterio(c: dict, depto: str) -> list:
    """Ids de las personas aprobadas del departamento que cumplen el criterio."""
    base = {'status': 'approved', **filtro_usuarios_depto(depto)}
    if c.get('todos'):
        return [u['id'] async for u in db.users.find(base, {'_id': 0, 'id': 1})]
    cruce = {}
    if c.get('cargos'):
        cruce['cargo_id'] = {'$in': c['cargos']}
    if c.get('areas'):
        cruce['area_id'] = {'$in': await _con_subareas(c['areas'], depto)}
    if c.get('sucursales'):
        cruce['sucursal'] = {'$in': c['sucursales']}
    ids = set()
    if cruce:
        ids |= {u['id'] async for u in db.users.find({**base, **cruce}, {'_id': 0, 'id': 1})}
    sueltos = set(c.get('personas') or [])
    if c.get('grupos'):
        async for g in db.user_groups.find({'id': {'$in': c['grupos']}}, {'_id': 0, 'miembros': 1}):
            sueltos |= set(g.get('miembros') or [])
    if sueltos:
        ids |= {u['id'] async for u in db.users.find({**base, 'id': {'$in': list(sueltos)}}, {'_id': 0, 'id': 1})}
    return list(ids)


async def _avisar(uids, tipo: str, msg: str, aid: str):
    for uid in dict.fromkeys(u for u in uids if u):
        await create_notification(uid, tipo, msg, related_id=aid, related_type='formulario')


async def _quien_supervisa(f: dict, a: dict) -> list:
    """Quién revisa esta entrega, aunque todavía no se haya enviado."""
    if a.get('supervisores'):
        return a['supervisores']
    uid = (a.get('enviada_por') or {}).get('id') or a.get('user_id') or next(iter(a.get('miembros') or []), None)
    u = await db.users.find_one({'id': uid}, {'_id': 0, 'password_hash': 0})
    return await supervisores_de(f, u, a.get('sucursal')) if u else []


async def _supervisores_fila(f: dict, a: dict) -> list:
    return [s['id'] for s in await _quien_supervisa(f, a)]


async def disparar(evento: str, f: dict, a: dict, respuesta: Optional[dict] = None):
    """Las reglas del formulario. Un aviso que falla nunca tumba lo que lo disparó."""
    try:
        await automatizaciones.disparar(evento, f, a, respuesta, _supervisores_fila)
    except Exception as ex:
        logger.error(f'regla de {f.get("id")} ({evento}) falló: {ex}')


async def _vencer(a: dict, f: dict):
    """Pasó su hora sin entregarse (o ya abrió la siguiente repetición)."""
    r = await db.form_asignaciones.update_one({'id': a['id'], 'estado': a['estado']}, {'$set': {'estado': 'vencido', 'vencida_at': now_iso()}})
    if not r.modified_count:
        return
    if supervision_de(f)['activa']:  # para que quien supervisa lo vea en su panel
        await db.form_asignaciones.update_one({'id': a['id']}, {'$set': {'supervisores': await _quien_supervisa(f, a)}})
    quien = a.get('user_name') or a.get('sucursal')
    await _avisar(a.get('miembros') or [a.get('user_id')], 'form_vencido', f'Venció «{f.get("titulo")}» sin entregarse.', a['id'])
    await _avisar([i for i in [f.get('creator_id')] if i != a.get('user_id')], 'form_vencido', f'{quien} no entregó «{f.get("titulo")}» a tiempo.', a['id'])
    await disparar('vencido', f, a)


def _vence_texto(vence: Optional[str]) -> str:
    if not vence:
        return ''
    d = datetime.strptime(vence, FMT)
    return f' Vence el {d.strftime("%d/%m")} a las {d.strftime("%H:%M")}.'


def _nueva(f: dict, cfg: dict, tipo: str, **extra) -> dict:
    return {'id': new_id(), 'form_id': f['id'], 'ciclo': 0, 'tipo': tipo, 'user_id': None, 'user_name': None, 'sucursal': None, 'tienda': None,
            'miembros': [], 'departamento': fa.depto_form(f), 'estado': 'pendiente', 'vence': cfg.get('fecha_limite'),
            'recordar_horas': cfg.get('recordar_horas') or 0, 'permite_tarde': bool(cfg.get('permite_tarde')),
            'creada_at': now_iso(), 'empezada_at': None, 'enviada_at': None, 'cerrada_at': None, 'enviada_por': None, 'tomada_por': None,
            'respuesta_id': None, 'version': None, 'version_id': None, 'avance': {}, 'historial': [], 'supervisores': [],
            'recordado': False, 'tardia': False, **extra}


async def alcance(f: dict, cfg: Optional[dict] = None) -> dict:
    """A quién alcanza la asignación: quiénes cumplen y quiénes de ellos tienen el módulo."""
    cfg = cfg or asignacion_de(f)
    todos = await resolver_criterio(cfg, fa.depto_form(f))
    ids = await acceso.con_modulo(todos, MODULO)
    gente = await db.users.find({'id': {'$in': list(ids)}}, {'_id': 0, 'id': 1, 'name': 1, 'sucursal': 1}).to_list(5000)
    por_sucursal = {}
    for u in gente:
        if (u.get('sucursal') or '').strip():
            por_sucursal.setdefault(u['sucursal'].strip(), []).append(u['id'])
    return {'gente': gente, 'por_sucursal': por_sucursal, 'personas': len(gente), 'sin_modulo': len(todos) - len(gente),
            'sucursales': sorted(por_sucursal)}


def _ciclo_actual(f: dict, cfg: dict) -> Optional[dict]:
    """El ciclo en que hoy se reparte: {ciclo, abre, vence}, o None si no hay ninguno abierto."""
    base = f.get('ciclo_base') or 0
    rep = cfg['repeticion']
    if rep['frecuencia'] == repeticion.UNA:
        return {'ciclo': base, 'abre': None, 'vence': cfg['fecha_limite']}
    lim = repeticion.vigente(rep, now_local())
    return {'ciclo': base + lim['n'], 'abre': lim['abre'], 'vence': lim['vence']} if lim else None


async def sincronizar(f: dict, avisar: bool = True) -> dict:
    """Deja las asignaciones como dice la configuración. Quita las que ya no
    tocan y nadie empezó; lo empezado o entregado se conserva."""
    fid, cfg = f['id'], asignacion_de(f)
    depto = fa.depto_form(f)
    al = await alcance(f, cfg)
    permisos = permisos_de(f)
    resueltos = {a: await resolver_criterio(permisos[a], depto) for a in fa.ACCIONES}
    await db.custom_forms.update_one({'id': fid}, {'$set': {'asignacion': cfg, 'audiencia_resueltos': [u['id'] for u in al['gente']],
                                                            'permisos_resueltos': resueltos}})
    if f.get('estado') != 'publicado':
        return al
    actual = _ciclo_actual(f, cfg)
    if not actual:
        return al  # todavía no abre la primera repetición, o ya se acabaron
    ciclo, fecha = actual['ciclo'], actual['vence']
    limites = {'ciclo': ciclo, 'vence': fecha, 'abre': actual['abre']}
    filas = await db.form_asignaciones.find({'form_id': fid, 'ciclo': ciclo, 'tipo': {'$in': ['persona', 'sucursal']}}, {'_id': 0}).to_list(5000)
    tocan = set()
    nuevas = []
    if cfg['modo'] == 'persona':
        ya = {a['user_id'] for a in filas if a['tipo'] == 'persona'}
        for u in al['gente']:
            tocan.add(('persona', u['id']))
            if u['id'] not in ya:
                nuevas.append(_nueva(f, cfg, 'persona', user_id=u['id'], user_name=u['name'], tienda=(u.get('sucursal') or '').strip() or None, **limites))
    elif cfg['modo'] == 'sucursal':
        ya = {a['sucursal']: a for a in filas if a['tipo'] == 'sucursal'}
        elegidas = cfg['sucursales'] or al['sucursales']
        for suc in elegidas:
            miembros = al['por_sucursal'].get(suc) or []
            if not miembros:
                continue
            tocan.add(('sucursal', suc))
            if suc in ya:
                await db.form_asignaciones.update_one({'id': ya[suc]['id']}, {'$set': {'miembros': miembros}})
            else:
                nuevas.append(_nueva(f, cfg, 'sucursal', sucursal=suc, tienda=suc, miembros=miembros, **limites))
    for a in filas:
        clave = ('persona', a['user_id']) if a['tipo'] == 'persona' else ('sucursal', a['sucursal'])
        if clave not in tocan and a['estado'] == 'pendiente':
            await db.form_asignaciones.delete_one({'id': a['id'], 'estado': 'pendiente'})
    # si la hora límite de esta repetición ya pasó, se espera la siguiente
    for a in nuevas if not actual['abre'] or fecha > now_local().strftime(FMT) else []:
        try:
            await db.form_asignaciones.insert_one(a)
        except Exception:  # otra vuelta ya la creó (índice único)
            continue
        if avisar:
            destino = a['miembros'] or [a['user_id']]
            await _avisar(destino, 'form_asignado', f'Te toca llenar «{f["titulo"]}».{_vence_texto(a["vence"])}', a['id'])
    # lo de repeticiones anteriores que no se entregó queda vencido y sigue la nueva
    await db.custom_forms.update_one({'id': fid}, {'$max': {'ciclo_max': ciclo}})
    async for a in db.form_asignaciones.find({'form_id': fid, 'ciclo': {'$lt': ciclo}, 'tipo': {'$in': ['persona', 'sucursal']},
                                              'estado': {'$in': ['pendiente', 'proceso']}, 'vence_propia': {'$ne': True}}, {'_id': 0, 'avance': 0}):
        await _vencer(a, f)
    # la fecha y sus reglas se copian a lo que sigue abierto (salvo a lo reabierto con fecha propia)
    q = {'form_id': fid, 'ciclo': ciclo, 'tipo': {'$in': ['persona', 'sucursal']}}
    await db.form_asignaciones.update_many({**q, 'estado': {'$in': ['pendiente', 'proceso', 'vencido']}}, {'$set': {
        'recordar_horas': cfg['recordar_horas'], 'permite_tarde': cfg['permite_tarde']}})
    q['vence_propia'] = {'$ne': True}
    await db.form_asignaciones.update_many({**q, 'estado': {'$in': ['pendiente', 'proceso']}, 'vence': {'$ne': fecha}},
                                           {'$set': {'vence': fecha, 'recordado': False}})
    if fecha is None or fecha > now_local().strftime(FMT):
        for estado, empezada in (('proceso', True), ('pendiente', False)):
            await db.form_asignaciones.update_many({**q, 'estado': 'vencido', 'avance.guardado_at': {'$exists': empezada}},
                                                   {'$set': {'estado': estado, 'vence': fecha, 'recordado': False}})
    return al


async def supervisores_de(f: dict, quien: dict, sucursal: Optional[str]) -> list:
    """Quién revisa esta entrega. Si lo configurado no da a nadie (o solo a
    quien llenó), sube a su jefe según Gente a cargo; si no hay, quien creó el formulario."""
    s = supervision_de(f)
    ids = []
    if s['quien'] == 'personas':
        ids = list(s['personas'])
    elif s['quien'] == 'tienda':
        suc = sucursal or (quien.get('sucursal') or '').strip()
        if suc:
            ids = [u['id'] async for u in db.users.find({'status': 'approved', 'sucursal': suc, 'position': 'Gerente', 'area': 'Tienda'}, {'_id': 0, 'id': 1})]
    if s['quien'] == 'jefe':
        ids = await mando.responsables_cercanos(quien)
    ids = [i for i in ids if i and i != quien['id']]
    if not ids:
        ids = [i for i in await mando.responsables_cercanos(quien) if i != quien['id']]
    if not ids and f.get('creator_id') != quien['id']:
        ids = [f.get('creator_id')]
    gente = await db.users.find({'id': {'$in': ids}, 'status': 'approved'}, {'_id': 0, 'id': 1, 'name': 1}).to_list(50)
    return [{'id': u['id'], 'name': u['name']} for u in gente]


# --------------------------------------------------------------------------- #
#  Ajustes del formulario (pestañas Asignaciones, Supervisión y Permisos)
# --------------------------------------------------------------------------- #
async def _form(fid: str) -> dict:
    f = await db.custom_forms.find_one({'id': fid, 'esquema': 2}, {'_id': 0})
    if not f:
        raise HTTPException(status_code=404, detail='Formulario no encontrado')
    return f


class AjustesInput(BaseModel):
    asignacion: Optional[dict] = None
    supervision: Optional[dict] = None
    permisos: Optional[dict] = None
    reglas: Optional[list] = None


def _resumen_alcance(al: dict) -> dict:
    return {k: al[k] for k in ('personas', 'sin_modulo', 'sucursales')}


@router.put('/{fid}/ajustes')
async def guardar_ajustes(fid: str, data: AjustesInput, user=Depends(get_current_user)):
    """Se aplican al momento: cambiar a quién le toca no pide volver a publicar."""
    f = await _form(fid)
    sets = {}
    if data.asignacion is not None or data.supervision is not None or data.reglas is not None:
        if not fa.puede(user, f, 'asignar'):
            raise HTTPException(status_code=403, detail='No puedes administrar las asignaciones de este formulario')
        if data.asignacion is not None:
            nueva = limpiar_asignacion(data.asignacion)
            problema = repeticion.error(nueva['repeticion'])
            if problema:
                raise HTTPException(status_code=400, detail=problema)
            vieja = asignacion_de(f)['repeticion']
            if any(nueva['repeticion'].get(k) != vieja.get(k) for k in ('frecuencia', 'intervalo_dias', 'inicio')):
                sets['ciclo_base'] = (f.get('ciclo_max') or 0) + 1  # otro calendario: sigue contando sin chocar con lo creado
            sets['asignacion'] = nueva
        if data.supervision is not None:
            sets['supervision'] = limpiar_supervision(data.supervision)
        if data.reglas is not None:
            sets['reglas'] = automatizaciones.limpiar(data.reglas)
    if data.permisos is not None:
        if not fa.gestiona(user, f):
            raise HTTPException(status_code=403, detail='Solo quien lo creó (o un admin) cambia los permisos')
        sets['permisos'] = limpiar_permisos(data.permisos)
    if sets:
        await db.custom_forms.update_one({'id': fid}, {'$set': {**sets, 'ajustes_at': now_iso()}})
        f = await _form(fid)
    return {'alcance': _resumen_alcance(await sincronizar(f)), 'mis_permisos': fa.mis_permisos(user, f)}


@router.post('/{fid}/alcance')
async def ver_alcance(fid: str, asignacion: dict, user=Depends(get_current_user)):
    """A cuántos alcanza lo que se está eligiendo, sin guardar ni avisar a nadie."""
    f = await _form(fid)
    if not fa.puede(user, f, 'asignar'):
        raise HTTPException(status_code=403, detail='No puedes administrar las asignaciones de este formulario')
    cfg = limpiar_asignacion(asignacion)
    rep = cfg['repeticion']
    una = rep['frecuencia'] == repeticion.UNA
    return {**_resumen_alcance(await alcance(f, cfg)), 'error': repeticion.error(rep), 'proximas': [] if una else repeticion.proximas(rep, now_local())}


@router.get('/{fid}/ajustes')
async def leer_ajustes(fid: str, user=Depends(get_current_user)):
    f = await _form(fid)
    if not fa.entra_al_constructor(user, f):
        raise HTTPException(status_code=403, detail='No tienes acceso a este formulario')
    return {'asignacion': asignacion_de(f), 'supervision': supervision_de(f), 'permisos': permisos_de(f),
            'alcance': _resumen_alcance(await alcance(f))}


@router.get('/{fid}/opciones-criterio')
async def opciones_criterio(fid: str, user=Depends(get_current_user)):
    """Lo que se puede elegir en Asignaciones, Supervisión y Permisos: es la Jerarquía del departamento."""
    f = await _form(fid)
    if not fa.entra_al_constructor(user, f):
        raise HTTPException(status_code=403, detail='No tienes acceso a este formulario')
    depto = fa.depto_form(f)
    gente = await db.users.find({'status': 'approved', **filtro_usuarios_depto(depto)},
                                {'_id': 0, 'id': 1, 'name': 1, 'position': 1, 'sucursal': 1, 'cargo_id': 1, 'area_id': 1}).sort('name', 1).to_list(3000)
    areas = await db.org_areas.find({'departamento': depto}, {'_id': 0, 'id': 1, 'nombre': 1, 'padre_id': 1}).to_list(3000)
    por_id = {a['id']: a for a in areas}

    def ruta(a):
        partes, x = [a['nombre']], por_id.get(a.get('padre_id'))
        while x:
            partes.insert(0, x['nombre'])
            x = por_id.get(x.get('padre_id'))
        return ' › '.join(partes)
    cargos = await db.org_cargos.find({'departamento': depto}, {'_id': 0, 'id': 1, 'nombre': 1}).sort('nombre', 1).to_list(500)
    grupos = await db.user_groups.find({}, {'_id': 0, 'id': 1, 'nombre': 1, 'miembros': 1}).sort('nombre', 1).to_list(500)
    ids = {u['id'] for u in gente}
    sucursales = sorted({(u.get('sucursal') or '').strip() for u in gente if (u.get('sucursal') or '').strip()} | (set(SUCURSALES) if depto == RETAIL else set()))
    return {
        'cargos': [{'id': c['id'], 'nombre': c['nombre'], 'n': sum(1 for u in gente if u.get('cargo_id') == c['id'])} for c in cargos],
        'areas': sorted(({'id': a['id'], 'nombre': ruta(a), 'n': sum(1 for u in gente if u.get('area_id') == a['id'])} for a in areas), key=lambda x: x['nombre']),
        'sucursales': [{'id': s, 'nombre': s, 'n': sum(1 for u in gente if (u.get('sucursal') or '').strip() == s)} for s in sucursales],
        'grupos': [{'id': g['id'], 'nombre': g['nombre'], 'n': len(ids & set(g.get('miembros') or []))} for g in grupos if ids & set(g.get('miembros') or [])],
        'personas': [{'id': u['id'], 'nombre': u['name'], 'detalle': u.get('position') or ''} for u in gente],
    }


@router.get('/{fid}/asignaciones')
async def lista_asignaciones(fid: str, ciclo: Optional[int] = None, user=Depends(get_current_user)):
    """Las entregas de una repetición (la última si no se dice cuál) y la lista de repeticiones."""
    f = await _form(fid)
    if not (fa.puede(user, f, 'asignar') or fa.puede(user, f, 'resultados')):
        raise HTTPException(status_code=403, detail='No tienes acceso a las asignaciones de este formulario')
    ciclos = await db.form_asignaciones.aggregate([
        {'$match': {'form_id': fid, 'tipo': {'$ne': 'libre'}}},
        {'$group': {'_id': '$ciclo', 'abre': {'$first': '$abre'}, 'total': {'$sum': 1},
                    'hechas': {'$sum': {'$cond': [{'$in': ['$estado', ['revision', 'completado']]}, 1, 0]}}}},
        {'$sort': {'_id': -1}}, {'$limit': 90}]).to_list(90)
    elegido = ciclo if ciclo is not None else (ciclos[0]['_id'] if ciclos else None)
    q = {'form_id': fid, 'ciclo': elegido} if elegido is not None else {'form_id': fid}
    filas = await db.form_asignaciones.find(q, {'_id': 0, 'avance.valores': 0, 'avance.notas': 0, 'avance.archivos': 0}).sort('creada_at', -1).to_list(3000)
    orden = {'vencido': 0, 'devuelto': 1, 'revision': 2, 'proceso': 3, 'pendiente': 4, 'completado': 5}
    filas.sort(key=lambda a: orden.get(a['estado'], 9))
    conteo = {}
    for a in filas:
        conteo[a['estado']] = conteo.get(a['estado'], 0) + 1
    return serialize_doc({'filas': [_fila_admin(a) for a in filas], 'conteo': conteo, 'puede_reabrir': fa.puede(user, f, 'asignar'), 'ciclo': elegido,
                          'ciclos': [{'ciclo': c['_id'], 'abre': c.get('abre'), 'total': c['total'], 'hechas': c['hechas']} for c in ciclos]})


def _fila_admin(a: dict) -> dict:
    return {k: a.get(k) for k in ('id', 'tipo', 'estado', 'user_name', 'sucursal', 'vence', 'empezada_at', 'enviada_at', 'cerrada_at', 'enviada_por',
                                  'tomada_por', 'tardia', 'version', 'respuesta_id', 'supervisores')} | {'avance': {k: (a.get('avance') or {}).get(k) for k in ('hechas', 'total', 'guardado_at')}}


# --------------------------------------------------------------------------- #
#  Mis formularios
# --------------------------------------------------------------------------- #
def _me_toca(a: dict, uid: str) -> bool:
    """Lo de una tienda es de todos sus miembros hasta que alguien lo entrega; de ahí en adelante, de quien lo entregó."""
    if a.get('enviada_por'):
        return a['enviada_por'].get('id') == uid
    return uid in (a.get('miembros') or []) if a['tipo'] == 'sucursal' else a.get('user_id') == uid


def _fila(a: dict, f: dict) -> dict:
    avance = a.get('avance') or {}
    ultimo = next((h for h in reversed(a.get('historial') or []) if h.get('accion') in ('devuelto', 'aprobado')), None)
    return {
        'id': a['id'], 'form_id': a['form_id'], 'titulo': (f or {}).get('titulo') or 'Formulario', 'descripcion': (f or {}).get('descripcion') or '',
        'tipo': a['tipo'], 'estado': a['estado'], 'sucursal': a.get('sucursal'), 'vence': a.get('vence'), 'permite_tarde': a.get('permite_tarde'),
        'hechas': avance.get('hechas'), 'total': avance.get('total'), 'guardado_at': avance.get('guardado_at'),
        'tomada_por': a.get('tomada_por'), 'enviada_at': a.get('enviada_at'), 'cerrada_at': a.get('cerrada_at'), 'enviada_por': a.get('enviada_por'),
        'respuesta_id': a.get('respuesta_id'), 'supervisores': a.get('supervisores') or [], 'tardia': a.get('tardia'),
        'revisar_antes': a.get('revisar_antes'), 'ultimo': ultimo, 'preguntas': len((f or {}).get('items') or []), 'abre': a.get('abre'),
    }


async def _mias(user: dict) -> dict:
    uid = user['id']
    filas = await db.form_asignaciones.find({'estado': {'$ne': 'cancelada'}, '$or': [
        {'user_id': uid}, {'miembros': uid}, {'enviada_por.id': uid}, {'estado': 'revision', 'supervisores.id': uid}]},
        {'_id': 0, 'avance.valores': 0, 'avance.notas': 0, 'avance.archivos': 0}).sort('creada_at', -1).to_list(2000)
    forms = {f['id']: f async for f in db.custom_forms.find({'id': {'$in': list({a['form_id'] for a in filas})}},
                                                            {'_id': 0, 'id': 1, 'titulo': 1, 'descripcion': 1, 'estado': 1, 'items': 1})}
    out = {'pendientes': [], 'proceso': [], 'devueltos': [], 'revisar': [], 'vencidos': [], 'completados': []}
    for a in filas:
        f = forms.get(a['form_id'])
        if not f:
            continue
        publicado = f.get('estado') == 'publicado'
        fila = _fila(a, f)
        if a['estado'] == 'revision' and any(s['id'] == uid for s in a.get('supervisores') or []) and (a.get('enviada_por') or {}).get('id') != uid:
            out['revisar'].append(fila)
        if a['estado'] in ('revision', 'completado'):
            if (a.get('enviada_por') or {}).get('id') == uid:
                out['completados'].append(fila)
        elif a['estado'] == 'devuelto' and _me_toca(a, uid):
            out['devueltos'].append(fila)
        elif publicado and _me_toca(a, uid):
            clave = {'pendiente': 'pendientes', 'proceso': 'proceso', 'vencido': 'vencidos'}.get(a['estado'])
            if clave:
                out[clave].append(fila)
    fin = '9999'
    for k in ('pendientes', 'proceso', 'devueltos'):
        out[k].sort(key=lambda x: x.get('vence') or fin)
    out['vencidos'] = sorted(out['vencidos'], key=lambda x: x.get('vence') or '', reverse=True)[:60]
    out['revisar'].sort(key=lambda x: x.get('enviada_at') or '')
    out['completados'].sort(key=lambda x: x.get('cerrada_at') or x.get('enviada_at') or '', reverse=True)
    out['completados'] = out['completados'][:60]
    # disponibles: para llenar cuando se necesite
    libres = []
    async for f in db.custom_forms.find({'esquema': 2, 'estado': 'publicado', 'asignacion.modo': 'disponible', 'audiencia_resueltos': uid},
                                        {'_id': 0, 'id': 1, 'titulo': 1, 'descripcion': 1, 'items': 1}):
        veces = await db.form_asignaciones.count_documents({'form_id': f['id'], 'tipo': 'libre', 'enviada_por.id': uid})
        libres.append({'form_id': f['id'], 'titulo': f['titulo'], 'descripcion': f.get('descripcion') or '', 'preguntas': len(f.get('items') or []), 'veces': veces})
    out['disponibles'] = sorted(libres, key=lambda x: x['titulo'])
    return out


@router.get('/mis')
async def mis_formularios(user=Depends(require_modulo(MODULO))):
    return serialize_doc({**await _mias(user), 'ahora': now_local().strftime(FMT)})


@router.get('/mis/contador')
async def contador(user=Depends(get_current_user)):
    """Para la sección Formulario del menú y la tarjeta de Inicio. Cada
    formulario que le toca a la persona sale en el menú, con lo que tenga por entregar."""
    if not puede_modulo(user, MODULO):
        return {'pendientes': 0, 'devueltos': 0, 'revisar': 0, 'total': 0, 'proximo': None, 'formularios': []}
    m = await _mias(user)
    abiertas = m['pendientes'] + m['proceso'] + m['devueltos']
    conteo = {'pendientes': len(m['pendientes']) + len(m['proceso']), 'devueltos': len(m['devueltos']), 'revisar': len(m['revisar']), 'vencidos': len(m['vencidos'])}
    fechas = sorted(a['vence'] for a in abiertas if a.get('vence'))
    menu = {}
    async for f in db.custom_forms.find({'esquema': 2, 'estado': 'publicado', 'audiencia_resueltos': user['id']}, {'_id': 0, 'id': 1, 'titulo': 1}):
        menu[f['id']] = {'id': f['id'], 'titulo': f['titulo'], 'pendientes': 0}
    for a in abiertas:
        menu.setdefault(a['form_id'], {'id': a['form_id'], 'titulo': a['titulo'], 'pendientes': 0})['pendientes'] += 1
    return {**conteo, 'total': conteo['pendientes'] + conteo['devueltos'] + conteo['revisar'], 'proximo': fechas[0] if fechas else None,
            'formularios': sorted(menu.values(), key=lambda f: f['titulo'])}


# --------------------------------------------------------------------------- #
#  Trabajar en una asignación (lo llaman estas rutas y formularios_v2.responder)
# --------------------------------------------------------------------------- #
async def fila_o_404(aid: str) -> dict:
    a = await db.form_asignaciones.find_one({'id': aid}, {'_id': 0})
    if not a:
        raise HTTPException(status_code=404, detail='No se encontró esta asignación')
    return a


def es_de(a: dict, user: dict) -> bool:
    return _me_toca(a, user['id'])


def se_puede_trabajar(a: dict) -> bool:
    return a['estado'] in EN_CURSO or (a['estado'] == 'vencido' and a.get('permite_tarde'))


async def para_trabajar(aid: str, user: dict) -> dict:
    a = await fila_o_404(aid)
    if not es_de(a, user):
        raise HTTPException(status_code=403, detail='Esta asignación es de otra persona')
    if not se_puede_trabajar(a):
        raise HTTPException(status_code=409, detail={'revision': 'Ya lo entregaste: está en revisión', 'completado': 'Ya está entregado',
                                                     'vencido': 'Venció: pide que lo reabran'}.get(a['estado'], 'Ya no se puede llenar'))
    return a


async def abierta_de(f: dict, user: dict) -> Optional[dict]:
    """Lo que la persona tiene en curso en este formulario."""
    uid = user['id']
    filas = await db.form_asignaciones.find({'form_id': f['id'], '$or': [{'user_id': uid}, {'miembros': uid}]}, {'_id': 0}).sort('creada_at', -1).to_list(200)
    for a in filas:
        if se_puede_trabajar(a):
            return a
    return None


async def crear_libre(f: dict, user: dict) -> dict:
    cfg = {'fecha_limite': None, 'recordar_horas': 0, 'permite_tarde': False}
    a = _nueva(f, cfg, 'libre', user_id=user['id'], user_name=user['name'], tienda=(user.get('sucursal') or '').strip() or None,
               estado='proceso', empezada_at=now_iso(), tomada_por={'id': user['id'], 'name': user['name']})
    await db.form_asignaciones.insert_one(a)
    a.pop('_id', None)
    return a


async def contenido_de(f: dict, a: Optional[dict]) -> dict:
    """Lo devuelto se corrige sobre la versión con que se contestó; lo demás, sobre la publicada."""
    if a and a.get('respuesta_id') and a.get('version_id'):
        v = await db.custom_form_versiones.find_one({'id': a['version_id']}, {'_id': 0, 'contenido': 1})
        if v:
            return v['contenido']
    return f.get('contenido_publicado') or {'pasos': []}


def metas_de(a: Optional[dict]) -> dict:
    """Los archivos ya subidos del avance: id -> meta."""
    return {m['id']: m for lista in ((a or {}).get('avance') or {}).get('archivos', {}).values() for m in lista}


def avance_desde_respuesta(row: dict) -> dict:
    """Una respuesta enviada, como avance: para corregirla o modificarla."""
    valores, notas, archivos = {}, {}, {}
    for e in row.get('entries') or []:
        if e.get('valor') not in (None, ''):
            valores[e['id']] = e['valor']
        if e.get('note'):
            notas[e['id']] = e['note']
        for m in (e.get('photos') or []) + (e.get('archivos') or []):
            archivos.setdefault(m.get('dueno') or (f'ev:{e["id"]}' if m.get('como') == 'evidencia' else e['id']), []).append(m)
    return {'valores': valores, 'notas': notas, 'archivos': archivos}


def _dueno(d: str) -> str:
    if not RE_DUENO.match(d or ''):
        raise HTTPException(status_code=400, detail='Pregunta inválida')
    return d


class AvanceInput(BaseModel):
    valores: dict = {}
    notas: dict = {}
    pantalla: Optional[str] = None
    hechas: Optional[int] = None
    total: Optional[int] = None
    base: Optional[str] = None  # el último guardado que vio esta pantalla


@router.post('/{fid}/empezar')
async def empezar(fid: str, user=Depends(get_current_user)):
    """La asignación de la persona en este formulario; en los disponibles se crea aquí."""
    f = await _form(fid)
    if not fa.puede_llenar(user, f) or f.get('estado') != 'publicado':
        raise HTTPException(status_code=403, detail='Este formulario no está disponible para llenar')
    a = await abierta_de(f, user)
    if not a:
        if asignacion_de(f)['modo'] != 'disponible' and not fa.gestiona(user, f):
            raise HTTPException(status_code=409, detail='No tienes nada pendiente en este formulario')
        a = await crear_libre(f, user)
    return serialize_doc(a)


@router.put('/asignaciones/{aid}/avance')
async def guardar_avance(aid: str, data: AvanceInput, user=Depends(get_current_user)):
    a = await para_trabajar(aid, user)
    if len(str(data.valores)) + len(str(data.notas)) > 400_000:
        raise HTTPException(status_code=400, detail='La respuesta es demasiado larga')
    previo = (a.get('avance') or {}).get('guardado_at')
    otro = a.get('tomada_por') or {}
    # en lo de una tienda, dos personas no se pisan: la que quedó atrás recarga
    if previo and data.base != previo and otro.get('id') not in (None, user['id']):
        raise HTTPException(status_code=409, detail=f'{otro.get("name")} siguió llenándolo: recarga para ver lo último')
    ahora = now_iso()
    sets = {'avance.valores': data.valores, 'avance.notas': data.notas, 'avance.pantalla': data.pantalla,
            'avance.hechas': data.hechas, 'avance.total': data.total, 'avance.guardado_at': ahora,
            'tomada_por': {'id': user['id'], 'name': user['name']}}
    if a['estado'] == 'pendiente':
        sets.update({'estado': 'proceso', 'empezada_at': ahora})
    await db.form_asignaciones.update_one({'id': aid}, {'$set': sets})
    return {'guardado_at': ahora, 'estado': sets.get('estado') or a['estado']}


@router.post('/asignaciones/{aid}/archivos')
async def subir_archivo(aid: str, dueno: str = Form(...), archivo: UploadFile = File(...), user=Depends(get_current_user)):
    """Cada foto o archivo se sube al tomarlo: así lo empezado sigue desde otro equipo."""
    a = await para_trabajar(aid, user)
    _dueno(dueno)
    contenido = await archivo.read()
    ctype = archivo.content_type or 'application/octet-stream'
    imagen = ctype.startswith('image/')
    if not contenido:
        raise HTTPException(status_code=400, detail='El archivo está vacío')
    if len(contenido) > (MAX_FOTO if imagen else MAX_ARCHIVO):
        raise HTTPException(status_code=400, detail='El archivo es demasiado grande')
    fid_arch = new_id()
    nombre = ' '.join((archivo.filename or '').split())[:120]
    ext = nombre.rsplit('.', 1)[-1][:8].lower() if '.' in nombre else ('png' if 'png' in ctype else 'jpg')
    path = f'{storage.APP_NAME}/formularios-custom/{a["form_id"]}/avance/{aid}/{fid_arch}.{ext}'
    await storage.put_object(path, contenido, ctype)
    meta = {'id': fid_arch, 'path': path, 'content_type': ctype, 'nombre': nombre, 'como': 'evidencia' if dueno.startswith('ev:') else 'propio'}
    await db.form_asignaciones.update_one({'id': aid}, {'$push': {f'avance.archivos.{dueno}': meta}})
    return {k: meta[k] for k in ('id', 'content_type', 'nombre', 'como')}


@router.delete('/asignaciones/{aid}/archivos/{archivo_id}')
async def quitar_archivo(aid: str, archivo_id: str, dueno: str, user=Depends(get_current_user)):
    await para_trabajar(aid, user)
    await db.form_asignaciones.update_one({'id': aid}, {'$pull': {f'avance.archivos.{_dueno(dueno)}': {'id': archivo_id}}})
    return {'ok': True}


@router.get('/asignaciones/{aid}/archivos/{archivo_id}')
async def ver_archivo(aid: str, archivo_id: str, user=Depends(get_current_user)):
    a = await fila_o_404(aid)
    if not es_de(a, user):
        raise HTTPException(status_code=403, detail='Esta asignación es de otra persona')
    meta = metas_de(a).get(archivo_id)
    if not meta:
        raise HTTPException(status_code=404, detail='Archivo no encontrado')
    content, ctype = await storage.get_object(meta['path'])
    return Response(content=content, media_type=meta.get('content_type') or ctype)


async def al_enviar(f: dict, a: dict, resp: dict, quien: dict, reenvio: bool) -> Optional[dict]:
    """Se entrega: pasa a revisión o termina. Es el candado de la entrega: si
    otra persona de la tienda entregó primero devuelve None y no se guarda
    nada. Si no, {'estado', 'supervisores'} para la respuesta y sus seguimientos."""
    sup = supervision_de(f)
    ahora = now_iso()
    enviada_por = {'id': quien['id'], 'name': quien['name']}
    tardia = bool(a.get('vence') and a['vence'] < now_local().strftime(FMT))
    sets = {'respuesta_id': resp['id'], 'version': resp.get('version'), 'version_id': resp.get('version_id'), 'enviada_at': ahora,
            'enviada_por': enviada_por, 'tardia': tardia or bool(a.get('tardia')), 'avance': {},
            'tienda': a.get('sucursal') or resp.get('sucursal') or a.get('tienda')}  # la tienda contestada manda
    historial = {'accion': 'corregido' if reenvio else 'enviado', 'por': enviada_por, 'at': ahora, 'comentario': ''}
    supervisores = []
    if sup['activa']:
        supervisores = await supervisores_de(f, quien, a.get('sucursal') or resp.get('sucursal'))
    if supervisores:
        estado = 'revision'
        vence = (now_local() + timedelta(hours=sup['plazo_horas'])).strftime(FMT) if sup['plazo_horas'] else None
        sets.update({'estado': estado, 'supervisores': supervisores, 'revisar_antes': vence, 'revision_atrasada': False})
    else:
        estado = 'completado'
        sets.update({'estado': estado, 'cerrada_at': ahora})
    r = await db.form_asignaciones.update_one({'id': a['id'], 'estado': a['estado']}, {'$set': sets, '$push': {'historial': historial}})
    if not r.modified_count:
        return None
    if estado == 'revision':
        que = 'corrigió' if reenvio else 'envió'
        await _avisar([s['id'] for s in supervisores], 'form_por_revisar', f'{quien["name"]} {que} «{f["titulo"]}»: te toca revisarlo.{_vence_texto(sets["revisar_antes"])}', a['id'])
    return {'estado': estado, 'supervisores': supervisores}


async def al_borrar_respuestas(resp_ids: list):
    """Sin la respuesta, lo asignado vuelve a quedar por llenar; lo disponible se quita."""
    if not resp_ids:
        return
    await db.form_asignaciones.delete_many({'respuesta_id': {'$in': resp_ids}, 'tipo': 'libre'})
    await db.form_asignaciones.update_many({'respuesta_id': {'$in': resp_ids}}, {'$set': {
        'estado': 'pendiente', 'respuesta_id': None, 'enviada_at': None, 'enviada_por': None, 'cerrada_at': None, 'supervisores': [],
        'version': None, 'version_id': None, 'avance': {}, 'tardia': False, 'tomada_por': None, 'empezada_at': None}})


# --------------------------------------------------------------------------- #
#  Supervisión
# --------------------------------------------------------------------------- #
def es_supervisor(a: dict, user: dict) -> bool:
    """Quien revisa esta entrega. Los admins del departamento también pueden
    aprobar o devolver, aunque no les llegue como pendiente."""
    if (a.get('enviada_por') or {}).get('id') == user['id']:
        return False
    if user['id'] in [s['id'] for s in a.get('supervisores') or []]:
        return True
    return es_super_admin(user) or (user.get('role') == 'admin' and departamento_de(user) == a.get('departamento'))


class ComentarioInput(BaseModel):
    comentario: Optional[str] = ''


@router.get('/asignaciones/{aid}')
async def abrir_asignacion(aid: str, user=Depends(get_current_user)):
    """Para llenarla o verla: la asignación, y el formulario en la versión que toca."""
    a = await fila_o_404(aid)
    f = await db.custom_forms.find_one({'id': a['form_id']}, {'_id': 0})
    if not f:
        raise HTTPException(status_code=404, detail='Este formulario ya no existe')
    if not (es_de(a, user) or es_supervisor(a, user) or fa.puede(user, f, 'resultados')):
        raise HTTPException(status_code=403, detail='Esta asignación es de otra persona')
    return serialize_doc({
        'asignacion': a, 'puede_llenar': es_de(a, user) and se_puede_trabajar(a) and (f.get('estado') == 'publicado' or a['estado'] == 'devuelto'),
        'form': {'id': f['id'], 'titulo': f['titulo'], 'descripcion': f.get('descripcion') or '', 'version': a.get('version') or f.get('version'),
                 'version_id': a.get('version_id') or f.get('version_id'), 'esquema': 2, 'contenido': await contenido_de(f, a), 'estado': f.get('estado')},
    })


@router.get('/asignaciones/{aid}/revision')
async def ver_revision(aid: str, user=Depends(get_current_user)):
    a = await fila_o_404(aid)
    f = await db.custom_forms.find_one({'id': a['form_id']}, {'_id': 0, 'id': 1, 'titulo': 1, 'creator_id': 1, 'departamento': 1, 'permisos_resueltos': 1})
    if not f or not a.get('respuesta_id'):
        raise HTTPException(status_code=404, detail='Todavía no hay respuesta para revisar')
    if not (es_supervisor(a, user) or es_de(a, user) or fa.puede(user, f, 'resultados')):
        raise HTTPException(status_code=403, detail='No puedes ver esta revisión')
    row = await db.custom_form_responses.find_one({'id': a['respuesta_id']}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='La respuesta ya no existe')
    a.pop('avance', None)
    return serialize_doc({'asignacion': a, 'respuesta': row, 'titulo': f['titulo'], 'puede_revisar': a['estado'] == 'revision' and es_supervisor(a, user)})


async def _cerrar_revision(aid: str, user: dict, accion: str, comentario: str) -> dict:
    a = await fila_o_404(aid)
    if not es_supervisor(a, user):
        raise HTTPException(status_code=403, detail='Solo el supervisor revisa esta entrega')
    if a['estado'] != 'revision':
        raise HTTPException(status_code=409, detail='Esta entrega ya no está en revisión')
    ahora = now_iso()
    por = {'id': user['id'], 'name': user['name']}
    sets = {'estado': 'completado', 'cerrada_at': ahora, 'revisada_por': por} if accion == 'aprobado' else {'estado': 'devuelto', 'revisada_por': por}
    if accion == 'devuelto':
        row = await db.custom_form_responses.find_one({'id': a['respuesta_id']}, {'_id': 0}) or {}
        sets['avance'] = {**avance_desde_respuesta(row), 'guardado_at': ahora}
    r = await db.form_asignaciones.update_one({'id': aid, 'estado': 'revision'}, {
        '$set': sets, '$push': {'historial': {'accion': accion, 'por': por, 'at': ahora, 'comentario': comentario}}})
    if not r.modified_count:
        raise HTTPException(status_code=409, detail='Esta entrega cambió: vuelve a abrirla')
    await db.custom_form_responses.update_one({'id': a['respuesta_id']}, {'$set': {'revision_estado': accion}})
    f = await db.custom_forms.find_one({'id': a['form_id']}, {'_id': 0, 'borrador': 0, 'contenido_publicado': 0}) or {}
    destino = [(a.get('enviada_por') or {}).get('id')]
    if accion == 'aprobado':
        await _avisar(destino, 'form_aprobado', f'{user["name"]} aprobó «{f.get("titulo")}».', aid)
    else:
        await _avisar(destino, 'form_devuelto', f'{user["name"]} devolvió «{f.get("titulo")}»: {comentario[:120]}', aid)
    await disparar(accion, f, a, await db.custom_form_responses.find_one({'id': a['respuesta_id']}, {'_id': 0}))
    return serialize_doc({'estado': sets['estado']})


@router.post('/asignaciones/{aid}/aprobar')
async def aprobar(aid: str, data: ComentarioInput, user=Depends(get_current_user)):
    return await _cerrar_revision(aid, user, 'aprobado', (data.comentario or '').strip()[:2000])


@router.post('/asignaciones/{aid}/devolver')
async def devolver(aid: str, data: ComentarioInput, user=Depends(get_current_user)):
    comentario = (data.comentario or '').strip()[:2000]
    if not comentario:
        raise HTTPException(status_code=400, detail='Escribe qué hay que corregir')
    return await _cerrar_revision(aid, user, 'devuelto', comentario)


class ReabrirInput(BaseModel):
    vence: Optional[str] = None


@router.post('/asignaciones/{aid}/reabrir')
async def reabrir(aid: str, data: ReabrirInput, user=Depends(get_current_user)):
    a = await fila_o_404(aid)
    f = await _form(a['form_id'])
    if not fa.puede(user, f, 'asignar'):
        raise HTTPException(status_code=403, detail='No puedes administrar las asignaciones de este formulario')
    r = await db.form_asignaciones.update_one({'id': aid, 'estado': 'vencido'}, {'$set': {
        'estado': 'proceso' if (a.get('avance') or {}).get('guardado_at') else 'pendiente', 'vence': _fecha(data.vence),
        'vence_propia': True, 'recordado': False}})
    if not r.modified_count:
        raise HTTPException(status_code=409, detail='Solo se reabre una asignación vencida')
    await _avisar(a.get('miembros') or [a.get('user_id')], 'form_asignado', f'Te reabrieron «{f["titulo"]}».{_vence_texto(_fecha(data.vence))}', aid)
    return {'ok': True}


# --------------------------------------------------------------------------- #
#  Recordatorios y vencimientos (lo llama reminders._loop)
# --------------------------------------------------------------------------- #
_ultima_sincronizacion = None


async def revisar():
    global _ultima_sincronizacion
    ahora = now_local().strftime(FMT)
    forms = {}
    sin_contenido = {'_id': 0, 'borrador': 0, 'contenido_publicado': 0}

    async def form_de(fid: str) -> dict:
        if fid not in forms:
            forms[fid] = await db.custom_forms.find_one({'id': fid}, sin_contenido) or {}
        return forms[fid]

    # repeticiones que acaban de abrir
    async for f in db.custom_forms.find({'esquema': 2, 'estado': 'publicado', 'asignacion.repeticion.frecuencia': {'$in': list(motor.FRECUENCIAS)}}, sin_contenido):
        lim = repeticion.vigente(limpiar_asignacion(f['asignacion'])['repeticion'], now_local())
        if lim and (f.get('ciclo_base') or 0) + lim['n'] > (f.get('ciclo_max') or 0):
            await sincronizar(f)

    async for a in db.form_asignaciones.find({'estado': {'$in': ['pendiente', 'proceso']}, 'vence': {'$ne': None}, 'recordado': False, 'recordar_horas': {'$gt': 0}},
                                             {'_id': 0, 'avance': 0}):
        aviso = (datetime.strptime(a['vence'], FMT) - timedelta(hours=a['recordar_horas'])).strftime(FMT)
        f = await form_de(a['form_id'])
        if ahora < aviso or f.get('estado') != 'publicado':
            continue
        r = await db.form_asignaciones.update_one({'id': a['id'], 'recordado': False}, {'$set': {'recordado': True}})
        # si el recordatorio cae antes de abrir, ya lo cubre el aviso de que le toca
        if r.modified_count and not (a.get('abre') and aviso <= a['abre']):
            await _avisar(a.get('miembros') or [a.get('user_id')], 'form_recordatorio', f'Te falta entregar «{f.get("titulo")}».{_vence_texto(a["vence"])}', a['id'])
    async for a in db.form_asignaciones.find({'estado': {'$in': ['pendiente', 'proceso']}, 'vence': {'$ne': None, '$lte': ahora}}, {'_id': 0, 'avance': 0}):
        f = await form_de(a['form_id'])
        if f.get('estado') == 'publicado':  # despublicado: nadie lo ve, no vence
            await _vencer(a, f)
    async for a in db.form_asignaciones.find({'estado': 'revision', 'revisar_antes': {'$ne': None, '$lte': ahora}, 'revision_atrasada': False}, {'_id': 0, 'avance': 0}):
        r = await db.form_asignaciones.update_one({'id': a['id'], 'estado': 'revision', 'revision_atrasada': False}, {'$set': {'revision_atrasada': True}})
        if r.modified_count:
            f = await form_de(a['form_id'])
            await _avisar([s['id'] for s in a.get('supervisores') or []], 'form_recordatorio',
                          f'Sigue sin revisar «{f.get("titulo")}» de {(a.get("enviada_por") or {}).get("name")}.', a['id'])
    # quien entró o salió de un cargo, área o grupo
    marca = now_local()
    if _ultima_sincronizacion is None or (marca - _ultima_sincronizacion).total_seconds() >= MINUTOS_SINCRONIZAR * 60:
        _ultima_sincronizacion = marca
        async for f in db.custom_forms.find({'esquema': 2}, {'_id': 0}):
            await sincronizar(f)


async def ensure_indexes():
    c = db.form_asignaciones
    await c.create_index('id', unique=True)
    await c.create_index([('form_id', 1), ('ciclo', 1), ('user_id', 1)], unique=True, partialFilterExpression={'tipo': 'persona'})
    await c.create_index([('form_id', 1), ('ciclo', 1), ('sucursal', 1)], unique=True, partialFilterExpression={'tipo': 'sucursal'})
    await c.create_index('user_id')
    await c.create_index('miembros')
    await c.create_index('supervisores.id')
    await c.create_index('enviada_por.id')
    await c.create_index([('estado', 1), ('vence', 1)])
    await db.form_temas.create_index('id', unique=True)
    await automatizaciones.ensure_indexes()
