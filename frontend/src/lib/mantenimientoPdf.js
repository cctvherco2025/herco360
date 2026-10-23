// PDF de mantenimiento con jsPDF (texto y vectores, sin capturar pantalla),
// con la misma identidad visual que guardiasPdf.js:
// - generateMantTareaPdf: un mantenimiento hecho, con respuestas, fotos,
//   antes/después y firmas.
// - generateReporteMantPdf: reporte del periodo (cumplimiento por
//   planificación, responsable y sucursal) y, si se pide, las fallas con foto.
import { jsPDF } from 'jspdf';
import api from '@/lib/api';
import { addImageContain } from '@/lib/pdfImage';

const NAVY = '#1e395e', CYAN = '#00a5df', GREEN = '#16a34a', RED = '#dc2626', ORANGE = '#ec9032', GRAY = '#64748b', VIOLET = '#7c3aed';
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;
const THUMB = 64, GAP = 8;
const ETQ_ESTADO = { bien: 'Bien', falla: 'Falla', na: 'No aplica' };

const hexToRgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const tintRgb = (hex, amt = 0.88) => hexToRgb(hex).map((c) => Math.round(c + (255 - c) * amt));
const dmy = (s) => (s && s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s || '—');
const dmyh = (s) => (s ? `${dmy(s)}${s.length >= 16 ? ` ${s.slice(11, 16)}` : ''}` : '—');
const limpio = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_');

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function cargarLogo() {
  try { const res = await fetch('/icon-192.png'); return res.ok ? await blobToDataUrl(await res.blob()) : null; } catch (e) { return null; }
}
async function cargarFotos(tareaId, ids) {
  const map = {};
  await Promise.all(ids.map(async (pid) => {
    try {
      const res = await api.get(`/mantenimiento/tareas/${tareaId}/foto/${pid}`, { responseType: 'blob' });
      map[pid] = await blobToDataUrl(res.data);
    } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
  }));
  return map;
}

