// PDF de Recorridos Preventivos (ECCP), con jsPDF. Sirve para un recorrido
// suelto y para los informes semanales/mensuales: recibe recorridos completos
// (con hallazgos), descarga sus fotos autenticado y pone cada foto junto a su
// hallazgo. Misma identidad visual que guardiasPdf.js / rutinaPdf.js.
import { jsPDF } from 'jspdf';
import api from '@/lib/api';
import { addImageContain } from '@/lib/pdfImage';
import { fmtHora } from '@/lib/time';
import { RECORRIDO_CATEGORIAS, tipoLabel, fmtFechaRecorrido } from '@/lib/recorridosSchema';

const NAVY = '#1e395e';
const CYAN = '#00a5df';
const ORANGE = '#ec9032';
const GREEN = '#16a34a';
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const THUMB = 58, GAP = 7;

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

// Fotos de hallazgos y de seguimiento, de 6 en 6 para no saturar.
async function fetchPhotos(recorridos) {
  const jobs = [];
  recorridos.forEach((r) => (r.hallazgos || []).forEach((h) => {
    (h.photos || []).forEach((p) => jobs.push([r.id, p.id]));
    (h.seguimiento || []).forEach((s) => (s.photos || []).forEach((p) => jobs.push([r.id, p.id])));
  }));
  const map = {};
  for (let i = 0; i < jobs.length; i += 6) {
    await Promise.all(jobs.slice(i, i + 6).map(async ([rid, pid]) => {
      try {
        const res = await api.get(`/recorridos/registros/${rid}/foto/${pid}`, { responseType: 'blob' });
        map[pid] = await blobToDataUrl(res.data);
      } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
    }));
  }
  return map;
}

const perRow = (w) => Math.max(1, Math.floor((w + GAP) / (THUMB + GAP)));
const photosHeight = (n, w) => (n ? Math.ceil(n / perRow(w)) * (THUMB + GAP) : 0);

function drawPhotos(doc, srcs, x, y, w) {
  const n = perRow(w);
  srcs.forEach((src, i) => {
    const px = x + (i % n) * (THUMB + GAP), py = y + Math.floor(i / n) * (THUMB + GAP);
    try {
      addImageContain(doc, src, px, py, THUMB, THUMB);
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.5);
      doc.roundedRect(px, py, THUMB, THUMB, 3, 3, 'S');
    } catch (e) { /* imagen inválida, se omite */ }
  });
}

