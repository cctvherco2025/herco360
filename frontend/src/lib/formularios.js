// Constructor de formularios (formato 2): tipos de pregunta y utilidades
// compartidas por el constructor, la vista previa y el llenado. Los mismos
// tipos viven en el servidor (backend/formularios_v2.py, TIPOS): agregar uno
// es agregarlo en los dos lados.

// tipo -> [nombre, abreviatura del ícono]
export const TIPOS = {
  corto: ['Texto corto', 'Aa'], largo: ['Texto largo', '¶'], numero: ['Número', '123'], correo: ['Correo', '@'],
  telefono: ['Teléfono', 'Tel'], unica: ['Selección única', '1'], multiple: ['Selección múltiple', '1+'],
  lista: ['Lista desplegable', '▾'], sino: ['Sí / No', 'S/N'], cumple: ['Cumple / No cumple / N/A', 'C'],
  escala: ['Escala', '1–10'], estrellas: ['Estrellas', '★'], fecha: ['Fecha', 'Fe'], hora: ['Hora', 'Hr'],
  fechahora: ['Fecha y hora', 'F+H'], foto: ['Fotografía', 'Fo'], camara: ['Cámara directa', 'Ca'],
  archivo: ['Archivo adjunto', 'Ar'], firma: ['Firma digital', 'Fi'], encabezado: ['Encabezado', 'H'],
  separador: ['Separador', '—'], imagen: ['Imagen informativa', 'Im'], instrucciones: ['Instrucciones', 'i'],
  colaborador: ['Colaborador', 'Co'], sucursal: ['Sucursal', 'Su'], caja: ['Área', 'Ár'],
  moneda: ['Moneda', 'L'], porcentaje: ['Porcentaje', '%'], direccion: ['Dirección', 'Dir'], ubicacion: ['Ubicación GPS', 'GPS'],
  articulo: ['Artículo', 'Art'], matriz: ['Matriz de evaluación', 'Mz'], calculado: ['Campo calculado', 'fx'],
  tabla: ['Tabla editable', 'Tb'], repetible: ['Grupo repetible', '↻'],
};

export const CATEGORIAS = [
  ['Básicos', ['corto', 'largo', 'numero', 'moneda', 'porcentaje', 'correo', 'telefono', 'direccion']],
  ['Opciones', ['unica', 'multiple', 'lista', 'articulo', 'sino', 'cumple', 'escala', 'estrellas', 'matriz']],
  ['Fecha y hora', ['fecha', 'hora', 'fechahora']],
  ['Evidencias', ['foto', 'camara', 'archivo', 'firma', 'ubicacion']],
  ['Estructura', ['encabezado', 'separador', 'imagen', 'instrucciones']],
  ['De la empresa', ['colaborador', 'sucursal', 'caja']],
  ['Avanzados', ['calculado', 'tabla', 'repetible']],
];

// Palabras extra para el buscador de componentes.
const ALIAS = {
  foto: 'imagen evidencia', camara: 'foto', archivo: 'documento pdf adjunto', firma: 'firmar',
  unica: 'opcion radio', multiple: 'casillas checklist', lista: 'select desplegable', cumple: 'checklist inspeccion',
  escala: 'calificacion nps', estrellas: 'calificacion', colaborador: 'persona usuario empleado', sucursal: 'tienda',
  caja: 'organigrama area departamento', encabezado: 'titulo', instrucciones: 'texto informativo',
  moneda: 'dinero precio lempiras', porcentaje: 'por ciento', direccion: 'domicilio', ubicacion: 'gps mapa coordenadas lugar',
  articulo: 'producto buscador lista busqueda', matriz: 'cuadricula filas columnas calificacion', calculado: 'formula total suma operacion',
  tabla: 'filas columnas', repetible: 'repetir agregar otro bloque',
};

export const CON_OPCIONES = new Set(['unica', 'multiple', 'lista', 'sino', 'cumple']);
export const OPCIONES_FIJAS = new Set(['sino', 'cumple']);
export const PUNTUABLES = new Set([...CON_OPCIONES, 'escala', 'estrellas', 'matriz']);
export const SIN_RESPUESTA = new Set(['encabezado', 'separador', 'imagen', 'instrucciones']);
export const DE_ARCHIVOS = new Set(['foto', 'camara', 'archivo', 'firma']);
export const CON_VALIDACION = new Set(['corto', 'largo', 'numero', 'moneda', 'porcentaje']);
export const EN_FILAS = new Set(['tabla', 'repetible']);
export const SIN_EVIDENCIA = new Set(['tabla', 'repetible', 'calculado']);
export const SIN_PREDETERMINADO = new Set(['tabla', 'repetible', 'calculado', 'matriz', 'ubicacion', 'direccion', 'articulo']);

