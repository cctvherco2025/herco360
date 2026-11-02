"""Constructor de formularios (formato 2): borrador, versiones y respuestas.

Amplía Formularios personalizados (routes_formularios_custom.py) sin cambiar
lo de antes: los formularios del formato 2 viven en la misma colección
(db.custom_forms, `esquema: 2`) y sus respuestas también
(db.custom_form_responses), así que el historial, las fotos, el reporte y
eliminar siguen funcionando igual. Promociones del mes no usa este formato.

Un formulario del formato 2 tiene:
  - `borrador`: lo que se edita (se guarda solo, con `rev` para que dos
    personas no se pisen). Su contenido son pasos › secciones › preguntas.
  - `contenido_publicado` y `version`: lo que se contesta. Publicar guarda
    una versión nueva en db.custom_form_versiones (con los cambios respecto a
    la anterior) y cada respuesta queda amarrada a la versión con la que se
    contestó; editar nunca cambia lo ya respondido.
  - `estado`: borrador | publicado | despublicado (despublicado: ya no recibe
    respuestas; lo respondido se conserva). `status` lo repite con los
    valores de antes para el código que ya lo lee.

Las preguntas son genéricas: un `tipo` de TIPOS y sus propiedades. Agregar un
tipo nuevo es agregarlo aquí y en la pantalla (lib/formularios.js).
"""
import copy
import json
import logging
import math
import re
from datetime import datetime
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from core import (db, get_current_user, serialize_doc, new_id, now_iso, can_create_custom_formulario,
                  departamento_de, filtro_usuarios_depto)
from models import SUCURSALES
import routes_formularios_custom as rfc
import formularios_acceso as fa
import formularios_asignaciones as fasig
import formularios_reglas as reglas
import mando
import storage
import tickets

router = APIRouter(prefix='/formularios-v2', tags=['formularios-v2'])
logger = logging.getLogger('formularios_v2')

ESQUEMA = 2
MAX_ITEMS = 300
MAX_PASOS = 50
MAX_FOTO = 8 * 1024 * 1024
MAX_ARCHIVO = 10 * 1024 * 1024
MAX_ARCHIVOS_POR_PREGUNTA = 10
MAX_ARTICULOS = 2000
MAX_MATRIZ = 30
MAX_COLUMNAS = 12
MAX_FILAS = 100

# tipo -> (nombre, grupo). Grupos: texto, opciones, valor, fecha, archivos, estructura, empresa, avanzado
TIPOS = {
    'corto': ('Texto corto', 'texto'), 'largo': ('Texto largo', 'texto'), 'numero': ('Número', 'valor'),
    'correo': ('Correo', 'texto'), 'telefono': ('Teléfono', 'texto'),
    'unica': ('Selección única', 'opciones'), 'multiple': ('Selección múltiple', 'opciones'),
    'lista': ('Lista desplegable', 'opciones'), 'sino': ('Sí / No', 'opciones'),
    'cumple': ('Cumple / No cumple / N/A', 'opciones'), 'escala': ('Escala', 'valor'), 'estrellas': ('Estrellas', 'valor'),
    'fecha': ('Fecha', 'fecha'), 'hora': ('Hora', 'fecha'), 'fechahora': ('Fecha y hora', 'fecha'),
    'foto': ('Fotografía', 'archivos'), 'camara': ('Cámara directa', 'archivos'), 'archivo': ('Archivo adjunto', 'archivos'),
    'firma': ('Firma digital', 'archivos'),
    'encabezado': ('Encabezado', 'estructura'), 'separador': ('Separador', 'estructura'),
    'imagen': ('Imagen informativa', 'estructura'), 'instrucciones': ('Instrucciones', 'estructura'),
    'colaborador': ('Colaborador', 'empresa'), 'sucursal': ('Sucursal', 'empresa'), 'caja': ('Área', 'empresa'),
    'moneda': ('Moneda', 'valor'), 'porcentaje': ('Porcentaje', 'valor'), 'direccion': ('Dirección', 'texto'),
    'ubicacion': ('Ubicación GPS', 'avanzado'), 'articulo': ('Artículo', 'opciones'), 'matriz': ('Matriz de evaluación', 'opciones'),
    'calculado': ('Campo calculado', 'avanzado'), 'tabla': ('Tabla editable', 'avanzado'), 'repetible': ('Grupo repetible', 'avanzado'),
}
CON_OPCIONES = {'unica', 'multiple', 'lista', 'sino', 'cumple'}
PUNTUABLES = CON_OPCIONES | {'escala', 'estrellas', 'matriz'}
SIN_RESPUESTA = {'encabezado', 'separador', 'imagen', 'instrucciones'}
DE_ARCHIVOS = {'foto', 'camara', 'archivo', 'firma'}
EN_FILAS = {'tabla', 'repetible'}
SIN_EVIDENCIA = EN_FILAS | {'calculado'}
SIN_PREDETERMINADO = EN_FILAS | {'calculado', 'matriz', 'ubicacion', 'direccion', 'articulo'}
COLUMNAS = {'tabla': ('texto', 'numero', 'lista', 'fecha'), 'repetible': ('texto', 'largo', 'numero', 'lista', 'fecha', 'foto')}
EVIDENCIAS = ('no', 'opcional', 'obligatoria', 'si_no_cumple')
OPCIONES_FIJAS = {
    'sino': [('Sí', 1, False, False), ('No', 0, False, False)],
    'cumple': [('Cumple', 1, False, False), ('No cumple', 0, False, True), ('No aplica', None, True, False)],
}
RE_CORREO = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
RE_TELEFONO = re.compile(r'^[0-9+()\-\s]{7,20}$')
RE_FILA = re.compile(r'^[\w-]{1,64}$')  # las filas van en el dueño de sus fotos
ESTADOS = ('borrador', 'publicado', 'despublicado')


def _txt(v, n=200) -> str:
    return ' '.join(str(v or '').split())[:n]


def _texto_largo(v, n=2000) -> str:
    return str(v or '').strip()[:n]


# --------------------------------------------------------------------------- #
#  Limpiar el contenido (borrador: flexible; publicar: estricto)
# --------------------------------------------------------------------------- #
def _num(v) -> Optional[float]:
    if v in (None, ''):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n):
        return None
    return int(n) if n.is_integer() else n


def _lineas(v, cuantas: int, largo: int) -> list:
    return list(dict.fromkeys(x for x in (_txt(y, largo) for y in (v if isinstance(v, list) else [])[:cuantas]) if x))


def _config_matriz(cfg: dict) -> dict:
    def lista(clave, con_puntos):
        out = []
        for x in (cfg.get(clave) or [])[:MAX_MATRIZ]:
            label = _txt(x.get('label'), 120) if isinstance(x, dict) else ''
            if label:
                out.append({'id': x.get('id') or new_id(), 'label': label, **({'pts': _num(x.get('pts'))} if con_puntos else {})})
        return out
    return {'filas': lista('filas', False), 'columnas': lista('columnas', True)}


def _config_filas(cfg: dict, tipo: str) -> dict:
    """Tabla y grupo repetible: columnas (o campos) iguales, cada fila con sus valores."""
    columnas = []
    for c in (cfg.get('columnas') or [])[:MAX_COLUMNAS]:
        if not isinstance(c, dict):
            continue
        t = c.get('tipo') if c.get('tipo') in COLUMNAS[tipo] else 'texto'
        col = {'id': c.get('id') or new_id(), 'nombre': _txt(c.get('nombre'), 80), 'tipo': t, 'obligatoria': bool(c.get('obligatoria'))}
        if t == 'lista':
            col['opciones'] = _lineas(c.get('opciones'), 100, 120)
        columnas.append(col)
    out = {'columnas': columnas, 'max_filas': int(min(MAX_FILAS, max(1, _num(cfg.get('max_filas')) or 20)))}
    if tipo == 'repetible':
        out['boton'] = _txt(cfg.get('boton'), 40) or 'Agregar otro'
    return out


def _opciones(it: dict, tipo: str) -> list:
    if tipo in OPCIONES_FIJAS:
        prev = {(o.get('label') or ''): o for o in it.get('opciones') or []}
        out = []
        for label, pts, na, falla in OPCIONES_FIJAS[tipo]:
            o = prev.get(label) or {}
            out.append({'id': o.get('id') or new_id(), 'label': label, 'na': na, 'falla': falla,
                        'pts': None if na else (_num(o.get('pts')) if o.get('pts') not in (None, '') else pts)})
        return out
    out = []
    for o in (it.get('opciones') or [])[:100]:
        label = _txt(o.get('label'), 120)
        if not label:
            continue
        out.append({'id': o.get('id') or new_id(), 'label': label, 'pts': _num(o.get('pts')), 'na': False, 'falla': False,
                    'imagen_id': _txt(o.get('imagen_id'), 64) or None})
    return out


