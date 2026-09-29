// Genera el PDF de la auditoría FLOS directamente con jsPDF (texto/vectores,
// sin capturar pantalla): encabezado de marca, medidor circular, tarjetas por
// dimensión y por criterio, y un plan de acción con prioridades — todo en la
// paleta institucional de HERCO.
import { jsPDF } from 'jspdf';
import { flosTone } from '@/lib/flosSchema';
import { preparePhoto } from '@/lib/customFormPdf';

const NAVY = '#1e395e';
const CYAN = '#00a5df';
const TONE_HEX = { g: '#16a34a', a: '#ec9032', r: '#dc2626' };
const DIM_COLOR = { FRENTEO: '#00a5df', LIMPIEZA: '#16a34a', ORDEN: '#1e395e', SURTIDO: '#ec9032' };
const DIM_MONO = { FRENTEO: 'FR', LIMPIEZA: 'LI', ORDEN: 'OR', SURTIDO: 'SU' };
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
// Fotos: por criterio 4 por fila (hasta ~4.6 cm de alto); comentario general 3 por fila.
const PHOTO_GAP = 8, ROW_PHOTO_COLS = 4, ROW_PHOTO_MAX_H = 130, GENERAL_PHOTO_COLS = 3, GENERAL_PHOTO_MAX_H = 180;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Mezcla un color hacia blanco — para fondos de tarjeta "tintados" sin tener
// que inventar pasteles a mano por cada tono.
function tintRgb(hex, amt = 0.86) {
  const [r, g, b] = hexToRgb(hex);
  return [r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt].map(Math.round);
}

async function loadImageDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch (e) { return null; }
}

// Anillo de progreso dibujado con segmentos de línea (jsPDF no trae arcos
// nativos) — pista completa en gris claro + arco de color desde arriba,
// en sentido horario, proporcional al porcentaje.
function drawGauge(doc, cx, cy, r, pct, color, lineWidth = 11) {
  doc.setLineWidth(lineWidth);
  doc.setDrawColor(226, 230, 236);
  const track = 90;
  for (let i = 0; i < track; i++) {
    const a0 = (i / track) * 2 * Math.PI, a1 = ((i + 1) / track) * 2 * Math.PI;
    doc.line(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1));
  }
  const p = Math.max(0, Math.min(100, pct)) / 100;
  if (p > 0) {
    doc.setDrawColor(...hexToRgb(color));
    const segs = Math.max(2, Math.round(track * p));
    const sweep = p * 2 * Math.PI;
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (i / segs) * sweep, a1 = -Math.PI / 2 + ((i + 1) / segs) * sweep;
      doc.line(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    }
  }
}

