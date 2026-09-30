// Repetición de actividades con RRULE (RFC 5545), igual que el backend
// (backend/recurrence.py). La regla se guarda sin DTSTART: el inicio es la
// fecha + hora de la actividad. Las fechas de rrule.js se manejan como hora
// "flotante" en UTC (Date.UTC) para que la zona del navegador no mueva días.
import { rrulestr } from 'rrule';

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const DIAS_SEMANA = [ // orden de los botones L M M J V S D
  { code: 'MO', corto: 'L', nombre: 'lunes' },
  { code: 'TU', corto: 'M', nombre: 'martes' },
  { code: 'WE', corto: 'M', nombre: 'miércoles' },
  { code: 'TH', corto: 'J', nombre: 'jueves' },
  { code: 'FR', corto: 'V', nombre: 'viernes' },
  { code: 'SA', corto: 'S', nombre: 'sábado' },
  { code: 'SU', corto: 'D', nombre: 'domingo' },
];
const NOMBRE_DIA = Object.fromEntries(DIAS_SEMANA.map((d) => [d.code, d.nombre]));
export const ORDINALES = { 1: 'primer', 2: 'segundo', 3: 'tercer', 4: 'cuarto', '-1': 'último' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const HABILES = ['MO', 'TU', 'WE', 'TH', 'FR'];

const partes = (s) => (s || '').split('-').map(Number);
const aUTC = (fecha, hora = '00:00') => {
  const [y, m, d] = partes(fecha); const [h, mi] = hora.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h || 0, mi || 0));
};
const aFecha = (dt) => `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
const diasDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

// ── Regla <-> objeto ───────────────────────────────────────────
// { freq, interval, byday: ['MO'], bymonthday: [14], bysetpos, bymonth, count, until: 'YYYY-MM-DD' }
export function leerRegla(regla) {
  const o = { freq: null, interval: 1, byday: [], bymonthday: [], bysetpos: null, bymonth: null, count: null, until: null };
  (regla || '').replace(/^RRULE:/i, '').split(';').filter(Boolean).forEach((p) => {
    const [k, v] = p.split('=');
    if (k === 'FREQ') o.freq = v;
    else if (k === 'INTERVAL') o.interval = Number(v) || 1;
    else if (k === 'BYDAY') o.byday = v.split(',');
    else if (k === 'BYMONTHDAY') o.bymonthday = v.split(',').map(Number);
    else if (k === 'BYSETPOS') o.bysetpos = Number(v);
    else if (k === 'BYMONTH') o.bymonth = Number(v);
    else if (k === 'COUNT') o.count = Number(v);
    else if (k === 'UNTIL') o.until = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  });
  return o;
}

// Mismo orden que normaliza el backend, para poder comparar reglas como texto.
export function construirRegla(o) {
  const p = [`FREQ=${o.freq}`];
  if (o.interval && o.interval > 1) p.push(`INTERVAL=${o.interval}`);
  if (o.bymonth) p.push(`BYMONTH=${o.bymonth}`);
  if (o.bymonthday?.length) p.push(`BYMONTHDAY=${o.bymonthday.join(',')}`);
  if (o.byday?.length) p.push(`BYDAY=${o.byday.join(',')}`);
  if (o.bysetpos) p.push(`BYSETPOS=${o.bysetpos}`);
  if (o.count) p.push(`COUNT=${o.count}`);
  else if (o.until) p.push(`UNTIL=${o.until.replace(/-/g, '')}T235959`);
  return p.join(';');
}

// "El día 31 de cada mes": si el mes no tiene ese día, el último día del mes
// (BYMONTHDAY=28,29,30,31;BYSETPOS=-1).
const diaDelMes = (dia) => (dia <= 28
  ? { bymonthday: [dia] }
  : { bymonthday: Array.from({ length: dia - 27 }, (_, i) => 28 + i), bysetpos: -1 });

// Datos de la fecha para armar las opciones: día de la semana, número de
// semana en el mes (3 = tercer lunes) y si es el último de ese día en el mes.
export function datosFecha(fecha) {
  const [y, m, d] = partes(fecha);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { y, m, d, wd, nth: Math.ceil(d / 7), esUltimo: d + 7 > diasDelMes(y, m) };
}

export function reglaMensualDia(fecha) { const { d } = datosFecha(fecha); return { freq: 'MONTHLY', ...diaDelMes(d) }; }
export function reglaAnual(fecha) {
  const { m, d } = datosFecha(fecha);
  return { freq: 'YEARLY', bymonth: m, ...(m === 2 && d === 29 ? { bymonthday: [28, 29], bysetpos: -1 } : { bymonthday: [d] }) };
}

// Opciones fijas del select "Repetición" (sin fin). Su regla depende de la
// fecha de inicio: "Cada semana" = ese día de la semana, "Una vez al mes" =
// ese día del mes. Todo lo demás (días, N-ésimo día, hasta cuándo) se arma en
// "Personalizado…" para esa actividad; no se guarda como opción.
export function opcionesRepeticion(fecha) {
  const ops = [{ key: 'none', label: 'No se repite', regla: '' }];
  if (!fecha) return ops;
  const { wd } = datosFecha(fecha);
  ops.push(
    { key: 'daily', label: 'Cada día', regla: 'FREQ=DAILY' },
    { key: 'weekly', label: 'Cada semana', regla: construirRegla({ freq: 'WEEKLY', byday: [wd] }) },
    { key: 'monthly', label: 'Una vez al mes', regla: construirRegla(reglaMensualDia(fecha)) },
  );
  return ops;
}

// ── Texto ───────────────────────────────────────────────────────
const lista = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
export const fechaCorta = (fecha) => { const [y, m, d] = partes(fecha); return `${d} ${MESES_CORTO[m - 1]} ${y}`; };

// "el tercer lunes de cada mes, hasta el 31 dic 2026"
export function describirRegla(regla, { conFin = true } = {}) {
  const o = leerRegla(regla);
  const n = o.interval || 1;
  let t = '';
  if (o.freq === 'DAILY') t = n === 1 ? 'todos los días' : `cada ${n} días`;
  else if (o.freq === 'WEEKLY') {
    const orden = DIAS_SEMANA.map((x) => x.code).filter((c) => o.byday.includes(c));
    if (n === 1 && orden.join() === HABILES.join()) t = 'de lunes a viernes';
    else t = `${n === 1 ? 'cada semana' : `cada ${n} semanas`} el ${lista(orden.map((c) => NOMBRE_DIA[c]))}`;
  } else if (o.freq === 'MONTHLY') {
    const cada = n === 1 ? 'de cada mes' : `cada ${n} meses`;
    if (o.byday.length) t = `el ${ORDINALES[o.bysetpos] || ORDINALES[1]} ${NOMBRE_DIA[o.byday[0]]} ${cada}`;
    else t = `el día ${Math.max(...o.bymonthday)} ${cada}`;
  } else if (o.freq === 'YEARLY') {
    t = `${n === 1 ? 'cada año' : `cada ${n} años`} el ${Math.max(...o.bymonthday)} de ${MESES[(o.bymonth || 1) - 1]}`;
  }
  if (conFin && o.until) t += `, hasta el ${fechaCorta(o.until)}`;
  else if (conFin && o.count) t += o.count === 1 ? ', 1 vez' : `, ${o.count} veces`;
  return t;
}

// ── Fechas ──────────────────────────────────────────────────────
function crear(regla, fecha, hora) {
  try { return rrulestr(regla, { dtstart: aUTC(fecha, hora) }); } catch (e) { return null; }
}

// Primeras `n` fechas (YYYY-MM-DD) de la serie.
export function proximasFechas(regla, fecha, hora, n = 4) {
  const rr = regla && fecha && crear(regla, fecha, hora);
  if (!rr) return [];
  return rr.all((_, i) => i < n).map(aFecha);
}

// Fechas de inicio entre `fecha` y `dias` días después.
export function fechasEnRango(regla, fecha, hora, dias = 365) {
  const rr = regla && fecha && crear(regla, fecha, hora);
  if (!rr) return [];
  const a = aUTC(fecha, hora);
  const b = new Date(a.getTime() + dias * 86400000);
  return rr.between(a, b, true).map(aFecha);
}

export const fechaLarga = (fecha) => {
  const [y, m, d] = partes(fecha);
  return `${DIAS_CORTO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MESES_CORTO[m - 1]} ${y}`;
};

// ¿Una actividad de varios días volvería a empezar antes de terminar?
// (misma regla que valida el servidor)
export function repeticionChoca(regla, fecha, horaInicio, horaFin, duracionDias) {
  if (!regla || !duracionDias) return false;
  const rr = crear(regla, fecha, horaInicio);
  if (!rr) return false;
  const inicios = rr.all((_, i) => i < 200);
  const [hf, mf] = horaFin.split(':').map(Number);
  for (let i = 1; i < inicios.length; i += 1) {
    const p = inicios[i - 1];
    const fin = new Date(Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate() + duracionDias, hf, mf));
    if (inicios[i] < fin) return true;
  }
  return false;
}
