"""Repetición de actividades con RRULE (RFC 5545).

Una actividad que se repite es UN solo documento con su regla en `rrule`
(ej. "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=3;UNTIL=20261231T235959"). DTSTART es
`date` + `start_time` y no se guarda en la regla. Las repeticiones se generan al
consultar (calendario, dashboard, recordatorios); no se crea un registro por
repetición.

Todas las horas son de pared en Honduras (UTC-6, sin horario de verano), igual
que el resto de la agenda, así que se trabaja con datetimes sin zona.
"""
from datetime import datetime, timedelta, date as date_cls
from dateutil.rrule import rrulestr

FRECUENCIAS = {'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'}
CLAVES = {'FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYSETPOS', 'BYMONTH', 'COUNT', 'UNTIL', 'WKST'}
MAX_INTERVALO = 99
MAX_VECES = 500
# Cuántas repeticiones se revisan para el choque "se repetiría antes de terminar".
MUESTRA_CHOQUE = 200


class ReglaInvalida(ValueError):
    pass


def _partes(regla: str) -> dict:
    partes = {}
    for trozo in regla.strip().upper().split(';'):
        if not trozo:
            continue
        clave, _, valor = trozo.partition('=')
        if clave not in CLAVES or not valor:
            raise ReglaInvalida(f'Repetición inválida ({clave})')
        partes[clave] = valor
    return partes


def normalizar(regla: str) -> str:
    """Valida la regla y la devuelve limpia (sin DTSTART, UNTIL sin zona)."""
    if not regla or not regla.strip():
        raise ReglaInvalida('Repetición vacía')
    regla = regla.strip()
    if regla.upper().startswith('RRULE:'):
        regla = regla[6:]
    partes = _partes(regla)
    if partes.get('FREQ') not in FRECUENCIAS:
        raise ReglaInvalida('Repetición inválida')
    try:
        if not 1 <= int(partes.get('INTERVAL', '1')) <= MAX_INTERVALO:
            raise ReglaInvalida(f'Se puede repetir cada 1 a {MAX_INTERVALO}')
        if 'COUNT' in partes and not 1 <= int(partes['COUNT']) <= MAX_VECES:
            raise ReglaInvalida(f'Se puede repetir de 1 a {MAX_VECES} veces')
    except ValueError as e:
        if isinstance(e, ReglaInvalida):
            raise
        raise ReglaInvalida('Repetición inválida')
    if 'COUNT' in partes and 'UNTIL' in partes:
        raise ReglaInvalida('Elegí una sola forma de terminar la repetición')
    if 'UNTIL' in partes:
        # Hora local de pared: "20261231" o "20261231T235959Z" -> "20261231T235959"
        u = partes['UNTIL'].rstrip('Z')
        partes['UNTIL'] = u if 'T' in u else f'{u}T235959'
    orden = ['FREQ', 'INTERVAL', 'BYMONTH', 'BYMONTHDAY', 'BYDAY', 'BYSETPOS', 'WKST', 'COUNT', 'UNTIL']
    limpia = ';'.join(f'{k}={partes[k]}' for k in orden if k in partes)
    try:
        rrulestr(limpia, dtstart=datetime(2026, 1, 1, 9, 0))
    except Exception:
        raise ReglaInvalida('Repetición inválida')
    return limpia


def _inicio(date: str, start_time: str) -> datetime:
    return datetime.strptime(f'{date} {start_time}', '%Y-%m-%d %H:%M')


def regla(rule: str, date: str, start_time: str):
    return rrulestr(rule, dtstart=_inicio(date, start_time))


def es_infinita(rule: str) -> bool:
    p = _partes(rule)
    return 'COUNT' not in p and 'UNTIL' not in p


def primera(rule: str, date: str, start_time: str):
    """Primera repetición (YYYY-MM-DD) o None si la regla no genera ninguna.
    Si la fecha elegida no cumple la regla (ej. miércoles con "cada lunes"), la
    serie empieza en la primera fecha que sí la cumple."""
    rr = regla(rule, date, start_time)
    d = rr.after(_inicio(date, start_time), inc=True)
    return d.date().isoformat() if d else None