def limpiar_item(it: dict) -> dict:
    tipo = (it.get('tipo') or '').strip()
    if tipo not in TIPOS:
        raise HTTPException(status_code=400, detail=f'Tipo de pregunta desconocido: {tipo}')
    item = {
        'id': it.get('id') or new_id(), 'tipo': tipo,
        'titulo': _txt(it.get('titulo'), 200), 'descripcion': _texto_largo(it.get('descripcion'), 1000),
        'ayuda': _txt(it.get('ayuda'), 200), 'obligatoria': bool(it.get('obligatoria')) and tipo not in SIN_RESPUESTA and tipo != 'calculado',
    }
    if tipo in CON_OPCIONES:
        item['opciones'] = _opciones(it, tipo)
    if tipo in PUNTUABLES:
        item['puntaje'] = bool(it.get('puntaje'))
    if tipo not in SIN_RESPUESTA and tipo not in DE_ARCHIVOS and tipo not in SIN_EVIDENCIA:
        ev = it.get('evidencia') or 'no'
        item['evidencia'] = ev if ev in EVIDENCIAS and (ev != 'si_no_cumple' or tipo == 'cumple') else 'no'
    val = it.get('validacion') or {}
    if tipo in ('corto', 'largo', 'numero', 'moneda', 'porcentaje'):
        item['validacion'] = {'min': _num(val.get('min')), 'max': _num(val.get('max')), 'mensaje': _txt(val.get('mensaje'), 160)}
    cfg = it.get('config') or {}
    if tipo == 'escala':
        item['config'] = {'max': int(min(10, max(3, _num(cfg.get('max')) or 10)))}
    elif tipo == 'estrellas':
        item['config'] = {'max': int(min(10, max(3, _num(cfg.get('max')) or 5)))}
    elif tipo == 'instrucciones':
        item['config'] = {'texto': _texto_largo(cfg.get('texto'), 4000)}
    elif tipo == 'imagen':
        item['config'] = {'imagen_id': _txt(cfg.get('imagen_id'), 64) or None}
    elif tipo in ('foto', 'camara', 'archivo'):
        item['config'] = {'varios': bool(cfg.get('varios'))}
    elif tipo == 'moneda':
        item['config'] = {'simbolo': _txt(cfg.get('simbolo'), 5) or 'L'}
    elif tipo == 'articulo':
        item['config'] = {'lista': _lineas(cfg.get('lista'), MAX_ARTICULOS, 160)}
    elif tipo == 'matriz':
        item['config'] = _config_matriz(cfg)
    elif tipo == 'calculado':
        item['config'] = reglas.limpiar_calculado(cfg)
    elif tipo in EN_FILAS:
        item['config'] = _config_filas(cfg, tipo)
    if tipo not in SIN_RESPUESTA and tipo not in DE_ARCHIVOS and tipo not in SIN_PREDETERMINADO and it.get('predeterminado') not in (None, ''):
        item['predeterminado'] = _txt(it.get('predeterminado'), 200)
    item['condicion'] = reglas.limpiar_condicion(it.get('condicion'))
    if tipo not in SIN_RESPUESTA:
        item['seguimiento'] = reglas.limpiar_seguimiento_item(it.get('seguimiento'), tipo, item.get('opciones') or [])
    item['apariencia'] = reglas.limpiar_apariencia(it.get('apariencia'), tipo, tipo in CON_OPCIONES and tipo != 'lista')
    item['max'] = maximo(item)
    return item


def maximo(item: dict) -> float:
    if not item.get('puntaje'):
        return 0
    if item['tipo'] in ('escala', 'estrellas'):
        return (item.get('config') or {}).get('max') or 0
    if item['tipo'] == 'matriz':
        pts = [c['pts'] for c in item['config']['columnas'] if c.get('pts') is not None]
        return max(pts) * len(item['config']['filas']) if pts else 0
    pts = [o['pts'] for o in item.get('opciones') or [] if not o.get('na') and o.get('pts') is not None]
    if not pts:
        return 0
    return sum(p for p in pts if p > 0) if item['tipo'] == 'multiple' else max(pts)


def limpiar_contenido(contenido: dict) -> dict:
    pasos_in = (contenido or {}).get('pasos') or []
    if len(pasos_in) > MAX_PASOS:
        raise HTTPException(status_code=400, detail=f'Máximo {MAX_PASOS} pasos')
    pasos, total = [], 0
    for p in pasos_in:
        secciones = []
        for s in p.get('secciones') or []:
            items = [limpiar_item(it) for it in (s.get('items') or [])]
            total += len(items)
            secciones.append({'id': s.get('id') or new_id(), 'nombre': _txt(s.get('nombre'), 120), 'items': items,
                              'condicion': reglas.limpiar_condicion(s.get('condicion'))})
        pasos.append({'id': p.get('id') or new_id(), 'nombre': _txt(p.get('nombre'), 120), 'secciones': secciones,
                      'estilo': p.get('estilo') if p.get('estilo') in reglas.ESTILOS_PASO else 'igual',
                      'condicion': reglas.limpiar_condicion(p.get('condicion'))})
    if total > MAX_ITEMS:
        raise HTTPException(status_code=400, detail=f'Máximo {MAX_ITEMS} preguntas por formulario')
    c = contenido or {}
    return {'pasos': pasos, 'diseno': reglas.limpiar_diseno(c.get('diseno')), 'navegacion': reglas.limpiar_navegacion(c.get('navegacion')),
            'seguimientos': reglas.limpiar_seguimientos(c.get('seguimientos'))}


def items_de(contenido: dict) -> list:
    """Preguntas en orden, con su paso y sección."""
    out = []
    for p in (contenido or {}).get('pasos') or []:
        for s in p.get('secciones') or []:
            for it in s.get('items') or []:
                out.append({**it, '_paso': p.get('nombre') or '', '_seccion': s.get('nombre') or ''})
    return out


def _errores_avanzado(it: dict, nombre: str) -> list:
    cfg = it.get('config') or {}
    if it['tipo'] == 'articulo' and not cfg.get('lista'):
        return [f'«{nombre}»: escribe su lista de artículos']
    if it['tipo'] == 'matriz':
        if not cfg.get('filas') or len(cfg.get('columnas') or []) < 2:
            return [f'«{nombre}» necesita al menos 1 fila y 2 columnas']
        if it.get('puntaje') and any(c.get('pts') is None for c in cfg['columnas']):
            return [f'«{nombre}»: pon puntos a todas sus columnas']
    if it['tipo'] in EN_FILAS:
        columnas = cfg.get('columnas') or []
        if not columnas:
            return [f'«{nombre}» necesita al menos {"una columna" if it["tipo"] == "tabla" else "un campo"}']
        if any(not c['nombre'] for c in columnas):
            return [f'«{nombre}»: {"hay una columna" if it["tipo"] == "tabla" else "hay un campo"} sin nombre']
        if any(c['tipo'] == 'lista' and len(c.get('opciones') or []) < 2 for c in columnas):
            return [f'«{nombre}»: cada lista necesita al menos 2 opciones']
    return []


def errores_para_publicar(contenido: dict) -> list:
    errores = []
    pasos = contenido.get('pasos') or []
    if not pasos:
        errores.append('Agrega al menos un paso')
    con_respuesta = 0
    for p in pasos:
        if not p['nombre']:
            errores.append('Hay un paso sin nombre')
        for s in p['secciones']:
            for it in s['items']:
                nombre = it['titulo'] or TIPOS[it['tipo']][0]
                if it['tipo'] not in SIN_RESPUESTA:
                    con_respuesta += 1
                if not it['titulo'] and it['tipo'] not in ('separador', 'imagen'):
                    errores.append(f'Una pregunta de tipo «{TIPOS[it["tipo"]][0]}» no tiene texto')
                if it['tipo'] in CON_OPCIONES and len(it.get('opciones') or []) < 2:
                    errores.append(f'«{nombre}» necesita al menos 2 opciones')
                if it.get('puntaje') and it['tipo'] in CON_OPCIONES and any(
                        o.get('pts') is None for o in it['opciones'] if not o.get('na')):
                    errores.append(f'«{nombre}»: pon puntos a todas sus opciones')
                if it['tipo'] == 'imagen' and not (it.get('config') or {}).get('imagen_id'):
                    errores.append('Una imagen informativa no tiene imagen')
                errores += _errores_avanzado(it, nombre)
    if not con_respuesta:
        errores.append('Agrega al menos una pregunta que se pueda contestar')
    errores += reglas.errores_reglas(contenido, {k: v[0] for k, v in TIPOS.items()})
    seg = contenido.get('seguimientos') or {}
    if seg.get('revisa') == 'persona' and not seg.get('persona_id'):
        errores.append('Seguimientos: elige la persona que los revisa')
    return list(dict.fromkeys(errores))[:12]


