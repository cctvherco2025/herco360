// Revisión de Guardias (ECCP): sucursales, semáforo y utilidades compartidas
// entre el recorrido y el historial. Los criterios vienen del backend
// (GET /guardias/criterios), que es quien valida y calcula al guardar.
import { parseApiDate, fmtHora } from '@/lib/time';

export const GUARDIAS_SUCURSALES = ['H1', 'H2', 'H4', 'H6'];

// Verde 90–100 · Amarillo 70–89 · Rojo < 70
export function guardiaTone(pct) {
  return pct >= 90 ? 'g' : pct >= 70 ? 'a' : 'r';
}
export const GUARDIA_TONE_COLOR = { g: '#16a34a', a: '#eab308', r: '#dc2626' };
export const ESTADO_LABEL = { excelente: 'Excelente', requiere_mejora: 'Requiere mejora', deficiente: 'Deficiente' };
export const estadoDePct = (pct) => (pct >= 90 ? 'excelente' : pct >= 70 ? 'requiere_mejora' : 'deficiente');

// answers: id -> 'cumple' | 'no_cumple'
export function computeGuardiaSummary(criterios, answers) {
  const total = (criterios || []).length;
  const cumplidos = (criterios || []).filter((c) => answers[c.id] === 'cumple').length;
  const respondidos = (criterios || []).filter((c) => answers[c.id]).length;
  const pct = total ? Math.round((cumplidos / total) * 100) : 0;
  return { total, respondidos, cumplidos, incumplidos: respondidos - cumplidos, pct, estado: estadoDePct(pct) };
}

// "22/10/2026 · 3:45 p. m." en la hora local y el formato 12/24 h del usuario.
export function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${dd}/${mm}/${d.getFullYear()} · ${fmtHora(hh)}`;
}