// Mismos valores que backend/formularios_v2.py y formularios_reglas.py
export const OPERACIONES = [['suma', 'Suma', '+'], ['resta', 'Resta', '−'], ['multiplicacion', 'Multiplicación', '×'], ['division', 'División', '÷'], ['promedio', 'Promedio', ', ']];
export const FORMATOS_CALCULO = [['numero', 'Número'], ['moneda', 'Moneda'], ['porcentaje', 'Porcentaje']];
export const CAMPOS_FILA = {
  tabla: [['texto', 'Texto'], ['numero', 'Número'], ['lista', 'Lista'], ['fecha', 'Fecha']],
  repetible: [['texto', 'Texto corto'], ['largo', 'Texto largo'], ['numero', 'Número'], ['lista', 'Lista'], ['fecha', 'Fecha'], ['foto', 'Foto']],
};

export const EVIDENCIAS = [['no', 'No'], ['opcional', 'Opcional'], ['obligatoria', 'Obligatoria'], ['si_no_cumple', 'Solo si no cumple']];

export const PESTANAS = [
  ['contenido', 'Contenido', ''], ['diseno', 'Diseño', ''], ['navegacion', 'Navegación', ''],
  ['asignaciones', 'Asignaciones', ''], ['supervision', 'Supervisión', ''], ['permisos', 'Permisos', ''],
  ['automatizaciones', 'Automatizaciones', ''], ['resultados', 'Resultados', ''],
];

// Mismas frecuencias que backend/mantenimiento_motor.py, más «una sola vez».
export const FRECUENCIAS = [
  ['una', 'Una sola vez'], ['diaria', 'Diaria'], ['semanal', 'Semanal'], ['quincenal', 'Cada 2 semanas'], ['mensual', 'Mensual'],
  ['bimestral', 'Cada 2 meses'], ['trimestral', 'Trimestral'], ['semestral', 'Semestral'], ['anual', 'Anual'], ['cada_n_dias', 'Cada N días'],
];

// Mismos eventos y destinos que backend/formularios_automatizaciones.py
export const EVENTOS_REGLA = [
  ['entregado', 'Se entrega', 'Cuando se entregue'], ['respuesta', 'Se detecta una respuesta', 'Cuando se detecte que'],
  ['aprobado', 'Se aprueba', 'Cuando se apruebe'], ['devuelto', 'Se devuelve', 'Cuando se devuelva'], ['vencido', 'Vence sin entregarse', 'Cuando venza sin entregarse'],
];
export const DESTINOS_REGLA = [['quien_lleno', 'Quien lo llena'], ['supervisor', 'Su supervisor o jefe'], ['creador', 'Quien creó el formulario']];

export const MODOS_ASIGNACION = [
  ['persona', 'Cada persona llena el suyo', 'A cada quien le aparece como pendiente, con su propio registro.'],
  ['sucursal', 'Uno por sucursal', 'Una entrega por tienda: lo llena cualquiera de esa tienda y a los demás les desaparece.'],
  ['disponible', 'Disponible', 'Sin pendientes ni fecha: lo llena quien lo necesite, las veces que quiera. Sirve para solicitudes.'],
];

export const QUIEN_SUPERVISA = [
  ['jefe', 'El jefe de quien llenó', 'Según Gente a cargo. Cada quien lo revisa su propio jefe.'],
  ['tienda', 'El gerente de la tienda contestada', 'Si no contestan una tienda, sube al jefe de quien llenó.'],
  ['personas', 'Personas fijas', 'Una o varias: basta con que una apruebe.'],
];

// Mismas acciones que backend/formularios_acceso.py, agrupadas como en Perfiles.
export const GRUPOS_PERMISOS = [
  ['Ver', [['resultados', 'Ver respuestas y resultados', 'Todas las respuestas, no solo las suyas'], ['exportar', 'Exportar', 'PDF de cada respuesta y, en la etapa 5, Excel']]],
  ['Hacer', [['modificar', 'Modificar respuestas enviadas', 'Corregir lo que contestó otra persona; queda registrado']]],
  ['Administrar', [['editar', 'Editar el formulario', 'Contenido, diseño y navegación'], ['publicar', 'Publicar y despublicar', ''],
    ['asignar', 'Administrar asignaciones', 'A quién le toca, fechas y supervisión'], ['eliminar', 'Eliminar', 'Respuestas y el formulario']]],
];

// Estado de una entrega: [nombre, clases del chip, color del número en el conteo]
export const ENTREGAS = {
  pendiente: ['Pendiente', 'bg-[#e8eef7] text-[#1e395e] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6]', 'text-[#1e395e] dark:text-[#3cbef6]'],
  proceso: ['En proceso', 'bg-[#e6f5fb] text-[#0a5b85] dark:bg-[rgba(0,165,223,0.18)] dark:text-[#7dd3fc]', 'text-[#0a5b85] dark:text-[#7dd3fc]'],
  revision: ['En revisión', 'bg-[#f1ecfb] text-[#5b3aa3] dark:bg-[rgba(139,92,246,0.2)] dark:text-[#c4b5fd]', 'text-[#5b3aa3] dark:text-[#c4b5fd]'],
  devuelto: ['Devuelto', 'bg-[#fff3e6] text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b]', 'text-[#8a4b0f] dark:text-[#f5b56b]'],
  completado: ['Completado', 'bg-[#e7f6ee] text-[#16794a] dark:bg-[rgba(22,163,74,0.18)] dark:text-[#4ade80]', 'text-[#16794a] dark:text-[#4ade80]'],
  vencido: ['Vencido', 'bg-[#fdecea] text-[#b42318] dark:bg-[rgba(220,38,38,0.18)] dark:text-[#f87171]', 'text-[#b42318] dark:text-[#f87171]'],
  disponible: ['Disponible', 'bg-muted text-muted-foreground', 'text-muted-foreground'],
};

