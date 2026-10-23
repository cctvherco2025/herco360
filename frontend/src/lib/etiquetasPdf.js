// PDF de Auditoría de Etiquetas de Precios (ECCP), con jsPDF. Sirve para una
// auditoría suelta y para los informes semanales/mensuales (resumen + detalle).
// El detalle va como tabla, una fila por etiqueta con sus fotos al lado, igual
// que la hoja "Detalle" del Excel. Misma identidad visual que los otros PDF.
import { jsPDF } from 'jspdf';
import api from '@/lib/api';
import { addImageContain } from '@/lib/pdfImage';
import { fmtHora } from '@/lib/time';
import { RESULTADO, etqTone, ETQ_TONE_COLOR, semanaLabel, fmtL, fmtFechaAud, DEFAULT_ETQ_CONFIG } from '@/lib/etiquetasSchema';

const NAVY = '#1e395e';
const CYAN = '#00a5df';
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 36;
const CONTENT_W = PAGE_W - MARGIN * 2;
const THUMB_W = 46, THUMB_H = 62, GAP = 4;
// N° | Resultado | Exhibido | Sistema | Diferencia | Observaciones | Fotos
const COLS = [
  ['N°', 24], ['Resultado', 110], ['Exhibido', 58], ['Sistema', 58],
  ['Diferencia', 62], ['Observaciones', 111], ['Fotos', 100],
];

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

// Fotos de todas las etiquetas, de 6 en 6.
async function fetchPhotos(auditorias) {
  const jobs = [];
  auditorias.forEach((a) => (a.etiquetas || []).forEach((e) => (e.photos || []).forEach((p) => jobs.push([a.id, p.id]))));
  const map = {};
  for (let i = 0; i < jobs.length; i += 6) {
    await Promise.all(jobs.slice(i, i + 6).map(async ([aid, pid]) => {
      try {
        const res = await api.get(`/etiquetas/auditorias/${aid}/foto/${pid}`, { responseType: 'blob' });
        map[pid] = await blobToDataUrl(res.data);
      } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
    }));
  }
  return map;
}