def cambios_entre(antes: Optional[dict], despues: dict) -> list:
    """Qué cambió de una versión a otra, para leerlo antes de publicar."""
    a = {it['id']: it for it in items_de(antes or {})}
    d = {it['id']: it for it in items_de(despues)}
    out = []
    for iid, it in d.items():
        nombre = it['titulo'] or TIPOS[it['tipo']][0]
        if iid not in a:
            out.append({'tipo': 'nueva', 'texto': f'«{nombre}» ({TIPOS[it["tipo"]][0].lower()}{", obligatoria" if it.get("obligatoria") else ""})'})
            continue
        v = a[iid]
        partes = []
        if v['tipo'] != it['tipo']:
            partes.append(f'ahora es {TIPOS[it["tipo"]][0].lower()}')
        if v['titulo'] != it['titulo']:
            partes.append(f'antes decía «{v["titulo"]}»')
        if bool(v.get('obligatoria')) != bool(it.get('obligatoria')):
            partes.append('ahora es obligatoria' if it.get('obligatoria') else 'ya no es obligatoria')
        if [(o['label'], o.get('pts')) for o in v.get('opciones') or []] != [(o['label'], o.get('pts')) for o in it.get('opciones') or []]:
            partes.append('cambiaron sus opciones o puntos')
        if (v.get('evidencia') or 'no') != (it.get('evidencia') or 'no'):
            partes.append({'no': 'ya no pide foto', 'opcional': 'ahora pide foto opcional', 'obligatoria': 'ahora pide foto obligatoria',
                           'si_no_cumple': 'ahora pide foto si no cumple'}[it.get('evidencia') or 'no'])
        if bool(v.get('puntaje')) != bool(it.get('puntaje')):
            partes.append('ahora tiene puntaje' if it.get('puntaje') else 'ya no tiene puntaje')
        if v['tipo'] == it['tipo'] and it.get('config') != v.get('config'):
            partes.append('cambió su configuración')
        if (v['_paso'], v['_seccion']) != (it['_paso'], it['_seccion']):
            partes.append(f'se movió a {it["_paso"]} › {it["_seccion"]}')
        if v.get('condicion') != it.get('condicion'):
            partes.append('ahora se muestra solo si ' + reglas.describir_condicion(it['condicion'], d) if it.get('condicion')
                          else 'ya no tiene condición')
        if v.get('seguimiento') != it.get('seguimiento'):
            partes.append('ahora abre un seguimiento' if it.get('seguimiento') and not v.get('seguimiento')
                          else ('ya no abre seguimiento' if not it.get('seguimiento') else 'cambió cuándo abre seguimiento'))
        if 'apariencia' in v and v['apariencia'] != it.get('apariencia'):  # las versiones de la etapa 1 no la tenían
            partes.append('cambió su apariencia')
        if partes:
            out.append({'tipo': 'cambio', 'texto': f'«{nombre}»: {", ".join(partes)}'})
    for iid, v in a.items():
        if iid not in d:
            out.append({'tipo': 'quitada', 'texto': f'«{v["titulo"] or TIPOS[v["tipo"]][0]}» (sus respuestas de antes se conservan)'})
    # pasos y secciones con condición, estilo de cada paso
    bloques_a = {b['id']: b for p in (antes or {}).get('pasos') or [] for b in [p] + (p.get('secciones') or [])}
    for p in despues.get('pasos') or []:
        for b, que in [(p, 'El paso')] + [(s, 'La sección') for s in p.get('secciones') or []]:
            previo = bloques_a.get(b['id'])
            if previo and (previo.get('condicion') != b.get('condicion')):
                out.append({'tipo': 'cambio', 'texto': f'{que} «{b.get("nombre") or "sin nombre"}»: '
                            + ('se muestra solo si ' + reglas.describir_condicion(b['condicion'], d) if b.get('condicion') else 'ya no tiene condición')})
            elif not previo and b.get('condicion'):
                out.append({'tipo': 'nueva', 'texto': f'{que} «{b.get("nombre") or "sin nombre"}» se muestra solo si '
                            + reglas.describir_condicion(b['condicion'], d)})
        if p['id'] in bloques_a and (bloques_a[p['id']].get('estilo') or 'igual') != (p.get('estilo') or 'igual'):
            out.append({'tipo': 'cambio', 'texto': f'El paso «{p.get("nombre")}» cambió de estilo'})
    if antes:
        # las versiones de la etapa 1 no traen estas partes: se comparan contra lo de fábrica
        bases = {'diseno': reglas.limpiar_diseno(None), 'navegacion': reglas.limpiar_navegacion(None),
                 'seguimientos': reglas.limpiar_seguimientos(None)}
        for clave, texto in (('diseno', 'Cambió el diseño (colores, letras o pantallas)'), ('navegacion', 'Cambió la navegación (estilo, progreso o botones)'),
                             ('seguimientos', 'Cambió quién revisa los seguimientos o su plazo')):
            if (antes.get(clave) or bases[clave]) != (despues.get(clave) or bases[clave]):
                out.append({'tipo': 'cambio', 'texto': texto})
    return out


def compat(contenido: dict) -> dict:
    """Campos de antes (`items`, puntaje) para el historial y el reporte."""
    items = [{'id': it['id'], 'seccion': it['_seccion'] or it['_paso'] or 'General', 'titulo': it['titulo'] or TIPOS[it['tipo']][0],
              'tipo': it['tipo'], 'scored': bool(it.get('puntaje')) and it['max'] > 0, 'max': it['max'],
              'opciones': [{'label': o['label'], 'pts': o.get('pts')} for o in it.get('opciones') or []]}
             for it in items_de(contenido) if it['tipo'] not in SIN_RESPUESTA]
    total = sum(it['max'] for it in items)
    return {'items': items, 'has_scoring': total > 0, 'total_max': total}


# --------------------------------------------------------------------------- #
#  Plantillas
# --------------------------------------------------------------------------- #
def _q(tipo, titulo, **extra):
    return {'id': new_id(), 'tipo': tipo, 'titulo': titulo, **extra}


def _plantilla(clave: str) -> dict:
    def paso(nombre, *secciones):
        return {'id': new_id(), 'nombre': nombre, 'secciones': [{'id': new_id(), 'nombre': n, 'items': its} for n, its in secciones]}
    if clave == 'encuesta':
        pasos = [paso('Encuesta', ('Tu opinión', [
            _q('escala', '¿Qué tan satisfecho estás?', obligatoria=True, config={'max': 10}),
            _q('unica', '¿Qué es lo que más valoras?', opciones=[{'label': 'Opción 1'}, {'label': 'Opción 2'}, {'label': 'Opción 3'}]),
            _q('multiple', '¿Qué mejorarías?', opciones=[{'label': 'Opción 1'}, {'label': 'Opción 2'}]),
            _q('estrellas', 'Califica la experiencia', config={'max': 5}),
            _q('sino', '¿Lo recomendarías?'),
            _q('largo', 'Comentarios')]))]
    elif clave == 'inspeccion':
        pasos = [paso('Datos generales', ('Identificación', [
                    _q('sucursal', 'Tienda que se inspecciona', obligatoria=True),
                    _q('fechahora', 'Fecha y hora de la inspección', obligatoria=True)])),
                 paso('Revisión', ('Exhibición', [
                    _q('cumple', 'Las góndolas están completas y ordenadas', obligatoria=True, puntaje=True, evidencia='si_no_cumple'),
                    _q('cumple', 'Los precios coinciden con el sistema', obligatoria=True, puntaje=True, evidencia='si_no_cumple'),
                    _q('foto', 'Foto del pasillo principal', obligatoria=True)]),
                    ('Limpieza', [
                    _q('cumple', 'El piso está limpio', obligatoria=True, puntaje=True, evidencia='si_no_cumple'),
                    _q('largo', 'Observaciones')])),
                 paso('Cierre', ('Firma', [_q('firma', 'Firma de quien inspecciona', obligatoria=True)]))]
    elif clave == 'solicitud':
        pasos = [paso('Solicitud', ('Datos', [
            _q('colaborador', 'Quién solicita', obligatoria=True),
            _q('lista', 'Tipo de solicitud', obligatoria=True, opciones=[{'label': 'Opción 1'}, {'label': 'Opción 2'}]),
            _q('fecha', 'Fecha en que se necesita', obligatoria=True),
            _q('largo', 'Detalle', obligatoria=True),
            _q('archivo', 'Documento de respaldo'),
            _q('firma', 'Firma')]))]
    elif clave == 'evaluacion':
        pasos = [paso('Evaluación', ('Sección 1', [
                    _q('unica', 'Criterio 1', obligatoria=True, puntaje=True,
                       opciones=[{'label': 'Excelente', 'pts': 10}, {'label': 'Bueno', 'pts': 7}, {'label': 'Regular', 'pts': 4}, {'label': 'Malo', 'pts': 0}]),
                    _q('unica', 'Criterio 2', obligatoria=True, puntaje=True,
                       opciones=[{'label': 'Excelente', 'pts': 10}, {'label': 'Bueno', 'pts': 7}, {'label': 'Regular', 'pts': 4}, {'label': 'Malo', 'pts': 0}])]),
                    ('Sección 2', [
                    _q('escala', 'Criterio 3', obligatoria=True, puntaje=True, config={'max': 10}),
                    _q('largo', 'Comentarios del evaluador')]))]
    else:
        pasos = [paso('Paso 1', ('General', []))]
    return limpiar_contenido({'pasos': pasos})


PLANTILLAS = [
    ('blanco', 'En blanco', 'Empieza sin preguntas.', 'Un paso, una sección'),
    ('encuesta', 'Encuesta', 'Preguntas de opción, escala y comentarios.', '6 preguntas'),
    ('inspeccion', 'Inspección / checklist', 'Cumple / No cumple, fotos, puntaje y firma.', '8 preguntas en 3 pasos'),
    ('solicitud', 'Solicitud', 'Datos, fecha, archivo y firma.', '6 preguntas'),
    ('evaluacion', 'Evaluación con puntaje', 'Secciones con puntos y total.', '4 preguntas en 2 secciones'),
]


# --------------------------------------------------------------------------- #
#  Permisos y lectura
# --------------------------------------------------------------------------- #
async def _form(fid: str) -> dict:
    f = await db.custom_forms.find_one({'id': fid, 'esquema': ESQUEMA}, {'_id': 0})
    if not f:
        raise HTTPException(status_code=404, detail='Formulario no encontrado')
    return f


def _exigir(user, f, *acciones):
    """Quien lo creó y los admins pueden todo; a los demás se les da en la pestaña Permisos."""
    if not any(fa.puede(user, f, a) for a in acciones):
        raise HTTPException(status_code=403, detail='No tienes permiso para hacer esto en este formulario')


def _para_editor(f: dict, user) -> dict:
    return serialize_doc({**f, 'puede_editar': fa.entra_al_constructor(user, f), 'mis_permisos': fa.mis_permisos(user, f),
                          'asignacion': fasig.asignacion_de(f), 'supervision': fasig.supervision_de(f), 'permisos': fasig.permisos_de(f),
                          'reglas': fasig.automatizaciones.limpiar(f.get('reglas')),
                          'tipos': {k: v[0] for k, v in TIPOS.items()}, 'cambios_sin_publicar': f.get('borrador') != f.get('contenido_publicado')})


