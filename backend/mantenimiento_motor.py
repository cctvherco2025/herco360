"""Cálculo de fechas de las planificaciones de mantenimiento (sin base de datos).

Una planificación se repite en ciclos numerados desde 1. El ciclo n empieza
en `inicio + (n-1) * largo` (los meses se cuentan siempre desde `inicio`, así
un plan mensual del 31 cae el 30 o el 28 y vuelve al 31, sin irse corriendo) y
termina donde empieza el n+1 (fin exclusivo).

Cada tarea de la planificación (definición) cae en un día del ciclo
(`dia_ciclo`, 1 = primer día) a una hora; si el ciclo es más corto (día 31 en
un ciclo de 28 días) cae el último día. Queda disponible `aviso_previo_dias`
antes y vence `horas_plazo` después de esa fecha y hora.

Todas las fechas y horas son de pared en Honduras (sin zona), como el resto
de la app; las fechas-hora se guardan como 'YYYY-MM-DDTHH:MM' para que se
puedan comparar como texto en las consultas.
"""
from datetime import date, datetime, timedelta

from dateutil.relativedelta import relativedelta

FRECUENCIAS = {
    'diaria': ('dias', 1, 'Diaria'),
    'semanal': ('dias', 7, 'Semanal'),
    'quincenal': ('dias', 14, 'Cada 2 semanas'),
    'mensual': ('meses', 1, 'Mensual'),
    'bimestral': ('meses', 2, 'Cada 2 meses'),
    'trimestral': ('meses', 3, 'Trimestral'),
    'semestral': ('meses', 6, 'Semestral'),
    'anual': ('meses', 12, 'Anual'),
    'cada_n_dias': ('dias', None, 'Cada N días'),
}
FMT = '%Y-%m-%dT%H:%M'


def _paso(frecuencia, intervalo_dias=None):
    unidad, n, _ = FRECUENCIAS[frecuencia]
    if n is None:
        n = int(intervalo_dias or 0)
        if n < 1:
            raise ValueError('intervalo_dias debe ser 1 o más')
    return unidad, n


def inicio_ciclo(inicio: date, frecuencia, intervalo_dias, n: int) -> date:
    """Primer día del ciclo n (n ≥ 1)."""
    unidad, paso = _paso(frecuencia, intervalo_dias)
    if unidad == 'dias':
        return inicio + timedelta(days=(n - 1) * paso)
    return inicio + relativedelta(months=(n - 1) * paso)


def rango_ciclo(inicio: date, frecuencia, intervalo_dias, n: int):
    """(inicio, fin) del ciclo n; fin exclusivo."""
    return inicio_ciclo(inicio, frecuencia, intervalo_dias, n), inicio_ciclo(inicio, frecuencia, intervalo_dias, n + 1)


def largo_dias(inicio: date, frecuencia, intervalo_dias, n: int) -> int:
    a, b = rango_ciclo(inicio, frecuencia, intervalo_dias, n)
    return (b - a).days


