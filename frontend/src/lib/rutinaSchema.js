// Esquema de "Rutina Operativa — Gerentes", portado de
// "Esquema de calificación rutina operativa gerentes.xlsx" (hoja única).
// Cada pregunta puntuable trae sus opciones con el puntaje exacto de cada una
// (columna "Desgloce" de la hoja); el máximo del ítem es el mayor puntaje de
// sus propias opciones — no la columna "Peso" (que en la hoja tiene un error
// de captura en "Reunión 1:1": dice 11 pero sus opciones llegan a 16. Usando
// el máximo real de las opciones, el total de los 13 ítems da exactamente
// 100 puntos, así que las opciones son la fuente de verdad, no "Peso").
// Algunas preguntas llevan además un sub-ítem de evidencia (foto y/o nota),
// sin puntaje propio — igual que el desglose de la hoja original.

export const RUTINA_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat'];

export const RUTINA_SCHEMA = [
  {
    seccion: 'Gestión de Categorías y Auditoría',
    items: [
      {
        id: 'ventas_rentabilidad',
        titulo: 'Evaluación de Ventas y Rentabilidad',
        pregunta: 'Seleccione el nivel alcanzado según metas de volumen y rentabilidad',
        opciones: [
          { label: 'Meta de volumen y rentabilidad superadas', pts: 12 },
          { label: 'Se alcanzó solo volumen o solo rentabilidad', pts: 6 },
          { label: '<90% de cumplimiento en ambas metas', pts: 0 },
        ],
        evidencia: { tipo: 'foto', prompt: 'Adjunte captura del reporte de ventas y margen/rentabilidad del mes' },
      },
      {
        id: 'flos_ejecucion',
        titulo: 'Ejecución de evaluación FLOS',
        pregunta: '¿Ejecutó la Evaluación FLOS?',
        opciones: [{ label: 'Sí', pts: 7 }, { label: 'No', pts: 0 }],
        evidencia: { tipo: 'foto', prompt: 'Adjunte captura de Chat de FLOS' },
      },
    ],
  },
  {
    seccion: 'Inventario, Abastecimiento y Sistemas',
    items: [
      {
        id: 'sobrestock',
        titulo: 'Gestión de Sobrestock',
        pregunta: '¿Realizó análisis de Requerimiento de Sobrestock?',
        opciones: [{ label: 'Sí', pts: 5 }, { label: 'No', pts: 0 }],
        evidencia: { tipo: 'foto', prompt: 'Adjunte documento de traslado o de reunión realizada con coordinador si aplica' },
      },
      {
        id: 'ubicacion_averiado',
        titulo: 'Ubicación Averiado',
        pregunta: '¿Realizó carpa de Liquidación de Averiados?',
        opciones: [
          { label: 'Dos o más carpas al mes', pts: 10 },
          { label: 'Una carpa al mes', pts: 5 },
          { label: 'No se sacó carpa', pts: 0 },
        ],
        evidencia: { tipo: 'texto', prompt: 'Ingrese fechas de realización de carpa' },
      },
      {
        id: 'herramientas_generales',
        titulo: 'Herramientas de Uso General',
        pregunta: 'Seleccione el estado de las herramientas',
        opciones: [{ label: 'Completas y funcionales', pts: 5 }, { label: 'Incompletas o en mal estado', pts: 0 }],
        evidencia: { tipo: 'foto', prompt: 'Adjunte fotografía de herramientas por categoría' },
      },
      {
        id: 'local_quest',
        titulo: 'Actualización de Local Quest',
        pregunta: 'Seleccione el nivel de actualización de Local Quest',
        opciones: [
          { label: 'Actualizado 3 veces x semana / 12 al mes', pts: 5 },
          { label: 'No se completó la actualización de todas las semanas', pts: 2 },
          { label: 'Actualización deficiente', pts: 0 },
        ],
        evidencia: { tipo: 'foto', prompt: 'Adjunte captura de versión del sistema' },
      },
      {
        id: 'matriz_inventarios',
        titulo: 'Matriz de inventarios',
        pregunta: 'Seleccione el rango de la nota obtenida',
        opciones: [
          { label: 'Mayor que 95', pts: 5 },
          { label: 'Entre 90 y 95', pts: 2 },
          { label: 'Menor que 90', pts: 0 },
        ],
      },
      {
        id: 'exactitud_inventarios',
        titulo: 'Exactitud de inventarios',
        pregunta: 'Seleccione el rango de la nota obtenida',
        opciones: [
          { label: 'Mayor que 99%', pts: 5 },
          { label: 'Entre 98% y 99%', pts: 2 },
          { label: 'Menor que 98%', pts: 0 },
        ],
      },
    ],
  },
  {
    seccion: 'Operación, Entregas y Equipo',
    items: [
      {
        id: 'tiempos_bodega',
        titulo: 'Tiempos de Bodega',
        pregunta: 'Retroalimente el porcentaje de Tiempos de sacado',
        opciones: [
          { label: 'Mayor que 98%', pts: 10 },
          { label: 'Entre 95% y 98%', pts: 5 },
          { label: 'Menor que 95%', pts: 0 },
        ],
      },
      {
        id: 'pendientes_entrega',
        titulo: 'Pendientes de Entrega',
        pregunta: 'Seleccione el estado de los pendientes de entrega',
        opciones: [
          { label: 'Pendientes menores a dos meses', pts: 10 },
          { label: 'Pendientes mayor a dos meses', pts: 5 },
          { label: 'Pendientes mayores a seis meses', pts: 0 },
        ],
        evidencia: { tipo: 'foto', prompt: 'Adjunte captura de pantalla de la bandeja de entregas' },
      },
      {
        id: 'reunion_coordinador',
        titulo: 'Reunión uno a uno con coordinador',
        pregunta: 'Seleccione el nivel de ejecución',
        opciones: [
          { label: 'Reuniones 1:1 ejecutadas', pts: 16 },
          { label: 'Ejecución parcial', pts: 8 },
          { label: 'No realizadas', pts: 0 },
        ],
        evidencia: { tipo: 'foto', prompt: 'Adjunte fotografías de reuniones ejecutadas' },
      },
      {
        id: 'clima_laboral',
        titulo: 'Clima Laboral (Calendario de Vacaciones)',
        pregunta: '¿Realizó calendarización de vacaciones del mes?',
        opciones: [{ label: 'Sí', pts: 5 }, { label: 'No', pts: 0 }],
        evidencia: { tipo: 'foto', prompt: 'Adjunte calendario de vacaciones programadas' },
      },
      {
        id: 'limpieza_general',
        titulo: 'Limpieza general de Tienda',
        pregunta: '¿Se revisaron todas las áreas de la tienda durante el mes?',
        opciones: [{ label: 'Sí', pts: 5 }, { label: 'No', pts: 0 }],
      },
    ],
  },
];

