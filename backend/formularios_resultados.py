"""Lo que se ve de los formularios una vez que corren.

Supervisión: de todos los formularios, lo que le toca a quien supervisa (los
admins, todo su departamento). Aprobar y devolver siguen en
formularios_asignaciones.py. Los seguimientos son los mismos de Seguimientos.

Resultados de un formulario: un panel igual para todos, con filtros, sacado de
sus entregas (db.form_asignaciones) y sus respuestas (db.custom_form_responses).
Lo da el permiso Ver resultados. El Excel, el permiso Exportar.
"""
import io
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from core import db, get_current_user, serialize_doc, es_super_admin, departamento_de, APP_UTC_OFFSET_HOURS
import formularios_acceso as fa
import formularios_asignaciones as fasig
import formularios_reglas as reglas

router = APIRouter(prefix='/formularios-v2', tags=['formularios-v2'])

PESTANAS = {
    'revisar': {'estado': 'revision'}, 'aprobados': {'estado': 'completado', 'revisada_por': {'$exists': True}},
    'devueltos': {'estado': 'devuelto'}, 'vencidos': {'estado': 'vencido'},
}
ORDEN = {'revisar': ('enviada_at', 1), 'aprobados': ('cerrada_at', -1), 'devueltos': ('enviada_at', -1), 'vencidos': ('vence', -1)}
ESTADOS = {'pendiente': 'Pendiente', 'proceso': 'En proceso', 'revision': 'En revisión', 'devuelto': 'Devuelto', 'completado': 'Completado', 'vencido': 'Vencido'}
SIN_DATOS = {'_id': 0, 'avance': 0}
MAX_FILAS = 200
_ZONA = timezone(timedelta(hours=APP_UTC_OFFSET_HOURS))


def _rango_utc(desde: Optional[str], hasta: Optional[str]) -> dict:
    """Días de la empresa, como los momentos guardados (UTC)."""
    rango = {}
    for op, dia, extra in (('$gte', desde, 0), ('$lt', hasta, 1)):
        try:
            d = datetime.strptime(dia or '', '%Y-%m-%d')
        except ValueError:
            continue
        rango[op] = (d + timedelta(days=extra, hours=-APP_UTC_OFFSET_HOURS)).strftime('%Y-%m-%dT%H:%M:%S')
    return rango


def _local(iso) -> Optional[datetime]:
    try:
        d = datetime.fromisoformat(str(iso).replace('Z', '+00:00'))
    except ValueError:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(_ZONA).replace(tzinfo=None)


def _pct(parte: int, total: int) -> Optional[int]:
    return round(parte / total * 100) if total else None


def _promedio(valores: list) -> Optional[int]:
    return round(sum(valores) / len(valores)) if valores else None


def _quien(a: dict) -> str:
    return (a.get('enviada_por') or {}).get('name') or a.get('user_name') or (f'Tienda {a["sucursal"]}' if a.get('sucursal') else '')


# --------------------------------------------------------------------------- #
#  Supervisión
# --------------------------------------------------------------------------- #
def _base(user: dict) -> dict:
    if es_super_admin(user):
        return {}
    if user.get('role') == 'admin':
        return {'departamento': departamento_de(user)}
    return {'supervisores.id': user['id']}


async def _base_seguimientos(user: dict) -> dict:
    q = {'origen.tipo': 'formulario', 'estado': {'$in': ['abierto', 'corregido']}}
    if user.get('role') == 'admin' and not es_super_admin(user):
        q['origen.form_id'] = {'$in': [f['id'] async for f in db.custom_forms.find({'esquema': 2, 'departamento': departamento_de(user)}, {'_id': 0, 'id': 1})]}
    elif not es_super_admin(user):
        q['revisores.id'] = user['id']
    return q


async def _ve_supervision(user: dict) -> bool:
    if user.get('role') == 'admin':
        return True
    return bool(await db.form_asignaciones.find_one(_base(user), {'_id': 1})
                or await db.tickets.find_one({'origen.tipo': 'formulario', 'revisores.id': user['id']}, {'_id': 1}))


