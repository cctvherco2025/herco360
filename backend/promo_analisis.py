"""Promociones del mes — "¿cómo vamos?" para la pestaña Resultados.

Se agrega al reporte de una publicación (GET /formularios-custom/{id}/reporte)
y trabaja sobre lo que ese reporte ya calculó (kpis, por_sucursal,
por_promocion, matriz) más las fechas de tareas, respuestas y tickets:

- resumen:     semáforo (bien / atención / riesgo), una frase y el avance
               Contestadas → Revisadas → Validadas contra el plazo.
- comparacion: los mismos números de la publicación del mes anterior.
- rankings:    tiendas y categorías de mejor a peor, y las promociones peor
               rotuladas.
- calidad:     tipos de inconsistencia, tickets, tiempos promedio y a tiempo
               vs. tarde.

Funciona con publicaciones con tareas (tienda × categoría) y con las del
flujo viejo (una respuesta por persona); lo que no aplica sale en None.
Fechas: created_at / enviada_at / validada_at son UTC (now_iso) y se restan
entre sí; los plazos (vence_*) están en hora de Honduras y se comparan con
now_local().
"""
from collections import Counter
from datetime import datetime, timezone
from typing import Callable, Optional

from core import db, now_local
import promo_plazos

_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
          'septiembre', 'octubre', 'noviembre', 'diciembre']


def _utc(s) -> Optional[datetime]:
    if not s:
        return None
    try:
        d = datetime.fromisoformat(str(s).replace('Z', '+00:00'))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _horas(desde, hasta) -> Optional[float]:
    a, b = _utc(desde), _utc(hasta)
    if not a or not b or b < a:
        return None
    return (b - a).total_seconds() / 3600


def _prom(valores) -> Optional[float]:
    v = [x for x in valores if x is not None]
    return round(sum(v) / len(v), 1) if v else None


def _pct(a, b) -> Optional[int]:
    return round(a / b * 100) if b else None


def periodo_label(periodo: str) -> str:
    try:
        y, m = periodo.split('-')
        return f'{_MESES[int(m) - 1].capitalize()} {y}'
    except Exception:
        return periodo or ''


def periodo_anterior(periodo: str) -> Optional[str]:
    try:
        y, m = map(int, periodo.split('-'))
    except Exception:
        return None
    y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return f'{y}-{m:02d}'


# --------------------------------------------------------------------------- #
#  Métricas base (se usan para esta publicación y para la del mes anterior)
# --------------------------------------------------------------------------- #
async def _metricas(form: dict, reporte: dict) -> dict:
    kpis = reporte['kpis']
    if reporte.get('flujo_tareas'):
        tareas = await db.promo_tareas.find({'form_id': form['id'], 'estado': {'$ne': 'cancelada'}}, {'_id': 0}).to_list(500)
        total = len(tareas)
        contestadas = [t for t in tareas if t.get('enviada_at') and t['estado'] != 'pendiente']
        revisadas = [t for t in tareas if t['estado'] in ('con_observaciones', 'validada')]
        validadas = [t for t in tareas if t['estado'] == 'validada']
        h_resp = [_horas(t.get('created_at'), t.get('enviada_at')) for t in contestadas]
        h_rev = [_horas(t.get('enviada_at'), (t.get('validada_at') or (t.get('revision') or {}).get('actualizada_at')))
                 for t in revisadas]
        tarde = sum(1 for t in tareas if t.get('tarde'))
        return {
            'flujo_tareas': True, 'tareas': tareas,
            'total': total, 'contestadas': len(contestadas), 'revisadas': len(revisadas), 'validadas': len(validadas),
            'avance_pct': _pct(len(contestadas), total), 'validadas_pct': _pct(len(validadas), total),
            'cumplimiento': kpis.get('cumplimiento_general'),
            'horas_respuesta': _prom(h_resp), 'horas_revision': _prom(h_rev),
            'a_tiempo': len(contestadas) - tarde if contestadas else 0, 'tarde': tarde,
            'vencidas': kpis.get('vencidas') or 0, 'con_observaciones': kpis.get('con_observaciones') or 0,
        }
    # flujo viejo: la unidad es la persona asignada
    respuestas = await db.custom_form_responses.find({'form_id': form['id']}, {'_id': 0, 'created_at': 1}).to_list(2000)
    h_resp = [_horas(form.get('created_at'), r.get('created_at')) for r in respuestas]
    total, contestadas = kpis.get('asignados') or 0, kpis.get('respondieron') or 0
    return {
        'flujo_tareas': False, 'tareas': [],
        'total': total, 'contestadas': contestadas, 'revisadas': None, 'validadas': None,
        'avance_pct': _pct(contestadas, total), 'validadas_pct': None,
        'cumplimiento': kpis.get('cumplimiento_general'),
        'horas_respuesta': _prom(h_resp), 'horas_revision': None,
        'a_tiempo': None, 'tarde': None, 'vencidas': 0, 'con_observaciones': 0,
    }