// Las fechas límite son hora de la empresa, en texto: 'AAAA-MM-DDTHH:MM'.
export const ahoraLocal = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function cuandoVence(vence) {
  if (!vence) return { texto: 'sin fecha límite', pronto: false, pasada: false };
  const ahora = ahoraLocal();
  const dias = Math.round((new Date(`${vence.slice(0, 10)}T12:00`) - new Date(`${ahora.slice(0, 10)}T12:00`)) / 86400000);
  const dia = dias === 0 ? 'hoy' : dias === 1 ? 'mañana' : dias === -1 ? 'ayer' : `el ${vence.slice(8, 10)}/${vence.slice(5, 7)}`;
  return { texto: `${dia} a las ${vence.slice(11, 16)}`, pronto: dias <= 1, pasada: vence < ahora };
}

// 'AAAA-MM-DDTHH:MM' -> «lun 03/11»
export function diaCorto(fecha) {
  if (!fecha) return '';
  const dia = new Date(`${fecha.slice(0, 10)}T12:00`).toLocaleDateString('es-HN', { weekday: 'short' }).replace('.', '');
  return `${dia} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

// Un momento guardado por el servidor (ISO con zona): «hoy 8:40», «28/10 16:40».
export function cuando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hora = d.toLocaleTimeString('es-HN', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `hoy ${hora}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hora}`;
}

export const ESTADOS = {
  borrador: ['Borrador', 'bg-[#fff3e6] text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b]'],
  publicado: ['Publicado', 'bg-[#e7f6ee] text-[#16794a] dark:bg-[rgba(22,163,74,0.18)] dark:text-[#4ade80]'],
  despublicado: ['Despublicado', 'bg-muted text-muted-foreground'],
};

export const uid = () => (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export function buscarTipos(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return CATEGORIAS.map(([nombre, tipos]) => [nombre, tipos.filter((k) => !t
    || `${TIPOS[k][0]} ${ALIAS[k] || ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(t))])
    .filter(([, tipos]) => tipos.length);
}

const opcion = (label, pts = null, extra = {}) => ({ id: uid(), label, pts, na: false, falla: false, ...extra });

export function opcionesDe(tipo) {
  if (tipo === 'sino') return [opcion('Sí', 1), opcion('No', 0)];
  if (tipo === 'cumple') return [opcion('Cumple', 1), opcion('No cumple', 0, { falla: true }), opcion('No aplica', null, { na: true })];
  return [opcion('Opción 1'), opcion('Opción 2')];
}

export function nuevaPregunta(tipo) {
  const it = { id: uid(), tipo, titulo: '', descripcion: '', ayuda: '', obligatoria: false };
  if (CON_OPCIONES.has(tipo)) it.opciones = opcionesDe(tipo);
  if (PUNTUABLES.has(tipo)) it.puntaje = false;
  if (!SIN_RESPUESTA.has(tipo) && !DE_ARCHIVOS.has(tipo) && !SIN_EVIDENCIA.has(tipo)) it.evidencia = 'no';
  if (CON_VALIDACION.has(tipo)) it.validacion = { min: null, max: null, mensaje: '' };
  if (tipo === 'escala') it.config = { max: 10 };
  if (tipo === 'estrellas') it.config = { max: 5 };
  if (tipo === 'instrucciones') it.config = { texto: '' };
  if (tipo === 'imagen') it.config = { imagen_id: null };
  if (['foto', 'camara', 'archivo'].includes(tipo)) it.config = { varios: false };
  if (tipo === 'moneda') it.config = { simbolo: 'L' };
  if (tipo === 'articulo') it.config = { lista: [] };
  if (tipo === 'matriz') {
    it.config = {
      filas: [{ id: uid(), label: 'Punto 1' }, { id: uid(), label: 'Punto 2' }],
      columnas: [{ id: uid(), label: 'Bien', pts: 2 }, { id: uid(), label: 'Regular', pts: 1 }, { id: uid(), label: 'Mal', pts: 0 }],
    };
  }
  if (tipo === 'calculado') it.config = { operacion: 'suma', preguntas: [], formato: 'numero', simbolo: 'L' };
  if (EN_FILAS.has(tipo)) it.config = { columnas: [nuevaColumna(tipo === 'tabla' ? 'Columna 1' : 'Campo 1')], max_filas: 20 };
  if (tipo === 'repetible') it.config.boton = 'Agregar otro';
  return it;
}

export const nuevaColumna = (nombre) => ({ id: uid(), nombre, tipo: 'texto', obligatoria: false });