const fmtAt = (d) => {
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${fmtHora(hh)}`;
};

/**
 * auditorias: documentos completos (con etiquetas).
 * conResumen: agrega la tabla resumida al inicio (informes).
 */
export async function generateEtiquetasPdf({ auditorias, cfg = DEFAULT_ETQ_CONFIG, titulo, subtitulo, filename, conResumen = false }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const [logo, photoMap] = await Promise.all([loadImageDataUrl('/icon-192.png'), fetchPhotos(auditorias)]);
  const toneHex = (pct) => ETQ_TONE_COLOR[etqTone(pct, cfg)] || '#9aa1ad';
  let y = 0;

  const newPage = () => { doc.addPage(); y = MARGIN + 6; };
  const ensure = (need) => { if (y + need > PAGE_H - 50) { newPage(); return true; } return false; };

  const chip = (txt, x, yy, color, { align = 'left', size = 7.5 } = {}) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size);
    const w = doc.getTextWidth(txt) + 12;
    const x0 = align === 'right' ? x - w : x;
    doc.setFillColor(...hexToRgb(color));
    doc.roundedRect(x0, yy - size - 2, w, size + 7, (size + 7) / 2, (size + 7) / 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(txt, x0 + w / 2, yy, { align: 'center' });
    return w;
  };

  // ── Encabezado de marca ──────────────────────────────────────
  doc.setFillColor(...hexToRgb(NAVY));
  doc.rect(0, 0, PAGE_W, 92, 'F');
  doc.setFillColor(...hexToRgb(CYAN));
  doc.rect(0, 92, PAGE_W, 4, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', MARGIN, 22, 44, 44); } catch (e) { /* logo opcional */ } }
  const titleX = logo ? MARGIN + 56 : MARGIN;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text(titulo || 'Auditoría de Etiquetas de Precios', titleX, 44);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(210, 224, 240);
  doc.text(subtitulo || 'ECCP · Experiencia al Cliente y Control de Pérdidas', titleX, 60);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${fmtAt(new Date())}`, titleX, 74);
  y = 118;

  // ── Informe resumido ─────────────────────────────────────────
  if (conResumen) {
    const tot = auditorias.reduce((s, a) => s + (a.total || 0), 0);
    const ok = auditorias.reduce((s, a) => s + (a.correctas || 0), 0);
    const pct = tot ? Math.round((ok / tot) * 1000) / 10 : null;
    const tiles = [
      ['Auditorías', auditorias.length, NAVY], ['Etiquetas verificadas', tot, NAVY],
      ['Correctas', ok, '#16a34a'], ['Irregularidades', tot - ok, '#dc2626'],
      ['Cumplimiento', pct == null ? '—' : `${pct}%`, pct == null ? '#9aa1ad' : toneHex(pct)],
    ];
    const tw = (CONTENT_W - 8 * 4) / 5;
    tiles.forEach(([label, value, c], i) => {
      const tx = MARGIN + i * (tw + 8);
      doc.setFillColor(246, 248, 251); doc.roundedRect(tx, y, tw, 50, 8, 8, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(140, 148, 160);
      doc.text(label.toUpperCase(), tx + 9, y + 16);
      doc.setFontSize(17); doc.setTextColor(...hexToRgb(c));
      doc.text(String(value), tx + 9, y + 39);
    });
    y += 70;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...hexToRgb(NAVY));
    doc.text('Informe resumido', MARGIN, y); y += 10;
    const rc = [['Fecha', 52], ['Semana', 48], ['Sucursal', 42], ['Departamento', 70], ['Coordinador', 113],
      ['Verificadas', 50], ['Correctas', 46], ['Irregul.', 44], ['Cumpl.', 58]];
    const head = () => {
      doc.setFillColor(...hexToRgb(NAVY)); doc.rect(MARGIN, y, CONTENT_W, 18, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
      let x = MARGIN;
      rc.forEach(([h, w]) => { doc.text(h, x + 4, y + 12); x += w; });
      y += 18;
    };
    head();
    auditorias.forEach((a, i) => {
      if (ensure(18)) head();
      if (i % 2) { doc.setFillColor(248, 249, 251); doc.rect(MARGIN, y, CONTENT_W, 18, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(40, 44, 52);
      const vals = [fmtFechaAud({ fecha_local: a.fecha_local }), semanaLabel(a.semana).replace('Semana ', 'S'), a.sucursal,
        a.departamento, a.coordinador_name, String(a.total), String(a.correctas), String(a.irregularidades)];
      let x = MARGIN;
      vals.forEach((v, j) => { doc.text(doc.splitTextToSize(v || '', rc[j][1] - 6)[0] || '', x + 4, y + 12); x += rc[j][1]; });
      chip(`${a.cumplimiento}%`, x + 4, y + 12.5, toneHex(a.cumplimiento));
      y += 18;
    });
    y += 22;
  }

  // ── Cada auditoría: ficha + detalle por etiqueta ─────────────
  const tableHead = () => {
    doc.setFillColor(...hexToRgb(NAVY)); doc.rect(MARGIN, y, CONTENT_W, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    let x = MARGIN;
    COLS.forEach(([h, w]) => { doc.text(h, x + 4, y + 12); x += w; });
    y += 18;
  };

  auditorias.forEach((a, ai) => {
    if (conResumen || ai > 0) ensure(150);
    // ficha
    doc.setFillColor(...hexToRgb(NAVY));
    doc.roundedRect(MARGIN, y, CONTENT_W, 42, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(255, 255, 255);
    doc.text(`${a.sucursal} · ${a.departamento}`, MARGIN + 12, y + 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(200, 216, 236);
    doc.text(`${semanaLabel(a.semana)} · ${fmtFechaAud(a)} · Coordinador: ${a.coordinador_name || '—'}`, MARGIN + 12, y + 32);
    chip(`${a.cumplimiento}% cumplimiento`, PAGE_W - MARGIN - 12, y + 25, toneHex(a.cumplimiento), { align: 'right', size: 8.5 });
    y += 52;

    const kpis = [['Revisadas', a.total, NAVY], ['Correctas', a.correctas, '#16a34a'],
      ['Precio incorrecto', a.precio_incorrecto, '#dc2626'], ['Sin etiqueta', a.sin_etiqueta, '#ec9032'],
      ['Deterioradas', a.deterioradas, '#a16207'], ['Irregularidades', a.irregularidades, '#dc2626']];
    const kw = (CONTENT_W - 6 * 5) / 6;
    kpis.forEach(([label, v, c], i) => {
      const kx = MARGIN + i * (kw + 6);
      doc.setFillColor(246, 248, 251); doc.roundedRect(kx, y, kw, 38, 6, 6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.3); doc.setTextColor(140, 148, 160);
      doc.text(label.toUpperCase(), kx + 7, y + 13);
      doc.setFontSize(14); doc.setTextColor(...hexToRgb(c));
      doc.text(String(v ?? 0), kx + 7, y + 31);
    });
    y += 50;

    tableHead();
    (a.etiquetas || []).forEach((e, i) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      const obs = doc.splitTextToSize(e.observaciones || '', COLS[5][1] - 8);
      const res = RESULTADO[e.resultado] || { corto: e.resultado, color: '#9aa1ad' };
      const resLines = doc.splitTextToSize(res.corto, COLS[1][1] - 16);
      // primero la etiqueta y luego la captura del sistema, como en el Excel
      const tipo = (p) => p.tipo || 'etiqueta';
      const fe = (e.photos || []).filter((p) => tipo(p) === 'etiqueta').map((p) => photoMap[p.id]).filter(Boolean);
      const fs = (e.photos || []).filter((p) => tipo(p) === 'sistema').map((p) => photoMap[p.id]).filter(Boolean);
      const pics = [...fe, ...fs];
      const shown = fs.length ? [fe[0], fs[0]].filter(Boolean) : fe.slice(0, 2);
      const textH = Math.max(obs.length * 10, resLines.length * 10 + 4) + 10;
      const rowH = Math.max(textH, shown.length ? THUMB_H + 8 : 0, 22);
      if (ensure(rowH)) tableHead();

      if (e.resultado !== 'correcta') { doc.setFillColor(...tintRgb(res.color, 0.92)); doc.rect(MARGIN, y, CONTENT_W, rowH, 'F'); }
      else if (i % 2) { doc.setFillColor(248, 249, 251); doc.rect(MARGIN, y, CONTENT_W, rowH, 'F'); }
      doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.5); doc.line(MARGIN, y + rowH, MARGIN + CONTENT_W, y + rowH);

      let x = MARGIN;
      const ty = y + 13;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(40, 44, 52);
      doc.text(String(e.numero), x + 4, ty); x += COLS[0][1];
      // resultado (etiqueta de color)
      doc.setFillColor(...hexToRgb(res.color)); doc.circle(x + 7, ty - 3, 2.6, 'F');
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...hexToRgb(res.color));
      doc.text(resLines, x + 13, ty); x += COLS[1][1];
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 44, 52);
      if (e.resultado === 'precio_incorrecto') {
        doc.text(fmtL(e.precio_exhibido), x + 4, ty); x += COLS[2][1];
        doc.text(fmtL(e.precio_sistema), x + 4, ty); x += COLS[3][1];
        doc.setFont('helvetica', 'bold'); doc.setTextColor(220, 38, 38);
        doc.text(fmtL(e.diferencia, { signo: true }), x + 4, ty); x += COLS[4][1];
      } else {
        doc.setTextColor(170, 176, 186);
        ['—', '—', '—'].forEach((d, j) => { doc.text(d, x + 4, ty); x += COLS[2 + j][1]; });
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(70, 76, 86);
      doc.text(obs, x + 4, ty); x += COLS[5][1];
      shown.forEach((src, j) => {
        try {
          addImageContain(doc, src, x + 4 + j * (THUMB_W + GAP), y + 4, THUMB_W, THUMB_H);
        } catch (err) { /* imagen inválida */ }
      });
      if (pics.length > 2) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 140);
        doc.text(`+${pics.length - 2}`, x + 4 + 2 * (THUMB_W + GAP) - 1, y + 4 + THUMB_H + 8, { align: 'right' });
      }
      y += rowH;
    });
    y += 26;
  });

  if (!auditorias.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(110, 118, 130);
    doc.text('No hay auditorías registradas en este periodo.', MARGIN, y + 10);
  }

  // ── Pie de página ────────────────────────────────────────────
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
    doc.line(MARGIN, PAGE_H - 32, PAGE_W - MARGIN, PAGE_H - 32);
    doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 20, 2.4, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO OPS · Auditoría de Etiquetas de Precios', MARGIN + 11, PAGE_H - 17);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 17, { align: 'right' });
  }

  doc.save(filename || 'Auditoria_Etiquetas.pdf');
}

export function generateAuditoriaEtiquetasPdf(aud, cfg) {
  return generateEtiquetasPdf({
    auditorias: [aud], cfg,
    filename: `Auditoria_Etiquetas_${aud.sucursal}_${aud.departamento}_${aud.semana || aud.fecha_local}.pdf`,
  });
}