# --------------------------------------------------------------------------- #
#  Bloques
# --------------------------------------------------------------------------- #
def _resumen(m: dict, reporte: dict) -> dict:
    ahora = now_local().replace(tzinfo=None)
    # plazo: el vencimiento más próximo de lo que falta contestar
    pend = [promo_plazos.parse(t.get('vence_respuesta')) for t in m['tareas'] if t['estado'] == 'pendiente']
    pend = [p for p in pend if p]
    vence = min(pend) if pend else None
    dias = round((vence - ahora).total_seconds() / 86400, 1) if vence else None

    c, avance = m['cumplimiento'], m['avance_pct']
    atencion = []
    if m['vencidas']:
        vencidas = [f"{x['tienda']} · {x['categoria']}" for x in reporte.get('matriz', []) if x.get('vencida')]
        atencion.append(f"{m['vencidas']} vencida{'s' if m['vencidas'] != 1 else ''} ({', '.join(vencidas[:3])})")
    if m['con_observaciones']:
        atencion.append(f"{m['con_observaciones']} con observaciones")
    if c is not None and c < 90:
        atencion.append(f'cumplimiento de {c}%')
    faltan = m['total'] - m['contestadas']
    if dias is not None and 0 <= dias <= 1 and faltan > 0:
        atencion.append(f"faltan {faltan} por contestar y vence en menos de un día")
    # ¿vamos atrasados? más del plazo transcurrido que de avance
    inicio_plazo = _utc(reporte.get('_publicada_at'))
    if vence and inicio_plazo and faltan > 0:
        publicada_local = inicio_plazo.astimezone(timezone.utc).replace(tzinfo=None) + (now_local() - datetime.utcnow())
        total_plazo = (vence - publicada_local).total_seconds()
        if total_plazo > 0:
            transcurrido = min(1.0, max(0.0, (ahora - publicada_local).total_seconds() / total_plazo))
            if transcurrido - (avance or 0) / 100 > 0.25:
                atencion.append(f'vamos atrasados: pasó el {round(transcurrido * 100)}% del plazo y va {avance or 0}% contestado')

    completo = m['total'] > 0 and faltan <= 0
    if m['vencidas'] or (c is not None and c < 75):
        estado = 'riesgo'
    elif atencion:
        estado = 'atencion'
    elif completo:
        estado = 'bien'
    else:
        estado = 'en_curso'   # falta contestar, pero sin alertas

    unidad = 'categorías' if m['flujo_tareas'] else 'personas'
    if m['contestadas'] == 0:
        frase = f"Aún no hay respuestas: 0 de {m['total']} {unidad}."
    else:
        partes = [f"{m['contestadas']} de {m['total']} {unidad} contestadas ({avance}%)"]
        if m['validadas'] is not None:
            partes.append(f"{m['validadas']} validadas")
        if c is not None:
            partes.append(f'cumplimiento {c}%')
        inicio = {'bien': 'Vamos bien', 'en_curso': 'En curso', 'atencion': 'Hay que poner atención',
                  'riesgo': 'Vamos en riesgo'}[estado]
        frase = f"{inicio}: {', '.join(partes)}."
    if atencion:
        frase += ' Atención: ' + '; '.join(atencion) + '.'

    return {
        'estado': estado, 'frase': frase,
        'avance': {'total': m['total'], 'contestadas': m['contestadas'], 'revisadas': m['revisadas'],
                   'validadas': m['validadas']},
        'plazo': {'vence': promo_plazos.iso(vence) if vence else None, 'dias_restantes': dias},
    }