def _para_llenar(f: dict, user) -> dict:
    return serialize_doc({k: f.get(k) for k in ('id', 'titulo', 'descripcion', 'esquema', 'estado', 'version', 'version_id',
                                                 'has_scoring', 'total_max', 'creator_id', 'kind', 'departamento')}
                         | {'contenido': f.get('contenido_publicado') or {'pasos': []},
                            'puede_editar': fa.entra_al_constructor(user, f), 'mis_permisos': fa.mis_permisos(user, f)})


@router.get('/plantillas')
async def plantillas(user=Depends(get_current_user)):
    return [{'id': k, 'nombre': n, 'descripcion': d, 'detalle': det} for k, n, d, det in PLANTILLAS]


# --------------------------------------------------------------------------- #
#  Temas guardados (diseños reutilizables, del departamento)
# --------------------------------------------------------------------------- #
class TemaInput(BaseModel):
    nombre: str
    diseno: dict


@router.get('/temas')
async def temas(user=Depends(get_current_user)):
    out = await db.form_temas.find({'departamento': departamento_de(user)}, {'_id': 0}).sort('nombre', 1).to_list(200)
    for t in out:
        t['puede_borrar'] = t['creado_por']['id'] == user['id'] or user.get('role') == 'admin'
    return serialize_doc(out)


@router.post('/temas')
async def guardar_tema(data: TemaInput, user=Depends(get_current_user)):
    if not can_create_custom_formulario(user):
        raise HTTPException(status_code=403, detail='No tienes permiso para crear formularios')
    nombre = _txt(data.nombre, 60)
    if not nombre:
        raise HTTPException(status_code=400, detail='Ponle nombre al tema')
    diseno = reglas.limpiar_diseno(data.diseno)
    # las imágenes son de cada formulario: el tema guarda colores, letras y forma
    diseno.update({'fondo_imagen_id': None, 'logo_imagen_id': None, 'portada_imagen_id': None,
                   'logo': 'herco' if diseno['logo'] == 'imagen' else diseno['logo']})
    doc = {'id': new_id(), 'nombre': nombre, 'departamento': departamento_de(user), 'diseno': diseno,
           'creado_por': {'id': user['id'], 'name': user['name']}, 'created_at': now_iso()}
    await db.form_temas.insert_one(doc)
    doc.pop('_id', None)
    return serialize_doc({**doc, 'puede_borrar': True})


@router.delete('/temas/{tid}')
async def borrar_tema(tid: str, user=Depends(get_current_user)):
    t = await db.form_temas.find_one({'id': tid}, {'_id': 0})
    if not t:
        raise HTTPException(status_code=404, detail='Tema no encontrado')
    if t['creado_por']['id'] != user['id'] and user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Solo quien lo guardó (o un admin) lo borra')
    await db.form_temas.delete_one({'id': tid})
    return {'ok': True}


class NuevoInput(BaseModel):
    titulo: Optional[str] = ''
    plantilla: Optional[str] = 'blanco'


@router.post('')
async def crear(data: NuevoInput, user=Depends(get_current_user)):
    if not can_create_custom_formulario(user):
        raise HTTPException(status_code=403, detail='No tienes permiso para crear formularios')
    nombre = dict((k, n) for k, n, _, _ in PLANTILLAS).get(data.plantilla or 'blanco', 'En blanco')
    titulo = _txt(data.titulo, 160) or ('Formulario nuevo' if (data.plantilla or 'blanco') == 'blanco' else nombre)
    contenido = _plantilla(data.plantilla or 'blanco')
    doc = {
        'id': new_id(), 'esquema': ESQUEMA, 'kind': 'generic', 'titulo': titulo, 'descripcion': '',
        'estado': 'borrador', 'status': 'borrador', 'plantilla': data.plantilla or 'blanco',
        'borrador': contenido, 'rev': 1, 'guardado_at': now_iso(), 'guardado_por': user['name'],
        'version': 0, 'version_id': None, 'contenido_publicado': None,
        'items': [], 'has_scoring': False, 'total_max': 0,
        'creator_id': user['id'], 'creator_name': user['name'], 'creator_avatar': user.get('avatar_url'),
        'departamento': departamento_de(user),
        'audiencia': {'todos': False, 'areas': [], 'cargos': [], 'user_ids': []}, 'audiencia_resueltos': [],
        'asignacion': fasig.limpiar_asignacion({}), 'supervision': fasig.limpiar_supervision({}), 'permisos': fasig.limpiar_permisos({}),
        'permisos_resueltos': {}, 'flujo_tareas': False, 'imagenes': {}, 'created_at': now_iso(),
    }
    await db.custom_forms.insert_one(doc)
    doc.pop('_id', None)
    return _para_editor(doc, user)


@router.get('/{fid}')
async def leer(fid: str, user=Depends(get_current_user)):
    """Quien entra al constructor recibe todo (borrador incluido); quien lo llena, solo lo publicado."""
    f = await _form(fid)
    if fa.entra_al_constructor(user, f):
        return _para_editor(f, user)
    if f.get('estado') != 'publicado' or not fa.puede_llenar(user, f):
        raise HTTPException(status_code=403, detail='No tienes acceso a este formulario')
    return _para_llenar(f, user)


@router.get('/{fid}/llenar')
async def para_llenar(fid: str, user=Depends(get_current_user)):
    """Lo publicado, para contestarlo, con lo que la persona tenga en curso.
    `disponible` dice si puede empezar uno nuevo; lo asignado se entrega una vez."""
    f = await _form(fid)
    a = await fasig.abierta_de(f, user)
    if not a and (f.get('estado') != 'publicado' or not fa.puede_llenar(user, f)):
        raise HTTPException(status_code=403, detail='No tienes acceso a este formulario')
    otra_vez = fasig.asignacion_de(f)['modo'] == 'disponible' or fa.gestiona(user, f)
    return {**_para_llenar(f, user), 'asignacion': serialize_doc(a), 'otra_vez': otra_vez,
            'disponible': (bool(a) or otra_vez) and f.get('estado') == 'publicado'}


@router.get('/{fid}/listas')
async def listas(fid: str, user=Depends(get_current_user)):
    """Lo que eligen las preguntas de la empresa (colaborador, sucursal, caja),
    del departamento del formulario."""
    f = await _form(fid)
    if not fa.ve_formulario(user, f) and not await fasig.abierta_de(f, user):
        raise HTTPException(status_code=403, detail='No tienes acceso a este formulario')
    depto = rfc._depto_form(f)
    gente = await db.users.find({'status': 'approved', **filtro_usuarios_depto(depto)},
                                {'_id': 0, 'id': 1, 'name': 1, 'position': 1}).sort('name', 1).to_list(2000)
    areas = await db.org_areas.find({'departamento': depto}, {'_id': 0, 'id': 1, 'nombre': 1, 'cargo_id': 1}).to_list(1000)
    cargos = {c['id']: c['nombre'] for c in await db.org_cargos.find({'departamento': depto}, {'_id': 0, 'id': 1, 'nombre': 1}).to_list(500)}
    cajas = sorted(({'id': a['id'], 'nombre': f'{cargos[a["cargo_id"]]} · {a["nombre"]}' if cargos.get(a.get('cargo_id')) else a['nombre']}
                    for a in areas), key=lambda c: c['nombre'])
    return {'colaboradores': [{'id': u['id'], 'nombre': u['name'], 'cargo': u.get('position') or ''} for u in gente],
            'sucursales': SUCURSALES, 'cajas': cajas}


class BorradorInput(BaseModel):
    rev: int
    titulo: str
    descripcion: Optional[str] = ''
    contenido: dict


@router.put('/{fid}/borrador')
async def guardar_borrador(fid: str, data: BorradorInput, user=Depends(get_current_user)):
    """Guardado automático. Si alguien más guardó en el medio (`rev` distinto),
    no se pisa: hay que recargar."""
    f = await _form(fid)
    _exigir(user, f, 'editar')
    contenido = limpiar_contenido(data.contenido)
    if not contenido['pasos']:
        # el constructor no deja quitar el último paso: si llega vacío es un error de la pantalla
        raise HTTPException(status_code=400, detail='El formulario necesita al menos un paso')
    sets = {'titulo': _txt(data.titulo, 160) or 'Formulario sin título', 'descripcion': _texto_largo(data.descripcion, 1000),
            'borrador': contenido, 'guardado_at': now_iso(), 'guardado_por': user['name']}
    r = await db.custom_forms.update_one({'id': fid, 'rev': data.rev}, {'$set': sets, '$inc': {'rev': 1}})
    if not r.modified_count:
        raise HTTPException(status_code=409, detail='Alguien más guardó cambios en este formulario: recarga para seguir')
    return {'rev': data.rev + 1, 'guardado_at': sets['guardado_at'], 'cambios_sin_publicar': contenido != f.get('contenido_publicado')}


