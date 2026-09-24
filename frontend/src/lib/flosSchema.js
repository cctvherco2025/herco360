// Helpers de la Auditoría FLOS (Frenteo · Limpieza · Orden · Surtido). El
// esquema (dimensiones, criterios, puntaje máximo y acción correctiva) ya NO
// vive hardcodeado aquí — se guarda en Mongo y se edita desde /formulario
// (botón "Editar puntajes", asignable por permiso). Este archivo solo trae
// funciones puras que operan sobre el esquema que se cargue en cada momento
// (GET /formulario/schema), para que AuditWizard/Historial/flosPdf no
// dupliquen esta lógica.

export const FLOS_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat'];

// dimensiones: [{ dimension, variables: [{id,name,desc,action,max}] }]
// -> lista plana en el orden del recorrido, con la dimensión adjunta a cada variable.
export function flattenFlosSchema(dimensiones) {
  return (dimensiones || []).flatMap((d) => d.variables.map((v) => ({ ...v, dim: d.dimension })));
}

// Fotos y texto de referencia — solo para los 5 criterios que el manual documentó
// fotográficamente. Las imágenes viven en /public/flos-refs (servidas como estáticos).
// Si un criterio se edita/elimina/agrega desde el editor, simplemente no tiene
// referencia (no rompe nada — el botón "Ver foto de referencia" no aparece).
export const FLOS_REF_CAPTION = {
  f1: 'Así se ve el frenteo cumplido: producto alineado al fleje, frentes hacia adelante y sin huecos.',
  f2: 'Exhibiciones con las muestras completas, fijas y operativas.',
  o4: 'Cajas estibadas correctamente y rotuladas con marcador negro, letra grande y legible.',
  s1: 'El nivel de producto que se considera stock adecuado en el lineal.',
  s3: 'Góndola frondosa: bandejas ajustadas, sin huecos de aire.',
};
export const FLOS_REF_PHOTO = {
  f1: '/flos-refs/f1.jpg',
  f2: '/flos-refs/f2.jpg',
  o4: '/flos-refs/o4.jpg',
  s1: '/flos-refs/s1.jpg',
  s3: '/flos-refs/s3.jpg',
};

// Tono por porcentaje cumplido — igual a las bandas del documento original.
export function flosTone(pct) {
  return pct >= 90 ? 'g' : pct >= 75 ? 'a' : 'r';
}
export const FLOS_TONE_COLOR = { g: '#16a34a', a: '#ec9032', r: '#dc2626' };

export function flosStatusLabel(pct, touchedCount) {
  if (touchedCount === 0) return 'Sin datos';
  if (pct >= 90) return 'Excelente ejecución';
  if (pct >= 75) return 'Requiere ajustes';
  return 'Intervención urgente';
}

// Resumen por dimensión + plan de acción (variables evaluadas por debajo del máximo,
// ordenadas de la más urgente a la menos urgente). dimensiones: esquema vigente
// (tal como llega de GET /formulario/schema). state: { scores: {id:int},
// comments: {id:str}, touched: Set|Array } — no muta nada.
export function computeFlosSummary(dimensiones, state) {
  const scores = state.scores || {};
  const touched = state.touched instanceof Set ? state.touched : new Set(state.touched || []);
  const comments = state.comments || {};

  const dims = (dimensiones || []).map((d) => {
    let a = 0, m = 0;
    d.variables.forEach((v) => { a += scores[v.id] ?? 0; m += v.max; });
    return { dim: d.dimension, a, m, pct: m ? Math.round((a / m) * 100) : 0, lost: m - a };
  });
  const totalMax = dims.reduce((s, d) => s + d.m, 0);
  const totalAct = dims.reduce((s, d) => s + d.a, 0);
  const pct = totalMax ? Math.round((totalAct / totalMax) * 100) : 0;
  const lost = totalMax - totalAct;
  const flat = flattenFlosSchema(dimensiones);
  const atRisk = flat.filter((v) => v.max > 0 && (scores[v.id] ?? 0) / v.max < 0.75).length;
  const best = touched.size ? [...dims].sort((a, b) => b.pct - a.pct)[0] : null;
  const worst = touched.size ? [...dims].sort((a, b) => a.pct - b.pct)[0] : null;

  const gaps = [];
  (dimensiones || []).forEach((d) => d.variables.forEach((v) => {
    if (!touched.has(v.id)) return;
    const s = scores[v.id] ?? 0;
    if (s < v.max) gaps.push({ v, dim: d.dimension, s, ratio: v.max ? s / v.max : 0, note: (comments[v.id] || '').trim() });
  }));
  gaps.sort((a, b) => a.ratio - b.ratio);
  const plan = gaps.map((g) => ({
    ...g,
    priority: g.ratio <= 0.5 ? 'Alta' : g.ratio <= 0.8 ? 'Media' : 'Baja',
    priorityKey: g.ratio <= 0.5 ? 'hi' : g.ratio <= 0.8 ? 'md' : 'lo',
  }));

  return {
    dims, totalAct, totalMax, pct, lost, atRisk, best, worst,
    touchedCount: touched.size, statusLabel: flosStatusLabel(pct, touched.size), plan,
  };
}

// Arma summary directo de una auditoría YA GUARDADA (self-contenido:
// total_score/total_max/dimension_totals y el 'action' de cada entrada se
// guardaron al enviarla), sin depender del esquema vigente — así editar el
// esquema después nunca altera cómo se ve/exporta una auditoría pasada,
// Plan de acción incluido.
export function summaryFromAudit(audit) {
  const entries = audit.entries || [];
  const dims = Object.entries(audit.dimension_totals || {}).map(([dim, t]) => ({
    dim, a: t.score || 0, m: t.max || 0, pct: t.max ? Math.round((t.score / t.max) * 100) : 0, lost: (t.max || 0) - (t.score || 0),
  }));
  const totalAct = audit.total_score || 0;
  const totalMax = audit.total_max || 0;
  const pct = audit.percent ?? (totalMax ? Math.round((totalAct / totalMax) * 100) : 0);
  const lost = totalMax - totalAct;
  const atRisk = entries.filter((e) => e.max > 0 && e.score / e.max < 0.75).length;
  const best = dims.length ? [...dims].sort((a, b) => b.pct - a.pct)[0] : null;
  const worst = dims.length ? [...dims].sort((a, b) => a.pct - b.pct)[0] : null;

  const gaps = entries
    .filter((e) => e.score < e.max)
    .map((e) => ({
      v: { id: e.id, name: e.name, max: e.max, action: e.action || '' },
      dim: e.dim, s: e.score, ratio: e.max ? e.score / e.max : 0, note: (e.comment || '').trim(),
    }));
  gaps.sort((a, b) => a.ratio - b.ratio);
  const plan = gaps.map((g) => ({
    ...g,
    priority: g.ratio <= 0.5 ? 'Alta' : g.ratio <= 0.8 ? 'Media' : 'Baja',
    priorityKey: g.ratio <= 0.5 ? 'hi' : g.ratio <= 0.8 ? 'md' : 'lo',
  }));

  return {
    dims, totalAct, totalMax, pct, lost, atRisk, best, worst,
    touchedCount: entries.length, statusLabel: flosStatusLabel(pct, entries.length), plan,
  };
}
