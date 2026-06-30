// Spanish date / relative-time helpers
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DIAS_CORTO = ['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'];
const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Parse a value into a LOCAL date. Plain "YYYY-MM-DD" strings are treated as
// local calendar dates (not UTC) to avoid off-by-one-day shifts in negative-UTC
// timezones (e.g. Honduras, UTC-6).
function toLocalDate(date) {
  if (typeof date === 'string') {
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  return new Date(date);
}

export function fullDateEs(date = new Date()) {
  const d = toLocalDate(date);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

export function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

export function greetingEs(date = new Date()) {
  const h = new Date(date).getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function timeAgoEs(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Math.floor((Date.now() - then) / 1000);
  if (diff < 60) return 'Hace un momento';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs} ${hrs === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `Hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const d = new Date(iso);
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

export { MESES, DIAS, DIAS_CORTO, MESES_CORTO };
