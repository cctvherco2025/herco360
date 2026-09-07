"""Reportes CAMS — ingest and reporting for the in-store people-counting agent.

The local agent (Proyecto CAM) POSTs batches of "entrada" events to
`/api/cams/ingesta?k=<CAM_INGEST_KEY>`. It retries on any non-2xx and sends a
deterministic `batch_id`, so we deduplicate by that id and always answer 2xx once
a batch is stored.

Environment:
    CAM_INGEST_KEY      shared secret required on the ingest URL (?k=...)
    CAM_PILOT_SUCURSAL   store label for the pilot camera (default "Piloto")
    CAM_PILOT_CAMARA     camera label (default "Camara 1")

Collections:
    cam_lotes    one doc per accepted POST  (batch_id unique)
    cam_eventos  one doc per entry timestamp (date_local / hour_local precomputed)
    cam_agentes  last-seen status per (sucursal, camara)

Event timestamps arrive in UTC ("...Z"); `date_local` / `hour_local` are in the
company timezone (core.APP_UTC_OFFSET_HOURS) so day/hour reports are simple.
"""
import os
import io
import re
import logging
import unicodedata
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse

from core import db, serialize_doc, new_id, now_iso, now_local, APP_UTC_OFFSET_HOURS, require_cams_access
from models import CamsIngestInput

router = APIRouter(prefix='/cams', tags=['cams'])
logger = logging.getLogger('cams')

INGEST_KEY = os.environ.get('CAM_INGEST_KEY', '').strip()
PILOT_SUCURSAL = os.environ.get('CAM_PILOT_SUCURSAL', 'Piloto').strip()
PILOT_CAMARA = os.environ.get('CAM_PILOT_CAMARA', 'Camara 1').strip()

_OFFSET = timedelta(hours=APP_UTC_OFFSET_HOURS)
ONLINE_WINDOW_MIN = 15  # agent is "en línea" if it reported within this many minutes


def _to_local(ts_utc: str) -> datetime:
    """Parse an ISO-8601 UTC timestamp and shift it to company local time (naive)."""
    s = (ts_utc or '').strip().replace('Z', '').replace('+00:00', '')
    return datetime.fromisoformat(s) + _OFFSET


def _slug(texto: str) -> str:
    """'Herco Centro' -> 'herco_centro'. Se usa como id estable de la sucursal
    cuando el agente no manda 'sucursal_id' explícito (mismo criterio que el
    agente local en conteo/config.py)."""
    norm = unicodedata.normalize('NFKD', texto or '')
    sin_acentos = ''.join(c for c in norm if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]+', '_', sin_acentos.lower()).strip('_')
    return s or 'piloto'


def _resolve_origen(data) -> tuple:
    """Sucursal / id estable / cámara de un lote entrante. Toma lo que mande el
    agente; si no manda nada (agente viejo) cae al piloto configurado por env."""
    sucursal = (getattr(data, 'sucursal', None) or '').strip() or PILOT_SUCURSAL
    sucursal_id = (getattr(data, 'sucursal_id', None) or '').strip() or _slug(sucursal)
    camara = (getattr(data, 'camara', None) or '').strip() or PILOT_CAMARA
    return sucursal, sucursal_id, camara


# --------------------------------------------------------------------------- #
#  Ingest (no user auth — shared key on the URL)
# --------------------------------------------------------------------------- #
@router.post('/ingesta')
async def ingesta(data: CamsIngestInput, k: str = Query(default='')):
    if not INGEST_KEY:
        raise HTTPException(status_code=503, detail='Ingesta de cámaras no configurada en el servidor')
    if k != INGEST_KEY:
        raise HTTPException(status_code=401, detail='Clave inválida')

    sucursal, sucursal_id, camara = _resolve_origen(data)

    # Deduplicate: the agent resends the same batch_id if a response was lost.
    if await db.cam_lotes.find_one({'batch_id': data.batch_id}, {'_id': 1}):
        return {'ok': True, 'dedup': True, 'stored': 0}

    eventos = []
    for ts in (data.eventos or []):
        try:
            loc = _to_local(ts)
        except Exception:
            continue
        eventos.append({
            'id': new_id(),
            'batch_id': data.batch_id,
            'sucursal': sucursal,
            'sucursal_id': sucursal_id,
            'camara': camara,
            'ts_utc': ts,
            'date_local': loc.strftime('%Y-%m-%d'),
            'hour_local': loc.hour,
            'created_at': now_iso(),
        })

    await db.cam_lotes.insert_one({
        'id': new_id(),
        'batch_id': data.batch_id,
        'sucursal': sucursal,
        'sucursal_id': sucursal_id,
        'camara': camara,
        'batch_timestamp': data.timestamp,
        'entradas': int(data.entradas or 0),
        'eventos_guardados': len(eventos),
        'received_at': now_iso(),
    })
    if eventos:
        await db.cam_eventos.insert_many(eventos)

    # Estado del agente: una fila por (sucursal_id, cámara). Se llavea por el id
    # estable, no por el nombre visible, para que renombrar la sucursal no cree
    # una fila huérfana. Se guarda 'sucursal' para poder mostrar el nombre.
    await db.cam_agentes.update_one(
        {'sucursal_id': sucursal_id, 'camara': camara},
        {'$set': {'sucursal': sucursal, 'last_seen': now_iso(), 'last_batch_id': data.batch_id},
         '$inc': {'total_entradas': int(data.entradas or 0), 'total_lotes': 1},
         '$setOnInsert': {'id': new_id(), 'first_seen': now_iso()}},
        upsert=True,
    )
    return {'ok': True, 'dedup': False, 'stored': len(eventos), 'sucursal': sucursal}