@router.get('/{fid}/cambios')
async def cambios(fid: str, user=Depends(get_current_user)):
    f = await _form(fid)
    _exigir(user, f, 'editar', 'publicar')
    respuestas = await db.custom_form_responses.count_documents({'form_id': fid, 'version_id': f.get('version_id')}) if f.get('version_id') else 0
    al = await fasig.alcance(f)
    avisos = []
    if not al['personas']:
        avisos.append('Todavía no le toca a nadie: elige a quién en Asignaciones. Puedes hacerlo después de publicar.')
    n = al['sin_modulo']
    if n:
        avisos.append(f'{n} {"persona no tiene" if n == 1 else "personas no tienen"} el módulo Mis formularios en su perfil: no lo {"va" if n == 1 else "van"} a ver.')
    return {'version': f.get('version') or 0, 'siguiente': (f.get('version') or 0) + 1,
            'cambios': cambios_entre(f.get('contenido_publicado'), f['borrador']),
            'errores': errores_para_publicar(f['borrador']), 'respuestas_version_actual': respuestas,
            'avisos': avisos, 'estado': f.get('estado')}


class PublicarInput(BaseModel):
    nota: Optional[str] = ''


@router.post('/{fid}/publicar')
async def publicar(fid: str, data: PublicarInput, user=Depends(get_current_user)):
    """Publica el borrador como versión nueva (o reactiva uno despublicado sin cambios)."""
    f = await _form(fid)
    _exigir(user, f, 'publicar')
    contenido = f['borrador']
    errores = errores_para_publicar(contenido)
    if errores:
        raise HTTPException(status_code=400, detail='No se puede publicar: ' + '; '.join(errores))
    seg = contenido.get('seguimientos') or {}
    if seg.get('revisa') == 'persona' and not await db.users.find_one({'id': seg.get('persona_id'), 'status': 'approved'}, {'_id': 1}):
        raise HTTPException(status_code=400, detail='No se puede publicar: la persona que revisa los seguimientos ya no está activa')
    sets = {'estado': 'publicado', 'status': 'publicado', 'publicado_at': now_iso()}
    if f.get('contenido_publicado') == contenido and f.get('version'):
        await db.custom_forms.update_one({'id': fid}, {'$set': sets})
        await fasig.sincronizar(await _form(fid))
        return {'version': f['version'], 'nueva': False}
    numero = (f.get('version') or 0) + 1
    version = {'id': new_id(), 'form_id': fid, 'numero': numero, 'titulo': f['titulo'], 'contenido': contenido,
               'cambios': cambios_entre(f.get('contenido_publicado'), contenido), 'nota': _txt(data.nota, 300),
               'publicada_at': now_iso(), 'publicada_por': {'id': user['id'], 'name': user['name']}}
    # la versión primero (índice único form_id+numero): si dos publican a la vez, solo una entra
    await db.custom_form_versiones.insert_one(version)
    sets.update({'version': numero, 'version_id': version['id'], 'contenido_publicado': contenido, **compat(contenido)})
    await db.custom_forms.update_one({'id': fid}, {'$set': sets})
    await fasig.sincronizar(await _form(fid))
    return {'version': numero, 'nueva': True}


@router.post('/{fid}/despublicar')
async def despublicar(fid: str, user=Depends(get_current_user)):
    f = await _form(fid)
    _exigir(user, f, 'publicar')
    if f.get('estado') != 'publicado':
        raise HTTPException(status_code=400, detail='No está publicado')
    await db.custom_forms.update_one({'id': fid}, {'$set': {'estado': 'despublicado', 'status': 'borrador', 'despublicado_at': now_iso()}})
    return {'estado': 'despublicado'}


@router.post('/{fid}/duplicar')
async def duplicar(fid: str, user=Depends(get_current_user)):
    f = await _form(fid)
    if not (fa.puede(user, f, 'editar') and can_create_custom_formulario(user)):
        raise HTTPException(status_code=403, detail='No puedes duplicar este formulario')
    nuevo = {k: copy.deepcopy(v) for k, v in f.items() if k not in ('_id',)}
    nuevo.update({'id': new_id(), 'titulo': f'{f["titulo"]} (copia)'[:160], 'estado': 'borrador', 'status': 'borrador', 'rev': 1,
                  'version': 0, 'version_id': None, 'contenido_publicado': None, 'items': [], 'has_scoring': False, 'total_max': 0,
                  'audiencia_resueltos': [], 'permisos_resueltos': {}, 'ciclo_base': 0, 'ciclo_max': 0, 'creator_id': user['id'], 'creator_name': user['name'],
                  'creator_avatar': user.get('avatar_url'), 'departamento': departamento_de(user),
                  'created_at': now_iso(), 'guardado_at': now_iso(), 'guardado_por': user['name'], 'duplicado_de': fid})
    for k in ('publicado_at', 'despublicado_at', 'updated_at'):
        nuevo.pop(k, None)
    await db.custom_forms.insert_one(nuevo)
    nuevo.pop('_id', None)
    await fasig.sincronizar(nuevo, avisar=False)
    return _para_editor(await _form(nuevo['id']), user)


@router.get('/{fid}/versiones')
async def versiones(fid: str, user=Depends(get_current_user)):
    f = await _form(fid)
    _exigir(user, f, 'editar', 'publicar')
    vs = await db.custom_form_versiones.find({'form_id': fid}, {'_id': 0, 'contenido': 0}).sort('numero', -1).to_list(500)
    for v in vs:
        v['respuestas'] = await db.custom_form_responses.count_documents({'form_id': fid, 'version_id': v['id']})
    return serialize_doc({'versiones': vs, 'actual': f.get('version') or 0, 'estado': f.get('estado'),
                          'cambios_sin_publicar': f['borrador'] != f.get('contenido_publicado')})


@router.post('/{fid}/versiones/{numero}/restaurar')
async def restaurar(fid: str, numero: int, user=Depends(get_current_user)):
    """La versión elegida vuelve a ser el borrador (para seguir editando o publicarla otra vez)."""
    f = await _form(fid)
    _exigir(user, f, 'editar')
    v = await db.custom_form_versiones.find_one({'form_id': fid, 'numero': numero}, {'_id': 0})
    if not v:
        raise HTTPException(status_code=404, detail='Versión no encontrada')
    await db.custom_forms.update_one({'id': fid}, {'$set': {'borrador': v['contenido'], 'guardado_at': now_iso(),
                                                            'guardado_por': user['name']}, '$inc': {'rev': 1}})
    return _para_editor(await _form(fid), user)


# --------------------------------------------------------------------------- #
#  Imágenes informativas
# --------------------------------------------------------------------------- #
@router.post('/{fid}/imagenes')
async def subir_imagen(fid: str, archivo: UploadFile = File(...), user=Depends(get_current_user)):
    f = await _form(fid)
    _exigir(user, f, 'editar')
    contenido = await archivo.read()
    ctype = archivo.content_type or ''
    if not ctype.startswith('image/'):
        raise HTTPException(status_code=400, detail='Sube una imagen (JPG, PNG o WEBP)')
    if len(contenido) > MAX_FOTO:
        raise HTTPException(status_code=400, detail='La imagen supera 8 MB')
    iid = new_id()
    ext = 'png' if 'png' in ctype else ('webp' if 'webp' in ctype else 'jpg')
    path = f'{storage.APP_NAME}/formularios-v2/{fid}/imagenes/{iid}.{ext}'
    await storage.put_object(path, contenido, ctype)
    await db.custom_forms.update_one({'id': fid}, {'$set': {f'imagenes.{iid}': {'path': path, 'content_type': ctype}}})
    return {'imagen_id': iid}


@router.get('/{fid}/imagenes/{iid}')
async def ver_imagen(fid: str, iid: str, user=Depends(get_current_user)):
    f = await _form(fid)
    if not fa.ve_formulario(user, f) and not await fasig.abierta_de(f, user):
        raise HTTPException(status_code=403, detail='No tienes acceso a este formulario')
    img = (f.get('imagenes') or {}).get(iid)
    if not img:
        raise HTTPException(status_code=404, detail='Imagen no encontrada')
    content, ctype = await storage.get_object(img['path'])
    return Response(content=content, media_type=img.get('content_type') or ctype)


# --------------------------------------------------------------------------- #
#  Responder
# --------------------------------------------------------------------------- #
def clave_foto(iid: str, fila: str, campo: str) -> str:
    """Dueño de las fotos de un campo en una fila de un grupo repetible."""
    return f'{iid}:{fila}:{campo}'


def _celda(col: dict, v: Any) -> tuple:
    t = col['tipo']
    if t in ('texto', 'largo'):
        s = _texto_largo(v, 2000 if t == 'largo' else 300)
        return s, ' '.join(s.split())
    if v in (None, ''):
        return None, ''
    if t == 'numero':
        n = _num(v)
        if n is None:
            raise ValueError('escribe un número')
        return n, reglas.cifra(n)
    if t == 'lista':
        if v not in col.get('opciones', []):
            raise ValueError('elige una de las opciones')
        return v, v
    try:
        return _txt(v, 20), datetime.strptime(_txt(v, 20), '%Y-%m-%d').strftime('%d/%m/%Y')
    except ValueError:
        raise ValueError('fecha inválida')


def _filas(it: dict, valor: Any, cuantos) -> tuple:
    """Tabla y grupo repetible: lo que sí trae algo, una línea de texto por fila.
    `cuantos(dueño)`: cuántos archivos tiene. Una fila vacía no cuenta."""
    cfg = it['config']
    filas, lineas = [], []
    for f in valor if isinstance(valor, list) else []:
        if not isinstance(f, dict) or not RE_FILA.match(str(f.get('id') or '')):
            continue
        datos = f.get('valores') if isinstance(f.get('valores'), dict) else {}
        limpios, partes, faltan = {}, [], []
        for c in cfg['columnas']:
            try:
                if c['tipo'] == 'foto':
                    n = cuantos(clave_foto(it['id'], f['id'], c['id']))
                    guardado, texto = n or None, f'{n} {"foto" if n == 1 else "fotos"}'
                else:
                    guardado, texto = _celda(c, datos.get(c['id']))
            except ValueError as e:
                raise ValueError(f'fila {len(filas) + 1}, {c["nombre"]}: {e}')
            if guardado in (None, ''):
                if c['obligatoria']:
                    faltan.append(c['nombre'])
                continue
            if c['tipo'] != 'foto':
                limpios[c['id']] = guardado
            partes.append(f'{c["nombre"]}: {texto}')
        if not partes:
            continue
        if faltan:
            raise ValueError(f'fila {len(filas) + 1}: falta {", ".join(faltan)}')
        filas.append({'id': f['id'], 'valores': limpios})
        lineas.append(f'{len(filas)}) ' + ' · '.join(partes))
    if len(filas) > cfg['max_filas']:
        raise ValueError(f'son máximo {cfg["max_filas"]} filas')
    return filas, '\n'.join(lineas)