def _filtro(tab: str, sucursal, persona, form_id, desde, hasta) -> dict:
    q = dict(PESTANAS[tab])
    if form_id:
        q['form_id'] = form_id
    if sucursal:
        q['tienda'] = sucursal
    if persona:
        q['$or'] = [{'enviada_por.id': persona}, {'user_id': persona}]
    if tab == 'vencidos':  # lo vencido no tiene fecha de envío: cuenta cuando venció
        rango = {**({'$gte': desde} if desde else {}), **({'$lte': f'{hasta}T23:59'} if hasta else {})}
        if rango:
            q['vence'] = rango
    elif _rango_utc(desde, hasta):
        q['enviada_at'] = _rango_utc(desde, hasta)
    return q


def _filtro_seguimientos(sucursal, persona, form_id, desde, hasta) -> dict:
    q = {}
    if form_id:
        q['origen.form_id'] = form_id
    if sucursal:
        q['tienda'] = sucursal
    if persona:
        q['asignado_a.id'] = persona
    if _rango_utc(desde, hasta):
        q['created_at'] = _rango_utc(desde, hasta)
    return q


def _fila(a: dict, titulos: dict, user: dict) -> dict:
    ultimo = next((h for h in reversed(a.get('historial') or []) if h.get('accion') in ('devuelto', 'aprobado')), None)
    return {**{k: a.get(k) for k in ('id', 'form_id', 'estado', 'tienda', 'vence', 'abre', 'enviada_at', 'cerrada_at', 'tardia', 'revisar_antes', 'revisada_por', 'respuesta_id')},
            'titulo': titulos.get(a['form_id']) or 'Formulario', 'quien': _quien(a), 'ultimo': ultimo, 'atrasada': bool(a.get('revision_atrasada')),
            'supervisores': [s.get('name') for s in a.get('supervisores') or []], 'puede_revisar': a['estado'] == 'revision' and fasig.es_supervisor(a, user)}


@router.get('/supervision/contador')
async def contador_supervision(user=Depends(get_current_user)):
    """Para la pantalla Formularios: si le sale Supervisión y cuánto tiene por revisar."""
    if not await _ve_supervision(user):
        return {'ver': False, 'pendientes': 0}
    return {'ver': True, 'pendientes': await db.form_asignaciones.count_documents({**_base(user), 'estado': 'revision'})}


