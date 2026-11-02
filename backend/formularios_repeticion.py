"""Cuándo se repite un formulario (pestaña Asignaciones). Solo fechas, sin base
de datos: los periodos son los del motor de mantenimiento (mantenimiento_motor.py).

Una repetición abre el primer día de su periodo a la hora `abre` y vence
`vence_dias` después a la hora `vence_hora`. Todo es hora de la empresa en texto
'AAAA-MM-DDTHH:MM', como el resto de la app, para compararlo directo.
"""
import re
from datetime import date, datetime, timedelta
from typing import Optional

import mantenimiento_motor as motor

UNA = 'una'
FMT = motor.FMT
FINES = ('nunca', 'fecha', 'ciclos')
RE_HORA = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
# el periodo más corto de cada frecuencia, en días: la hora límite tiene que caber
DIAS_MINIMOS = {'diaria': 1, 'semanal': 7, 'quincenal': 14, 'mensual': 28, 'bimestral': 59, 'trimestral': 89, 'semestral': 181, 'anual': 365}


def _entero(v, minimo: int, maximo: int, defecto: int) -> int:
    try:
        return min(maximo, max(minimo, int(v)))
    except (TypeError, ValueError):
        return defecto


def _dia(v) -> Optional[str]:
    try:
        return date.fromisoformat(str(v or '')[:10]).isoformat()
    except ValueError:
        return None


def limpiar(r, hoy: date) -> dict:
    r = r if isinstance(r, dict) else {}
    frecuencia = r.get('frecuencia')
    if frecuencia not in motor.FRECUENCIAS:
        return {'frecuencia': UNA}
    fin = r.get('fin_tipo') if r.get('fin_tipo') in FINES else 'nunca'
    hora = lambda v, defecto: v if isinstance(v, str) and RE_HORA.match(v) else defecto  # noqa: E731
    return {
        'frecuencia': frecuencia, 'intervalo_dias': _entero(r.get('intervalo_dias'), 1, 365, 1) if frecuencia == 'cada_n_dias' else None,
        'inicio': _dia(r.get('inicio')) or hoy.isoformat(), 'abre': hora(r.get('abre'), '07:00'),
        'vence_dias': _entero(r.get('vence_dias'), 0, 365, 0), 'vence_hora': hora(r.get('vence_hora'), '17:00'), 'fin_tipo': fin,
        'fin_valor': _dia(r.get('fin_valor')) if fin == 'fecha' else (_entero(r.get('fin_valor'), 1, 9999, 1) if fin == 'ciclos' else None),
    }


def _minutos(hora: str) -> int:
    return int(hora[:2]) * 60 + int(hora[3:5])


def error(rep: dict) -> Optional[str]:
    """Por qué no se puede guardar esta repetición."""
    if rep['frecuencia'] == UNA:
        return None
    dura = rep['vence_dias'] * 1440 + _minutos(rep['vence_hora']) - _minutos(rep['abre'])
    if dura <= 0:
        return 'La hora límite tiene que ser después de la hora de abrir'
    if dura > (rep['intervalo_dias'] or DIAS_MINIMOS.get(rep['frecuencia'], 1)) * 1440:
        return 'La hora límite cae después de que abre la siguiente repetición'
    if rep['fin_tipo'] == 'fecha' and (not rep['fin_valor'] or rep['fin_valor'] < rep['inicio']):
        return 'La fecha final tiene que ser después del inicio'
    return None


def _inicio(rep: dict) -> date:
    return date.fromisoformat(rep['inicio'])


def _limites(rep: dict, n: int) -> dict:
    dia = motor.inicio_ciclo(_inicio(rep), rep['frecuencia'], rep['intervalo_dias'], n)
    return {'n': n, 'abre': f'{dia.isoformat()}T{rep["abre"]}', 'vence': f'{(dia + timedelta(days=rep["vence_dias"])).isoformat()}T{rep["vence_hora"]}'}


def _ultimo(rep: dict) -> Optional[int]:
    return motor.ultimo_ciclo(_inicio(rep), rep['frecuencia'], rep['intervalo_dias'], rep['fin_tipo'], rep['fin_valor'])


def vigente(rep: dict, ahora: datetime) -> Optional[dict]:
    """La última repetición que ya abrió ({n, abre, vence}); None si todavía no
    abre ninguna o ya se acabaron. Lo que se perdió con el servidor apagado no
    se rellena: siempre es la de hoy."""
    n = motor.ciclo_de_fecha(_inicio(rep), rep['frecuencia'], rep['intervalo_dias'], ahora.date())
    if n >= 1 and _limites(rep, n)['abre'] > ahora.strftime(FMT):
        n -= 1
    ultimo = _ultimo(rep)
    if n < 1 or (ultimo is not None and n > ultimo):
        return None
    return _limites(rep, n)


def proximas(rep: dict, ahora: datetime, cuantas: int = 3) -> list:
    """Las siguientes que van a abrir, para mostrarlas antes de guardar."""
    n = max(1, motor.ciclo_de_fecha(_inicio(rep), rep['frecuencia'], rep['intervalo_dias'], ahora.date()))
    ultimo = _ultimo(rep)
    texto = ahora.strftime(FMT)
    out = []
    while len(out) < cuantas and (ultimo is None or n <= ultimo):
        lim = _limites(rep, n)
        if lim['abre'] > texto:
            out.append({'abre': lim['abre'], 'vence': lim['vence']})
        n += 1
    return out