async def _mostrar_valor(it: dict, valor: Any, depto: str, cuantos=lambda dueno: 0):
    """Valida la respuesta de una pregunta y devuelve (valor guardado, texto para mostrar)."""
    t = it['tipo']
    if t in ('corto', 'largo', 'correo', 'telefono'):
        v = _texto_largo(valor, 4000 if t == 'largo' else 300)
        val = it.get('validacion') or {}
        if v and t in ('corto', 'largo'):
            if val.get('min') is not None and len(v) < val['min']:
                raise ValueError(val.get('mensaje') or f'Escribe al menos {int(val["min"])} caracteres')
            if val.get('max') is not None and len(v) > val['max']:
                raise ValueError(val.get('mensaje') or f'Escribe máximo {int(val["max"])} caracteres')
        if v and t == 'correo' and not RE_CORREO.match(v):
            raise ValueError('Escribe un correo válido')
        if v and t == 'telefono' and not RE_TELEFONO.match(v):
            raise ValueError('Escribe un teléfono válido')
        return v, v
    if t == 'numero':
        if valor in (None, ''):
            return None, ''
        n = _num(valor)
        if n is None:
            raise ValueError('Escribe un número')
        val = it.get('validacion') or {}
        if (val.get('min') is not None and n < val['min']) or (val.get('max') is not None and n > val['max']):
            raise ValueError(val.get('mensaje') or 'El número está fuera del rango permitido')
        return n, (str(int(n)) if n == int(n) else str(n))
    if t in ('moneda', 'porcentaje'):
        if valor in (None, ''):
            return None, ''
        n = _num(valor)
        if n is None:
            raise ValueError('Escribe un número')
        val = it.get('validacion') or {}
        minimo, tope = val.get('min'), val.get('max')
        if t == 'porcentaje':
            minimo, tope = 0 if minimo is None else minimo, 100 if tope is None else tope
        if (minimo is not None and n < minimo) or (tope is not None and n > tope):
            raise ValueError(val.get('mensaje') or 'El número está fuera del rango permitido')
        return n, reglas.dinero(n, it['config']['simbolo']) if t == 'moneda' else f'{reglas.cifra(n)} %'
    if t == 'direccion':
        d = valor if isinstance(valor, dict) else {}
        linea, ciudad = _txt(d.get('direccion'), 300), _txt(d.get('ciudad'), 120)
        if not linea and not ciudad:
            return None, ''
        if not linea and it.get('obligatoria'):
            raise ValueError('Escribe la dirección')
        return {'direccion': linea, 'ciudad': ciudad}, ', '.join(x for x in (linea, ciudad) if x)
    if t == 'ubicacion':
        d = valor if isinstance(valor, dict) else {}
        if not d:
            return None, ''
        lat, lng, precision = _num(d.get('lat')), _num(d.get('lng')), _num(d.get('precision'))
        if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError('La ubicación no es válida: vuelve a tomarla')
        precision = round(precision) if precision is not None and precision >= 0 else None
        texto = f'{lat:.5f}, {lng:.5f}' + (f' (±{precision} m)' if precision is not None else '')
        return {'lat': lat, 'lng': lng, 'precision': precision, 'at': _txt(d.get('at'), 40)}, texto
    if t == 'articulo':
        v = _txt(valor, 160)
        if not v:
            return None, ''
        if v not in it['config']['lista']:
            raise ValueError('Elige un artículo de la lista')
        return v, v
    if t == 'matriz':
        d = valor if isinstance(valor, dict) else {}
        columnas = {c['id']: c for c in it['config']['columnas']}
        elegidas, textos = {}, []
        for f in it['config']['filas']:
            c = d.get(f['id'])
            if c in (None, ''):
                continue
            if not isinstance(c, str) or c not in columnas:
                raise ValueError('Elige una de las columnas')
            elegidas[f['id']] = c
            textos.append(f'{f["label"]}: {columnas[c]["label"]}')
        if elegidas and it.get('obligatoria') and len(elegidas) < len(it['config']['filas']):
            raise ValueError('Contesta todas las filas')
        return elegidas or None, textos
    if t in EN_FILAS:
        return _filas(it, valor, cuantos)
    if t in ('unica', 'lista', 'sino', 'cumple'):
        if valor in (None, ''):
            return None, ''
        o = next((o for o in it['opciones'] if o['id'] == valor), None)
        if not o:
            raise ValueError('Elige una de las opciones')
        return o['id'], o['label']
    if t == 'multiple':
        ids = [v for v in (valor or []) if isinstance(v, str)]
        ops = [o for o in it['opciones'] if o['id'] in ids]
        if len(ops) != len(set(ids)):
            raise ValueError('Elige entre las opciones')
        return [o['id'] for o in ops], [o['label'] for o in ops]
    if t in ('escala', 'estrellas'):
        if valor in (None, ''):
            return None, ''
        n = _num(valor)
        mx = (it.get('config') or {}).get('max') or (10 if t == 'escala' else 5)
        if n is None or n != int(n) or not 1 <= n <= mx:
            raise ValueError(f'Elige un valor de 1 a {mx}')
        return int(n), f'{int(n)} de {mx}'
    if t in ('fecha', 'hora', 'fechahora'):
        v = _txt(valor, 20)
        if not v:
            return None, ''
        fmt = {'fecha': '%Y-%m-%d', 'hora': '%H:%M', 'fechahora': '%Y-%m-%dT%H:%M'}[t]
        try:
            d = datetime.strptime(v, fmt)
        except ValueError:
            raise ValueError('Fecha u hora inválida')
        return v, {'fecha': d.strftime('%d/%m/%Y'), 'hora': d.strftime('%H:%M'), 'fechahora': d.strftime('%d/%m/%Y %H:%M')}[t]
    if t == 'colaborador':
        if not valor:
            return None, ''
        u = await db.users.find_one({'id': valor, 'status': 'approved', **filtro_usuarios_depto(depto)}, {'_id': 0, 'id': 1, 'name': 1})
        if not u:
            raise ValueError('Elige un colaborador del departamento')
        return u['id'], u['name']
    if t == 'sucursal':
        if not valor:
            return None, ''
        if valor not in SUCURSALES:
            raise ValueError('Elige una sucursal')
        return valor, valor
    if t == 'caja':
        if not valor:
            return None, ''
        a = await db.org_areas.find_one({'id': valor, 'departamento': depto}, {'_id': 0, 'id': 1, 'nombre': 1, 'cargo_id': 1})
        if not a:
            raise ValueError('Elige un área')
        c = await db.org_cargos.find_one({'id': a.get('cargo_id')}, {'_id': 0, 'nombre': 1}) if a.get('cargo_id') else None
        return a['id'], f'{c["nombre"]} · {a["nombre"]}' if c else a['nombre']
    return None, ''


def _es_imagen(a: UploadFile) -> bool:
    return (a.content_type or '').startswith('image/')


def _puntos(it: dict, guardado: Any):
    """(puntos, máximo) que cuenta esta respuesta; No aplica no cuenta."""
    if not it.get('puntaje') or not it['max'] or guardado in (None, '', []):
        return 0, 0
    t = it['tipo']
    if t in ('escala', 'estrellas'):
        return guardado, it['max']
    if t == 'matriz':
        columnas = {c['id']: c.get('pts') or 0 for c in it['config']['columnas']}
        return sum(max(0, columnas[c]) for c in guardado.values()), max(columnas.values()) * len(guardado)
    if t == 'multiple':
        return max(0, sum((o.get('pts') or 0) for o in it['opciones'] if o['id'] in guardado)), it['max']
    o = next((o for o in it['opciones'] if o['id'] == guardado), None)
    if not o or o.get('na'):
        return 0, 0
    return max(0, o.get('pts') or 0), it['max']


def _es_imagen_ya(m: dict) -> bool:
    return (m.get('content_type') or '').startswith('image/')


def _leer_envio(data: str, archivos: list, dueno: list):
    """(payload, respuestas, notas, archivos nuevos por dueño)"""
    try:
        payload = json.loads(data) or {}
        respuestas = payload.get('respuestas') or {}
        notas = payload.get('notas') or {}
    except Exception:
        raise HTTPException(status_code=400, detail='Datos de la respuesta inválidos')
    if not isinstance(respuestas, dict) or not isinstance(notas, dict):
        raise HTTPException(status_code=400, detail='Datos de la respuesta inválidos')
    if len(archivos) != len(dueno):
        raise HTTPException(status_code=400, detail='Los archivos no coinciden con sus preguntas')
    por_dueno = {}
    for a, d in zip(archivos, dueno):
        por_dueno.setdefault(d, []).append(a)
    return payload, respuestas, notas, por_dueno


