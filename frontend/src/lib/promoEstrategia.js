// Estrategia de cada promoción del consolidado de Mercadeo: Descuento (%),
// Precio especial (precio lista -> precio promo) o Combo (2+1, 3+1 a un precio).
// Se detecta al leer el Excel y viaja con cada pregunta (estrategia + etiqueta)
// para que quien responde y quien revisa sepan QUÉ se debe ver en el rótulo.

export const ESTRATEGIA_LABEL = {
  descuento: 'Descuento', precio: 'Precio especial', combo: 'Combo', mixta: 'Varias estrategias',
};

// Color por estrategia (chips del formulario, historial y PDF)
export const ESTRATEGIA_COLOR = {
  descuento: '#16a34a', precio: '#00a5df', combo: '#712146', mixta: '#6b7280',
};

const norm = (v) => (v ?? '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// Valor de una columna por nombre normalizado ("Observación" == "observacion")
function col(row, headers, name) {
  const h = headers.find((x) => norm(x) === norm(name));
  const v = h ? row[h] : '';
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * Lee la estrategia de una fila del Excel ya inspeccionado.
 * Devuelve { estrategia, oferta, etiqueta, codigo } donde:
 *  - oferta: el detalle corto para mostrar junto al producto
 *    ("15%", "2+1 · L 370.00", "L 5,300.00 → L 4,260.00")
 *  - etiqueta: el chip de la pregunta ("DESCUENTO 15%", "COMBO 2+1", "PRECIO ESPECIAL")
 */
export function detectarEstrategia(row, headers) {
  const hoja = norm(col(row, headers, 'Hoja'));
  const desc = col(row, headers, 'Descuento');
  const obs = col(row, headers, 'Observación');
  const pCombo = col(row, headers, 'Precio combo');
  const pLista = col(row, headers, 'Precio lista');
  const pPromo = col(row, headers, 'Precio promo');
  const codigo = col(row, headers, 'Código');

  let estrategia = '';
  if (hoja.includes('combo') || pCombo || /\d\s*\+\s*\d/.test(obs)) estrategia = 'combo';
  else if (hoja.includes('precio') || pPromo) estrategia = 'precio';
  else if (hoja.includes('descuento') || desc) estrategia = 'descuento';

  let oferta = '';
  let etiqueta = '';
  if (estrategia === 'combo') {
    oferta = [obs, pCombo].filter(Boolean).join(' · ');
    etiqueta = `COMBO${obs ? ` ${obs}` : ''}`;
  } else if (estrategia === 'precio') {
    oferta = pLista && pPromo ? `${pLista} → ${pPromo}` : pPromo;
    etiqueta = 'PRECIO ESPECIAL';
  } else if (estrategia === 'descuento') {
    oferta = desc;
    etiqueta = `DESCUENTO${desc ? ` ${desc}` : ''}`;
  }
  return { estrategia, oferta, etiqueta, codigo };
}

// Etiqueta de una pregunta que agrupa varias líneas: si todas comparten
// estrategia (y el mismo % o la misma mecánica de combo) se dice; si no, "mixta".
export function etiquetaDeGrupo(lineas) {
  const estr = [...new Set(lineas.map((l) => l.estrategia || ''))];
  if (estr.length !== 1 || !estr[0]) {
    return estr.filter(Boolean).length > 1 ? { estrategia: 'mixta', etiqueta: 'VARIAS ESTRATEGIAS' } : { estrategia: '', etiqueta: '' };
  }
  const e = estr[0];
  if (e === 'precio') return { estrategia: e, etiqueta: 'PRECIO ESPECIAL' };
  const detalles = [...new Set(lineas.map((l) => (e === 'descuento' ? l.descuento : (l.oferta || '').split(' · ')[0]) || ''))];
  const base = e === 'combo' ? 'COMBO' : 'DESCUENTO';
  return { estrategia: e, etiqueta: detalles.length === 1 && detalles[0] ? `${base} ${detalles[0]}` : base };
}