const fmtAt = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${fmtHora(hh)}`;
};

/**
 * recorridos: documentos completos (con hallazgos).
 * titulo / subtitulo: encabezado ("Informe semanal", "del 13/10 al 19/10/2026 · H1").
 * conResumen: agrega la portada con totales por departamento (informes).
 */
export async function generateRecorridosPdf({ recorridos, titulo, subtitulo, filename, conResumen = false }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const [logo, photoMap] = await Promise.all([loadImageDataUrl('/icon-192.png'), fetchPhotos(recorridos)]);
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
  doc.text(titulo || 'Recorrido Preventivo en Tienda', titleX, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5);
  doc.setTextColor(210, 224, 240);
  doc.text(subtitulo || 'ECCP · Experiencia al Cliente y Control de Pérdidas', titleX, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${fmtAt(new Date().toISOString())}`, titleX, 78);
  y = 124;

  // ── Resumen del periodo (informes) ───────────────────────────
  const todos = recorridos.flatMap((r) => r.hallazgos || []);
  if (conResumen) {
    const tiles = [
      ['Recorridos', recorridos.length, NAVY],
      ['Sin novedades', recorridos.filter((r) => !(r.hallazgos || []).length).length, GREEN],
      ['Hallazgos', todos.length, ORANGE],
      ['Con seguimiento', todos.filter((h) => (h.seguimiento || []).length).length, CYAN],
    ];
    const tw = (CONTENT_W - 24) / 4;
    tiles.forEach(([label, value, c], i) => {
      const tx = MARGIN + i * (tw + 8);
      doc.setFillColor(246, 248, 251); doc.roundedRect(tx, y, tw, 52, 8, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
      doc.text(label.toUpperCase(), tx + 10, y + 17);
      doc.setFontSize(19); doc.setTextColor(...hexToRgb(c));
      doc.text(String(value), tx + 10, y + 40);
    });
    y += 74;

    // hallazgos por departamento (las 6 categorías, de mayor a menor)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...hexToRgb(NAVY));
    doc.text('Hallazgos por departamento', MARGIN, y);
    y += 14;
    const porCat = RECORRIDO_CATEGORIAS.map((c) => [c, todos.filter((h) => h.categoria === c).length]).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...porCat.map(([, n]) => n));
    const barX = MARGIN + 100, barW = CONTENT_W - 140;
    porCat.forEach(([cat, n]) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 56, 66);
      doc.text(cat, MARGIN, y + 9);
      doc.setFillColor(236, 239, 243); doc.roundedRect(barX, y + 1, barW, 10, 3, 3, 'F');
      if (n) { doc.setFillColor(...hexToRgb(CYAN)); doc.roundedRect(barX, y + 1, Math.max(6, (barW * n) / max), 10, 3, 3, 'F'); }
      doc.setFont('helvetica', 'bold'); doc.setTextColor(50, 56, 66);
      doc.text(String(n), PAGE_W - MARGIN, y + 9, { align: 'right' });
      y += 17;
    });
    y += 16;
  }

  // ── Cada recorrido con sus hallazgos ─────────────────────────
  const innerW = CONTENT_W - 28;
  recorridos.forEach((r) => {
    const hs = r.hallazgos || [];
    ensure(70);
    // cabecera del recorrido
    doc.setFillColor(...hexToRgb(NAVY));
    doc.roundedRect(MARGIN, y, CONTENT_W, 40, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(255, 255, 255);
    doc.text(`${r.sucursal} · ${fmtFechaRecorrido(r)}`, MARGIN + 14, y + 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 216, 236);
    doc.text(`Coordinador: ${r.coordinador_name || '—'}`, MARGIN + 14, y + 31);
    const badge = hs.length ? `${hs.length} hallazgo${hs.length === 1 ? '' : 's'}` : 'Sin novedades';
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    const bw = doc.getTextWidth(badge) + 18;
    doc.setFillColor(...hexToRgb(hs.length ? ORANGE : GREEN));
    doc.roundedRect(PAGE_W - MARGIN - 12 - bw, y + 12, bw, 16, 8, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(badge, PAGE_W - MARGIN - 12 - bw / 2, y + 23, { align: 'center' });
    y += 54;

    hs.forEach((h, idx) => {
      // líneas de texto del hallazgo
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      const tipoLines = doc.splitTextToSize(`${idx + 1}. ${tipoLabel(h.tipo)}`, innerW - 110);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      const info = [];
      if (h.producto || h.cantidad != null) info.push(`Producto: ${h.producto || '—'}${h.cantidad != null ? ` · Cantidad: ${h.cantidad}` : ''}`);
      const descLines = doc.splitTextToSize(h.descripcion || '', innerW);
      const extra = [];
      if (h.responsable) extra.push(`Responsable notificado: ${h.responsable}`);
      if (h.accion) extra.push(`Acción: ${h.accion}`);
      const extraLines = extra.flatMap((t) => doc.splitTextToSize(t, innerW));
      const imgs = pics(h.photos);
      const segs = (h.seguimiento || []).map((s) => ({
        lines: doc.splitTextToSize(`Seguimiento ${fmtAt(s.at)} · ${s.user_name}: ${s.accion}`, innerW - 10),
        imgs: pics(s.photos),
      }));

      const cardH = 14 + tipoLines.length * 12.5 + info.length * 11 + descLines.length * 11 + 4
        + extraLines.length * 11 + (imgs.length ? photosHeight(imgs.length, innerW) - 6 : 0)
        + segs.reduce((a, s) => a + s.lines.length * 10.5 + (s.imgs.length ? photosHeight(s.imgs.length, innerW - 10) - 6 : 0) + 6, 0) + 6;
      // un hallazgo muy largo empieza en página nueva en vez de cortarse a la mitad
      ensure(Math.min(cardH + 10, PAGE_H - 140));
      const top = y;
      doc.setFillColor(...tintRgb(ORANGE, 0.92));
      doc.roundedRect(MARGIN, top, CONTENT_W, cardH, 7, 7, 'F');
      y = top + 16;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(30, 32, 38);
      doc.text(tipoLines, MARGIN + 14, y);
      // chip del departamento
      doc.setFontSize(8.5);
      const cw = doc.getTextWidth(h.categoria) + 16;
      doc.setFillColor(...hexToRgb(NAVY));
      doc.roundedRect(PAGE_W - MARGIN - 14 - cw, y - 10, cw, 15, 7.5, 7.5, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(h.categoria, PAGE_W - MARGIN - 14 - cw / 2, y, { align: 'center' });
      y += tipoLines.length * 12.5;

      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(90, 96, 106);
      info.forEach((t) => { doc.text(t, MARGIN + 14, y); y += 11; });
      doc.setTextColor(40, 44, 52);
      doc.text(descLines, MARGIN + 14, y); y += descLines.length * 11 + 4;
      doc.setTextColor(90, 96, 106);
      if (extraLines.length) { doc.text(extraLines, MARGIN + 14, y); y += extraLines.length * 11; }
      if (imgs.length) { drawPhotos(doc, imgs, MARGIN + 14, y - 6, innerW); y += photosHeight(imgs.length, innerW) + 4; }
      segs.forEach((s) => {
        doc.setFillColor(...hexToRgb(GREEN)); doc.rect(MARGIN + 14, y - 8, 2.5, s.lines.length * 10.5 + 1, 'F');
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(22, 120, 60);
        doc.text(s.lines, MARGIN + 22, y); y += s.lines.length * 10.5;
        if (s.imgs.length) { drawPhotos(doc, s.imgs, MARGIN + 22, y - 6, innerW - 10); y += photosHeight(s.imgs.length, innerW - 10) + 2; }
        y += 6;
      });
      y = top + cardH + 10;
    });
    y += 10;
  });

  if (!recorridos.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(110, 118, 130);
    doc.text('No hay recorridos registrados en este periodo.', MARGIN, y + 10);
  }

  // ── Pie de página en todas las páginas ───────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 22, 2.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO OPS · Recorridos Preventivos', MARGIN + 11, PAGE_H - 19);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
  }

  doc.save(filename || 'Recorrido_Preventivo.pdf');
}

// PDF de un solo recorrido (botón en el resultado y en el historial).
export function generateRecorridoPdf(rec) {
  return generateRecorridosPdf({
    recorridos: [rec],
    filename: `Recorrido_${rec.sucursal || ''}_${rec.fecha_local || ''}.pdf`,
  });
}
