// Esquema de la Auditoría FLOS (Frenteo · Limpieza · Orden · Surtido).
// Portado de "Auditoría FLOS Herco 2.1 (Referencias).html" — mismo contenido y
// puntajes, reestilizado a la interfaz de HERCO360.

export const FLOS_SUCURSALES = ['Panamericana', 'Centro', 'San Lorenzo', 'Juticalpa', 'Champagnat'];

export const FLOS_SCHEMA = [
  {
    dimension: 'FRENTEO',
    icon: 'AlignStartVertical',
    variables: [
      { id: 'f1', name: 'Presentación Visual de Producto en Góndola', max: 8, desc: 'Alineación vertical perfecta, frentes hacia adelante y sin huecos falsos.', action: 'Ejecutar frenteo inmediato arrastrando el producto hacia la línea frontal del fleje. Colocar los empaques más limpios adelante.' },
      { id: 'f2', name: 'Presentación Visual de Producto en Exhibición', max: 8, desc: 'Muestras físicas fijas (como cerraduras en paneles de madera) atornilladas y operativas.', action: 'Ajustar tornillos sueltos en las muestras de exhibición, limpiar manchas de grasa y reponer las muestras dañadas.' },
      { id: 'f3', name: 'Rotación Correcta de Fechas', max: 5, desc: '> 5 articulos vencidos = 0 puntos', action: 'Retirar bolsas rotas del pasillo. Reempacar la tornillería suelta y aplicar PEPS mandando el stock viejo al frente.' },
      { id: 'f4', name: 'Colocación de Material POP y Promociones', max: 5, desc: 'Rótulos de descuento vigentes, alineados y distribuidos uniformemente por cuadrante. Verificar promociones vigentes antes de comenzar evaluacion', action: 'Redistribuir el material POP sobrecargado. Retirar carteles de ofertas vencidas y alinear los flejes promocionales.' },
      { id: 'f5', name: 'Correcto Etiquetado del Producto', max: 5, desc: 'Revisar 30 etiquetas — 25 a 30 correctas = 5 pts · 20 a 24 = 3 pts · menos de 20 = 0 pts', action: 'Imprimir flejes de precios faltantes desde el sistema. Retirar etiquetas dañadas o escritas con marcador.' },
    ],
  },
  {
    dimension: 'LIMPIEZA',
    icon: 'Sparkles',
    variables: [
      { id: 'l1', name: 'Limpieza de los Estantes', max: 6, desc: 'Libre de polvo, humedad y manchas', action: 'Limpieza profunda con paño desengrasante en las bases de estantería. Eliminar residuos de derrame de líquidos.' },
      { id: 'l2', name: 'Limpieza de los Productos', max: 7, desc: 'Libre de polvo, humedad y manchas', action: 'Pasar sacudidor de microfibra por todo el stock expuesto. Limpiar la acumulación de polvo en las caras superiores.' },
      { id: 'l3', name: 'Limpieza del Pasillo', max: 5, desc: 'Libre de polvo y objetos extraños (papeles, bolsas,etiquetas)', action: 'Barrer el pasillo de inmediato y retirar residuos plásticos generados durante el desempaque matutino.' },
    ],
  },
  {
    dimension: 'ORDEN',
    icon: 'LayoutGrid',
    variables: [
      { id: 'o1', name: 'Góndola y Estaciones Libres de Objetos Ajenos a Ellas', max: 7, desc: 'Botes, bebidas en bolsa, comida, golosinas, objetos personales.', action: 'Retirar del piso de venta cualquier termo, botella de agua u objeto personal de los asesores. Moverlos a los casilleros.' },
      { id: 'o2', name: 'Pasillos Libres de Objetos Ajenos al Mismo', max: 5, desc: 'Tránsito fluido. Canastas, carretillas y escaleras en su ubicación correspondiente.', action: 'Reubicar las escaleras logísticas y carretillas en los espacios asignados de bodega para liberar el paso del cliente.' },
      { id: 'o3', name: 'Herramientas y Equipo de Trabajo en Buenas Condiciones', max: 6, desc: 'Tenaza (1) Corta perno pequeño (1), Navaja (1) Destornillador (1Phillip y 1Plano), Ajustable (1) Cinta metrica (1)  Set de puntas Phillips (1), Tijera para lamina (1), segueta (1).', action: 'Realizar cambio de herramientas de uso general en area de trabajo' },
      { id: 'o4', name: 'Orden y Rotulación en Cajas y Empaques de Bodegas Aéreas', max: 5, desc: 'Cajas estibadas de manera correcta, Rotulacion con marcador negro y letra grande y legible. Ver hoja de referencias.', action: 'Girar y ordenar las cajas de sobre-stock aéreo. Escribir con marcador legible el contenido viendo de frente.' },
      { id: 'o5', name: 'Góndola Libre de Producto Averiado', max: 5, desc: 'Cero producto quebrado, abollado o abierto en el lineal. El averiado va a su estante correspondiente.', action: 'Retirar del lineal el producto golpeado o abierto y trasladarlo al área de merma autorizada para trámite logístico.' },
    ],
  },
  {
    dimension: 'SURTIDO',
    icon: 'PackageSearch',
    variables: [
      { id: 's1', name: 'Stock Adecuado de Producto', max: 8, desc: 'Densidad óptima. Evitar ganchos vacíos teniendo mercancía disponible.', action: 'Bajar mercancía de la bodega aérea de forma inmediata para rellenar los ganchos vacíos de alta rotación.' },
      { id: 's2', name: 'Activaciones de Temporada y Promociones Mensuales', max: 8, desc: 'Verificar activaciones de temporada y promociones vigentes antes de comenzar evaluacion.', action: 'Modificar la altura de los entrepaños de la góndola para compactar el espacio y eliminar los huecos vacíos de aire.' },
      { id: 's3', name: 'Góndola Frondosa de Producto', max: 7, desc: 'Ajuste de bandejas para evitar huecos de aire masivos e infundir percepción de abundancia.', action: 'Modificar la altura de los entrepaños de la góndola para compactar el espacio y eliminar los huecos vacíos de aire.' },
    ],
  },
];