# --------------------------------------------------------------------------- #
#  Reporting (require_cams_access: admins, Director comercial, o acceso manual)
# --------------------------------------------------------------------------- #
def _scope(sucursal: str = None, sucursal_id: str = None) -> dict:
    """Fragmento de query para acotar a una tienda. Acepta el id estable
    (preferido) o el nombre visible; sin ninguno, no filtra (todas)."""
    if sucursal_id:
        return {'sucursal_id': sucursal_id}
    if sucursal:
        return {'sucursal': sucursal}
    return {}


async def _agent_state(sucursal=None, sucursal_id=None):
    q = _scope(sucursal, sucursal_id)
    agents = await db.cam_agentes.find(q, {'_id': 0}).to_list(50)
    out = []
    now = now_local()
    for a in agents:
        online = False
        mins = None
        try:
            last = _to_local(a['last_seen'])
            mins = (now - last).total_seconds() / 60.0
            online = mins < ONLINE_WINDOW_MIN
        except Exception:
            pass
        out.append({**a, 'online': online, 'mins_since': None if mins is None else round(mins, 1)})
    return out


@router.get('/meta')
async def meta(user=Depends(require_cams_access)):
    nombres = await db.cam_eventos.distinct('sucursal')
    # Pares id+nombre para el selector; el id estable es la clave para filtrar.
    # Se arma desde cam_agentes (una fila por tienda/cámara), que es chico.
    ags = await db.cam_agentes.find({}, {'_id': 0, 'sucursal': 1, 'sucursal_id': 1}).to_list(100)
    vistos, sucursales_full = set(), []
    for a in ags:
        nombre = (a.get('sucursal') or '').strip()
        sid = (a.get('sucursal_id') or '').strip() or _slug(nombre)
        if not nombre or sid in vistos:
            continue
        vistos.add(sid)
        sucursales_full.append({'id': sid, 'nombre': nombre})
    sucursales_full.sort(key=lambda x: x['nombre'])
    return {
        'configured': bool(INGEST_KEY),
        'sucursales': sorted([s for s in nombres if s]),  # compat: lista de nombres
        'sucursales_full': sucursales_full,               # [{id, nombre}]
        'agents': serialize_doc(await _agent_state()),
        'online_window_min': ONLINE_WINDOW_MIN,
    }


@router.get('/summary')
async def summary(start: str, end: str, sucursal: str = None, sucursal_id: str = None,
                 user=Depends(require_cams_access)):
    scope = _scope(sucursal, sucursal_id)
    q = {'date_local': {'$gte': start, '$lte': end}, **scope}
    rows = await db.cam_eventos.find(q, {'_id': 0, 'date_local': 1}).to_list(200000)
    by_day = {}
    for r in rows:
        by_day[r['date_local']] = by_day.get(r['date_local'], 0) + 1

    # Fill every day in the range so the chart has no gaps.
    days = []
    try:
        d0 = datetime.strptime(start, '%Y-%m-%d').date()
        d1 = datetime.strptime(end, '%Y-%m-%d').date()
        cur = d0
        while cur <= d1:
            key = cur.isoformat()
            days.append({'date': key, 'count': by_day.get(key, 0)})
            cur += timedelta(days=1)
    except Exception:
        days = [{'date': k, 'count': v} for k, v in sorted(by_day.items())]

    today_key = now_local().strftime('%Y-%m-%d')
    today = await db.cam_eventos.count_documents({'date_local': today_key, **scope})

    return {'total': len(rows), 'today': today, 'by_day': days}


