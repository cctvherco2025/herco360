// PDF de una respuesta a un formulario personalizado, con jsPDF (texto/
// vectores, sin capturar pantalla). Misma identidad visual que flosPdf.js /
// rutinaPdf.js, pero dirigida por el esquema guardado (no hay contenido fijo):
// si el formulario no lleva puntaje, se omite el medidor y solo se listan las
// respuestas.
import { jsPDF } from 'jspdf';

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
function tone(pct) { return pct >= 90 ? 'g' : pct >= 75 ? 'a' : 'r'; }

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

function answerText(row) {
  if (Array.isArray(row.respuesta)) return row.respuesta.length ? row.respuesta.join(', ') : '—';
  return row.respuesta ? String(row.respuesta) : '';
}

export async function generateCustomFormPdf({ formTitulo, meta, rows, hasScoring, totalScore, totalMax }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const logo = await loadImageDataUrl('/icon-192.png');
  let y = 0;

  const newPage = () => { doc.addPage(); y = MARGIN; };
  const ensure = (need) => { if (y + need > PAGE_H - 56) newPage(); };

  doc.setFillColor(...hexToRgb(NAVY));
  doc.rect(0, 0, PAGE_W, 96, 'F');
  doc.setFillColor(...hexToRgb(CYAN));
  doc.rect(0, 96, PAGE_W, 4, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', MARGIN, 22, 46, 46); } catch (e) { /* logo opcional */ } }
  const titleX = logo ? MARGIN + 60 : MARGIN;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  const titleLines = doc.splitTextToSize(formTitulo || 'Formulario', PAGE_W - titleX - MARGIN);
  doc.text(titleLines[0], titleX, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.setTextColor(210, 224, 240);
  doc.text('HERCO360 · Formulario personalizado', titleX, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${new Date().toLocaleString('es-HN')}`, titleX, 78);
  y = 122;

  const fieldW = (PAGE_W - MARGIN * 2 - 16) / 2;
  const fields = [['Respondido por', meta.respondent], ['Fecha', meta.fecha]];
  fields.forEach(([label, value], i) => {
    const x = MARGIN + i * (fieldW + 16);
    doc.setFillColor(246, 248, 251); doc.roundedRect(x, y, fieldW, 42, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(label.toUpperCase(), x + 10, y + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(String(value || '—'), x + 10, y + 32, { maxWidth: fieldW - 16 });
  });
  y += 60;

  if (hasScoring) {
    const pct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;
    const t = tone(pct);
    const gcx = MARGIN + 55, gcy = y + 44, gr = 40;
    drawGauge(doc, gcx, gcy, gr, pct, TONE_HEX[t]);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...hexToRgb(TONE_HEX[t]));
    doc.text(`${pct}%`, gcx, gcy + 6, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80, 86, 96);
    doc.text(`${totalScore}/${totalMax} pts`, MARGIN + 110, y + 40);
    y += 100;
  }

  ensure(30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Respuestas', MARGIN, y);
  y += 20;

  let curSec = null;
  for (const r of rows) {
    if (r.seccion !== curSec) {
      curSec = r.seccion;
      ensure(24);
      doc.setFillColor(...hexToRgb(CYAN)); doc.rect(MARGIN, y - 10, 3, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...hexToRgb(NAVY));
      doc.text(curSec, MARGIN + 10, y);
      y += 16;
    }
    const t = r.scored ? tone(r.max ? (r.score / r.max) * 100 : 0) : null;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(r.titulo, PAGE_W - MARGIN * 2 - 90);
    const ansTxt = answerText(r);
    const ansLines = ansTxt ? doc.splitTextToSize(ansTxt, PAGE_W - MARGIN * 2 - 24) : [];
    const noteLines = r.note ? doc.splitTextToSize(`"${r.note}"`, PAGE_W - MARGIN * 2 - 24) : [];
    const hasPhotos = r.photos && r.photos.length > 0;
    const cardH = 14 + nameLines.length * 12 + (ansLines.length ? ansLines.length * 10.5 + 3 : 0)
      + (noteLines.length ? noteLines.length * 10.5 + 3 : 0) + (hasPhotos ? 58 : 6);
    ensure(cardH + 8);

    doc.setFillColor(...(t ? tintRgb(TONE_HEX[t], 0.9) : [248, 248, 249]));
    doc.roundedRect(MARGIN, y - 12, PAGE_W - MARGIN * 2, cardH, 7, 7, 'F');

    doc.setTextColor(30, 32, 38);
    doc.text(nameLines, MARGIN + 14, y);
    if (r.scored) {
      const chipTxt = `${r.score}/${r.max}`;
      const chipColor = TONE_HEX[t];
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
      const chipW = doc.getTextWidth(chipTxt) + 16;
      doc.setFillColor(...hexToRgb(chipColor));
      doc.roundedRect(PAGE_W - MARGIN - 14 - chipW, y - 10, chipW, 15, 7.5, 7.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(chipTxt, PAGE_W - MARGIN - 14 - chipW / 2, y, { align: 'center' });
    }
    y += nameLines.length * 12 + 2;

    if (ansLines.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.7); doc.setTextColor(70, 76, 86);
      doc.text(ansLines, MARGIN + 14, y);
      y += ansLines.length * 10.5 + 3;
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

  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 22, 2.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO360 · Formulario', MARGIN + 11, PAGE_H - 19);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
  }

  const fname = `${(formTitulo || 'Formulario').replace(/\s+/g, '_')}_${(meta.respondent || '').replace(/\s+/g, '')}.pdf`;
  doc.save(fname);
}