// Al cambiar el tipo se conserva lo que sirva (texto, obligatoria, opciones si las dos llevan).
export function cambiarTipo(it, tipo) {
  const base = nuevaPregunta(tipo);
  const out = { ...base, id: it.id, titulo: it.titulo, descripcion: it.descripcion, ayuda: it.ayuda };
  if (!SIN_RESPUESTA.has(tipo)) out.obligatoria = !!it.obligatoria;
  if (CON_OPCIONES.has(tipo) && !OPCIONES_FIJAS.has(tipo) && CON_OPCIONES.has(it.tipo) && !OPCIONES_FIJAS.has(it.tipo)) out.opciones = it.opciones;
  if (PUNTUABLES.has(tipo) && PUNTUABLES.has(it.tipo)) out.puntaje = !!it.puntaje;
  if (out.evidencia && it.evidencia && (it.evidencia !== 'si_no_cumple' || tipo === 'cumple')) out.evidencia = it.evidencia;
  // su propia condición sigue igual; el seguimiento solo si sigue siendo de la misma familia
  if (it.condicion) out.condicion = it.condicion;
  if (it.apariencia?.ancho) out.apariencia = { ...(out.apariencia || {}), ancho: it.apariencia.ancho };
  if (it.seguimiento && FAMILIA[tipo] === FAMILIA[it.tipo] && !it.seguimiento.valores) out.seguimiento = it.seguimiento;
  return out;
}

export const nombreDe = (it) => it.titulo || TIPOS[it.tipo]?.[0] || 'Pregunta';

// Preguntas en orden, cada una con su paso y sección.
export function preguntasDe(contenido) {
  const out = [];
  (contenido?.pasos || []).forEach((p) => (p.secciones || []).forEach((s) => (s.items || []).forEach((it) => out.push({ it, paso: p, seccion: s }))));
  return out;
}

export function maximoDe(it) {
  if (!it.puntaje) return 0;
  if (it.tipo === 'escala' || it.tipo === 'estrellas') return it.config?.max || 0;
  if (it.tipo === 'matriz') {
    const cols = (it.config?.columnas || []).filter((c) => c.pts !== null && c.pts !== '' && c.pts !== undefined).map((c) => Number(c.pts) || 0);
    return cols.length ? Math.max(...cols) * (it.config?.filas || []).length : 0;
  }
  const pts = (it.opciones || []).filter((o) => !o.na && o.pts !== null && o.pts !== '' && o.pts !== undefined).map((o) => Number(o.pts) || 0);
  if (!pts.length) return 0;
  return it.tipo === 'multiple' ? pts.filter((p) => p > 0).reduce((a, b) => a + b, 0) : Math.max(...pts);
}

// Texto corto bajo el título de la pregunta, en el lienzo.
export function resumenDe(it) {
  const partes = [TIPOS[it.tipo]?.[0]];
  if (it.tipo === 'escala' || it.tipo === 'estrellas') partes[0] = `${partes[0]} 1 a ${it.config?.max}`;
  if (it.puntaje && maximoDe(it)) partes.push(`${maximoDe(it)} pts`);
  if (it.evidencia === 'obligatoria') partes.push('pide foto');
  if (it.evidencia === 'opcional') partes.push('foto opcional');
  if (it.evidencia === 'si_no_cumple') partes.push('foto si no cumple');
  if (it.config?.varios) partes.push('varios archivos');
  if (it.tipo === 'matriz') partes.push(`${it.config?.filas?.length || 0} filas`);
  if (it.tipo === 'articulo') partes.push(`${it.config?.lista?.length || 0} artículos`);
  if (it.tipo === 'tabla') partes.push(`${it.config?.columnas?.length || 0} columnas`);
  if (it.tipo === 'repetible') partes.push(`${it.config?.columnas?.length || 0} campos`);
  if (it.tipo === 'calculado') partes.push(OPERACIONES.find(([k]) => k === it.config?.operacion)?.[1]);
  return partes.filter(Boolean).join(' · ');
}

const sinNada = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
export const claveFoto = (itemId, filaId, campoId) => `${itemId}:${filaId}:${campoId}`;

// Las filas que traen algo (una vacía no cuenta). `archivos`: dueño -> lista.
export function filasConDatos(it, valor, archivos = {}) {
  return (Array.isArray(valor) ? valor : []).filter((f) => (it.config?.columnas || []).some((c) => (c.tipo === 'foto'
    ? (archivos[claveFoto(it.id, f.id, c.id)] || []).length > 0
    : !sinNada(typeof f.valores?.[c.id] === 'string' ? f.valores[c.id].trim() : f.valores?.[c.id]))));
}

