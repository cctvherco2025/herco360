// PDF de la Rutina Operativa — Gerentes, con jsPDF (texto/vectores, sin
// capturar pantalla). Misma identidad visual que flosPdf.js.
import { jsPDF } from 'jspdf';
import { RUTINA_TOTAL_MAX, rutinaTone } from '@/lib/rutinaSchema';

const NAVY = '#1e395e';
const CYAN = '#00a5df';
const TONE_HEX = { g: '#16a34a', a: '#ec9032', r: '#dc2626' };
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
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

export async function generateRutinaPdf({ meta, rows, summary }) {
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
  doc.text('Rutina Operativa · Gerentes', titleX, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.setTextColor(210, 224, 240);
  doc.text('Evaluación mensual de gestión de tienda', titleX, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${new Date().toLocaleString('es-HN')}`, titleX, 78);
  y = 122;

  // ── Ficha de la evaluación ───────────────────────────────────
  const fieldW = (PAGE_W - MARGIN * 2 - 24) / 4;
  const fields = [['Sucursal', meta.sucursal], ['Gerente', meta.gerente], ['Mes', meta.mesLabel], ['Fecha', meta.fecha]];
  fields.forEach(([label, value], i) => {
    const x = MARGIN + i * (fieldW + 8);
    doc.setFillColor(246, 248, 251); doc.roundedRect(x, y, fieldW, 46, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(label.toUpperCase(), x + 10, y + 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(String(value || '—'), x + 10, y + 34, { maxWidth: fieldW - 16 });
  });
  y += 66;

  // ── Resultado global: medidor + secciones ───────────────────
  const tone = rutinaTone(summary.pct);
  const gcx = MARGIN + 62, gcy = y + 62, gr = 50;
  drawGauge(doc, gcx, gcy, gr, summary.pct, TONE_HEX[tone]);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(23); doc.setTextColor(...hexToRgb(TONE_HEX[tone]));
  doc.text(`${summary.pct}%`, gcx, gcy + 8, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
  doc.text(`${summary.totalAct}/${RUTINA_TOTAL_MAX} pts`, gcx, gcy + 22, { align: 'center' });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(60, 66, 76);
  doc.text(summary.statusLabel, gcx, gcy + 76, { align: 'center' });

  const secX = MARGIN + 150, secW = PAGE_W - MARGIN - secX, secH = 34;
  summary.sections.forEach((s, i) => {
    const cy2 = y + i * (secH + 8);
    const t = rutinaTone(s.pct);
    doc.setFillColor(252, 252, 253); doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.7);
    doc.roundedRect(secX, cy2, secW, secH, 8, 8, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(50, 56, 66);
    const lbl = doc.splitTextToSize(s.seccion, secW - 90);
    doc.text(lbl[0], secX + 10, cy2 + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text(`${s.a}/${s.m} pts`, secX + 10, cy2 + 26);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...hexToRgb(TONE_HEX[t]));
    doc.text(`${s.pct}%`, secX + secW - 10, cy2 + 21, { align: 'right' });
  });
  y += summary.sections.length * (secH + 8) + 18;

  // ── Detalle por pregunta ─────────────────────────────────────
  ensure(30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Detalle de la evaluación', MARGIN, y);
  y += 20;

  let curSec = null;
  for (const r of rows) {
    if (r.seccion !== curSec) {
      curSec = r.seccion;
      ensure(28);
      doc.setFillColor(...hexToRgb(CYAN)); doc.rect(MARGIN, y - 10, 3, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...hexToRgb(NAVY));
      const secLines = doc.splitTextToSize(curSec, PAGE_W - MARGIN * 2 - 14);
      doc.text(secLines, MARGIN + 10, y);
      y += secLines.length * 12 + 6;
    }
    const t = r.touched ? rutinaTone(r.max ? (r.score / r.max) * 100 : 0) : null;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(r.titulo, PAGE_W - MARGIN * 2 - 90);
    const optLine = r.opcion ? doc.splitTextToSize(r.opcion, PAGE_W - MARGIN * 2 - 24) : [];
    const noteLines = r.note ? doc.splitTextToSize(`"${r.note}"`, PAGE_W - MARGIN * 2 - 24) : [];
    const hasPhotos = r.photos && r.photos.length > 0;
    const cardH = 14 + nameLines.length * 12 + (optLine.length ? optLine.length * 10.5 + 3 : 0)
      + (noteLines.length ? noteLines.length * 10.5 + 3 : 0) + (hasPhotos ? 58 : 6);
    ensure(cardH + 8);

    doc.setFillColor(...(t ? tintRgb(TONE_HEX[t], 0.9) : [248, 248, 249]));
    doc.roundedRect(MARGIN, y - 12, PAGE_W - MARGIN * 2, cardH, 7, 7, 'F');

    doc.setTextColor(30, 32, 38);
    doc.text(nameLines, MARGIN + 14, y);
    const chipTxt = r.touched ? `${r.score}/${r.max}` : 'Sin responder';
    const chipColor = t ? TONE_HEX[t] : '#9aa1ad';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    const chipW = doc.getTextWidth(chipTxt) + 16;
    doc.setFillColor(...hexToRgb(chipColor));
    doc.roundedRect(PAGE_W - MARGIN - 14 - chipW, y - 10, chipW, 15, 7.5, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(chipTxt, PAGE_W - MARGIN - 14 - chipW / 2, y, { align: 'center' });
    y += nameLines.length * 12 + 2;

    if (optLine.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7); doc.setTextColor(70, 76, 86);
      doc.text(optLine, MARGIN + 14, y);
      y += optLine.length * 10.5 + 3;
    }
    if (noteLines.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(100, 106, 116);
      doc.text(noteLines, MARGIN + 14, y);
      y += noteLines.length * 10.5 + 3;
    }
    if (hasPhotos) {
      const thumb = 52, gap = 7;
      r.photos.slice(0, 5).forEach((p, i) => {
        try {
          doc.addImage(p.dataUrl, 'JPEG', MARGIN + 14 + i * (thumb + gap), y, thumb, thumb);
          doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.5);
          doc.roundedRect(MARGIN + 14 + i * (thumb + gap), y, thumb, thumb, 3, 3, 'S');
        } catch (e) { /* imagen inválida, se omite */ }
      });
      y += thumb + 10;
    } else {
      y += 6;
    }
    y += 10;
  }

  // ── Pie de página en todas las páginas ───────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 22, 2.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO360 · Rutina Operativa', MARGIN + 11, PAGE_H - 19);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
  }

  const fname = `Rutina_Operativa_${(meta.sucursal || 'tienda').replace(/\s+/g, '')}_${meta.mesLabel || ''}.pdf`;
  doc.save(fname);
}
