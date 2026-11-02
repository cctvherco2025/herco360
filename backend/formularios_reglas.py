"""Etapa 2 del constructor de formularios: diseño, navegación, condiciones y
seguimientos. Todo es parte del contenido (se edita en el borrador y entra en
vigor al publicar), y aquí está la lógica que comparten el borrador, publicar
y responder. La pantalla tiene la misma lógica en lib/formularios.js.

Condiciones (solo mostrar u ocultar): una pregunta, una sección o un paso
llevan `condicion = {union: 'y'|'o', reglas: [{pregunta_id, op, valor}]}` y se
muestran solo si se cumple. Una regla solo mira preguntas anteriores. Lo que
queda oculto no se exige ni se guarda, y para las reglas que siguen cuenta
como vacío.

Seguimientos: una pregunta lleva `seguimiento` = {valores: [id de opción]} o
{op: mayor|menor|igual, valor}; si al enviar la respuesta lo cumple, se abre
un seguimiento (tickets.py) con todas las que lo cumplieron, asignado a quien
llenó y revisado por quien diga `contenido.seguimientos`.

Campos calculados: `config = {operacion, preguntas, formato, simbolo}`. Miran
preguntas anteriores, igual que las condiciones, y su valor lo saca siempre el
servidor al enviar; la pantalla solo lo muestra.
"""
import math
import re
from typing import Optional

COLOR = re.compile(r'^#[0-9a-fA-F]{6}$')
ESTILOS = ('paso', 'una', 'pagina', 'checklist')
ESTILOS_PASO = ('igual', 'paso', 'una', 'checklist')
PROGRESOS = ('barra', 'pasos', 'porcentaje', 'nada')
FUENTES = ('herco', 'inter', 'poppins', 'serif')
PLAZOS = (24, 48, 72, 168)
REVISA = ('creador', 'jefe', 'persona')

DISENO_BASE = {
    'principal': '#1e395e', 'acento': '#00a5df', 'fondo': '#f4f6fa', 'fondo_imagen_id': None, 'fuente': 'herco',
    'tam': 'normal', 'esquinas': 'suaves', 'sombras': 'suave', 'espaciado': 'normal', 'alineacion': 'izquierda',
    'columnas': 1, 'tarjetas': True, 'logo': 'herco', 'logo_imagen_id': None, 'portada_imagen_id': None,
    'bienvenida': {'activa': False, 'titulo': '', 'texto': '', 'boton': 'Empezar'},
    'final': {'mensaje': '¡Gracias! Tu respuesta quedó registrada', 'puntaje': True},
}
NAVEGACION_BASE = {'estilo': 'paso', 'progreso': 'barra', 'siguiente': 'Siguiente', 'anterior': 'Anterior',
                   'enviar': 'Enviar', 'volver': True, 'resumen': False}
SEGUIMIENTOS_BASE = {'revisa': 'creador', 'persona_id': None, 'plazo_horas': 48}

# operadores por familia de pregunta
FAMILIA = {
    'unica': 'opcion', 'lista': 'opcion', 'sino': 'opcion', 'cumple': 'opcion', 'multiple': 'multiple',
    'numero': 'numero', 'escala': 'numero', 'estrellas': 'numero', 'moneda': 'numero', 'porcentaje': 'numero', 'calculado': 'numero',
    'corto': 'texto', 'largo': 'texto', 'correo': 'texto', 'telefono': 'texto', 'articulo': 'texto',
    'fecha': 'fecha', 'hora': 'fecha', 'fechahora': 'fecha',
    'colaborador': 'eleccion', 'sucursal': 'eleccion', 'caja': 'eleccion',
    'foto': 'archivos', 'camara': 'archivos', 'archivo': 'archivos', 'firma': 'archivos',
    'direccion': 'contenido', 'ubicacion': 'contenido', 'matriz': 'contenido', 'tabla': 'contenido', 'repetible': 'contenido',
}
OPERADORES = {
    'opcion': ('igual', 'diferente', 'vacia', 'no_vacia'),
    'multiple': ('contiene', 'no_contiene', 'vacia', 'no_vacia'),
    'numero': ('igual', 'diferente', 'mayor', 'menor', 'vacia', 'no_vacia'),
    'texto': ('igual', 'diferente', 'contiene', 'no_contiene', 'vacia', 'no_vacia'),
    'fecha': ('igual', 'diferente', 'mayor', 'menor', 'vacia', 'no_vacia'),
    'eleccion': ('igual', 'diferente', 'vacia', 'no_vacia'),
    'archivos': ('vacia', 'no_vacia'),
    'contenido': ('vacia', 'no_vacia'),
}
TODOS_OPS = {op for ops in OPERADORES.values() for op in ops}
SIN_VALOR = {'vacia', 'no_vacia'}
NOMBRE_OP = {'igual': 'es', 'diferente': 'no es', 'mayor': 'es mayor que', 'menor': 'es menor que', 'contiene': 'contiene',
             'no_contiene': 'no contiene', 'vacia': 'está vacía', 'no_vacia': 'no está vacía'}
