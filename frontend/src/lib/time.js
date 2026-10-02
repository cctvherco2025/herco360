// Spanish date / relative-time helpers
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DIAS_CORTO = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Normaliza un ISO-8601 del backend a algo que TODO navegador pueda parsear.
// El backend emite (o emitió) timestamps como "2026-09-07T18:49:14.540923+00:00":
// Safari / iOS / WebViews viejos NO parsean fracciones de segundo de más de 3
// dígitos y a veces tampoco el offset "+00:00", y devuelven Invalid Date. Eso
// terminaba en "Hace NaN min" o, si algo hacía .toISOString()/Intl encima, en
// una pantalla en blanco. Acá recortamos los microsegundos a milisegundos y
// dejamos "Z".
export function parseApiDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const s = value
      .replace(/(\.\d{3})\d+/, '$1')      // .540923 -> .540
      .replace(/([+-]\d{2}):?(\d{2})$/, '$1$2')  // +00:00 -> +0000
      .replace(/\+0000$/, 'Z');
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(value); // último recurso (puede ser Invalid Date)
}

// Parse a value into a LOCAL date. Plain "YYYY-MM-DD" strings are treated as
// local calendar dates (not UTC) to avoid off-by-one-day shifts in negative-UTC
// timezones (e.g. Honduras, UTC-6).
function toLocalDate(date) {
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return parseApiDate(date);
}

export function fullDateEs(date = new Date()) {
  const d = toLocalDate(date);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export function greetingEs(date = new Date()) {
  const d = parseApiDate(date);
  const h = Number.isNaN(d.getTime()) ? new Date().getHours() : d.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function timeAgoEs(iso) {
  if (!iso) return '';
  const then = parseApiDate(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return 'Hace un momento';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} ${hrs === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const d = parseApiDate(iso);
  return `${d.getDate()} ${MESES_CORTO[d.getMonth()]}`;
}

export function monthYearEs(date) {
  const d = toLocalDate(date);
  return `${capitalize(MESES[d.getMonth()])} ${d.getFullYear()}`;
}

export function ymd(date) {
  const d = toLocalDate(date);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// ---- Formato de hora (12 h a. m./p. m. o 24 h) · preferencia por usuario ----
// La hora SIEMPRE se guarda como "HH:MM" (24 h); esto es solo para mostrarla.
// El valor se sincroniza desde el perfil del usuario (AuthContext) y se guarda
// en localStorage para aplicarlo al instante.
const TIME_KEY = 'herco_time_format';
let _timeFormat = '24h';
try { const v = localStorage.getItem(TIME_KEY); if (v === '24h' || v === '12h') _timeFormat = v; } catch (e) { /* sin storage */ }

export function getTimeFormat() { return _timeFormat; }
export function setTimeFormat(fmt) {
  _timeFormat = fmt === '24h' ? '24h' : '12h';
  try { localStorage.setItem(TIME_KEY, _timeFormat); } catch (e) { /* sin storage */ }
}

// "09:00" -> "9:00 a. m." (o "09:00" en 24 h). corto: "9 am" cuando es en punto.
export function fmtHora(hhmm, { corto = false } = {}) {
  if (typeof hhmm !== 'string' || !hhmm.includes(':')) return hhmm || '';
  const [hs, ms] = hhmm.split(':');
  const h = Number(hs); const m = Number(ms);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const mm = String(m).padStart(2, '0');
  if (_timeFormat === '24h') return `${String(h).padStart(2, '0')}:${mm}`;
  const h12 = h % 12 || 12;
  const ap = corto ? (h < 12 ? 'am' : 'pm') : (h < 12 ? 'a. m.' : 'p. m.');
  return corto && m === 0 ? `${h12} ${ap}` : `${h12}:${mm} ${ap}`;
}

// "09:00","10:30" -> "9:00 a. m. – 10:30 a. m."
export function fmtRangoHoras(a, b) {
  const x = fmtHora(a); const y = fmtHora(b);
  return x && y ? `${x} – ${y}` : (x || y || '');
}

export { MESES, DIAS, DIAS_CORTO, MESES_CORTO };