@router.get('/supervision')
async def supervision(tab: str = 'revisar', sucursal: Optional[str] = None, persona: Optional[str] = None, form_id: Optional[str] = None,
                      desde: Optional[str] = None, hasta: Optional[str] = None, user=Depends(get_current_user)):
    if not await _ve_supervision(user):
        raise HTTPException(status_code=403, detail='No supervisas ningún formulario')
    base = _base(user)
    filtros = (sucursal, persona, form_id, desde, hasta)
    base_seg = await _base_seguimientos(user)
    q_seg = {'$and': [base_seg, _filtro_seguimientos(*filtros)]}  # un filtro nunca abre más de lo que le toca ver
    conteos = {k: await db.form_asignaciones.count_documents({'$and': [base, _filtro(k, *filtros)]}) for k in PESTANAS}
    conteos['seguimientos'] = await db.tickets.count_documents(q_seg)
    # lo que se puede elegir en los filtros: lo que esta persona ve, sin filtrar
    todas = await db.form_asignaciones.find({**base, 'estado': {'$in': ['revision', 'completado', 'devuelto', 'vencido']}},
                                            {'_id': 0, 'form_id': 1, 'tienda': 1, 'user_id': 1, 'user_name': 1, 'enviada_por': 1, 'revisada_por': 1, 'estado': 1}).to_list(5000)
    todas = [a for a in todas if a['estado'] != 'completado' or a.get('revisada_por')]
    tickets = await db.tickets.find(base_seg, {'_id': 0, 'id': 1, 'numero': 1, 'titulo': 1, 'tienda': 1, 'estado': 1, 'vence': 1, 'vencido': 1, 'created_at': 1,
                                               'asignado_a': 1, 'origen': 1, 'lineas': 1}).to_list(2000)
    ids = {a['form_id'] for a in todas} | {t['origen']['form_id'] for t in tickets}
    titulos = {f['id']: f['titulo'] async for f in db.custom_forms.find({'id': {'$in': list(ids)}}, {'_id': 0, 'id': 1, 'titulo': 1})}
    personas = {}
    for a in todas:
        p = a.get('enviada_por') or ({'id': a.get('user_id'), 'name': a.get('user_name')} if a.get('user_id') else None)
        if p:
            personas[p['id']] = p['name']
    for t in tickets:
        personas[t['asignado_a']['id']] = t['asignado_a']['name']
    opciones = {'formularios': sorted(({'id': k, 'nombre': v} for k, v in titulos.items()), key=lambda x: x['nombre']),
                'sucursales': sorted({a['tienda'] for a in todas if a.get('tienda')} | {t['tienda'] for t in tickets if t.get('tienda')}),
                'personas': sorted(({'id': k, 'nombre': v} for k, v in personas.items()), key=lambda x: x['nombre'])}
    filas = []
    if tab == 'seguimientos':
        lista = await db.tickets.find(q_seg, {'_id': 0}).sort('created_at', -1).to_list(MAX_FILAS)
        filas = [{**{k: t.get(k) for k in ('id', 'numero', 'titulo', 'tienda', 'estado', 'vence', 'vencido', 'created_at')}, 'quien': (t.get('asignado_a') or {}).get('name'),
                  'puntos': len(t.get('lineas') or []), 'corregidos': sum(1 for ln in t.get('lineas') or [] if ln.get('corregida'))} for t in lista]
    elif tab in PESTANAS:
        campo, sentido = ORDEN[tab]
        lista = await db.form_asignaciones.find({'$and': [base, _filtro(tab, *filtros)]}, SIN_DATOS).sort(campo, sentido).to_list(MAX_FILAS)
        filas = [_fila(a, titulos, user) for a in lista]
    return serialize_doc({'tab': tab, 'filas': filas, 'conteos': conteos, 'opciones': opciones, 'tope': MAX_FILAS})


# --------------------------------------------------------------------------- #
#  Resultados de un formulario
# --------------------------------------------------------------------------- #
async def _datos(f: dict, desde, hasta, sucursal, persona, estado) -> tuple:
    """(entregas, respuestas) del formulario que cumplen los filtros."""
    q = {'form_id': f['id']}
    r = {'form_id': f['id']}
    rango = _rango_utc(desde, hasta)
    if rango:
        q['creada_at'] = rango
        r['created_at'] = rango
    if sucursal:
        q['tienda'] = sucursal
    if persona:
        q['$or'] = [{'enviada_por.id': persona}, {'user_id': persona}]
        r['respondent_id'] = persona
    if estado:
        q['estado'] = estado
    filas = await db.form_asignaciones.find(q, SIN_DATOS).to_list(20000)
    respuestas = await db.custom_form_responses.find(r, {'_id': 0}).sort('created_at', 1).to_list(20000)
    if estado:
        ids = {a['id'] for a in filas}
        respuestas = [x for x in respuestas if x.get('asignacion_id') in ids]
    if sucursal:
        respuestas = [x for x in respuestas if (x.get('sucursal') or x.get('respondent_sucursal') or '') == sucursal]
    return filas, respuestas


def _tienda_resp(r: dict) -> str:
    return r.get('sucursal') or r.get('respondent_sucursal') or 'Sin tienda'


def _grupo(filas: list, respuestas: list) -> dict:
    asignadas = [a for a in filas if a['tipo'] != 'libre']
    entregadas = [a for a in asignadas if a.get('enviada_at')]
    return {'asignadas': len(asignadas), 'entregadas': len(entregadas), 'a_tiempo': sum(1 for a in entregadas if not a.get('tardia')),
            'vencidas': sum(1 for a in asignadas if a['estado'] == 'vencido'), 'respuestas': len(respuestas),
            'cumplimiento': _pct(len(entregadas), len(asignadas)), 'puntaje': _promedio([x['percent'] for x in respuestas if x.get('percent') is not None])}


