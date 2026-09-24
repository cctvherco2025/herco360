// Helpers de "Rutina Operativa — Gerentes". El esquema (secciones, preguntas,
// opciones y sus puntos) ya NO vive hardcodeado aquí — se guarda en Mongo y
// se edita desde /rutina-operativa (botón "Editar puntajes", admins y
// Director comercial). Este archivo solo trae funciones puras que operan
// sobre el esquema que se cargue en cada momento (GET /rutina/schema),
// para que RutinaWizard/Historial/rutinaPdf no dupliquen esta lógica.

export const RUTINA_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat'];

// secciones: [{ seccion, items: [{ id, titulo, pregunta, opciones:[{label,pts}], evidencia }] }]
// -> lista plana con el máximo de cada ítem ya calculado (mayor puntaje de sus opciones).
export function flattenRutinaSchema(secciones) {
  return (secciones || []).flatMap((s) => s.items.map((it) => ({
    ...it, seccion: s.seccion, max: it.opciones.length ? Math.max(...it.opciones.map((o) => o.pts)) : 0,
  })));
}

export function rutinaTotalMax(flat) {
  return (flat || []).reduce((sum, it) => sum + it.max, 0);
}

export function rutinaTone(pct) {
  return pct >= 90 ? 'g' : pct >= 75 ? 'a' : 'r';
}
export const RUTINA_TONE_COLOR = { g: '#16a34a', a: '#ec9032', r: '#dc2626' };

export function rutinaStatusLabel(pct, touchedCount) {
  if (touchedCount === 0) return 'Sin datos';
  if (pct >= 90) return 'Excelente';
  if (pct >= 75) return 'Requiere ajustes';
  return 'Intervención urgente';
}

// secciones: esquema vigente (tal como llega de GET /rutina/schema).
// state: { answers: {id: optionIndex}, touched: Set|Array }
export function computeRutinaSummary(secciones, state) {
  const answers = state.answers || {};
  const touched = state.touched instanceof Set ? state.touched : new Set(state.touched || []);

  const sections = (secciones || []).map((s) => {
    let a = 0, m = 0;
    s.items.forEach((it) => {
      const max = it.opciones.length ? Math.max(...it.opciones.map((o) => o.pts)) : 0;
      m += max;
      const idx = answers[it.id];
      if (touched.has(it.id) && typeof idx === 'number' && it.opciones[idx]) a += it.opciones[idx].pts;
    });
    return { seccion: s.seccion, a, m, pct: m ? Math.round((a / m) * 100) : 0 };
  });
  const totalMax = sections.reduce((s, x) => s + x.m, 0);
  const totalAct = sections.reduce((s, x) => s + x.a, 0);
  const pct = totalMax ? Math.round((totalAct / totalMax) * 100) : 0;
  const best = touched.size ? [...sections].sort((a, b) => b.pct - a.pct)[0] : null;
  const worst = touched.size ? [...sections].sort((a, b) => a.pct - b.pct)[0] : null;

  return {
    sections, totalAct, totalMax, pct,
    touchedCount: touched.size, statusLabel: rutinaStatusLabel(pct, touched.size), best, worst,
  };
}

// Arma summary + sections directo de una evaluación YA GUARDADA (self-
// contained: total_score/total_max/section_totals se guardaron al enviarla),
// sin depender del esquema vigente — así editar el esquema después nunca
// altera cómo se ve/exporta una evaluación pasada.
export function summaryFromEvaluacion(evalDoc) {
  const sections = Object.entries(evalDoc.section_totals || {}).map(([seccion, t]) => ({
    seccion, a: t.score || 0, m: t.max || 0, pct: t.max ? Math.round((t.score / t.max) * 100) : 0,
  }));
  const touchedCount = (evalDoc.entries || []).length;
  const pct = evalDoc.percent ?? (evalDoc.total_max ? Math.round((evalDoc.total_score / evalDoc.total_max) * 100) : 0);
  const best = sections.length ? [...sections].sort((a, b) => b.pct - a.pct)[0] : null;
  const worst = sections.length ? [...sections].sort((a, b) => a.pct - b.pct)[0] : null;
  return {
    sections, totalAct: evalDoc.total_score || 0, totalMax: evalDoc.total_max || 0, pct,
    touchedCount, statusLabel: rutinaStatusLabel(pct, touchedCount), best, worst,
  };
}