// Lienzo común: encabezado, salto de página y pie.
function lienzo(titulo, subtitulo, logo, pie) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const s = { doc, y: 0 };
  doc.setFillColor(...hexToRgb(NAVY)); doc.rect(0, 0, PAGE_W, 96, 'F');
  doc.setFillColor(...hexToRgb(CYAN)); doc.rect(0, 96, PAGE_W, 4, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', MARGIN, 22, 46, 46); } catch (e) { /* logo opcional */ } }
  const tx = logo ? MARGIN + 60 : MARGIN;
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
  doc.text(titulo, tx, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(210, 224, 240);
  doc.text(doc.splitTextToSize(subtitulo, PAGE_W - tx - MARGIN)[0], tx, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  const ahora = new Date();
  doc.text(`Generado el ${ahora.toLocaleDateString('es-HN')} ${ahora.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}`, tx, 78);
  s.y = 122;
  s.ensure = (need) => { if (s.y + need > PAGE_H - 56) { doc.addPage(); s.y = MARGIN + 12; } };
  s.cerrar = () => {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6);
      doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
      doc.setFillColor(...hexToRgb(CYAN)); doc.circle(MARGIN + 3, PAGE_H - 22, 2.4, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
      doc.text(`HERCO OPS · ${pie}`, MARGIN + 11, PAGE_H - 19);
      doc.setFont('helvetica', 'normal');
      doc.text(`Página ${i} de ${total}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
    }
  };
  s.seccion = (texto) => {
    s.y += 12;
    s.ensure(40);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(texto, MARGIN, s.y);
    s.y += 18;
  };
  return s;
}

// Recuadros de datos en una fila: [[etiqueta, valor, peso], …]
function ficha(s, campos) {
  const { doc } = s;
  const unit = (CONTENT_W - 8 * (campos.length - 1)) / campos.reduce((a, f) => a + f[2], 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const lineas = campos.map(([, v, k]) => doc.splitTextToSize(String(v ?? '—'), unit * k - 18).slice(0, 2));
  const h = 32 + Math.max(...lineas.map((l) => l.length)) * 11.5;
  s.ensure(h + 10);
  let x = MARGIN;
  campos.forEach(([etq, , k], i) => {
    const w = unit * k;
    doc.setFillColor(246, 248, 251); doc.roundedRect(x, s.y, w, h, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(etq.toUpperCase(), x + 10, s.y + 16);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...hexToRgb(NAVY));
    doc.text(lineas[i], x + 10, s.y + 31);
    x += w + 8;
  });
  s.y += h + 12;
}

// Recuadros con número grande: [[etiqueta, valor, color], …]
function numeros(s, tiles) {
  const { doc } = s;
  s.ensure(66);
  const w = (CONTENT_W - 8 * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([etq, v, c], i) => {
    const x = MARGIN + i * (w + 8);
    doc.setFillColor(252, 252, 253); doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.7);
    doc.roundedRect(x, s.y, w, 54, 8, 8, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(doc.splitTextToSize(etq.toUpperCase(), w - 16)[0], x + 10, s.y + 17);
    doc.setFontSize(19); doc.setTextColor(...hexToRgb(c));
    doc.text(String(v ?? '—'), x + 10, s.y + 42);
  });
  s.y += 66;
}

const perRow = (w, t = THUMB) => Math.max(1, Math.floor((w + GAP) / (t + GAP)));
function fotos(s, srcs, x, w, t = THUMB) {
  const { doc } = s;
  const n = perRow(w, t);
  for (let i = 0; i < srcs.length; i += n) {
    s.ensure(t + GAP);
    srcs.slice(i, i + n).forEach((src, k) => {
      const px = x + k * (t + GAP);
      try {
        addImageContain(doc, src, px, s.y, t, t);
        doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.5); doc.roundedRect(px, s.y, t, t, 3, 3, 'S');
      } catch (e) { /* imagen inválida */ }
    });
    s.y += t + GAP;
  }
}

// Tabla simple con encabezado navy: cols [{t, w, align}], filas [[…]]
function tabla(s, cols, filas) {
  const { doc } = s;
  const total = cols.reduce((a, c) => a + c.w, 0);
  const ws = cols.map((c) => (c.w / total) * CONTENT_W);
  const encabezado = () => {
    s.ensure(24);
    doc.setFillColor(...hexToRgb(NAVY)); doc.rect(MARGIN, s.y, CONTENT_W, 18, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    let x = MARGIN;
    cols.forEach((c, i) => {
      doc.text(c.t, c.align === 'right' ? x + ws[i] - 6 : x + 6, s.y + 12, { align: c.align === 'right' ? 'right' : 'left' });
      x += ws[i];
    });
    s.y += 18;
  };
  encabezado();
  filas.forEach((f, r) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    const lineas = f.map((v, i) => doc.splitTextToSize(String(v ?? '—'), ws[i] - 12));
    const h = Math.max(...lineas.map((l) => l.length)) * 10 + 8;
    if (s.y + h > PAGE_H - 56) { doc.addPage(); s.y = MARGIN + 12; encabezado(); }
    if (r % 2) { doc.setFillColor(246, 248, 251); doc.rect(MARGIN, s.y, CONTENT_W, h, 'F'); }
    let x = MARGIN;
    lineas.forEach((l, i) => {
      doc.setTextColor(40, 44, 52);
      if (cols[i].color) { const c = cols[i].color(f[i]); if (c) doc.setTextColor(...hexToRgb(c)); }
      doc.text(l, cols[i].align === 'right' ? x + ws[i] - 6 : x + 6, s.y + 11, { align: cols[i].align === 'right' ? 'right' : 'left' });
      x += ws[i];
    });
    s.y += h;
  });
  s.y += 14;
}

const pctTxt = (v) => (v == null ? '—' : `${v}%`);
const pctColor = (v) => { const n = parseFloat(v); return Number.isNaN(n) ? null : n >= 90 ? GREEN : n >= 70 ? ORANGE : RED; };

// ── PDF de un mantenimiento ─────────────────────────────────────
export async function generateMantTareaPdf(t, personas = {}) {
  const items = t.checklist.items || [];
  const ids = [
    ...(t.respuestas || []).flatMap((r) => (r.fotos || []).map((p) => p.id)),
    ...((t.antes?.fotos || []).map((p) => p.id)), ...((t.despues?.fotos || []).map((p) => p.id)),
  ];
  const [logo, fotoMap] = await Promise.all([cargarLogo(), cargarFotos(t.id, ids)]);
  const pics = (list) => (list || []).map((p) => fotoMap[p.id]).filter(Boolean);
  const s = lienzo('Mantenimiento preventivo', `${t.checklist.nombre} · ${t.activo_codigo} ${t.activo_nombre}`, logo, 'Mantenimiento preventivo');
  const { doc } = s;
  const responsable = personas[t.responsable_id]?.name || t.completada_por_nombre || '—';

  ficha(s, [['Tarea', t.numero, 1], ['Activo', `${t.activo_codigo} · ${t.activo_nombre}`, 1.6], ['Sucursal', `${t.sucursal}${t.ubicacion ? ` · ${t.ubicacion}` : ''}`, 1.1]]);
  ficha(s, [['Planificación', `${t.plan_numero} · ${t.plan_nombre}`, 1.6], ['Programada', dmyh(`${t.fecha}T${(t.disponible_desde || '').slice(11, 16)}`), 1], ['Hecho por', `${t.completada_por_nombre || responsable}`, 1.2], ['Fecha de entrega', dmyh(t.completada_en), 1]]);

  const respuestas = Object.fromEntries((t.respuestas || []).map((r) => [r.item_id, r]));
  const esFalla = (it, v) => {
    if (it.tipo === 'estado') return v === 'falla';
    const f = (it.opciones || []).filter((o) => o.falla).map((o) => o.texto);
    return it.tipo === 'unica' ? f.includes(v) : it.tipo === 'multiple' ? (v || []).some((x) => f.includes(x)) : false;
  };
  const fallas = items.filter((it) => esFalla(it, respuestas[it.id]?.valor)).length;
  const estado = t.estado === 'completada' ? (t.tardia ? 'Hecho tarde' : 'Hecho a tiempo') : t.estado;
  numeros(s, [['Preguntas', items.length, NAVY], ['Fallas', fallas, fallas ? RED : GREEN], ['Estado', estado, t.tardia ? ORANGE : GREEN]]);

  // antes y después
  if (t.antes || t.despues) {
    s.seccion('Antes y después');
    const colW = (CONTENT_W - 12) / 2;
    const BIG = 118;
    const alto = Math.max(...[t.antes, t.despues].map((x) => Math.ceil(Math.max(1, pics(x?.fotos).length) / perRow(colW - 20, BIG)) * (BIG + GAP))) + 50;
    s.ensure(alto);
    const top = s.y;
    [['Antes · cómo se encontró', t.antes, ORANGE], ['Después · cómo quedó', t.despues, GREEN]].forEach(([titulo, x, c], i) => {
      const cx = MARGIN + i * (colW + 12);
      doc.setFillColor(...tintRgb(c, 0.9)); doc.roundedRect(cx, top, colW, alto - 8, 8, 8, 'F');
      doc.setFillColor(...hexToRgb(c)); doc.rect(cx, top + 8, 3, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...hexToRgb(NAVY));
      doc.text(titulo, cx + 12, top + 19);
      s.y = top + 30;
      const srcs = pics(x?.fotos);
      if (srcs.length) fotos(s, srcs, cx + 10, colW - 20, BIG);
      if (x?.comentario) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(80, 86, 96);
        doc.text(doc.splitTextToSize(x.comentario, colW - 20).slice(0, 2), cx + 10, s.y + 6);
      }
    });
    s.y = top + alto + 6;
  }

  // respuestas
  s.seccion('Checklist');
  const innerW = CONTENT_W - 28;
  items.forEach((it, idx) => {
    const r = respuestas[it.id] || {};
    const v = r.valor;
    const falla = esFalla(it, v);
    let chip; let c = NAVY;
    if (it.tipo === 'estado') { chip = ETQ_ESTADO[v] || 'Sin respuesta'; c = v === 'bien' ? GREEN : v === 'falla' ? RED : GRAY; }
    else if (it.tipo === 'check') { chip = v ? 'Hecho' : 'No marcada'; c = v ? GREEN : GRAY; }
    else if (it.tipo === 'foto') { chip = 'Foto'; c = CYAN; }
    else if (it.tipo === 'multiple') { chip = (v || []).join(', ') || 'Sin respuesta'; c = falla ? RED : NAVY; }
    else { chip = v === null || v === undefined || v === '' ? 'Sin respuesta' : `${v}${it.tipo === 'numero' && it.unidad ? ` ${it.unidad}` : ''}`; c = falla ? RED : NAVY; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    const chipTxt = doc.splitTextToSize(chip, 170)[0];
    const chipW = Math.min(190, doc.getTextWidth(chipTxt) + 16);
    doc.setFontSize(9.5);
    const nombre = doc.splitTextToSize(`${idx + 1}. ${it.texto}`, innerW - chipW - 12);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
    const coment = r.comentario ? doc.splitTextToSize(`"${r.comentario}"`, innerW) : [];
    const imgs = pics(r.fotos);
    const fotosH = imgs.length ? Math.ceil(imgs.length / perRow(innerW)) * (THUMB + GAP) : 0;
    const cardH = 14 + nombre.length * 12 + (coment.length ? coment.length * 10.5 + 4 : 0) + fotosH + 6;
    s.ensure(cardH + 8);
    const top = s.y;
    doc.setFillColor(...tintRgb(falla ? RED : c === GREEN ? GREEN : NAVY, falla ? 0.9 : 0.94));
    doc.roundedRect(MARGIN, top, CONTENT_W, cardH, 7, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 32, 38);
    doc.text(nombre, MARGIN + 14, top + 17);
    doc.setFontSize(8.5); doc.setFillColor(...hexToRgb(c));
    doc.roundedRect(PAGE_W - MARGIN - 14 - chipW, top + 6, chipW, 15, 7.5, 7.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(chipTxt, PAGE_W - MARGIN - 14 - chipW / 2, top + 16.5, { align: 'center' });
    s.y = top + 14 + nombre.length * 12;
    if (coment.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(falla ? 153 : 100, falla ? 27 : 106, falla ? 27 : 116);
      doc.text(coment, MARGIN + 14, s.y + 2);
      s.y += coment.length * 10.5 + 4;
    }
    if (imgs.length) fotos(s, imgs, MARGIN + 14, innerW);
    s.y = top + cardH + 8;
  });

  if (t.observaciones) {
    s.seccion('Observaciones');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(50, 56, 66);
    doc.splitTextToSize(t.observaciones, CONTENT_W).forEach((ln) => { s.ensure(12); doc.text(ln, MARGIN, s.y); s.y += 11.5; });
    s.y += 8;
  }

  // firmas
  s.ensure(70);
  s.y += 34;
  doc.setDrawColor(160, 166, 176); doc.setLineWidth(0.7);
  doc.line(MARGIN, s.y, MARGIN + 200, s.y);
  doc.line(PAGE_W - MARGIN - 200, s.y, PAGE_W - MARGIN, s.y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110, 118, 130);
  doc.text(`Realizó: ${t.completada_por_nombre || responsable}`, MARGIN, s.y + 12);
  doc.text(`Supervisó: ${personas[t.supervisor_id]?.name || ''}`, PAGE_W - MARGIN - 200, s.y + 12, { maxWidth: 200 });

  s.cerrar();
  doc.save(`Mantenimiento_${t.numero}_${limpio(t.activo_codigo)}_${(t.completada_en || t.fecha || '').slice(0, 10)}.pdf`);
}

// ── Reporte del periodo ─────────────────────────────────────────
export async function generateReporteMantPdf(d, filtrosTxt, { conFallas = true } = {}) {
  const fallas = conFallas ? d.fallas : [];
  const porTarea = {};
  fallas.forEach((f) => { (porTarea[f.tarea_id] = porTarea[f.tarea_id] || []).push(...f.fotos.slice(0, 3)); });
  const mapas = await Promise.all([cargarLogo(), ...Object.entries(porTarea).map(([tid, ids]) => cargarFotos(tid, ids))]);
  const logo = mapas[0];
  const fotoMap = Object.assign({}, ...mapas.slice(1));
  const s = lienzo('Reporte de mantenimiento', `${dmy(d.desde)} al ${dmy(d.hasta)}${filtrosTxt ? ` · ${filtrosTxt}` : ''}`, logo, 'Reporte de mantenimiento');
  const { doc } = s;
  const r = d.resumen;

  numeros(s, [['Cumplimiento', pctTxt(r.cumplimiento), pctColor(r.cumplimiento) || NAVY], ['Tareas', r.total, NAVY],
    ['A tiempo', r.a_tiempo, GREEN], ['Tarde', r.tardias, ORANGE], ['Incompletas', r.incompletas, RED], ['Fallas', r.fallas, r.fallas ? RED : GREEN]]);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
  doc.text(`Cumplimiento = hechas (a tiempo o tarde) / cerradas (hechas + incompletas). Abiertas: ${r.abiertas}${r.vencidas ? ` (${r.vencidas} vencidas)` : ''}.`, MARGIN, s.y - 4);
  s.y += 10;

  const cols = (titulo) => [
    { t: titulo, w: 34 }, { t: 'Tareas', w: 8, align: 'right' }, { t: 'A tiempo', w: 9, align: 'right' },
    { t: 'Tarde', w: 8, align: 'right' }, { t: 'Incompl.', w: 9, align: 'right' }, { t: 'Fallas', w: 8, align: 'right' },
    { t: 'Cumplimiento', w: 12, align: 'right', color: pctColor },
  ];
  const filas = (g) => g.map((x) => [x.nombre, x.total, x.a_tiempo, x.tardias, x.incompletas, x.fallas, pctTxt(x.cumplimiento)]);
  [['Por planificación', 'por_plan', 'Planificación'], ['Por responsable', 'por_responsable', 'Responsable'],
    ['Por sucursal', 'por_sucursal', 'Sucursal'], ['Por categoría', 'por_categoria', 'Categoría']].forEach(([titulo, k, col]) => {
    if (!d[k].length) return;
    s.seccion(titulo);
    tabla(s, cols(col), filas(d[k]));
  });

  if (conFallas) {
    s.seccion(`Fallas del periodo · ${fallas.length}`);
    if (!fallas.length) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110, 118, 130);
      doc.text('Sin fallas reportadas en el periodo.', MARGIN, s.y); s.y += 16;
    }
    fallas.forEach((f) => {
      const imgs = f.fotos.slice(0, 3).map((id) => fotoMap[id]).filter(Boolean);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      const coment = f.comentario ? doc.splitTextToSize(`"${f.comentario}"`, CONTENT_W - 28 - (imgs.length ? imgs.length * (THUMB + GAP) : 0)) : [];
      const h = Math.max(62 + coment.length * 10.5, imgs.length ? THUMB + 20 : 0);
      s.ensure(h + 8);
      const top = s.y;
      doc.setFillColor(...tintRgb(RED, 0.92)); doc.roundedRect(MARGIN, top, CONTENT_W, h, 7, 7, 'F');
      doc.setFillColor(...hexToRgb(RED)); doc.rect(MARGIN, top + 8, 3, 14, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(30, 32, 38);
      const textoW = CONTENT_W - 28 - (imgs.length ? imgs.length * (THUMB + GAP) : 0);
      doc.text(doc.splitTextToSize(`${f.activo_codigo} · ${f.activo_nombre}`, textoW)[0], MARGIN + 12, top + 19);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110, 118, 130);
      doc.text(doc.splitTextToSize(`${dmy(f.fecha)} · ${f.numero} · ${f.sucursal} · ${f.checklist}${f.responsable ? ` · ${f.responsable}` : ''}`, textoW)[0], MARGIN + 12, top + 32);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...hexToRgb(RED));
      doc.text(doc.splitTextToSize(`${f.pregunta}: ${f.respuesta}`, textoW)[0], MARGIN + 12, top + 46);
      if (coment.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5); doc.setTextColor(80, 86, 96);
        doc.text(coment, MARGIN + 12, top + 59);
      }
      imgs.forEach((src, k) => {
        const px = PAGE_W - MARGIN - 10 - (imgs.length - k) * (THUMB + GAP) + GAP;
        try { addImageContain(doc, src, px, top + 10, THUMB, THUMB); } catch (e) { /* imagen inválida */ }
      });
      s.y = top + h + 8;
    });
  }

  s.cerrar();
  doc.save(`Reporte_mantenimiento_${d.desde}_a_${d.hasta}.pdf`);
}

export const COLOR_MANT = VIOLET;