def _por_pregunta(f: dict, respuestas: list) -> list:
    """Cuánto se contestó cada pregunta y qué se contestó, en el orden del formulario."""
    out = {}
    for p in (f.get('contenido_publicado') or {}).get('pasos') or []:
        for s in p.get('secciones') or []:
            for it in s.get('items') or []:
                if reglas.FAMILIA.get(it.get('tipo')):
                    opciones = {o['label']: 0 for o in it.get('opciones') or []}
                    if it['tipo'] == 'matriz':
                        opciones = {f'{f["label"]}: {c["label"]}': 0 for f in it['config']['filas'] for c in it['config']['columnas']}
                    out[it['id']] = {'id': it['id'], 'titulo': it.get('titulo') or 'Sin título', 'seccion': s.get('nombre') or '', 'tipo': it['tipo'],
                                     'respondidas': 0, 'puntos': 0, 'maximo': 0, 'opciones': opciones, 'numeros': []}
    for r in respuestas:
        for e in r.get('entries') or []:
            p = out.setdefault(e['id'], {'id': e['id'], 'titulo': e.get('titulo') or 'Sin título', 'seccion': e.get('seccion') or '', 'tipo': e.get('tipo'),
                                         'respondidas': 0, 'puntos': 0, 'maximo': 0, 'opciones': {}, 'numeros': []})
            valor = e.get('respuesta')
            if valor in (None, '', []) and not e.get('photos') and not e.get('archivos'):
                continue
            p['respondidas'] += 1
            p['puntos'] += e.get('score') or 0
            p['maximo'] += e.get('max') or 0
            familia = reglas.FAMILIA.get(p['tipo'])
            if familia in ('opcion', 'multiple') or p['tipo'] == 'matriz':
                for texto in valor if isinstance(valor, list) else [valor]:
                    p['opciones'][texto] = p['opciones'].get(texto, 0) + 1
            elif familia == 'numero' and isinstance(e.get('valor'), (int, float)):
                p['numeros'].append(e['valor'])
    filas = []
    for p in out.values():
        opciones = [{'texto': k, 'n': n, 'pct': _pct(n, p['respondidas'])} for k, n in p['opciones'].items()]
        numeros = p['numeros']
        filas.append({**{k: p[k] for k in ('id', 'titulo', 'seccion', 'tipo', 'respondidas')}, 'puntaje': _pct(p['puntos'], p['maximo']), 'opciones': opciones,
                      'promedio': round(sum(numeros) / len(numeros), 1) if numeros else None})
    return filas


def _tendencia(filas: list, respuestas: list) -> dict:
    """Por repetición si se repite; si no, por día de entrega."""
    asignadas = [a for a in filas if a['tipo'] != 'libre']
    ciclos = {a['ciclo'] for a in asignadas}
    puntajes = {x.get('asignacion_id'): x.get('percent') for x in respuestas}
    if len(ciclos) > 1:
        puntos = []
        for c in sorted(ciclos):
            grupo = [a for a in asignadas if a['ciclo'] == c]
            entregadas = [a for a in grupo if a.get('enviada_at')]
            puntos.append({'dia': (next((a['abre'] for a in grupo if a.get('abre')), '') or '')[:10], 'asignadas': len(grupo), 'entregadas': len(entregadas),
                           'cumplimiento': _pct(len(entregadas), len(grupo)),
                           'puntaje': _promedio([puntajes[a['id']] for a in entregadas if puntajes.get(a['id']) is not None])})
        return {'tipo': 'repeticion', 'puntos': [p for p in puntos if p['dia']][-60:]}
    dias = {}
    for r in respuestas:
        d = _local(r.get('created_at'))
        if d:
            dias.setdefault(d.strftime('%Y-%m-%d'), []).append(r)
    puntos = [{'dia': k, 'respuestas': len(v), 'puntaje': _promedio([x['percent'] for x in v if x.get('percent') is not None])} for k, v in sorted(dias.items())]
    return {'tipo': 'dia', 'puntos': puntos[-60:]}