function dimBadge(doc, dim, x, y, size = 22) {
  const color = DIM_COLOR[dim] || NAVY;
  doc.setFillColor(...tintRgb(color, 0.82));
  doc.roundedRect(x, y, size, size, 5, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(size * 0.34);
  doc.setTextColor(...hexToRgb(color));
  doc.text(DIM_MONO[dim] || dim.slice(0, 2), x + size / 2, y + size / 2 + size * 0.12, { align: 'center' });
}

export async function generateFlosPdf({ meta, rows, generalComment, generalPhotos, summary }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const logo = await loadImageDataUrl('/icon-192.png');
  let y = 0;

  const newPage = () => { doc.addPage(); y = MARGIN; };
  const ensure = (need) => { if (y + need > PAGE_H - 56) newPage(); };

  // ── Encabezado de marca ──────────────────────────────────────
  doc.setFillColor(...hexToRgb(NAVY));
  doc.rect(0, 0, PAGE_W, 96, 'F');
  doc.setFillColor(...hexToRgb(CYAN));
  doc.rect(0, 96, PAGE_W, 4, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', MARGIN, 22, 46, 46); } catch (e) { /* logo opcional */ } }
  const titleX = logo ? MARGIN + 60 : MARGIN;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
  doc.text('Auditoría FLOS', titleX, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.setTextColor(210, 224, 240);
  doc.text('Frenteo · Limpieza · Orden · Surtido', titleX, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${new Date().toLocaleString('es-HN')}`, titleX, 78);
  y = 122;

  // Fotos listas para el PDF (dimensiones reales, JPEG re-codificado) — se
  // preparan antes de dibujar para poder medir cada fila y no deformarlas.
  const prep = async (list) => (await Promise.all((list || []).map((p) => (p?.dataUrl ? preparePhoto(p.dataUrl) : null)))).filter(Boolean);
  const rowPhotos = await Promise.all(rows.map((r) => prep(r.photos)));
  const generales = await prep(generalPhotos);

  // Cuadrícula de fotos con su proporción real, centrada en cada celda. Salta
  // de página por fila. `firstRowH` sirve para que un título o tarjeta no se
  // quede al pie de una página y sus fotos en la siguiente.
  const fitSizes = (fila, cellW, maxH) => fila.map((p) => { const s = Math.min(cellW / p.w, maxH / p.h); return { w: p.w * s, h: p.h * s }; });
  const gridCellW = (cols) => (CONTENT_W - PHOTO_GAP * (cols - 1)) / cols;
  const firstRowH = (photos, cols, maxH) => (photos.length
    ? Math.max(...fitSizes(photos.slice(0, cols), gridCellW(cols), maxH).map((s) => s.h)) + PHOTO_GAP : 0);
  const photoGrid = (photos, cols, maxH, titulo) => {
    const cellW = gridCellW(cols);
    for (let i = 0; i < photos.length; i += cols) {
      const fila = photos.slice(i, i + cols);
      const sizes = fitSizes(fila, cellW, maxH);
      const rowH = Math.max(...sizes.map((s) => s.h));
      const pagina = doc.internal.getNumberOfPages();
      ensure(rowH + PHOTO_GAP);
      // si las fotos siguen en otra página, se aclara de qué criterio son
      if (i > 0 && titulo && doc.internal.getNumberOfPages() !== pagina) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(120, 128, 140);
        doc.text(`${titulo} (continuación)`, MARGIN, y + 8);
        y += 16;
      }
      fila.forEach((p, j) => {
        const cellX = MARGIN + j * (cellW + PHOTO_GAP);
        const { w, h } = sizes[j];
        doc.setFillColor(242, 244, 247);
        doc.roundedRect(cellX, y, cellW, rowH, 4, 4, 'F');
        try { doc.addImage(p.data, 'JPEG', cellX + (cellW - w) / 2, y + (rowH - h) / 2, w, h); } catch (e) { /* imagen inválida, se omite */ }
      });
      y += rowH + PHOTO_GAP;
    }
  };

  // ── Ficha de la visita ───────────────────────────────────────
  // El alto de las casillas se calcula con el texto real: un nombre largo
  // ("Moisés Armando Melgar Álvarez") ocupa 2 líneas y antes se salía.
  const fieldW = (CONTENT_W - 24) / 3;
  const fields = [['Sucursal', meta.sucursal], ['Auditor', meta.auditor], ['Fecha', meta.fecha]];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
  const fieldLines = fields.map(([, value]) => doc.splitTextToSize(String(value || '—'), fieldW - 24));
  const fichaH = 46 + (Math.max(...fieldLines.map((l) => l.length)) - 1) * 14;
  fields.forEach(([label], i) => {
    const x = MARGIN + i * (fieldW + 12);
    doc.setFillColor(246, 248, 251); doc.roundedRect(x, y, fieldW, fichaH, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(140, 148, 160);
    doc.text(label.toUpperCase(), x + 12, y + 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...hexToRgb(NAVY));
    fieldLines[i].forEach((ln, k) => doc.text(ln, x + 12, y + 34 + k * 14));
  });
  y += fichaH + 8;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5);
  const lineaLines = doc.splitTextToSize(String(meta.linea || '—'), CONTENT_W - 150 - 12);
  const lineaH = 30 + (lineaLines.length - 1) * 14;
  doc.setFillColor(246, 248, 251); doc.roundedRect(MARGIN, y, CONTENT_W, lineaH, 8, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(140, 148, 160);
  doc.text('CATEGORÍA / LÍNEA', MARGIN + 12, y + 18);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...hexToRgb(NAVY));
  lineaLines.forEach((ln, k) => doc.text(ln, MARGIN + 150, y + 20 + k * 14));
  y += lineaH + 16;

  // ── Resultado global: medidor + dimensiones ─────────────────
  const tone = flosTone(summary.pct);
  const gcx = MARGIN + 62, gcy = y + 62, gr = 50;
  drawGauge(doc, gcx, gcy, gr, summary.pct, TONE_HEX[tone]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(23); doc.setTextColor(...hexToRgb(TONE_HEX[tone]));
  doc.text(`${summary.pct}%`, gcx, gcy + 8, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
  doc.text(`${summary.totalAct}/${summary.totalMax} pts`, gcx, gcy + 22, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(60, 66, 76);
  doc.text(summary.statusLabel, gcx, gcy + 76, { align: 'center' });

  const gridX = MARGIN + 150, gridW = PAGE_W - MARGIN - gridX, cellW = (gridW - 10) / 2, cellH = 50;
  summary.dims.forEach((d, i) => {
    const cx = gridX + (i % 2) * (cellW + 10), cy = y + Math.floor(i / 2) * (cellH + 8);
    const t = flosTone(d.pct);
    doc.setFillColor(252, 252, 253); doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.7);
    doc.roundedRect(cx, cy, cellW, cellH, 8, 8, 'FD');
    dimBadge(doc, d.dim, cx + 8, cy + 8, 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(50, 56, 66);
    doc.text(d.dim, cx + 38, cy + 18);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...hexToRgb(TONE_HEX[t]));
    doc.text(`${d.pct}%`, cx + cellW - 10, cy + 20, { align: 'right' });
    doc.setFillColor(230, 233, 238); doc.roundedRect(cx + 38, cy + 30, cellW - 48, 6, 3, 3, 'F');
    doc.setFillColor(...hexToRgb(TONE_HEX[t]));
    doc.roundedRect(cx + 38, cy + 30, Math.max(4, ((cellW - 48) * d.pct) / 100), 6, 3, 3, 'F');
  });
  // El bloque mide lo que ocupe lo más alto: el medidor con su estado debajo
  // (hasta gcy + 76 + descendentes) o la cuadrícula de dimensiones. Antes solo
  // se contaba la cuadrícula y el estado ("Excelente ejecución") quedaba
  // tapado por las estadísticas.
  const dimsRows = Math.ceil(summary.dims.length / 2);
  y += Math.max(dimsRows * cellH + (dimsRows - 1) * 8, 62 + 76 + 6) + 16;

  // ── Franja de estadísticas ───────────────────────────────────
  const stats = [
    ['Criterios evaluados', `${summary.touchedCount}/${rows.length}`],
    ['En riesgo (<75%)', summary.atRisk],
    ['Puntos perdidos', summary.lost],
  ];
  const statW = (CONTENT_W - 16) / 3;
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * (statW + 8);
    doc.setFillColor(...tintRgb(NAVY, 0.93)); doc.roundedRect(x, y, statW, 40, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(String(value), x + 12, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 120, 134);
    doc.text(label, x + 12, y + 33);
  });
  y += 40 + 26;

  // ── Detalle por criterio ────────────────────────────────────
  // Cada tarjeta se mide ANTES de dibujarla (nombre + comentario) y las fotos
  // van debajo en cuadrícula, con su proporción real y todas (antes: cuadradas,
  // deformadas y máximo 5). Separación fija entre tarjetas y títulos.
  ensure(30 + 24 + 60);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Detalle del recorrido', MARGIN, y);
  y += 14;

  let curDim = null;
  rows.forEach((r, ri) => {
    const fotos = rowPhotos[ri];
    const t = r.touched ? flosTone(r.max ? (r.score / r.max) * 100 : 0) : null;
    const chipTxt = r.touched ? `${r.score}/${r.max}` : 'No evaluado';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    const chipW = doc.getTextWidth(chipTxt) + 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(r.name, CONTENT_W - 28 - chipW - 12);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.6);
    const noteLines = r.comment ? doc.splitTextToSize(`"${r.comment}"`, CONTENT_W - 28) : [];
    // posiciones relativas a la parte de arriba de la tarjeta
    const nameB = 20;
    const lastNameB = nameB + (nameLines.length - 1) * 12;
    const noteB = lastNameB + 15;
    const lastB = noteLines.length ? noteB + (noteLines.length - 1) * 11 : lastNameB;
    const cardH = lastB + 11;
    const primeraFila = firstRowH(fotos, ROW_PHOTO_COLS, ROW_PHOTO_MAX_H);

    if (r.dim !== curDim) {
      curDim = r.dim;
      // el título de la dimensión baja de página junto con su primera tarjeta
      ensure(10 + 22 + cardH + primeraFila);
      y += 10;
      dimBadge(doc, curDim, MARGIN, y, 18);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...hexToRgb(DIM_COLOR[curDim] || NAVY));
      doc.text(curDim, MARGIN + 24, y + 13);
      y += 26;
    } else {
      ensure(cardH + primeraFila);
    }

    const top = y;
    doc.setFillColor(...(t ? tintRgb(TONE_HEX[t], 0.9) : [248, 248, 249]));
    doc.roundedRect(MARGIN, top, CONTENT_W, cardH, 7, 7, 'F');

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 32, 38);
    nameLines.forEach((ln, k) => doc.text(ln, MARGIN + 14, top + nameB + k * 12));

    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.setFillColor(...hexToRgb(t ? TONE_HEX[t] : '#9aa1ad'));
    doc.roundedRect(PAGE_W - MARGIN - 14 - chipW, top + 8, chipW, 15, 7.5, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(chipTxt, PAGE_W - MARGIN - 14 - chipW / 2, top + 18.5, { align: 'center' });

    if (noteLines.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.6); doc.setTextColor(90, 96, 106);
      noteLines.forEach((ln, k) => doc.text(ln, MARGIN + 14, top + noteB + k * 11));
    }
    y = top + cardH + 6;
    if (fotos.length) photoGrid(fotos, ROW_PHOTO_COLS, ROW_PHOTO_MAX_H, `Fotos de: ${r.name}`);
    y += 6;
  });

  // ── Comentario general ──────────────────────────────────────
  if (generalComment || generales.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    const lines = generalComment ? doc.splitTextToSize(generalComment, CONTENT_W) : [];
    ensure(16 + 22 + lines.length * 12 + firstRowH(generales, GENERAL_PHOTO_COLS, GENERAL_PHOTO_MAX_H));
    y += 16;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text('Comentario general de la visita', MARGIN, y);
    y += 18;
    if (lines.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(50, 54, 62);
      lines.forEach((ln) => { ensure(12); doc.text(ln, MARGIN, y); y += 12; });
      y += 6;
    }
    if (generales.length) photoGrid(generales, GENERAL_PHOTO_COLS, GENERAL_PHOTO_MAX_H, 'Fotos del comentario general');
  }

  // ── Plan de acción ───────────────────────────────────────────
  newPage();
  doc.setFillColor(...hexToRgb(NAVY)); doc.rect(0, 0, PAGE_W, 4, 'F');
  y = MARGIN + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Plan de acción', MARGIN, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(130, 138, 150);
  doc.text('Ordenado por urgencia — de la mayor pérdida de puntos a la menor.', MARGIN, y + 16);
  y += 32;

  if (summary.plan.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(22, 163, 74);
    doc.text(summary.touchedCount > 0
      ? 'Sin acciones pendientes: todo lo evaluado alcanzó el máximo.'
      : 'Recorrido incompleto: no hay acciones que priorizar.', MARGIN, y + 12);
  } else {
    const prioColor = { hi: '#dc2626', md: '#ec9032', lo: '#16a34a' };
    summary.plan.forEach((g) => {
      // A la derecha, en la misma línea del nombre: "3/5 pts" + chip de
      // prioridad. El nombre se corta antes de llegar ahí y la acción va
      // debajo a todo el ancho (antes "3/5 pts" se montaba sobre la acción).
      const pTxt = g.priority.toUpperCase();
      const ptsTxt = `${g.s}/${g.v.max} pts`;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      const pW = doc.getTextWidth(pTxt) + 14;
      doc.setFontSize(8.5);
      const ptsW = doc.getTextWidth(ptsTxt);
      doc.setFontSize(10.5);
      const nameLines = doc.splitTextToSize(g.v.name, CONTENT_W - 16 - 12 - pW - 8 - ptsW - 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      const actLines = doc.splitTextToSize(g.v.action, CONTENT_W - 32);
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.3);
      const noteLines = g.note ? doc.splitTextToSize(`Hallazgo: "${g.note}"`, CONTENT_W - 32) : [];

      const nameB = 19;
      const lastNameB = nameB + (nameLines.length - 1) * 13;
      const actB = lastNameB + 15;
      const lastActB = actB + (actLines.length - 1) * 11;
      const noteB = lastActB + 14;
      const lastB = noteLines.length ? noteB + (noteLines.length - 1) * 10.5 : lastActB;
      const cardH = lastB + 12;
      ensure(cardH + 8);

      const top = y;
      const color = prioColor[g.priorityKey];
      doc.setFillColor(...tintRgb(color, 0.93));
      doc.roundedRect(MARGIN, top, CONTENT_W, cardH, 8, 8, 'F');
      doc.setFillColor(...hexToRgb(color));
      doc.roundedRect(MARGIN, top, 4, cardH, 2, 2, 'F');

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(30, 32, 38);
      nameLines.forEach((ln, k) => doc.text(ln, MARGIN + 16, top + nameB + k * 13));

      const chipX = PAGE_W - MARGIN - 12 - pW;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      doc.setFillColor(...hexToRgb(color));
      doc.roundedRect(chipX, top + 8, pW, 14, 7, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(pTxt, chipX + pW / 2, top + 18, { align: 'center' });
      doc.setFontSize(8.5); doc.setTextColor(90, 96, 106);
      doc.text(ptsTxt, chipX - 8, top + 18, { align: 'right' });

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 66, 76);
      actLines.forEach((ln, k) => doc.text(ln, MARGIN + 16, top + actB + k * 11));
      if (noteLines.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.3); doc.setTextColor(110, 116, 126);
        noteLines.forEach((ln, k) => doc.text(ln, MARGIN + 16, top + noteB + k * 10.5));
      }
      y = top + cardH + 8;
    });
  }

  // ── Pie de página en todas las páginas ───────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 22, 2.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO360 · Auditoría FLOS', MARGIN + 11, PAGE_H - 19);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
  }

  const fname = `Auditoria_FLOS_${(meta.sucursal || 'tienda').replace(/\s+/g, '')}_${meta.fecha || ''}.pdf`;
  doc.save(fname);
}