// Lista plana en el orden del recorrido, con la dimensión adjunta a cada variable.
export const FLOS_FLAT = FLOS_SCHEMA.flatMap((d) => d.variables.map((v) => ({ ...v, dim: d.dimension })));
export const FLOS_TOTAL_MAX = FLOS_FLAT.reduce((s, v) => s + v.max, 0);

// Fotos y texto de referencia — solo para los 5 criterios que el manual documentó
// fotográficamente. Las imágenes viven en /public/flos-refs (servidas como estáticos).
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
// ordenadas de la más urgente a la menos urgente). Toma el estado del recorrido
// { scores: {id:int}, comments: {id:str}, touched: Set|Array } y no muta nada.
export function computeFlosSummary(state) {
  const scores = state.scores || {};
  const touched = state.touched instanceof Set ? state.touched : new Set(state.touched || []);
  const comments = state.comments || {};

  const dims = FLOS_SCHEMA.map((d) => {
    let a = 0, m = 0;
    d.variables.forEach((v) => { a += scores[v.id] ?? 0; m += v.max; });
    return { dim: d.dimension, icon: d.icon, a, m, pct: m ? Math.round((a / m) * 100) : 0, lost: m - a };
  });
  const totalAct = dims.reduce((s, d) => s + d.a, 0);
  const pct = FLOS_TOTAL_MAX ? Math.round((totalAct / FLOS_TOTAL_MAX) * 100) : 0;
  const lost = FLOS_TOTAL_MAX - totalAct;
  const atRisk = FLOS_FLAT.filter((v) => v.max > 0 && (scores[v.id] ?? 0) / v.max < 0.75).length;
  const best = touched.size ? [...dims].sort((a, b) => b.pct - a.pct)[0] : null;
  const worst = touched.size ? [...dims].sort((a, b) => a.pct - b.pct)[0] : null;

  const gaps = [];
  FLOS_SCHEMA.forEach((d) => d.variables.forEach((v) => {
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
    dims, totalAct, totalMax: FLOS_TOTAL_MAX, pct, lost, atRisk, best, worst,
    touchedCount: touched.size, statusLabel: flosStatusLabel(pct, touched.size), plan,
  };
}
