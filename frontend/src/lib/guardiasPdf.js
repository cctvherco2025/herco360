// PDF de la Revisión de Guardias (ECCP), con jsPDF (texto/vectores, sin
// capturar pantalla). Misma identidad visual que rutinaPdf.js / flosPdf.js.
// Se arma siempre desde la evaluación guardada (GET /guardias/evaluaciones/:id)
// y descarga sus fotos autenticado.
import { jsPDF } from 'jspdf';
import api from '@/lib/api';
import { addImageContain } from '@/lib/pdfImage';
import { guardiaTone, ESTADO_LABEL, fmtFechaHora } from '@/lib/guardiasSchema';

const NAVY = '#1e395e';
const CYAN = '#00a5df';
const TONE_HEX = { g: '#16a34a', a: '#eab308', r: '#dc2626' };
const GREEN = '#16a34a', RED = '#dc2626';
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const THUMB = 52, GAP = 7;

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function tintRgb(hex, amt = 0.86) {
  const [r, g, b] = hexToRgb(hex);
  return [r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt].map(Math.round);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function loadImageDataUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch (e) { return null; }
}

// Todas las fotos de la evaluación (criterios + paso final) como data URLs.
async function fetchPhotos(evalDoc) {
  const ids = [
    ...(evalDoc.photos || []),
    ...(evalDoc.entries || []).flatMap((e) => e.photos || []),
  ].map((p) => p.id);
  const map = {};
  await Promise.all(ids.map(async (pid) => {
    try {
      const res = await api.get(`/guardias/evaluaciones/${evalDoc.id}/foto/${pid}`, { responseType: 'blob' });
      map[pid] = await blobToDataUrl(res.data);
    } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
  }));
  return map;
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

const perRow = (w) => Math.max(1, Math.floor((w + GAP) / (THUMB + GAP)));
const photosHeight = (n, w) => (n ? Math.ceil(n / perRow(w)) * (THUMB + GAP) + 3 : 0);

function drawPhotos(doc, dataUrls, x, y, w) {
  const n = perRow(w);
  dataUrls.forEach((src, i) => {
    const px = x + (i % n) * (THUMB + GAP), py = y + Math.floor(i / n) * (THUMB + GAP);
    try {
      addImageContain(doc, src, px, py, THUMB, THUMB);
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.5);
      doc.roundedRect(px, py, THUMB, THUMB, 3, 3, 'S');
    } catch (e) { /* imagen inválida, se omite */ }
  });
}