def _armar(f: dict, filas: list, respuestas: list) -> dict:
    por_tienda = {}
    for a in filas:
        por_tienda.setdefault(a.get('tienda') or 'Sin tienda', ([], []))[0].append(a)
    for r in respuestas:
        por_tienda.setdefault(_tienda_resp(r), ([], []))[1].append(r)
    por_persona = {}
    for a in filas:
        uid = (a.get('enviada_por') or {}).get('id') or a.get('user_id')
        if uid:
            g = por_persona.setdefault(uid, {'nombre': _quien(a), 'tienda': a.get('tienda'), 'filas': [], 'respuestas': []})
            g['filas'].append(a)
    for r in respuestas:
        g = por_persona.setdefault(r['respondent_id'], {'nombre': r.get('respondent_name'), 'tienda': _tienda_resp(r), 'filas': [], 'respuestas': []})
        g['respuestas'].append(r)
    conteo = {}
    for a in filas:
        conteo[a['estado']] = conteo.get(a['estado'], 0) + 1
    asignadas = [a for a in filas if a['tipo'] != 'libre']
    tiendas = sorted(({'tienda': k, **_grupo(*v)} for k, v in por_tienda.items()), key=lambda x: (-(x['cumplimiento'] or 0), x['tienda']))
    personas = sorted(({'id': k, 'nombre': g['nombre'], 'tienda': g['tienda'], **_grupo(g['filas'], g['respuestas'])} for k, g in por_persona.items()),
                      key=lambda x: (x['nombre'] or ''))
    resumen = {**_grupo(filas, respuestas), 'pendientes': conteo.get('pendiente', 0) + conteo.get('proceso', 0), 'en_revision': conteo.get('revision', 0),
               'devueltas': conteo.get('devuelto', 0), 'puntualidad': None}
    resumen['puntualidad'] = _pct(resumen['a_tiempo'], resumen['entregadas'])
    return {'asigna': bool(asignadas), 'con_puntaje': any(x.get('total_max') for x in respuestas), 'resumen': resumen, 'por_tienda': tiendas, 'por_persona': personas,
            'por_pregunta': _por_pregunta(f, respuestas), 'tendencia': _tendencia(filas, respuestas)}


async def _opciones(f: dict) -> dict:
    """Lo que se puede elegir en los filtros, sin que dependa de lo ya filtrado."""
    filas = await db.form_asignaciones.find({'form_id': f['id']}, {'_id': 0, 'tienda': 1, 'user_id': 1, 'user_name': 1, 'enviada_por': 1}).to_list(20000)
    personas = {}
    for a in filas:
        if a.get('enviada_por'):
            personas[a['enviada_por']['id']] = a['enviada_por']['name']
        elif a.get('user_id'):
            personas[a['user_id']] = a.get('user_name')
    async for r in db.custom_form_responses.find({'form_id': f['id']}, {'_id': 0, 'respondent_id': 1, 'respondent_name': 1}):
        personas[r['respondent_id']] = r.get('respondent_name')
    tiendas = {a['tienda'] for a in filas if a.get('tienda')}
    return {'sucursales': sorted(tiendas), 'personas': sorted(({'id': k, 'nombre': v or ''} for k, v in personas.items()), key=lambda x: x['nombre']),
            'estados': [{'id': k, 'nombre': v} for k, v in ESTADOS.items()]}


@router.get('/{fid}/resultados')
async def resultados(fid: str, desde: Optional[str] = None, hasta: Optional[str] = None, sucursal: Optional[str] = None,
                     persona: Optional[str] = None, estado: Optional[str] = None, user=Depends(get_current_user)):
    f = await fasig._form(fid)
    if not fa.puede(user, f, 'resultados'):
        raise HTTPException(status_code=403, detail='No puedes ver los resultados de este formulario')
    filas, respuestas = await _datos(f, desde, hasta, sucursal, persona, estado)
    return serialize_doc({**_armar(f, filas, respuestas), 'opciones': await _opciones(f)})