// Validación en pantalla (el servidor vuelve a validar al enviar). `todos`:
// los archivos de todo el formulario, por dueño (las fotos de los grupos repetibles).
export function errorDe(it, valor, archivos, evidencia, todos) {
  const vacio = sinNada(valor);
  if (DE_ARCHIVOS.has(it.tipo)) {
    if (it.obligatoria && !(archivos || []).length) return it.tipo === 'firma' ? 'Falta la firma' : 'Falta el archivo o la foto';
    return null;
  }
  if (EN_FILAS.has(it.tipo)) {
    const filas = filasConDatos(it, valor, todos);
    if (it.obligatoria && !filas.length) return 'Agrega al menos una fila';
    const fila = filas.findIndex((f) => (it.config?.columnas || []).some((c) => c.obligatoria && (c.tipo === 'foto' ? !(todos?.[claveFoto(it.id, f.id, c.id)] || []).length : sinNada(f.valores?.[c.id]))));
    return fila >= 0 ? `A la fila ${fila + 1} le falta un dato obligatorio` : null;
  }
  if (it.tipo === 'calculado') return null;
  if (it.obligatoria && vacio) return it.tipo === 'ubicacion' ? 'Falta guardar la ubicación' : 'Esta pregunta es obligatoria';
  if (!vacio) {
    const v = it.validacion || {};
    if (it.tipo === 'numero' || it.tipo === 'moneda' || it.tipo === 'porcentaje') {
      const n = Number(valor);
      const hay = (x) => x !== null && x !== undefined && x !== '';
      const min = it.tipo === 'porcentaje' && !hay(v.min) ? 0 : v.min;
      const max = it.tipo === 'porcentaje' && !hay(v.max) ? 100 : v.max;
      if (Number.isNaN(n)) return 'Escribe un número';
      if ((hay(min) && n < Number(min)) || (hay(max) && n > Number(max))) {
        return v.mensaje || `Escribe un número entre ${min ?? '…'} y ${max ?? '…'}`;
      }
    }
    if (it.tipo === 'matriz' && it.obligatoria && (it.config?.filas || []).some((f) => !valor[f.id])) return 'Contesta todas las filas';
    if (it.tipo === 'direccion' && it.obligatoria && !(valor.direccion || '').trim()) return 'Escribe la dirección';
    if (it.tipo === 'corto' || it.tipo === 'largo') {
      const largo = String(valor).trim().length;
      if (v.min && largo < Number(v.min)) return v.mensaje || `Escribe al menos ${v.min} caracteres`;
      if (v.max && largo > Number(v.max)) return v.mensaje || `Escribe máximo ${v.max} caracteres`;
    }
    if (it.tipo === 'correo' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(valor).trim())) return 'Escribe un correo válido';
    if (it.tipo === 'telefono' && !/^[0-9+()\-\s]{7,20}$/.test(String(valor).trim())) return 'Escribe un teléfono válido';
  }
  const fallo = it.tipo === 'cumple' && (it.opciones || []).some((o) => o.id === valor && o.falla);
  if ((it.evidencia === 'obligatoria' || (it.evidencia === 'si_no_cumple' && fallo)) && !(evidencia || []).length) {
    return 'Falta la foto de evidencia';
  }
  return null;
}

export const pideEvidencia = (it, valor) => it.evidencia === 'obligatoria' || it.evidencia === 'opcional'
  || (it.evidencia === 'si_no_cumple' && (it.opciones || []).some((o) => o.id === valor && o.falla));

// Mismo formato que el servidor (formularios_reglas.py): 1,250.00
const conComas = (n, decimales) => Number(n).toLocaleString('en-US', { minimumFractionDigits: decimales, maximumFractionDigits: 2 });
export const dinero = (n, simbolo = 'L') => `${simbolo} ${conComas(n, 2)}`;
export const cifra = (n) => conComas(n, 0);

export function textoCalculado(it, n) {
  if (n === null || n === undefined) return '';
  if (it.config?.formato === 'moneda') return dinero(n, it.config.simbolo);
  return it.config?.formato === 'porcentaje' ? `${cifra(n)} %` : cifra(n);
}

export const urlMapa = (u) => `https://www.google.com/maps?q=${u.lat},${u.lng}`;

// Mismo cálculo que el servidor: lo oculto o sin contestar no cuenta; suma y
// promedio siguen con lo que haya, resta necesita la primera y multiplicar o
// dividir, todas. La pantalla solo lo muestra: el valor lo saca el servidor.
export function calcular(cfg, efectivos) {
  const nums = (cfg?.preguntas || []).map((id) => {
    const v = efectivos[id];
    return v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  });
  const hay = nums.filter((n) => n !== null);
  if (!hay.length) return null;
  const sumar = (l) => l.reduce((a, b) => a + b, 0);
  let r;
  if (cfg.operacion === 'suma') r = sumar(hay);
  else if (cfg.operacion === 'promedio') r = sumar(hay) / hay.length;
  else if (cfg.operacion === 'resta') {
    if (nums[0] === null) return null;
    r = nums[0] - sumar(hay.slice(1));
  } else if (nums.includes(null)) return null;
  else if (cfg.operacion === 'multiplicacion') r = nums.reduce((a, b) => a * b, 1);
  else {
    if (nums.slice(1).includes(0)) return null;
    r = nums.slice(1).reduce((a, b) => a / b, nums[0]);
  }
  if (!Number.isFinite(r)) return null;
  const n = Math.floor(Math.abs(r) * 100 + 0.5) / 100;
  return r < 0 ? -n : n;
}