def _rankings(m: dict, reporte: dict) -> dict:
    tiendas = [{'nombre': s['sucursal'], 'cumplimiento': s.get('cumplimiento'),
                'avance_pct': _pct(s.get('respondieron') or 0, s.get('asignados') or 0)}
               for s in reporte.get('por_sucursal', [])]
    # categorías: cumplimiento de sus promociones + avance de sus tareas
    por_cat = {}
    for p in reporte.get('por_promocion', []):
        c = por_cat.setdefault(p['categoria'], {'nombre': p['categoria'], 'si': 0, 'no': 0, 'total': 0, 'contestadas': 0})
        c['si'] += p['visibles']; c['no'] += p['no_visibles']
    for t in m['tareas']:
        c = por_cat.setdefault(t['categoria'], {'nombre': t['categoria'], 'si': 0, 'no': 0, 'total': 0, 'contestadas': 0})
        c['total'] += 1
        c['contestadas'] += 1 if t['estado'] != 'pendiente' else 0
    categorias = [{'nombre': c['nombre'], 'cumplimiento': _pct(c['si'], c['si'] + c['no']),
                   'avance_pct': _pct(c['contestadas'], c['total']) if m['flujo_tareas'] else None}
                  for c in por_cat.values()]
    orden = lambda x: (x['cumplimiento'] is None, -(x['cumplimiento'] or 0), -(x['avance_pct'] or 0))  # noqa: E731
    peores = sorted((p for p in reporte.get('por_promocion', []) if p.get('cumplimiento') is not None and p['no_visibles'] > 0),
                    key=lambda p: (p['cumplimiento'], -p['no_visibles']))[:5]
    return {
        'tiendas': sorted(tiendas, key=orden),
        'categorias': sorted(categorias, key=orden),
        'peores_promociones': [{'titulo': p['titulo'], 'categoria': p['categoria'], 'cumplimiento': p['cumplimiento'],
                                'no_visibles': p['no_visibles'], 'etiqueta': p.get('etiqueta'),
                                'estrategia': p.get('estrategia')} for p in peores],
    }


async def _calidad(form: dict, m: dict) -> dict:
    tipos = Counter()
    for t in m['tareas']:
        for ln in ((t.get('revision') or {}).get('lineas') or {}).values():
            if ln.get('v') == 'mal':
                tipos[ln.get('tipo') or 'Otro'] += 1
    tickets = await db.tickets.find({'origen.form_id': form['id']},
                                    {'_id': 0, 'estado': 1, 'created_at': 1, 'cerrado_at': 1, 'reaperturas': 1}).to_list(500)
    est = Counter(t.get('estado') for t in tickets)
    return {
        'inconsistencias': [{'tipo': k, 'n': v} for k, v in tipos.most_common()],
        'tickets': {
            'total': len(tickets), 'abiertos': est.get('abierto', 0), 'corregidos': est.get('corregido', 0),
            'cerrados': est.get('cerrado', 0),
            'horas_cierre': _prom(_horas(t.get('created_at'), t.get('cerrado_at')) for t in tickets if t.get('cerrado_at')),
            'reaperturas': sum(int(t.get('reaperturas') or 0) for t in tickets),
        } if m['flujo_tareas'] else None,
        'tiempos': {'horas_respuesta': m['horas_respuesta'], 'horas_revision': m['horas_revision']},
        'a_tiempo': m['a_tiempo'], 'tarde': m['tarde'],
    }


async def _comparacion(form: dict, m: dict, construir_reporte: Callable) -> Optional[dict]:
    """La publicación del mes anterior de la misma serie (la más reciente si
    hubo varias)."""
    prev = periodo_anterior(form.get('periodo') or '')
    if not prev:
        return None
    q = {'kind': 'promociones', 'periodo': prev, 'status': {'$ne': 'borrador'}}
    if form.get('serie_key'):
        q['serie_key'] = form['serie_key']
    anterior = await db.custom_forms.find(q, {'_id': 0}).sort('created_at', -1).to_list(1)
    if not anterior:
        return None
    a = anterior[0]
    ma = await _metricas(a, await construir_reporte(a))
    campos = ('cumplimiento', 'avance_pct', 'validadas_pct', 'horas_respuesta', 'horas_revision')
    return {
        'periodo': prev, 'periodo_label': periodo_label(prev), 'titulo': a.get('titulo'),
        'actual': {k: m[k] for k in campos}, 'anterior': {k: ma[k] for k in campos},
    }


async def analisis(form: dict, reporte: dict, construir_reporte: Callable) -> dict:
    m = await _metricas(form, reporte)
    return {
        'resumen': _resumen(m, {**reporte, '_publicada_at': form.get('created_at')}),
        'comparacion': await _comparacion(form, m, construir_reporte),
        'rankings': _rankings(m, reporte),
        'calidad': await _calidad(form, m),
    }