def ciclo_de_fecha(inicio: date, frecuencia, intervalo_dias, d: date) -> int:
    """Número del ciclo que contiene la fecha d (0 si d es antes del inicio)."""
    if d < inicio:
        return 0
    unidad, paso = _paso(frecuencia, intervalo_dias)
    if unidad == 'dias':
        return (d - inicio).days // paso + 1
    meses = (d.year - inicio.year) * 12 + (d.month - inicio.month)
    n = max(1, meses // paso + 1)
    # ajustar por el día del mes (y los meses cortos)
    while n > 1 and inicio_ciclo(inicio, frecuencia, intervalo_dias, n) > d:
        n -= 1
    while inicio_ciclo(inicio, frecuencia, intervalo_dias, n + 1) <= d:
        n += 1
    return n


def ultimo_ciclo(inicio: date, frecuencia, intervalo_dias, fin_tipo, fin_valor):
    """Último ciclo que se genera, o None si no termina."""
    if fin_tipo == 'ciclos':
        return max(0, int(fin_valor or 0))
    if fin_tipo == 'fecha':
        limite = date.fromisoformat(str(fin_valor))
        return ciclo_de_fecha(inicio, frecuencia, intervalo_dias, limite)
    return None


def fecha_en_ciclo(ini: date, fin: date, dia_ciclo: int) -> date:
    """Fecha del día `dia_ciclo` del ciclo; el último día si el ciclo es más corto."""
    d = ini + timedelta(days=max(1, int(dia_ciclo)) - 1)
    return min(d, fin - timedelta(days=1))


def fecha_por_dia_mes(ini: date, fin: date, dia_mes: int) -> date:
    """Primera fecha del ciclo [ini, fin) que cae el día `dia_mes` de su mes
    (31 = el último día: en un mes más corto cae su último día)."""
    y, m = ini.year, ini.month
    while date(y, m, 1) < fin:
        ultimo = (date(y + (m == 12), m % 12 + 1, 1) - timedelta(days=1)).day
        d = date(y, m, min(int(dia_mes), ultimo))
        if ini <= d < fin:
            return d
        y, m = y + (m == 12), m % 12 + 1
    return fin - timedelta(days=1)


def fecha_de(ini: date, fin: date, defn: dict) -> date:
    """Fecha de una definición en su ciclo: por día del mes (frecuencias de
    meses) o por día del ciclo (1 = primer día)."""
    if defn.get('dia_mes'):
        return fecha_por_dia_mes(ini, fin, defn['dia_mes'])
    return fecha_en_ciclo(ini, fin, defn.get('dia_ciclo') or 1)


def tiempos_en(fecha: date, hora: str, defn: dict):
    """(fecha, disponible_desde, vence_en) para una fecha y hora dadas, con el
    aviso previo y el plazo de la definición."""
    hh, mm = (hora or '08:00').split(':')
    momento = datetime(fecha.year, fecha.month, fecha.day, int(hh), int(mm))
    disponible = momento - timedelta(days=int(defn.get('aviso_previo_dias') or 0))
    vence = momento + timedelta(hours=int(defn.get('horas_plazo') or 24))
    return fecha, disponible.strftime(FMT), vence.strftime(FMT)


def tiempos_tarea(ini: date, fin: date, defn: dict, reprogramada: dict = None):
    """(fecha, disponible_desde, vence_en) de una definición en un ciclo.
    disponible_desde y vence_en en formato 'YYYY-MM-DDTHH:MM'. Si esa
    ocurrencia se reprogramó ({fecha, hora}), usa esa fecha, aunque quede
    fuera del ciclo."""
    if reprogramada:
        return tiempos_en(date.fromisoformat(reprogramada['fecha']), reprogramada.get('hora') or defn.get('hora'), defn)
    return tiempos_en(fecha_de(ini, fin, defn), defn.get('hora'), defn)


def responsable_de_ciclo(responsables: list, n: int):
    """Usuario a cargo en el ciclo n: el último cambio con desde_ciclo ≤ n."""
    vigente = None
    for r in sorted(responsables or [], key=lambda r: r.get('desde_ciclo') or 1):
        if (r.get('desde_ciclo') or 1) <= n:
            vigente = r.get('usuario_id')
    return vigente


def ciclos_pendientes(plan: dict, hoy: date):
    """Números de ciclo que faltan crear hasta hoy (en orden). Respeta el fin
    de la planificación y `saltar_hasta` (ciclos que se saltaron al reanudar)."""
    inicio = date.fromisoformat(plan['inicio'])
    objetivo = ciclo_de_fecha(inicio, plan['frecuencia'], plan.get('intervalo_dias'), hoy)
    ult = ultimo_ciclo(inicio, plan['frecuencia'], plan.get('intervalo_dias'), plan.get('fin_tipo'), plan.get('fin_valor'))
    if ult is not None:
        objetivo = min(objetivo, ult)
    desde = max(int(plan.get('ciclo_actual') or 0), int(plan.get('saltar_hasta') or 0)) + 1
    return list(range(desde, objetivo + 1))


def vista_previa(plan: dict, definiciones: list, ciclos: int = 3, desde: int = 1):
    """Fechas de las tareas de los próximos `ciclos` ciclos (sin guardar nada)."""
    inicio = date.fromisoformat(plan['inicio'])
    ult = ultimo_ciclo(inicio, plan['frecuencia'], plan.get('intervalo_dias'), plan.get('fin_tipo'), plan.get('fin_valor'))
    out = []
    for n in range(desde, desde + ciclos):
        if ult is not None and n > ult:
            break
        ini, fin = rango_ciclo(inicio, plan['frecuencia'], plan.get('intervalo_dias'), n)
        tareas = []
        for d in definiciones:
            fecha, disp, vence = tiempos_tarea(ini, fin, d)
            tareas.append({'definicion_id': d.get('id'), 'fecha': fecha.isoformat(), 'disponible_desde': disp, 'vence_en': vence})
        out.append({'numero': n, 'inicio': ini.isoformat(), 'fin': (fin - timedelta(days=1)).isoformat(), 'tareas': tareas})
    return out