async def _armar_entradas(cont: dict, respuestas: dict, notas: dict, por_dueno: dict, previos: dict, depto: str) -> dict:
    """Valida una respuesta contra `cont` y arma sus entradas. Cada archivo dice
    de qué pregunta es (`dueno`): el id de la pregunta (foto, cámara, archivo,
    firma), `ev:<id>` para la foto de evidencia o `clave_foto` si es de una fila
    de un grupo repetible. `previos` son los que ya están guardados (lo subido
    al ir llenando, o los que se conservan al modificar)."""
    tipos = {it['id']: it['tipo'] for it in items_de(cont)}

    def cuantos(dueno):
        return len(por_dueno.get(dueno, [])) + len(previos.get(dueno, []))
    # lo contestado en lo visible, para las condiciones de lo que sigue (oculto = vacío; archivos = cuántos)
    efectivos = {}
    visibles = set()
    for p in cont['pasos']:
        paso_ve = reglas.cumple(p.get('condicion'), efectivos, tipos)
        for sec in p['secciones']:
            sec_ve = paso_ve and reglas.cumple(sec.get('condicion'), efectivos, tipos)
            for it in sec['items']:
                if it['tipo'] in SIN_RESPUESTA:
                    continue
                if sec_ve and reglas.cumple(it.get('condicion'), efectivos, tipos):
                    visibles.add(it['id'])
                    if it['tipo'] in DE_ARCHIVOS:
                        efectivos[it['id']] = cuantos(it['id'])
                    elif it['tipo'] == 'calculado':
                        efectivos[it['id']] = reglas.calcular(it['config'], efectivos)
                    else:
                        try:
                            efectivos[it['id']] = (await _mostrar_valor(it, respuestas.get(it['id']), depto, cuantos))[0]
                        except ValueError:
                            efectivos[it['id']] = None  # el error se reporta abajo
                else:
                    efectivos[it['id']] = None
    entries, faltan, total, total_max, disparadas = [], [], 0, 0, []
    sucursal_respondida = None
    for it in items_de(cont):
        if it['tipo'] in SIN_RESPUESTA or it['id'] not in visibles:
            continue  # oculta por una condición: no se exige ni se guarda
        nombre = it['titulo'] or TIPOS[it['tipo']][0]
        propios = por_dueno.get(it['id'], [])
        evidencia = por_dueno.get(f'ev:{it["id"]}', [])
        ya_propios = list(previos.get(it['id'], []))
        ya_evidencia = list(previos.get(f'ev:{it["id"]}', []))
        de_filas = {}
        if it['tipo'] in DE_ARCHIVOS:
            guardado, mostrar = None, ''
            cuantos = len(propios) + len(ya_propios)
            if it.get('obligatoria') and not cuantos:
                faltan.append(f'«{nombre}»: falta {"la firma" if it["tipo"] == "firma" else "el archivo o la foto"}')
            if cuantos > (1 if it['tipo'] == 'firma' or not (it.get('config') or {}).get('varios') else MAX_ARCHIVOS_POR_PREGUNTA):
                faltan.append(f'«{nombre}»: demasiados archivos')
            if it['tipo'] != 'archivo' and not (all(_es_imagen(a) for a in propios) and all(_es_imagen_ya(m) for m in ya_propios)):
                faltan.append(f'«{nombre}»: solo acepta imágenes')
        else:
            try:
                if it['tipo'] == 'calculado':
                    guardado, mostrar = efectivos[it['id']], reglas.texto_calculado(it['config'], efectivos[it['id']])
                else:
                    guardado, mostrar = await _mostrar_valor(it, respuestas.get(it['id']), depto, cuantos)
            except ValueError as e:
                faltan.append(f'«{nombre}»: {e}')
                continue
            if it.get('obligatoria') and guardado in (None, '', []):
                faltan.append(f'«{nombre}» es obligatoria')
            if it['tipo'] == 'repetible':
                for f in guardado:
                    for c in it['config']['columnas']:
                        clave = clave_foto(it['id'], f['id'], c['id'])
                        if c['tipo'] != 'foto' or not cuantos(clave):
                            continue
                        nuevos, ya = por_dueno.get(clave, []), previos.get(clave, [])
                        if len(nuevos) + len(ya) > MAX_ARCHIVOS_POR_PREGUNTA or not (all(_es_imagen(a) for a in nuevos) and all(_es_imagen_ya(m) for m in ya)):
                            faltan.append(f'«{nombre}»: {c["nombre"]} acepta hasta {MAX_ARCHIVOS_POR_PREGUNTA} fotos')
                        de_filas[clave] = nuevos
                        ya_propios += [{**m, 'dueno': clave} for m in ya]
            ev = it.get('evidencia') or 'no'
            fallo = it['tipo'] == 'cumple' and any(o['id'] == guardado and o.get('falla') for o in it['opciones'])
            if ev == 'no' or (ev == 'si_no_cumple' and not fallo):
                evidencia, ya_evidencia = [], []  # no la pide: si llegó, no se guarda
            cuantas = len(evidencia) + len(ya_evidencia)
            if (ev == 'obligatoria' or (ev == 'si_no_cumple' and fallo)) and not cuantas:
                faltan.append(f'«{nombre}»: falta la foto de evidencia')
            if cuantas > MAX_ARCHIVOS_POR_PREGUNTA or not (all(_es_imagen(a) for a in evidencia) and all(_es_imagen_ya(m) for m in ya_evidencia)):
                faltan.append(f'«{nombre}»: la evidencia debe ser una o varias fotos')
        pts, mx = _puntos(it, guardado)
        total += pts
        total_max += mx
        if it['tipo'] == 'sucursal' and guardado and not sucursal_respondida:
            sucursal_respondida = guardado
        if reglas.dispara_seguimiento(it, guardado):
            disparadas.append(it['id'])
        nota = _texto_largo(notas.get(it['id']), 1000) if isinstance(notas.get(it['id']), str) else ''
        ya = ya_propios + ya_evidencia
        entries.append({'id': it['id'], 'titulo': nombre, 'seccion': it['_seccion'] or it['_paso'], 'paso': it['_paso'],
                        'tipo': it['tipo'], 'valor': guardado, 'respuesta': mostrar, 'score': pts, 'max': mx, 'note': nota,
                        'photos': [m for m in ya if _es_imagen_ya(m)], 'archivos': [m for m in ya if not _es_imagen_ya(m)],
                        '_propios': propios, '_evidencia': evidencia, '_de_filas': de_filas})
    if faltan:
        raise HTTPException(status_code=400, detail='Revisa: ' + '; '.join(faltan[:6]))
    return {'entries': entries, 'total': total, 'total_max': total_max, 'sucursal': sucursal_respondida, 'disparadas': disparadas}


async def _subir_archivos(entries: list, fid: str, resp_id: str):
    for e in entries:
        lote = [(a, 'propio', None) for a in e.pop('_propios')] + [(a, 'evidencia', None) for a in e.pop('_evidencia')]
        lote += [(a, 'propio', clave) for clave, lista in e.pop('_de_filas').items() for a in lista]
        for a, como, clave in lote:
            contenido = await a.read()
            if not contenido:
                continue
            ctype = a.content_type or 'application/octet-stream'
            imagen = ctype.startswith('image/')
            if len(contenido) > (MAX_FOTO if imagen else MAX_ARCHIVO):
                raise HTTPException(status_code=400, detail=f'Un archivo de «{e["titulo"]}» es demasiado grande')
            aid = new_id()
            ext = (a.filename or '').rsplit('.', 1)[-1][:8].lower() if '.' in (a.filename or '') else ('png' if 'png' in ctype else 'jpg')
            path = f'{storage.APP_NAME}/formularios-custom/{fid}/{resp_id}/{aid}.{ext}'
            try:
                await storage.put_object(path, contenido, ctype)
            except Exception as ex:
                logger.error(f'subida falló: {ex}')
                raise HTTPException(status_code=502, detail='No se pudo subir un archivo')
            meta = {'id': aid, 'path': path, 'content_type': ctype, 'nombre': _txt(a.filename, 120), 'como': como, **({'dueno': clave} if clave else {})}
            (e['photos'] if imagen else e['archivos']).append(meta)