SEGUIMIENTO_OPCIONES = {'unica', 'lista', 'sino', 'cumple', 'multiple'}
SEGUIMIENTO_NUMERO = {'numero', 'escala', 'estrellas', 'moneda', 'porcentaje', 'calculado'}
OPERACIONES = ('suma', 'resta', 'multiplicacion', 'division', 'promedio')
FORMATOS = ('numero', 'moneda', 'porcentaje')


def _txt(v, n=200) -> str:
    return ' '.join(str(v or '').split())[:n]


def _num(v) -> Optional[float]:
    if v in (None, ''):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _uno(v, opciones, defecto):
    return v if v in opciones else defecto


def _id(v) -> Optional[str]:
    v = _txt(v, 64)
    return v or None


def limpiar_calculado(cfg) -> dict:
    cfg = cfg if isinstance(cfg, dict) else {}
    ids = [_id(x) for x in (cfg.get('preguntas') or [])[:20] if isinstance(x, str)]
    return {'operacion': _uno(cfg.get('operacion'), OPERACIONES, 'suma'), 'preguntas': list(dict.fromkeys(i for i in ids if i)),
            'formato': _uno(cfg.get('formato'), FORMATOS, 'numero'), 'simbolo': _txt(cfg.get('simbolo'), 5) or 'L'}


def _redondear(x: float) -> float:
    n = math.floor(abs(x) * 100 + 0.5) / 100
    return math.copysign(n, x) if n else 0


def calcular(cfg: dict, efectivos: dict) -> Optional[float]:
    """Lo que esté oculto o sin contestar no cuenta: suma y promedio siguen con
    lo que haya, resta necesita la primera, y multiplicar o dividir, todas."""
    nums = [_num(efectivos.get(i)) for i in cfg.get('preguntas') or []]
    hay = [n for n in nums if n is not None]
    if not hay:
        return None
    op = cfg.get('operacion')
    if op == 'suma':
        r = sum(hay)
    elif op == 'promedio':
        r = sum(hay) / len(hay)
    elif op == 'resta':
        if nums[0] is None:
            return None
        r = nums[0] - sum(hay[1:])
    elif None in nums:
        return None
    elif op == 'multiplicacion':
        r = math.prod(nums)
    else:
        if 0 in nums[1:]:
            return None
        r = nums[0]
        for n in nums[1:]:
            r /= n
    return _redondear(r) if math.isfinite(r) else None


def cifra(n: float) -> str:
    return f'{n:,.2f}'.rstrip('0').rstrip('.')


def dinero(n: float, simbolo: str) -> str:
    return f'{simbolo} {n:,.2f}'


def texto_calculado(cfg: dict, n: Optional[float]) -> str:
    if n is None:
        return ''
    if cfg.get('formato') == 'moneda':
        return dinero(n, cfg.get('simbolo') or 'L')
    return f'{cifra(n)} %' if cfg.get('formato') == 'porcentaje' else cifra(n)


# --------------------------------------------------------------------------- #
#  Limpiar lo que manda la pantalla
# --------------------------------------------------------------------------- #
def limpiar_diseno(d) -> dict:
    d = d if isinstance(d, dict) else {}
    b = DISENO_BASE
    bien, fin = d.get('bienvenida') or {}, d.get('final') or {}
    try:
        columnas = int(d.get('columnas') or 1)
    except (TypeError, ValueError):
        columnas = 1
    return {
        'principal': d.get('principal') if COLOR.match(str(d.get('principal') or '')) else b['principal'],
        'acento': d.get('acento') if COLOR.match(str(d.get('acento') or '')) else b['acento'],
        'fondo': d.get('fondo') if COLOR.match(str(d.get('fondo') or '')) else b['fondo'],
        'fondo_imagen_id': _id(d.get('fondo_imagen_id')),
        'fuente': _uno(d.get('fuente'), FUENTES, 'herco'),
        'tam': _uno(d.get('tam'), ('normal', 'grande'), 'normal'),
        'esquinas': _uno(d.get('esquinas'), ('rectas', 'suaves', 'redondas'), 'suaves'),
        'sombras': _uno(d.get('sombras'), ('no', 'suave'), 'suave'),
        'espaciado': _uno(d.get('espaciado'), ('compacto', 'normal', 'amplio'), 'normal'),
        'alineacion': _uno(d.get('alineacion'), ('izquierda', 'centro'), 'izquierda'),
        'columnas': min(3, max(1, columnas)),
        'tarjetas': bool(d.get('tarjetas', True)),
        'logo': _uno(d.get('logo'), ('herco', 'ninguno', 'imagen'), 'herco'),
        'logo_imagen_id': _id(d.get('logo_imagen_id')),
        'portada_imagen_id': _id(d.get('portada_imagen_id')),
        'bienvenida': {'activa': bool(bien.get('activa')), 'titulo': _txt(bien.get('titulo'), 160),
                       'texto': str(bien.get('texto') or '').strip()[:1000], 'boton': _txt(bien.get('boton'), 40) or 'Empezar'},
        'final': {'mensaje': _txt(fin.get('mensaje'), 200) or b['final']['mensaje'], 'puntaje': bool(fin.get('puntaje', True))},
    }


