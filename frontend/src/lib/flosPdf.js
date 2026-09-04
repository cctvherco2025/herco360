// Genera el PDF de la auditoría FLOS directamente con jsPDF (texto/vectores,
// sin capturar pantalla): encabezado de marca, medidor circular, tarjetas por
// dimensión y por criterio, y un plan de acción con prioridades — todo en la
// paleta institucional de HERCO.
import { jsPDF } from 'jspdf';
import { FLOS_TOTAL_MAX, flosTone } from '@/lib/flosSchema';

const NAVY = '#1e395e';
const CYAN = '#00a5df';
const TONE_HEX = { g: '#16a34a', a: '#ec9032', r: '#dc2626' };
const DIM_COLOR = { FRENTEO: '#00a5df', LIMPIEZA: '#16a34a', ORDEN: '#1e395e', SURTIDO: '#ec9032' };
const DIM_MONO = { FRENTEO: 'FR', LIMPIEZA: 'LI', ORDEN: 'OR', SURTIDO: 'SU' };
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;

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
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
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

  // ── Ficha de la visita ───────────────────────────────────────
  const fieldW = (PAGE_W - MARGIN * 2 - 24) / 3;
  const fields = [['Sucursal', meta.sucursal], ['Auditor', meta.auditor], ['Fecha', meta.fecha]];
  fields.forEach(([label, value], i) => {
    const x = MARGIN + i * (fieldW + 12);
    doc.setFillColor(246, 248, 251); doc.roundedRect(x, y, fieldW, 46, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(140, 148, 160);
    doc.text(label.toUpperCase(), x + 12, y + 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(String(value || '—'), x + 12, y + 34, { maxWidth: fieldW - 20 });
  });
  doc.setFillColor(246, 248, 251); doc.roundedRect(MARGIN, y + 54, PAGE_W - MARGIN * 2, 30, 8, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(140, 148, 160);
  doc.text('CATEGORÍA / LÍNEA', MARGIN + 12, y + 71);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...hexToRgb(NAVY));
  doc.text(String(meta.linea || '—'), MARGIN + 150, y + 74);
  y += 100;

  // ── Resultado global: medidor + dimensiones ─────────────────
  const tone = flosTone(summary.pct);
  const gcx = MARGIN + 62, gcy = y + 62, gr = 50;
  drawGauge(doc, gcx, gcy, gr, summary.pct, TONE_HEX[tone]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(23); doc.setTextColor(...hexToRgb(TONE_HEX[tone]));
  doc.text(`${summary.pct}%`, gcx, gcy + 8, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
  doc.text(`${summary.totalAct}/${FLOS_TOTAL_MAX} pts`, gcx, gcy + 22, { align: 'center' });
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
  y += cellH * 2 + 8 + 18;

  // ── Franja de estadísticas ───────────────────────────────────
  const stats = [
    ['Criterios evaluados', `${summary.touchedCount}/${rows.length}`],
    ['En riesgo (<75%)', summary.atRisk],
    ['Puntos perdidos', summary.lost],
  ];
  const statW = (PAGE_W - MARGIN * 2 - 16) / 3;
  stats.forEach(([label, value], i) => {
    const x = MARGIN + i * (statW + 8);
    doc.setFillColor(...tintRgb(NAVY, 0.93)); doc.roundedRect(x, y, statW, 40, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(String(value), x + 12, y + 22);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 120, 134);
    doc.text(label, x + 12, y + 33);
  });
  y += 58;

  // ── Detalle por criterio ────────────────────────────────────
  ensure(30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Detalle del recorrido', MARGIN, y);
  y += 20;

  let curDim = null;
  for (const r of rows) {
    if (r.dim !== curDim) {
      curDim = r.dim;
      ensure(30);
      dimBadge(doc, curDim, MARGIN, y - 15, 18);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...hexToRgb(DIM_COLOR[curDim] || NAVY));
      doc.text(curDim, MARGIN + 24, y - 2);
      y += 12;
    }
    const t = r.touched ? flosTone(r.max ? (r.score / r.max) * 100 : 0) : null;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(r.name, PAGE_W - MARGIN * 2 - 90);
    const noteLines = r.comment ? doc.splitTextToSize(`"${r.comment}"`, PAGE_W - MARGIN * 2 - 24) : [];
    const hasPhotos = r.photos && r.photos.length > 0;
    const cardH = 14 + nameLines.length * 12 + (noteLines.length ? noteLines.length * 11 + 4 : 0) + (hasPhotos ? 58 : 8);
    ensure(cardH + 8);

    doc.setFillColor(...(t ? tintRgb(TONE_HEX[t], 0.9) : [248, 248, 249]));
    doc.roundedRect(MARGIN, y - 12, PAGE_W - MARGIN * 2, cardH, 7, 7, 'F');

    doc.setTextColor(30, 32, 38);
    doc.text(nameLines, MARGIN + 14, y);
    const chipTxt = r.touched ? `${r.score}/${r.max}` : 'No evaluado';
    const chipColor = t ? TONE_HEX[t] : '#9aa1ad';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    const chipW = doc.getTextWidth(chipTxt) + 16;
    doc.setFillColor(...hexToRgb(chipColor));
    doc.roundedRect(PAGE_W - MARGIN - 14 - chipW, y - 10, chipW, 15, 7.5, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(chipTxt, PAGE_W - MARGIN - 14 - chipW / 2, y, { align: 'center' });
    y += nameLines.length * 12 + 2;

    if (noteLines.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.6); doc.setTextColor(90, 96, 106);
      doc.text(noteLines, MARGIN + 14, y);
      y += noteLines.length * 11 + 4;
    }
    if (hasPhotos) {
      const thumb = 52, gap = 7;
      r.photos.slice(0, 5).forEach((p, i) => {
        try {
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.5);
          doc.addImage(p.dataUrl, 'JPEG', MARGIN + 14 + i * (thumb + gap), y, thumb, thumb);
          doc.roundedRect(MARGIN + 14 + i * (thumb + gap), y, thumb, thumb, 3, 3, 'S');
        } catch (e) { /* imagen inválida, se omite */ }
      });
      y += thumb + 10;
    } else {
      y += 8;
    }
    y += 10;
  }

  // ── Comentario general ──────────────────────────────────────
  if (generalComment || (generalPhotos && generalPhotos.length)) {
    ensure(46);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text('Comentario general de la visita', MARGIN, y + 4);
    y += 20;
    if (generalComment) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(50, 54, 62);
      const lines = doc.splitTextToSize(generalComment, PAGE_W - MARGIN * 2);
      ensure(lines.length * 12);
      doc.text(lines, MARGIN, y);
      y += lines.length * 12 + 6;
    }
    if (generalPhotos && generalPhotos.length) {
      const thumb = 90, gap = 10;
      ensure(thumb + 10);
      generalPhotos.slice(0, 4).forEach((p, i) => {
        try {
          doc.addImage(p.dataUrl, 'JPEG', MARGIN + i * (thumb + gap), y, thumb, thumb);
          doc.setDrawColor(226, 230, 236); doc.setLineWidth(1);
          doc.roundedRect(MARGIN + i * (thumb + gap), y, thumb, thumb, 4, 4, 'S');
        } catch (e) { /* omite */ }
      });
      y += thumb + 14;
    }
  }

  // ── Plan de acción ───────────────────────────────────────────
  newPage();
  doc.setFillColor(...hexToRgb(NAVY)); doc.rect(0, 0, PAGE_W, 4, 'F');
  y = MARGIN + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Plan de acción', MARGIN, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(130, 138, 150);
  doc.text('Ordenado por urgencia — de la mayor pérdida de puntos a la menor.', MARGIN, y + 16);
  y += 40;

  if (summary.plan.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(22, 163, 74);
    doc.text(summary.touchedCount > 0
      ? 'Sin acciones pendientes: todo lo evaluado alcanzó el máximo.'
      : 'Recorrido incompleto: no hay acciones que priorizar.', MARGIN, y);
  } else {
    const prioColor = { hi: '#dc2626', md: '#ec9032', lo: '#16a34a' };
    summary.plan.forEach((g) => {
      const actLines = doc.splitTextToSize(g.v.action, PAGE_W - MARGIN * 2 - 24);
      const noteLines = g.note ? doc.splitTextToSize(`Hallazgo: "${g.note}"`, PAGE_W - MARGIN * 2 - 24) : [];
      const cardH = 22 + actLines.length * 11 + (noteLines.length ? noteLines.length * 10.5 + 4 : 0) + 14;
      ensure(cardH + 10);

      doc.setFillColor(...tintRgb(prioColor[g.priorityKey], 0.93));
      doc.roundedRect(MARGIN, y - 14, PAGE_W - MARGIN * 2, cardH, 8, 8, 'F');
      doc.setFillColor(...hexToRgb(prioColor[g.priorityKey]));
      doc.roundedRect(MARGIN, y - 14, 4, cardH, 2, 2, 'F');

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(30, 32, 38);
      doc.text(g.v.name, MARGIN + 16, y);
      const pTxt = g.priority.toUpperCase();
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      const pW = doc.getTextWidth(pTxt) + 14;
      doc.setFillColor(...hexToRgb(prioColor[g.priorityKey]));
      doc.roundedRect(PAGE_W - MARGIN - 16 - pW, y - 11, pW, 14, 7, 7, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(pTxt, PAGE_W - MARGIN - 16 - pW / 2, y - 1, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(90, 96, 106);
      doc.text(`${g.s}/${g.v.max} pts`, PAGE_W - MARGIN - 16, y + 12, { align: 'right' });
      y += 16;

      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 66, 76);
      doc.text(actLines, MARGIN + 16, y);
      y += actLines.length * 11 + 4;
      if (noteLines.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.3); doc.setTextColor(110, 116, 126);
        doc.text(noteLines, MARGIN + 16, y);
        y += noteLines.length * 10.5;
      }
      y += 22;
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