@router.post('/{fid}/respuestas')
async def responder(fid: str, data: str = Form(...), archivos: List[UploadFile] = File(default=[]),
                    dueno: List[str] = Form(default=[]), user=Depends(get_current_user)):
    """Entrega una respuesta: lo que la persona tenga asignado o en curso (con
    lo que ya subió al ir llenando), o uno nuevo en los disponibles. Lo que
    vuelve devuelto se corrige sobre la misma respuesta, en su misma versión.
    `data`: {"respuestas": {id_pregunta: valor}, "notas": {...}, "asignacion_id": id}."""
    f = await _form(fid)
    payload, respuestas, notas, por_dueno = _leer_envio(data, archivos, dueno)
    a = await fasig.para_trabajar(payload['asignacion_id'], user) if payload.get('asignacion_id') else await fasig.abierta_de(f, user)
    if a and a['form_id'] != fid:
        raise HTTPException(status_code=400, detail='Esta asignación es de otro formulario')
    if not a:
        if f.get('estado') != 'publicado' or not fa.puede_llenar(user, f):
            raise HTTPException(status_code=403, detail='Este formulario no está disponible para responder')
        if fasig.asignacion_de(f)['modo'] != 'disponible' and not fa.gestiona(user, f):
            raise HTTPException(status_code=409, detail='Ya entregaste este formulario')
    elif f.get('estado') != 'publicado' and a['estado'] != 'devuelto':
        raise HTTPException(status_code=403, detail='Este formulario no está disponible para responder')
    cont = await fasig.contenido_de(f, a)
    previos = ((a or {}).get('avance') or {}).get('archivos') or {}
    armado = await _armar_entradas(cont, respuestas, notas, por_dueno, previos, rfc._depto_form(f))
    anterior = await db.custom_form_responses.find_one({'id': a['respuesta_id']}, {'_id': 0}) if a and a.get('respuesta_id') else None
    resp_id = anterior['id'] if anterior else new_id()
    await _subir_archivos(armado['entries'], fid, resp_id)
    total, total_max = armado['total'], armado['total_max']
    ahora = now_iso()
    doc = {
        'id': resp_id, 'form_id': fid, 'form_titulo': f['titulo'], 'form_kind': 'generic', 'esquema': ESQUEMA,
        'version_id': (anterior or f).get('version_id'), 'version': (anterior or f).get('version'),
        'respondent_id': user['id'], 'respondent_name': user['name'], 'respondent_avatar': user.get('avatar_url'),
        'respondent_sucursal': user.get('sucursal') or '', 'respondent_position': user.get('position') or '',
        'sucursal': armado['sucursal'] or (a or {}).get('sucursal'), 'categoria': None, 'tarea_id': None, 'general_photos': [],
        'entries': armado['entries'], 'total_score': total, 'total_max': total_max,
        'percent': round(total / total_max * 100) if total_max else None, 'created_at': (anterior or {}).get('created_at') or ahora,
    }
    a = a or await fasig.crear_libre(f, user)
    doc['asignacion_id'] = a['id']
    envio = await fasig.al_enviar(f, a, doc, user, bool(anterior))
    if not envio:
        raise HTTPException(status_code=409, detail='Alguien más de tu tienda ya lo entregó')
    doc.update({'estado_entrega': envio['estado'], 'supervisores_ids': [s['id'] for s in envio['supervisores']],
                'revision_estado': 'pendiente' if envio['estado'] == 'revision' else None})
    if anterior:
        doc.update({'corregida_at': ahora, 'seguimiento_id': anterior.get('seguimiento_id'), 'modificaciones': anterior.get('modificaciones') or []})
        await db.custom_form_responses.replace_one({'id': resp_id}, doc)
    else:
        await db.custom_form_responses.insert_one(doc)
    doc.pop('_id', None)
    if armado['disparadas'] and not await _seguimiento_abierto(anterior):
        try:
            t = await _abrir_seguimiento(f, cont, doc, armado['disparadas'], user, envio['supervisores'])
            doc['seguimiento'] = {'id': t['id'], 'numero': t['numero']}
            await db.custom_form_responses.update_one({'id': resp_id}, {'$set': {'seguimiento_id': t['id']}})
        except Exception as ex:  # la respuesta ya quedó guardada: el seguimiento no la tumba
            logger.error(f'no se pudo abrir el seguimiento de {resp_id}: {ex}')
    entregada = {**a, 'enviada_por': {'id': user['id'], 'name': user['name']}, 'supervisores': envio['supervisores']}
    if not anterior:
        await fasig.disparar('entregado', f, entregada, doc)
    await fasig.disparar('respuesta', f, entregada, doc)
    return serialize_doc(doc)


async def _seguimiento_abierto(anterior: Optional[dict]) -> bool:
    """Al corregir lo devuelto no se abre otro si el de esa respuesta sigue en curso."""
    if not (anterior or {}).get('seguimiento_id'):
        return False
    return bool(await db.tickets.find_one({'id': anterior['seguimiento_id'], 'estado': {'$in': ['abierto', 'corregido']}}, {'_id': 1}))


async def _respuesta_y_version(fid: str, rid: str, user) -> tuple:
    f = await _form(fid)
    _exigir(user, f, 'modificar')
    row = await db.custom_form_responses.find_one({'id': rid, 'form_id': fid}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Respuesta no encontrada')
    v = await db.custom_form_versiones.find_one({'id': row.get('version_id')}, {'_id': 0, 'contenido': 1})
    if row.get('esquema') != ESQUEMA or not v:
        raise HTTPException(status_code=409, detail='Esta respuesta es del formato de antes: no se puede modificar')
    return f, row, v['contenido']


@router.get('/{fid}/respuestas/{rid}/para-modificar')
async def para_modificar(fid: str, rid: str, user=Depends(get_current_user)):
    f, row, contenido = await _respuesta_y_version(fid, rid, user)
    return serialize_doc({'form': {'id': fid, 'titulo': f['titulo'], 'descripcion': f.get('descripcion') or '', 'version': row.get('version'),
                                   'version_id': row.get('version_id'), 'esquema': ESQUEMA, 'contenido': contenido},
                          'inicial': fasig.avance_desde_respuesta(row),
                          'respuesta': {k: row.get(k) for k in ('id', 'respondent_name', 'created_at', 'modificaciones')}})


@router.post('/{fid}/respuestas/{rid}/modificar')
async def modificar_respuesta(fid: str, rid: str, data: str = Form(...), archivos: List[UploadFile] = File(default=[]),
                              dueno: List[str] = Form(default=[]), user=Depends(get_current_user)):
    """Corrige una respuesta ya entregada, en su versión. Queda el registro de
    quién y cuándo; sus seguimientos no se tocan. `conservar` ({dueño: [ids]})
    dice qué archivos se quedan."""
    f, row, contenido = await _respuesta_y_version(fid, rid, user)
    payload, respuestas, notas, por_dueno = _leer_envio(data, archivos, dueno)
    conservar = payload.get('conservar') if isinstance(payload.get('conservar'), dict) else {}
    previos = {d: [m for m in lista if m['id'] in (conservar.get(d) or [])] for d, lista in fasig.avance_desde_respuesta(row)['archivos'].items()}
    armado = await _armar_entradas(contenido, respuestas, notas, por_dueno, previos, rfc._depto_form(f))
    await _subir_archivos(armado['entries'], fid, rid)
    total, total_max = armado['total'], armado['total_max']
    await db.custom_form_responses.update_one({'id': rid}, {
        '$set': {'entries': armado['entries'], 'total_score': total, 'total_max': total_max,
                 'percent': round(total / total_max * 100) if total_max else None, 'sucursal': armado['sucursal'] or row.get('sucursal')},
        '$push': {'modificaciones': {'por': {'id': user['id'], 'name': user['name']}, 'at': now_iso()}}})
    return {'ok': True}


async def _revisores_seguimiento(f: dict, cfg: dict, quien: dict) -> list:
    """Quién revisa y cierra: lo que diga el formulario; si eso deja a nadie
    (o solo a quien llenó), su jefe según el organigrama, y si no, quien lo creó."""
    if cfg.get('revisa') == 'persona' and cfg.get('persona_id'):
        ids = [cfg['persona_id']]
    elif cfg.get('revisa') == 'jefe':
        ids = await mando.responsables_cercanos(quien)
    else:
        ids = [f['creator_id']]
    ids = [i for i in ids if i and i != quien['id']]
    if not ids:
        ids = [i for i in await mando.responsables_cercanos(quien) if i != quien['id']] or \
            ([f['creator_id']] if f['creator_id'] != quien['id'] else [])
    gente = await db.users.find({'id': {'$in': ids}}, {'_id': 0, 'id': 1, 'name': 1}).to_list(50)
    return [{'id': u['id'], 'name': u['name']} for u in gente]


async def _abrir_seguimiento(f: dict, cont: dict, resp: dict, disparadas: list, quien: dict, supervisores: list) -> dict:
    """Uno por respuesta, con todas las preguntas que lo pidieron como líneas.
    Si el formulario se supervisa, lo revisa su supervisor; no espera a que apruebe."""
    cfg = cont.get('seguimientos') or reglas.SEGUIMIENTOS_BASE
    por_id = {e['id']: e for e in resp['entries']}
    lineas = []
    for iid in disparadas:
        e = por_id[iid]
        lineas.append({'item_id': iid, 'titulo': e['titulo'],
                       'tipo': ', '.join(e['respuesta']) if isinstance(e['respuesta'], list) else str(e['respuesta']),
                       'comentario': e.get('note') or '', 'evidencia': list(e.get('photos') or [])})
    revisores = supervisores or await _revisores_seguimiento(f, cfg, quien)
    return await tickets.crear_ticket_formulario(f, resp, lineas, revisores, cfg.get('plazo_horas') or 48)


@router.get('/{fid}/respuestas/{rid}/archivo/{aid}')
async def descargar_archivo(fid: str, rid: str, aid: str, user=Depends(get_current_user)):
    """Archivos adjuntos que no son imagen (las imágenes van por el endpoint de fotos)."""
    f = await _form(fid)
    row = await db.custom_form_responses.find_one({'id': rid, 'form_id': fid}, {'_id': 0})
    if not row:
        raise HTTPException(status_code=404, detail='Respuesta no encontrada')
    if not rfc._ve_respuesta(user, f, row):
        raise HTTPException(status_code=403, detail='No tienes acceso a esta respuesta')
    meta = next((a for e in row.get('entries', []) for a in e.get('archivos', []) if a['id'] == aid), None)
    if not meta:
        raise HTTPException(status_code=404, detail='Archivo no encontrado')
    content, ctype = await storage.get_object(meta['path'])
    nombre = (meta.get('nombre') or 'archivo').replace('"', '')
    return Response(content=content, media_type=meta.get('content_type') or ctype,
                    headers={'Content-Disposition': f'attachment; filename="{nombre}"'})


async def ensure_indexes():
    await db.custom_form_versiones.create_index('id', unique=True)
    await db.custom_form_versiones.create_index([('form_id', 1), ('numero', 1)], unique=True)