@router.get('/por-sucursal')
async def por_sucursal(start: str, end: str, user=Depends(require_cams_access)):
    """Desglose de entradas por sucursal en el rango — la vista de 'separación'
    de Reportes CAMS: una fila por tienda con su total del rango y su total de
    hoy, ordenadas de mayor a menor. Agrupa por 'sucursal_id' (estable) y toma
    el nombre visible más reciente que se haya visto para ese id."""
    today_key = now_local().strftime('%Y-%m-%d')
    rows = await db.cam_eventos.find(
        {'date_local': {'$gte': start, '$lte': end}},
        {'_id': 0, 'sucursal': 1, 'sucursal_id': 1, 'date_local': 1},
    ).to_list(300000)

    acc = {}
    for r in rows:
        nombre = (r.get('sucursal') or '').strip() or '(sin sucursal)'
        sid = (r.get('sucursal_id') or '').strip() or _slug(nombre)
        e = acc.setdefault(sid, {'sucursal_id': sid, 'sucursal': nombre, 'total': 0, 'today': 0})
        e['sucursal'] = nombre  # el último visto gana (nombre puede haber cambiado)
        e['total'] += 1
        if r.get('date_local') == today_key:
            e['today'] += 1

    out = sorted(acc.values(), key=lambda x: x['total'], reverse=True)
    return {'start': start, 'end': end, 'today': today_key,
            'total': sum(e['total'] for e in out), 'sucursales': out}


@router.get('/hourly')
async def hourly(date: str, sucursal: str = None, sucursal_id: str = None,
                 user=Depends(require_cams_access)):
    q = {'date_local': date, **_scope(sucursal, sucursal_id)}
    rows = await db.cam_eventos.find(q, {'_id': 0, 'hour_local': 1}).to_list(200000)
    hours = [0] * 24
    for r in rows:
        h = r.get('hour_local')
        if isinstance(h, int) and 0 <= h < 24:
            hours[h] += 1
    return {'date': date, 'hours': hours, 'total': len(rows)}


@router.get('/recent')
async def recent(limit: int = 20, sucursal: str = None, sucursal_id: str = None,
                 user=Depends(require_cams_access)):
    q = _scope(sucursal, sucursal_id)
    rows = await db.cam_eventos.find(q, {'_id': 0}).sort('ts_utc', -1).limit(min(limit, 100)).to_list(100)
    for r in rows:
        try:
            r['hora_local'] = _to_local(r['ts_utc']).strftime('%d/%m %H:%M:%S')
        except Exception:
            r['hora_local'] = r.get('ts_utc', '')
    return serialize_doc(rows)


@router.get('/export')
async def export(start: str, end: str, sucursal: str = None, sucursal_id: str = None,
                user=Depends(require_cams_access)):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    q = {'date_local': {'$gte': start, '$lte': end}, **_scope(sucursal, sucursal_id)}
    rows = await db.cam_eventos.find(q, {'_id': 0}).sort('ts_utc', 1).to_list(200000)

    wb = Workbook()
    ws = wb.active
    ws.title = 'Entradas'
    ws.append(['Fecha', 'Hora', 'Sucursal', 'Cámara'])
    head = PatternFill('solid', fgColor='1E395E')
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = head
    for r in rows:
        try:
            loc = _to_local(r['ts_utc'])
            f, h = loc.strftime('%Y-%m-%d'), loc.strftime('%H:%M:%S')
        except Exception:
            f, h = r.get('date_local', ''), ''
        ws.append([f, h, r.get('sucursal', ''), r.get('camara', '')])
    for col, w in zip('ABCD', (14, 12, 12, 22)):
        ws.column_dimensions[col].width = w

    ws2 = wb.create_sheet('Por día')
    ws2.append(['Fecha', 'Entradas'])
    for c in ws2[1]:
        c.font = Font(bold=True, color='FFFFFF')
        c.fill = head
    by_day = {}
    for r in rows:
        by_day[r['date_local']] = by_day.get(r['date_local'], 0) + 1
    for k in sorted(by_day):
        ws2.append([k, by_day[k]])
    ws2.column_dimensions['A'].width = 14
    ws2.column_dimensions['B'].width = 12

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    suf = f'_{sucursal or sucursal_id}' if (sucursal or sucursal_id) else ''
    fname = f'reportes_cams{suf}_{start}_a_{end}.xlsx'
    return StreamingResponse(
        buf,
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{fname}"'},
    )