def limpiar_navegacion(n) -> dict:
    n = n if isinstance(n, dict) else {}
    b = NAVEGACION_BASE
    return {
        'estilo': _uno(n.get('estilo'), ESTILOS, 'paso'),
        'progreso': _uno(n.get('progreso'), PROGRESOS, 'barra'),
        'siguiente': _txt(n.get('siguiente'), 30) or b['siguiente'],
        'anterior': _txt(n.get('anterior'), 30) or b['anterior'],
        'enviar': _txt(n.get('enviar'), 30) or b['enviar'],
        'volver': bool(n.get('volver', True)),
        'resumen': bool(n.get('resumen')),
    }


def limpiar_seguimientos(s) -> dict:
    s = s if isinstance(s, dict) else {}
    try:
        plazo = int(s.get('plazo_horas') or 48)
    except (TypeError, ValueError):
        plazo = 48
    revisa = _uno(s.get('revisa'), REVISA, 'creador')
    return {'revisa': revisa, 'persona_id': _id(s.get('persona_id')) if revisa == 'persona' else None,
            'plazo_horas': plazo if plazo in PLAZOS else 48}


def limpiar_condicion(c) -> Optional[dict]:
    if not isinstance(c, dict):
        return None
    reglas = []
    for r in (c.get('reglas') or [])[:20]:
        if not isinstance(r, dict) or r.get('op') not in TODOS_OPS or not r.get('pregunta_id'):
            continue
        valor = r.get('valor')
        if r['op'] in SIN_VALOR:
            valor = None
        elif isinstance(valor, (int, float)) and not isinstance(valor, bool):
            pass
        else:
            valor = _txt(valor, 200)
        reglas.append({'pregunta_id': _id(r['pregunta_id']), 'op': r['op'], 'valor': valor})
    if not reglas:
        return None
    return {'union': 'o' if c.get('union') == 'o' else 'y', 'reglas': reglas}


def limpiar_seguimiento_item(s, tipo: str, opciones: list) -> Optional[dict]:
    if not isinstance(s, dict):
        return None
    if tipo in SEGUIMIENTO_OPCIONES:
        ids = {o['id'] for o in opciones}
        valores = [v for v in (s.get('valores') or []) if v in ids]
        return {'valores': list(dict.fromkeys(valores))} if valores else None
    if tipo in SEGUIMIENTO_NUMERO:
        valor = _num(s.get('valor'))
        if valor is None:
            return None
        return {'op': _uno(s.get('op'), ('mayor', 'menor', 'igual'), 'mayor'), 'valor': int(valor) if valor.is_integer() else valor}
    return None


def limpiar_apariencia(a, tipo: str, con_opciones: bool) -> dict:
    a = a if isinstance(a, dict) else {}
    out = {'ancho': _uno(a.get('ancho'), ('auto', 'completo', 'mitad', 'tercio'), 'auto')}
    if con_opciones:
        out['opciones'] = _uno(a.get('opciones'), ('lista', 'fila', 'cuadricula'), 'lista')
    return out


# --------------------------------------------------------------------------- #
#  Evaluar condiciones
# --------------------------------------------------------------------------- #
def _vacio(v) -> bool:
    return v is None or v == '' or v == []


def cumple_regla(regla: dict, efectivos: dict, tipos: dict) -> bool:
    """`efectivos`: id de pregunta -> valor guardado (None si está oculta o sin
    contestar; para las de archivos, la cantidad de archivos)."""
    pid, op, valor = regla['pregunta_id'], regla['op'], regla.get('valor')
    v = efectivos.get(pid)
    if op == 'vacia':
        return _vacio(v) or v == 0 and FAMILIA.get(tipos.get(pid)) == 'archivos'
    if op == 'no_vacia':
        return not (_vacio(v) or v == 0 and FAMILIA.get(tipos.get(pid)) == 'archivos')
    if _vacio(v):
        return op in ('diferente', 'no_contiene')
    fam = FAMILIA.get(tipos.get(pid))
    if fam == 'multiple':
        dentro = valor in (v if isinstance(v, list) else [])
        return dentro if op == 'contiene' else (not dentro if op == 'no_contiene' else False)
    if fam == 'numero':
        a, b = _num(v), _num(valor)
        if a is None or b is None:
            return op == 'diferente'
        return {'igual': a == b, 'diferente': a != b, 'mayor': a > b, 'menor': a < b}.get(op, False)
    a, b = str(v).strip(), str(valor if valor is not None else '').strip()
    if fam == 'texto':
        a, b = a.lower(), b.lower()
        if op in ('contiene', 'no_contiene'):
            return (b in a) if op == 'contiene' else (b not in a)
    return {'igual': a == b, 'diferente': a != b, 'mayor': a > b, 'menor': a < b}.get(op, False)