export async function generateGuardiaPdf(evalDoc) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const [logo, photoMap] = await Promise.all([loadImageDataUrl('/icon-192.png'), fetchPhotos(evalDoc)]);
  const pics = (list) => (list || []).map((p) => photoMap[p.id]).filter(Boolean);
  let y = 0;

  const newPage = () => { doc.addPage(); y = MARGIN + 12; };
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
  doc.text('Revisión de Guardias de Seguridad', titleX, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.setTextColor(210, 224, 240);
  doc.text('ECCP · Experiencia al Cliente y Control de Pérdidas', titleX, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${fmtFechaHora(new Date().toISOString())}`, titleX, 78);
  y = 122;

  // ── Ficha de la evaluación ───────────────────────────────────
  const fields = [
    ['Sucursal', evalDoc.sucursal, 0.6], ['Guardia', evalDoc.guardia, 1.3],
    ['Evaluador', evalDoc.evaluador_name, 1.3], ['Fecha y hora', fmtFechaHora(evalDoc.created_at), 1.1],
  ];
  const unit = (CONTENT_W - 8 * (fields.length - 1)) / fields.reduce((s, f) => s + f[2], 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  const fieldLines = fields.map(([, v, k]) => doc.splitTextToSize(String(v || '—'), unit * k - 18).slice(0, 2));
  const fieldH = 34 + Math.max(...fieldLines.map((l) => l.length)) * 12;
  let fx = MARGIN;
  fields.forEach(([label, , k], i) => {
    const w = unit * k;
    doc.setFillColor(246, 248, 251); doc.roundedRect(fx, y, w, fieldH, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(label.toUpperCase(), fx + 10, y + 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(fieldLines[i], fx + 10, y + 33);
    fx += w + 8;
  });
  y += fieldH + 20;

  // ── Resultado: medidor + conteos ────────────────────────────
  const tone = guardiaTone(evalDoc.percent);
  const color = TONE_HEX[tone];
  const gcx = MARGIN + 62, gcy = y + 56, gr = 48;
  drawGauge(doc, gcx, gcy, gr, evalDoc.percent, color);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(23); doc.setTextColor(...hexToRgb(color));
  doc.text(`${evalDoc.percent}%`, gcx, gcy + 4, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
  doc.text('cumplimiento', gcx, gcy + 17, { align: 'center' });

  const boxX = MARGIN + 150, boxW = PAGE_W - MARGIN - boxX;
  // estado
  doc.setFillColor(...tintRgb(color, 0.86));
  doc.roundedRect(boxX, y + 4, boxW, 34, 8, 8, 'F');
  doc.setFillColor(...hexToRgb(color)); doc.circle(boxX + 16, y + 21, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...hexToRgb(color));
  doc.text(ESTADO_LABEL[evalDoc.estado] || '—', boxX + 28, y + 25.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 118, 130);
  doc.text('Verde 90-100% · Amarillo 70-89% · Rojo < 70%', boxX + boxW - 10, y + 25, { align: 'right' });
  // conteos
  const tiles = [
    ['Criterios evaluados', evalDoc.total_criterios, NAVY],
    ['Cumplidos', evalDoc.cumplidos, GREEN],
    ['Incumplidos', evalDoc.incumplidos, RED],
  ];
  const tileW = (boxW - 16) / 3;
  tiles.forEach(([label, value, c], i) => {
    const tx = boxX + i * (tileW + 8), ty = y + 48;
    doc.setFillColor(252, 252, 253); doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.7);
    doc.roundedRect(tx, ty, tileW, 54, 8, 8, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(label.toUpperCase(), tx + 10, ty + 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(...hexToRgb(c));
    doc.text(String(value ?? '—'), tx + 10, ty + 42);
  });
  y += 128;

  // ── Detalle por criterio ─────────────────────────────────────
  ensure(30);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
  doc.text('Checklist de supervisión', MARGIN, y);
  y += 20;

  const innerW = CONTENT_W - 28;
  (evalDoc.entries || []).forEach((e, idx) => {
    const ok = e.respuesta === 'cumple';
    const c = ok ? GREEN : RED;
    const chipTxt = ok ? 'Cumple' : 'No cumple';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    const nameLines = doc.splitTextToSize(`${idx + 1}. ${e.titulo}`, innerW - 80);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
    const descLines = e.descripcion ? doc.splitTextToSize(`"${e.descripcion}"`, innerW) : [];
    const imgs = pics(e.photos);
    const cardH = 12 + nameLines.length * 12 + (descLines.length ? descLines.length * 10.5 + 3 : 0) + (imgs.length ? photosHeight(imgs.length, innerW) - 10 : 0) + 6;
    ensure(cardH + 8);
    const top = y - 12;

    doc.setFillColor(...tintRgb(c, 0.9));
    doc.roundedRect(MARGIN, top, CONTENT_W, cardH, 7, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 32, 38);
    doc.text(nameLines, MARGIN + 14, y);
    doc.setFontSize(8.5);
    const chipW = doc.getTextWidth(chipTxt) + 16;
    doc.setFillColor(...hexToRgb(c));
    doc.roundedRect(PAGE_W - MARGIN - 14 - chipW, y - 10, chipW, 15, 7.5, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(chipTxt, PAGE_W - MARGIN - 14 - chipW / 2, y, { align: 'center' });
    y += nameLines.length * 12;

    if (descLines.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(100, 106, 116);
      doc.text(descLines, MARGIN + 14, y + 1);
      y += descLines.length * 10.5 + 3;
    }
    if (imgs.length) {
      drawPhotos(doc, imgs, MARGIN + 14, y - 4, innerW);
    }
    y = top + cardH + 8 + 12; // 8 de separación + baseline de la siguiente tarjeta
  });

  // ── Observaciones, acciones y fotos generales ───────────────
  const bloque = (titulo, texto) => {
    if (!texto) return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    const lines = doc.splitTextToSize(texto, CONTENT_W - 28);
    // en trozos para poder partir textos largos entre páginas
    ensure(40);
    doc.setFillColor(...hexToRgb(CYAN)); doc.rect(MARGIN, y - 10, 3, 14, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(titulo, MARGIN + 10, y);
    y += 16;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 56, 66);
    lines.forEach((ln) => { ensure(12); doc.text(ln, MARGIN + 10, y); y += 11.5; });
    y += 12;
  };
  if (evalDoc.observaciones || evalDoc.acciones || (evalDoc.photos || []).length) {
    ensure(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text('Observaciones y acciones correctivas', MARGIN, y + 6);
    y += 28;
  }
  bloque('Observaciones generales', evalDoc.observaciones);
  bloque('Acciones correctivas', evalDoc.acciones);
  const generales = pics(evalDoc.photos);
  if (generales.length) {
    ensure(30 + THUMB);
    doc.setFillColor(...hexToRgb(CYAN)); doc.rect(MARGIN, y - 10, 3, 14, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text('Fotografías de evidencia', MARGIN + 10, y);
    y += 10;
    const n = perRow(CONTENT_W - 10);
    for (let i = 0; i < generales.length; i += n) {
      ensure(THUMB + GAP);
      drawPhotos(doc, generales.slice(i, i + n), MARGIN + 10, y, CONTENT_W - 10);
      y += THUMB + GAP;
    }
  }

  // ── Firma del evaluador ──────────────────────────────────────
  ensure(70);
  y += 34;
  doc.setDrawColor(160, 166, 176); doc.setLineWidth(0.7);
  doc.line(MARGIN, y, MARGIN + 200, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110, 118, 130);
  doc.text(`Evaluador ECCP: ${evalDoc.evaluador_name || ''}`, MARGIN, y + 12);
  doc.line(PAGE_W - MARGIN - 200, y, PAGE_W - MARGIN, y);
  doc.text(`Guardia: ${evalDoc.guardia || ''}`, PAGE_W - MARGIN - 200, y + 12, { maxWidth: 200 });

  // ── Pie de página en todas las páginas ───────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 22, 2.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO OPS · Revisión de Guardias', MARGIN + 11, PAGE_H - 19);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
  }

  const fecha = (evalDoc.created_at || '').slice(0, 10);
  const nombre = (evalDoc.guardia || 'guardia').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '_');
  doc.save(`Revision_Guardia_${evalDoc.sucursal || ''}_${nombre}_${fecha}.pdf`);
}