export const RUTINA_FLAT = RUTINA_SCHEMA.flatMap((s) => s.items.map((it) => ({
  ...it, seccion: s.seccion, max: Math.max(...it.opciones.map((o) => o.pts)),
})));
export const RUTINA_TOTAL_MAX = RUTINA_FLAT.reduce((sum, it) => sum + it.max, 0); // 100

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

// state: { answers: {id: optionIndex}, notes: {id:str}, touched: Set|Array }
export function computeRutinaSummary(state) {
  const answers = state.answers || {};
  const touched = state.touched instanceof Set ? state.touched : new Set(state.touched || []);

  const sections = RUTINA_SCHEMA.map((s) => {
    let a = 0, m = 0;
    s.items.forEach((it) => {
      const max = Math.max(...it.opciones.map((o) => o.pts));
      m += max;
      const idx = answers[it.id];
      if (touched.has(it.id) && typeof idx === 'number' && it.opciones[idx]) a += it.opciones[idx].pts;
    });
    return { seccion: s.seccion, a, m, pct: m ? Math.round((a / m) * 100) : 0 };
  });
  const totalAct = sections.reduce((s, x) => s + x.a, 0);
  const pct = RUTINA_TOTAL_MAX ? Math.round((totalAct / RUTINA_TOTAL_MAX) * 100) : 0;
  const best = touched.size ? [...sections].sort((a, b) => b.pct - a.pct)[0] : null;
  const worst = touched.size ? [...sections].sort((a, b) => a.pct - b.pct)[0] : null;

  return {
    sections, totalAct, totalMax: RUTINA_TOTAL_MAX, pct,
    touchedCount: touched.size, statusLabel: rutinaStatusLabel(pct, touched.size), best, worst,
  };
}
