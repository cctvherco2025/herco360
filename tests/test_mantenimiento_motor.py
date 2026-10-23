"""Pruebas del cálculo de fechas de mantenimiento (backend/mantenimiento_motor.py).

Con pytest: `pytest tests/test_mantenimiento_motor.py`. Sin pytest:
`python tests/test_mantenimiento_motor.py`.
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))
import mantenimiento_motor as m  # noqa: E402


def test_largo_por_frecuencia():
    ini = date(2026, 1, 1)
    assert m.largo_dias(ini, 'diaria', None, 1) == 1
    assert m.largo_dias(ini, 'semanal', None, 1) == 7
    assert m.largo_dias(ini, 'quincenal', None, 3) == 14
    assert m.largo_dias(ini, 'mensual', None, 1) == 31  # enero
    assert m.largo_dias(ini, 'mensual', None, 2) == 28  # febrero 2026
    assert m.largo_dias(ini, 'trimestral', None, 1) == 90  # ene-mar
    assert m.largo_dias(ini, 'semestral', None, 1) == 181
    assert m.largo_dias(ini, 'anual', None, 1) == 365
    assert m.largo_dias(ini, 'cada_n_dias', 10, 4) == 10


def test_mensual_desde_el_31_no_se_corre():
    ini = date(2026, 1, 31)
    assert m.inicio_ciclo(ini, 'mensual', None, 2) == date(2026, 2, 28)
    assert m.inicio_ciclo(ini, 'mensual', None, 3) == date(2026, 3, 31)
    assert m.inicio_ciclo(ini, 'mensual', None, 4) == date(2026, 4, 30)


def test_ciclo_de_fecha():
    ini = date(2026, 1, 31)
    assert m.ciclo_de_fecha(ini, 'mensual', None, date(2026, 1, 30)) == 0
    assert m.ciclo_de_fecha(ini, 'mensual', None, date(2026, 1, 31)) == 1
    assert m.ciclo_de_fecha(ini, 'mensual', None, date(2026, 2, 27)) == 1
    assert m.ciclo_de_fecha(ini, 'mensual', None, date(2026, 2, 28)) == 2
    assert m.ciclo_de_fecha(ini, 'mensual', None, date(2026, 3, 30)) == 2
    assert m.ciclo_de_fecha(ini, 'mensual', None, date(2026, 3, 31)) == 3
    s = date(2026, 10, 1)
    assert m.ciclo_de_fecha(s, 'semanal', None, date(2026, 10, 7)) == 1
    assert m.ciclo_de_fecha(s, 'semanal', None, date(2026, 10, 8)) == 2
    # todo número coincide con su rango
    for f in ('mensual', 'trimestral', 'semanal', 'anual'):
        for d in range(0, 800, 13):
            x = date.fromordinal(ini.toordinal() + d)
            n = m.ciclo_de_fecha(ini, f, None, x)
            a, b = m.rango_ciclo(ini, f, None, n)
            assert a <= x < b, (f, x, n, a, b)


def test_dia_fuera_de_rango_cae_el_ultimo_dia():
    ini, fin = m.rango_ciclo(date(2026, 2, 1), 'mensual', None, 1)  # febrero: 28 días
    assert m.fecha_en_ciclo(ini, fin, 31) == date(2026, 2, 28)
    assert m.fecha_en_ciclo(ini, fin, 1) == date(2026, 2, 1)
    ini, fin = m.rango_ciclo(date(2026, 4, 1), 'mensual', None, 1)  # abril: 30
    assert m.fecha_en_ciclo(ini, fin, 31) == date(2026, 4, 30)


def test_tiempos_tarea():
    ini, fin = m.rango_ciclo(date(2026, 10, 5), 'semanal', None, 1)
    fecha, disp, vence = m.tiempos_tarea(ini, fin, {'dia_ciclo': 3, 'hora': '09:30', 'horas_plazo': 48, 'aviso_previo_dias': 1})
    assert fecha == date(2026, 10, 7)
    assert disp == '2026-10-06T09:30'
    assert vence == '2026-10-09T09:30'


def test_reprogramada_fuera_del_ciclo():
    ini, fin = m.rango_ciclo(date(2026, 10, 1), 'mensual', None, 1)
    d = {'dia_ciclo': 1, 'hora': '08:00', 'horas_plazo': 48, 'aviso_previo_dias': 1}
    fecha, disp, vence = m.tiempos_tarea(ini, fin, d, {'fecha': '2026-11-05', 'hora': '14:00'})
    assert fecha == date(2026, 11, 5)
    assert disp == '2026-11-04T14:00'
    assert vence == '2026-11-07T14:00'
    # sin hora en la reprogramación usa la de la definición
    assert m.tiempos_tarea(ini, fin, d, {'fecha': '2026-10-20'})[2] == '2026-10-22T08:00'


def test_dia_del_mes():
    # mensual desde el 1: el 15 de cada mes; 31 = último día (30 en noviembre)
    ini, fin = m.rango_ciclo(date(2026, 11, 1), 'mensual', None, 1)
    assert m.fecha_por_dia_mes(ini, fin, 15) == date(2026, 11, 15)
    assert m.fecha_por_dia_mes(ini, fin, 31) == date(2026, 11, 30)
    ini, fin = m.rango_ciclo(date(2026, 11, 1), 'mensual', None, 4)  # febrero 2027
    assert m.fecha_por_dia_mes(ini, fin, 30) == date(2027, 2, 28)
    # mensual desde el 15: el día 10 cae en el mes siguiente dentro del ciclo
    ini, fin = m.rango_ciclo(date(2026, 11, 15), 'mensual', None, 1)
    assert m.fecha_por_dia_mes(ini, fin, 10) == date(2026, 12, 10)
    # trimestral desde el 1 de enero, día 10: 10 de ene, abr, jul, oct
    fechas = [m.tiempos_tarea(*m.rango_ciclo(date(2027, 1, 1), 'trimestral', None, n), {'dia_mes': 10, 'hora': '08:00'})[0] for n in (1, 2, 3, 4)]
    assert fechas == [date(2027, 1, 10), date(2027, 4, 10), date(2027, 7, 10), date(2027, 10, 10)]


def test_fin_por_ciclos_y_por_fecha():
    ini = date(2026, 1, 1)
    assert m.ultimo_ciclo(ini, 'mensual', None, 'nunca', None) is None
    assert m.ultimo_ciclo(ini, 'mensual', None, 'ciclos', 4) == 4
    # fin el 15 de abril: el ciclo de abril (4) empieza antes y se genera; el de mayo no
    assert m.ultimo_ciclo(ini, 'mensual', None, 'fecha', '2026-04-15') == 4
    assert m.ultimo_ciclo(ini, 'mensual', None, 'fecha', '2026-03-31') == 3


def test_responsable_por_ciclo():
    rs = [{'usuario_id': 'a', 'desde_ciclo': 1}, {'usuario_id': 'b', 'desde_ciclo': 4}]
    assert m.responsable_de_ciclo(rs, 1) == 'a'
    assert m.responsable_de_ciclo(rs, 3) == 'a'
    assert m.responsable_de_ciclo(rs, 4) == 'b'
    assert m.responsable_de_ciclo(rs, 9) == 'b'


def test_recupera_ciclos_tras_dias_sin_correr():
    plan = {'inicio': '2026-10-01', 'frecuencia': 'semanal', 'ciclo_actual': 1, 'fin_tipo': 'nunca'}
    assert m.ciclos_pendientes(plan, date(2026, 10, 1)) == []
    assert m.ciclos_pendientes(plan, date(2026, 10, 22)) == [2, 3, 4]
    # con fin por ciclos no pasa del último
    assert m.ciclos_pendientes({**plan, 'fin_tipo': 'ciclos', 'fin_valor': 3}, date(2026, 12, 1)) == [2, 3]
    # al reanudar se saltan los atrasados
    assert m.ciclos_pendientes({**plan, 'saltar_hasta': 3}, date(2026, 10, 22)) == [4]
    # antes del inicio no hay nada
    assert m.ciclos_pendientes({**plan, 'ciclo_actual': 0, 'inicio': '2026-11-01'}, date(2026, 10, 22)) == []


def test_vista_previa():
    plan = {'inicio': '2026-10-01', 'frecuencia': 'mensual', 'fin_tipo': 'ciclos', 'fin_valor': 2}
    vp = m.vista_previa(plan, [{'id': 'd1', 'dia_ciclo': 31, 'hora': '08:00', 'horas_plazo': 24}])
    assert [c['numero'] for c in vp] == [1, 2]
    assert vp[0]['tareas'][0]['fecha'] == '2026-10-31'
    assert vp[1]['tareas'][0]['fecha'] == '2026-11-30'
    assert vp[1]['fin'] == '2026-11-30'


if __name__ == '__main__':
    pruebas = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    for p in pruebas:
        p()
        print('ok', p.__name__)
    print(f'{len(pruebas)} pruebas pasaron')