def cumple(cond: Optional[dict], efectivos: dict, tipos: dict) -> bool:
    if not cond or not cond.get('reglas'):
        return True
    res = [cumple_regla(r, efectivos, tipos) for r in cond['reglas']]
    return any(res) if cond.get('union') == 'o' else all(res)


def dispara_seguimiento(it: dict, valor) -> bool:
    s = it.get('seguimiento')
    if not s or _vacio(valor):
        return False
    if 'valores' in s:
        elegidos = valor if isinstance(valor, list) else [valor]
        return any(v in s['valores'] for v in elegidos)
    a, b = _num(valor), _num(s.get('valor'))
    if a is None or b is None:
        return False
    return {'mayor': a > b, 'menor': a < b, 'igual': a == b}.get(s.get('op'), False)


# --------------------------------------------------------------------------- #
#  Revisar antes de publicar
# --------------------------------------------------------------------------- #
def _errores_calculado(it: dict, vistas: dict, tipos_nombre: dict) -> list:
    nombre = it.get('titulo') or tipos_nombre[it['tipo']]
    ids = (it.get('config') or {}).get('preguntas') or []
    if len(ids) < 2:
        return [f'«{nombre}»: elige al menos 2 preguntas para calcular']
    if any(FAMILIA.get((vistas.get(i) or {}).get('tipo')) != 'numero' for i in ids):
        return [f'«{nombre}»: usa una pregunta que no existe, que va después o que no es un número']
    return []


def errores_reglas(contenido: dict, tipos_nombre: dict) -> list:
    """Reglas que miran preguntas que no existen, que van después o que no
    se pueden comparar así."""
    errores = []
    vistas = {}  # preguntas que ya pasaron (para "solo anteriores")

    def revisar(cond, donde):
        for r in (cond or {}).get('reglas') or []:
            p = vistas.get(r['pregunta_id'])
            if not p:
                errores.append(f'{donde}: su condición mira una pregunta que no existe o que va después')
                continue
            fam = FAMILIA.get(p['tipo'])
            if r['op'] not in OPERADORES.get(fam, ()):
                errores.append(f'{donde}: «{NOMBRE_OP.get(r["op"], r["op"])}» no sirve para «{p["titulo"] or tipos_nombre[p["tipo"]]}»')
            elif r['op'] not in SIN_VALOR and _vacio(r.get('valor')):
                errores.append(f'{donde}: a su condición le falta el valor')
            elif fam in ('opcion', 'multiple') and r['op'] not in SIN_VALOR and r.get('valor') not in {o['id'] for o in p.get('opciones') or []}:
                errores.append(f'{donde}: su condición usa una opción que ya no existe en «{p["titulo"]}»')

    for p in contenido.get('pasos') or []:
        revisar(p.get('condicion'), f'El paso «{p.get("nombre") or "sin nombre"}»')
        for s in p.get('secciones') or []:
            revisar(s.get('condicion'), f'La sección «{s.get("nombre") or "sin nombre"}»')
            for it in s.get('items') or []:
                revisar(it.get('condicion'), f'«{it.get("titulo") or tipos_nombre[it["tipo"]]}»')
                if it['tipo'] == 'calculado':
                    errores += _errores_calculado(it, vistas, tipos_nombre)
                if it['tipo'] in FAMILIA:
                    vistas[it['id']] = it
    return errores


def describir_condicion(cond: Optional[dict], preguntas: dict) -> str:
    if not cond:
        return ''
    partes = []
    for r in cond.get('reglas') or []:
        p = preguntas.get(r['pregunta_id']) or {}
        valor = r.get('valor')
        if p.get('opciones'):
            valor = next((o['label'] for o in p['opciones'] if o['id'] == valor), valor)
        partes.append(f'«{p.get("titulo") or "?"}» {NOMBRE_OP.get(r["op"], r["op"])}' + ('' if r['op'] in SIN_VALOR else f' «{valor}»'))
    return (' y ' if cond.get('union') != 'o' else ' o ').join(partes)
