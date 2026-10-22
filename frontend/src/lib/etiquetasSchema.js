// Auditoría de Etiquetas de Precios (ECCP): catálogos y utilidades.
// Deben coincidir con backend/routes_etiquetas.py (SUCURSALES, DEPARTAMENTOS,
// RESULTADOS); la cantidad de etiquetas y los rangos de color vienen de
// GET /etiquetas/config (los configura el administrador).
import { fmtHora } from '@/lib/time';

export const ETQ_SUCURSALES = ['H1', 'H2', 'H4', 'H6'];
export const ETQ_DEPARTAMENTOS = ['Herramientas', 'Hogar', 'Ferretería', 'Iluminación', 'Pinturas', 'Revestimiento'];
export const ETQ_RESULTADOS = [
  { k: 'correcta', label: 'Correcta', corto: 'Correcta', color: '#16a34a' },
  { k: 'precio_incorrecto', label: 'Precio incorrecto', corto: 'Precio incorrecto', color: '#dc2626' },
  { k: 'sin_etiqueta', label: 'Sin etiqueta', corto: 'Sin etiqueta', color: '#ec9032' },
  { k: 'deteriorada', label: 'Etiqueta deteriorada o ilegible', corto: 'Deteriorada', color: '#a16207' },
];
export const RESULTADO = Object.fromEntries(ETQ_RESULTADOS.map((r) => [r.k, r]));
export const DEFAULT_ETQ_CONFIG = { cantidad: 20, verde_min: 95, amarillo_min: 85 };

// Semáforo con los rangos configurados.
export const ETQ_TONE_COLOR = { g: '#16a34a', a: '#eab308', r: '#dc2626' };
export const ETQ_TONE_LABEL = { g: 'Cumple', a: 'Requiere atención', r: 'Crítico' };
export function etqTone(pct, cfg = DEFAULT_ETQ_CONFIG) {
  if (pct == null) return null;
  return pct >= cfg.verde_min ? 'g' : pct >= cfg.amarillo_min ? 'a' : 'r';
}

// Semana ISO (lunes a domingo) de una fecha local.
export function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia); // jueves de esa semana
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return { anio: y, num: w, id: `${y}-W${String(w).padStart(2, '0')}` };
}
// Lunes de una semana 'YYYY-Www'.
export function lunesDeSemana(id) {
  const [y, w] = id.split('-W').map(Number);
  const ene4 = new Date(y, 0, 4);
  const lunes1 = new Date(y, 0, 4 - ((ene4.getDay() + 6) % 7));
  return new Date(lunes1.getFullYear(), lunes1.getMonth(), lunes1.getDate() + (w - 1) * 7);
}
export const semanaLabel = (id) => (id ? `Semana ${Number(id.split('-W')[1])}` : '—');

// Lempiras: "L 1,234.50" (con signo si se pide)
export function fmtL(n, { signo = false } = {}) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : signo && v > 0 ? '+' : ''}L ${s}`;
}

export function fmtFechaAud(a) {
  const f = a?.fecha_local || '';
  const d = f.length === 10 ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—';
  return a?.hora_local ? `${d} · ${fmtHora(a.hora_local)}` : d;
}