# --------------------------------------------------------------------------- #
#  Excel: una fila por entrega, una columna por pregunta
# --------------------------------------------------------------------------- #
def _celda(e: dict):
    if isinstance(e.get('valor'), (int, float)) and not isinstance(e.get('valor'), bool) and reglas.FAMILIA.get(e.get('tipo')) == 'numero':
        return e['valor']
    valor = e.get('respuesta')
    texto = ', '.join(str(x) for x in valor) if isinstance(valor, list) else ('' if valor is None else str(valor))
    n = len(e.get('photos') or []) + len(e.get('archivos') or [])
    if n:
        texto = f'{texto} ({n} {"archivo" if n == 1 else "archivos"})'.strip()
    if e.get('note'):
        texto = f'{texto} · {e["note"]}'.strip(' ·')
    return texto


def _libro(f: dict, filas: list, respuestas: list) -> io.BytesIO:
    from openpyxl import Workbook
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    preguntas = {p['id']: p['titulo'] for p in _por_pregunta(f, respuestas)}
    por_id = {a['id']: a for a in filas}
    wb = Workbook()
    ws = wb.active
    ws.title = 'Respuestas'
    fijas = ['Fecha', 'Persona', 'Cargo', 'Tienda', 'Versión', 'Estado', 'Tarde', 'Puntos', 'Máximo', '%']
    ws.append(fijas + list(preguntas.values()))
    fondo = PatternFill('solid', fgColor='1E395E')
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = fondo
        c.alignment = Alignment(vertical='center', wrap_text=True)
    for r in respuestas:
        a = por_id.get(r.get('asignacion_id')) or {}
        estado = 'Aprobado' if a.get('estado') == 'completado' and a.get('revisada_por') else ESTADOS.get(a.get('estado'), 'Entregado')
        d = _local(r.get('created_at'))
        entradas = {e['id']: _celda(e) for e in r.get('entries') or []}
        fila = [d.strftime('%d/%m/%Y %H:%M') if d else '', r.get('respondent_name') or '', r.get('respondent_position') or '', _tienda_resp(r), r.get('version'), estado,
                'Sí' if a.get('tardia') else 'No', r.get('total_score') if r.get('total_max') else None, r.get('total_max') or None, r.get('percent')]
        fila += [entradas.get(k, '') for k in preguntas]
        ws.append([ILLEGAL_CHARACTERS_RE.sub('', x) if isinstance(x, str) else x for x in fila])
        # lo que escribió la gente es texto: un «=...» nunca se vuelve fórmula
        for c in ws[ws.max_row]:
            if isinstance(c.value, str):
                c.data_type = 's'
                if '\n' in c.value:  # tablas y grupos repetibles: una línea por fila
                    c.alignment = Alignment(vertical='top', wrap_text=True)
    for i in range(1, len(fijas) + len(preguntas) + 1):
        ws.column_dimensions[get_column_letter(i)].width = 18 if i <= len(fijas) else 30
    ws.freeze_panes = 'C2'
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


@router.get('/{fid}/resultados/excel')
async def excel(fid: str, desde: Optional[str] = None, hasta: Optional[str] = None, sucursal: Optional[str] = None,
                persona: Optional[str] = None, estado: Optional[str] = None, user=Depends(get_current_user)):
    f = await fasig._form(fid)
    if not fa.puede(user, f, 'exportar'):
        raise HTTPException(status_code=403, detail='No puedes exportar este formulario')
    filas, respuestas = await _datos(f, desde, hasta, sucursal, persona, estado)
    nombre = re.sub(r'[^A-Za-z0-9]+', '_', f.get('titulo') or 'formulario').strip('_') or 'formulario'
    return StreamingResponse(_libro(f, filas, respuestas), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                             headers={'Content-Disposition': f'attachment; filename="Resultados_{nombre}.xlsx"'})