def serie_hasta(rule: str, date: str, start_time: str, span_days: int):
    """Último día (YYYY-MM-DD) que ocupa la serie, o None si no termina."""
    if es_infinita(rule):
        return None
    rr = regla(rule, date, start_time)
    ultima = None
    for ultima in rr:  # finita y acotada por MAX_VECES / UNTIL
        pass
    if not ultima:
        return date
    return (ultima.date() + timedelta(days=span_days)).isoformat()


def fechas(rule: str, date: str, start_time: str, desde: date_cls, hasta: date_cls, limite: int = 1000) -> list:
    """Fechas de inicio (date) de las repeticiones que empiezan entre desde y hasta."""
    rr = regla(rule, date, start_time)
    a = datetime.combine(desde, datetime.min.time())
    b = datetime.combine(hasta, datetime.max.time())
    out = []
    for d in rr.xafter(a, inc=True):
        if d > b or len(out) >= limite:
            break
        out.append(d.date())
    return out


def choca_consigo(rule: str, date: str, start_time: str, end_time: str, span_days: int) -> bool:
    """¿Alguna repetición empieza antes de que termine la anterior?"""
    if span_days == 0:
        return False
    rr = regla(rule, date, start_time)
    previa = None
    for i, d in enumerate(rr):
        if i >= MUESTRA_CHOQUE:
            break
        if previa is not None:
            fin = datetime.strptime(f'{previa.date() + timedelta(days=span_days)} {end_time}', '%Y-%m-%d %H:%M')
            if d < fin:
                return True
        previa = d
    return False


def ocurrencias(activity: dict, desde: str, hasta: str) -> list:
    """Repeticiones de una actividad con `rrule` que tocan [desde, hasta]
    (YYYY-MM-DD). Cada una es una copia del documento con sus propias fechas;
    `id` sigue siendo el de la serie y `serie_date`/`serie_end_date` guardan el
    rango de la primera repetición (para editar la serie)."""
    d0 = datetime.strptime(activity['date'], '%Y-%m-%d').date()
    d1 = datetime.strptime(activity.get('end_date') or activity['date'], '%Y-%m-%d').date()
    span = d1 - d0
    a = datetime.strptime(desde, '%Y-%m-%d').date()
    b = datetime.strptime(hasta, '%Y-%m-%d').date()
    out = []
    for f in fechas(activity['rrule'], activity['date'], activity['start_time'], a - span, b):
        fin = f + span
        occ = dict(activity)
        occ.update({
            'date': f.isoformat(), 'end_date': fin.isoformat(),
            'fecha_hora_inicio': f'{f.isoformat()}T{activity["start_time"]}:00-06:00',
            'fecha_hora_fin': f'{fin.isoformat()}T{activity["end_time"]}:00-06:00',
            'serie_date': activity['date'], 'serie_end_date': activity.get('end_date') or activity['date'],
        })
        out.append(occ)
    return out


def filtro_rango(start: str, end: str) -> dict:
    """Condición Mongo: actividad (suelta o serie) que toca [start, end]."""
    return {'date': {'$lte': end}, '$or': [
        {'rrule': {'$exists': False}, 'end_date': {'$gte': start}},
        {'rrule': {'$exists': False}, 'end_date': {'$exists': False}, 'date': {'$gte': start}},
        {'rrule': {'$exists': True}, 'serie_hasta': None},
        {'rrule': {'$exists': True}, 'serie_hasta': {'$gte': start}},
    ]}


def expandir(docs: list, start: str, end: str) -> list:
    """Reemplaza cada serie por sus repeticiones dentro de [start, end]."""
    out = []
    for a in docs:
        if a.get('rrule'):
            out.extend(ocurrencias(a, start, end))
        else:
            a.setdefault('end_date', a.get('date'))
            out.append(a)
    return out