export function haceCuanto(iso, ahora = Date.now()) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (s < 10) return 'hace un momento';
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  return new Date(iso).toLocaleString('es-HN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ── Etapa 2: diseño, navegación, condiciones y seguimientos ──────────────
   La misma lógica vive en el servidor (backend/formularios_reglas.py). */

export const DISENO_BASE = {
  principal: '#1e395e', acento: '#00a5df', fondo: '#f4f6fa', fondo_imagen_id: null, fuente: 'herco', tam: 'normal',
  esquinas: 'suaves', sombras: 'suave', espaciado: 'normal', alineacion: 'izquierda', columnas: 1, tarjetas: true,
  logo: 'herco', logo_imagen_id: null, portada_imagen_id: null,
  bienvenida: { activa: false, titulo: '', texto: '', boton: 'Empezar' },
  final: { mensaje: '¡Gracias! Tu respuesta quedó registrada', puntaje: true },
};
export const NAVEGACION_BASE = { estilo: 'paso', progreso: 'barra', siguiente: 'Siguiente', anterior: 'Anterior', enviar: 'Enviar', volver: true, resumen: false };
export const SEGUIMIENTOS_BASE = { revisa: 'creador', persona_id: null, plazo_horas: 48 };

// El contenido con lo de la etapa 2 completo (los borradores de antes no lo traen).
export function conDefaults(contenido) {
  const c = contenido || {};
  const d = c.diseno || {};
  return {
    ...c,
    pasos: (c.pasos || []).map((p) => ({ estilo: 'igual', condicion: null, ...p, secciones: (p.secciones || []).map((s) => ({ condicion: null, ...s })) })),
    diseno: { ...DISENO_BASE, ...d, bienvenida: { ...DISENO_BASE.bienvenida, ...(d.bienvenida || {}) }, final: { ...DISENO_BASE.final, ...(d.final || {}) } },
    navegacion: { ...NAVEGACION_BASE, ...(c.navegacion || {}) },
    seguimientos: { ...SEGUIMIENTOS_BASE, ...(c.seguimientos || {}) },
  };
}

export const ESTILOS = [
  ['paso', 'Paso a paso', 'Varias preguntas por paso, con Siguiente y Anterior.'],
  ['una', 'Una pregunta a la vez', 'Grande, de una en una, con transición suave.'],
  ['pagina', 'Todo en una página', 'Todas las secciones seguidas y un solo Enviar.'],
  ['checklist', 'Checklist', 'Filas compactas ✓ ✕ N/A para inspecciones.'],
];

export const FUENTES = {
  herco: { label: 'HERCO', titulo: "'Space Grotesk', system-ui, sans-serif", texto: "'IBM Plex Sans', system-ui, sans-serif" },
  inter: { label: 'Inter', titulo: "'Inter', system-ui, sans-serif", texto: "'Inter', system-ui, sans-serif", url: 'Inter:wght@400;500;600;700' },
  poppins: { label: 'Poppins', titulo: "'Poppins', system-ui, sans-serif", texto: "'Poppins', system-ui, sans-serif", url: 'Poppins:wght@400;500;600' },
  serif: { label: 'Merriweather', titulo: "'Merriweather', Georgia, serif", texto: "'IBM Plex Sans', system-ui, sans-serif", url: 'Merriweather:wght@400;700' },
};

// Las tipografías que no usa el resto de la app se cargan solo cuando un formulario las pide.
export function cargarFuente(k) {
  const f = FUENTES[k];
  if (!f?.url || typeof document === 'undefined' || document.getElementById(`fuente-${k}`)) return;
  const link = document.createElement('link');
  link.id = `fuente-${k}`;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f.url}&display=swap`;
  document.head.appendChild(link);
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt((hex || '#000000').slice(i, i + 2), 16) || 0);
export const mezclar = (hex, con, p) => `#${rgb(hex).map((x, i) => Math.round(x + (rgb(con)[i] - x) * p).toString(16).padStart(2, '0')).join('')}`;
const claro = (hex) => { const [r, g, b] = rgb(hex); return 0.299 * r + 0.587 * g + 0.114 * b > 150; };

// Variables CSS del tema. En modo oscuro se conserva el acento, el fondo se
// oscurece y el principal se aclara para que se lea.
export function temaDe(diseno, oscuro) {
  const d = { ...DISENO_BASE, ...(diseno || {}) };
  const f = FUENTES[d.fuente] || FUENTES.herco;
  const fondo = oscuro ? '#0f172a' : d.fondo;
  const tarjeta = oscuro ? '#172236' : '#ffffff';
  const principal = oscuro ? mezclar(d.principal, '#ffffff', 0.45) : d.principal;
  const sombra = d.sombras === 'suave' ? (oscuro ? '0 2px 10px rgba(0,0,0,0.35)' : '0 2px 10px rgba(11,20,36,0.07)') : 'none';
  return {
    '--f-principal': principal,
    '--f-boton': principal,
    '--f-boton-texto': claro(principal) ? '#0b1424' : '#ffffff',
    '--f-acento': d.acento,
    '--f-acento-texto': claro(d.acento) ? '#0b1424' : '#ffffff',
    '--f-acento-suave': mezclar(d.acento, fondo, 0.85),
    '--f-pista': oscuro ? '#2c3a52' : mezclar(d.acento, '#ffffff', 0.8),
    '--f-fondo': fondo,
    '--f-tarjeta': tarjeta,
    '--f-texto': oscuro ? '#e6ebf3' : '#0b1424',
    '--f-suave': oscuro ? '#a3b0c4' : '#5a6577',
    '--f-borde': oscuro ? '#2c3a52' : '#d5dce6',
    '--f-radio': { rectas: '4px', suaves: '14px', redondas: '22px' }[d.esquinas] || '14px',
    '--f-radio-chico': d.esquinas === 'rectas' ? '3px' : '10px',
    '--f-gap': { compacto: '10px', normal: '16px', amplio: '24px' }[d.espaciado] || '16px',
    '--f-sombra': sombra,
    '--f-fuente-titulo': f.titulo,
    fontFamily: f.texto,
    fontSize: d.tam === 'grande' ? '16px' : '14px',
    textAlign: d.alineacion === 'centro' ? 'center' : 'left',
    color: oscuro ? '#e6ebf3' : '#0b1424',
  };
}

// Operadores de las condiciones según el tipo de la pregunta que se mira.
export const FAMILIA = {
  unica: 'opcion', lista: 'opcion', sino: 'opcion', cumple: 'opcion', multiple: 'multiple',
  numero: 'numero', escala: 'numero', estrellas: 'numero', moneda: 'numero', porcentaje: 'numero', calculado: 'numero',
  corto: 'texto', largo: 'texto', correo: 'texto', telefono: 'texto', articulo: 'texto',
  fecha: 'fecha', hora: 'fecha', fechahora: 'fecha',
  colaborador: 'eleccion', sucursal: 'eleccion', caja: 'eleccion',
  foto: 'archivos', camara: 'archivos', archivo: 'archivos', firma: 'archivos',
  direccion: 'contenido', ubicacion: 'contenido', matriz: 'contenido', tabla: 'contenido', repetible: 'contenido',
};
export const OPERADORES = {
  opcion: ['igual', 'diferente', 'vacia', 'no_vacia'],
  multiple: ['contiene', 'no_contiene', 'vacia', 'no_vacia'],
  numero: ['igual', 'diferente', 'mayor', 'menor', 'vacia', 'no_vacia'],
  texto: ['igual', 'diferente', 'contiene', 'no_contiene', 'vacia', 'no_vacia'],
  fecha: ['igual', 'diferente', 'mayor', 'menor', 'vacia', 'no_vacia'],
  eleccion: ['igual', 'diferente', 'vacia', 'no_vacia'],
  archivos: ['vacia', 'no_vacia'],
  contenido: ['vacia', 'no_vacia'],
};
export const NOMBRE_OP = {
  igual: 'es', diferente: 'no es', mayor: 'es mayor que', menor: 'es menor que', contiene: 'contiene',
  no_contiene: 'no contiene', vacia: 'está vacía', no_vacia: 'no está vacía',
};
export const NOMBRE_OP_FECHA = { mayor: 'es después de', menor: 'es antes de' };
export const SIN_VALOR = new Set(['vacia', 'no_vacia']);
export const SEGUIMIENTO_OPCIONES = new Set(['unica', 'lista', 'sino', 'cumple', 'multiple']);
export const SEGUIMIENTO_NUMERO = new Set(['numero', 'escala', 'estrellas', 'moneda', 'porcentaje', 'calculado']);

const vacio = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

export function cumpleRegla(r, efectivos, tipos) {
  const v = efectivos[r.pregunta_id];
  const fam = FAMILIA[tipos[r.pregunta_id]];
  const sinNada = vacio(v) || (fam === 'archivos' && !v);
  if (r.op === 'vacia') return sinNada;
  if (r.op === 'no_vacia') return !sinNada;
  if (sinNada) return r.op === 'diferente' || r.op === 'no_contiene';
  if (fam === 'multiple') {
    const dentro = (Array.isArray(v) ? v : []).includes(r.valor);
    return r.op === 'contiene' ? dentro : r.op === 'no_contiene' ? !dentro : false;
  }
  if (fam === 'numero') {
    const a = Number(v); const b = Number(r.valor);
    if (Number.isNaN(a) || Number.isNaN(b) || r.valor === '' || r.valor === null) return r.op === 'diferente';
    return { igual: a === b, diferente: a !== b, mayor: a > b, menor: a < b }[r.op] || false;
  }
  let a = String(v).trim(); let b = String(r.valor ?? '').trim();
  if (fam === 'texto') {
    a = a.toLowerCase(); b = b.toLowerCase();
    if (r.op === 'contiene') return a.includes(b);
    if (r.op === 'no_contiene') return !a.includes(b);
  }
  return { igual: a === b, diferente: a !== b, mayor: a > b, menor: a < b }[r.op] || false;
}

export function cumple(cond, efectivos, tipos) {
  if (!cond?.reglas?.length) return true;
  const res = cond.reglas.map((r) => cumpleRegla(r, efectivos, tipos));
  return cond.union === 'o' ? res.some(Boolean) : res.every(Boolean);
}

// Qué pasos, secciones y preguntas se ven con lo contestado hasta ahora, y lo
// que da cada campo calculado. Lo oculto cuenta como vacío para las reglas que
// siguen. `archivos`: dueño -> lista.
export function visibilidad(contenido, valores, archivos = {}) {
  const tipos = {};
  preguntasDe(contenido).forEach(({ it }) => { tipos[it.id] = it.tipo; });
  const efectivos = {};
  const calculados = {};
  const pasos = new Set(); const secciones = new Set(); const items = new Set();
  const valorDe = (it) => {
    if (DE_ARCHIVOS.has(it.tipo)) return (archivos[it.id] || []).length;
    if (it.tipo === 'calculado') { calculados[it.id] = calcular(it.config, efectivos); return calculados[it.id]; }
    return EN_FILAS.has(it.tipo) ? filasConDatos(it, valores[it.id], archivos) : valores[it.id];
  };
  (contenido?.pasos || []).forEach((p) => {
    const pv = cumple(p.condicion, efectivos, tipos);
    if (pv) pasos.add(p.id);
    (p.secciones || []).forEach((s) => {
      const sv = pv && cumple(s.condicion, efectivos, tipos);
      if (sv) secciones.add(s.id);
      (s.items || []).forEach((it) => {
        const iv = sv && cumple(it.condicion, efectivos, tipos);
        if (iv) items.add(it.id);
        if (!SIN_RESPUESTA.has(it.tipo)) efectivos[it.id] = iv ? valorDe(it) : null;
      });
    });
  });
  return { pasos, secciones, items, calculados };
}

export function disparaSeguimiento(it, valor) {
  const s = it.seguimiento;
  if (!s || vacio(valor)) return false;
  if (s.valores) return (Array.isArray(valor) ? valor : [valor]).some((v) => s.valores.includes(v));
  const a = Number(valor); const b = Number(s.valor);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return { mayor: a > b, menor: a < b, igual: a === b }[s.op] || false;
}

export function describirCondicion(cond, porId) {
  if (!cond?.reglas?.length) return '';
  return cond.reglas.map((r) => {
    const p = porId[r.pregunta_id];
    if (!p) return '«(pregunta que ya no existe)»';
    const fecha = FAMILIA[p.tipo] === 'fecha';
    const op = (fecha && NOMBRE_OP_FECHA[r.op]) || NOMBRE_OP[r.op];
    let valor = r.valor;
    if (p.opciones) valor = p.opciones.find((o) => o.id === r.valor)?.label ?? valor;
    return `«${nombreDe(p)}» ${op}${SIN_VALOR.has(r.op) ? '' : ` «${valor ?? ''}»`}`;
  }).join(cond.union === 'o' ? ' o ' : ' y ');
}

export function describirSeguimiento(it) {
  const s = it.seguimiento;
  if (!s) return '';
  if (s.valores) return `Abre seguimiento si: ${s.valores.map((v) => (it.opciones || []).find((o) => o.id === v)?.label).filter(Boolean).join(' o ')}`;
  return `Abre seguimiento si ${NOMBRE_OP[s.op]} ${s.valor}`;
}

// Preguntas que pueden usarse en una regla: las que van antes de `limite` (id) y tienen respuesta.
export function anterioresA(contenido, limite) {
  const out = [];
  for (const p of contenido?.pasos || []) {
    if (p.id === limite) return out;
    for (const s of p.secciones || []) {
      if (s.id === limite) return out;
      for (const it of s.items || []) {
        if (it.id === limite) return out;
        if (FAMILIA[it.tipo]) out.push(it);
      }
    }
  }
  return out;
}

// Lo que puede sumar un campo calculado: las preguntas de número que van antes.
export const numericasAntes = (contenido, limite) => anterioresA(contenido, limite).filter((it) => FAMILIA[it.tipo] === 'numero');

// Reglas (de preguntas, secciones y pasos) y campos calculados que miran a la pregunta `qid`.
export function usosDe(contenido, qid) {
  let n = 0;
  const cuenta = (c) => { n += (c?.reglas || []).filter((r) => r.pregunta_id === qid).length; };
  (contenido?.pasos || []).forEach((p) => {
    cuenta(p.condicion);
    (p.secciones || []).forEach((s) => {
      cuenta(s.condicion);
      (s.items || []).forEach((it) => { cuenta(it.condicion); if (it.tipo === 'calculado' && it.config?.preguntas?.includes(qid)) n += 1; });
    });
  });
  return n;
}

export function quitarUsos(contenido, qid) {
  const limpiar = (c) => {
    if (!c?.reglas) return c || null;
    const reglas = c.reglas.filter((r) => r.pregunta_id !== qid);
    return reglas.length ? { ...c, reglas } : null;
  };
  contenido.pasos.forEach((p) => {
    p.condicion = limpiar(p.condicion);
    p.secciones.forEach((s) => {
      s.condicion = limpiar(s.condicion);
      s.items.forEach((it) => {
        it.condicion = limpiar(it.condicion);
        if (it.tipo === 'calculado') it.config = { ...it.config, preguntas: (it.config?.preguntas || []).filter((id) => id !== qid) };
      });
    });
  });
}
