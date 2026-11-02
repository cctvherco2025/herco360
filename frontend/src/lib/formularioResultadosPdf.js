// PDF del panel de Resultados de un formulario, con jsPDF (texto y vectores, sin
// capturar pantalla). Misma identidad que customFormPdf.js: lo que dice es lo que
// se ve en el panel con los filtros aplicados.
import { jsPDF } from 'jspdf';
import { loadImageDataUrl } from '@/lib/customFormPdf';

const NAVY = [30, 57, 94];
const CYAN = [0, 165, 223];
const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 40;
const ANCHO = PAGE_W - MARGIN * 2;
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);

export async function generarResultadosPdf({ titulo, filtros, d }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const logo = await loadImageDataUrl('/icon-192.png');
  let y = 0;
  const ensure = (alto) => { if (y + alto > PAGE_H - 56) { doc.addPage(); y = MARGIN; } };

  doc.setFillColor(...NAVY); doc.rect(0, 0, PAGE_W, 96, 'F');
  doc.setFillColor(...CYAN); doc.rect(0, 96, PAGE_W, 4, 'F');
  if (logo) { try { doc.addImage(logo, 'PNG', MARGIN, 22, 46, 46); } catch (e) { /* logo opcional */ } }
  const x0 = logo ? MARGIN + 60 : MARGIN;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(255, 255, 255);
  doc.text(doc.splitTextToSize(titulo || 'Formulario', PAGE_W - x0 - MARGIN)[0], x0, 46);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(210, 224, 240);
  doc.text('HERCO OPS · Resultados', x0, 63);
  doc.setFontSize(8.5); doc.setTextColor(180, 200, 224);
  doc.text(`Generado el ${new Date().toLocaleString('es-HN')}`, x0, 78);
  y = 120;
  doc.setFontSize(9); doc.setTextColor(80, 86, 96);
  doc.text(doc.splitTextToSize(filtros, ANCHO), MARGIN, y);
  y += 16;

  // indicadores
  const s = d.resumen;
  const tiles = d.asigna
    ? [['Entregadas', `${s.entregadas} de ${s.asignadas}`], ['Cumplimiento', pct(s.cumplimiento)], ['A tiempo', pct(s.puntualidad)], ['Vencidas', String(s.vencidas)]]
    : [['Respuestas', String(s.respuestas)]];
  if (d.con_puntaje) tiles.push(['Puntaje promedio', pct(s.puntaje)]);
  const anchoTile = (ANCHO - 8 * (tiles.length - 1)) / tiles.length;
  tiles.forEach(([etiqueta, valor], i) => {
    const x = MARGIN + i * (anchoTile + 8);
    doc.setFillColor(246, 248, 251); doc.roundedRect(x, y, anchoTile, 46, 8, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(140, 148, 160);
    doc.text(etiqueta.toUpperCase(), x + 9, y + 16);
    doc.setFontSize(13); doc.setTextColor(...NAVY);
    doc.text(valor, x + 9, y + 35);
  });
  y += 66;

  // columnas: [nombre, parte del ancho, 'right' si es número]
  const tabla = (nombre, columnas, filas) => {
    if (!filas.length) return;
    ensure(60);
    doc.setFillColor(...CYAN); doc.rect(MARGIN, y - 10, 3, 14, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...NAVY);
    doc.text(nombre, MARGIN + 10, y);
    y += 14;
    const total = columnas.reduce((a, c) => a + c[1], 0);
    const anchos = columnas.map((c) => (c[1] / total) * ANCHO);
    const renglon = (celdas, cabecera) => {
      doc.setFont('helvetica', cabecera ? 'bold' : 'normal'); doc.setFontSize(cabecera ? 7.5 : 8.5);
      const lineas = celdas.map((c, i) => doc.splitTextToSize(String(c ?? '—'), anchos[i] - 8));
      const alto = Math.max(...lineas.map((l) => l.length)) * 10.5 + 7;
      ensure(alto);
      if (cabecera) { doc.setFillColor(238, 241, 247); doc.rect(MARGIN, y, ANCHO, alto, 'F'); }
      doc.setTextColor(...(cabecera ? NAVY : [50, 56, 66]));
      let x = MARGIN;
      lineas.forEach((l, i) => {
        const derecha = columnas[i][2] === 'right';
        doc.text(l, derecha ? x + anchos[i] - 4 : x + 4, y + 11, derecha ? { align: 'right' } : undefined);
        x += anchos[i];
      });
      y += alto;
      doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.5); doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    };
    renglon(columnas.map((c) => c[0]), true);
    filas.forEach((f) => renglon(f, false));
    y += 20;
  };

  const conEntregas = d.asigna ? [['Entregadas', 1, 'right'], ['A tiempo', 1, 'right'], ['Vencidas', 1, 'right'], ['Cumplimiento', 1.2, 'right']] : [['Respuestas', 1, 'right']];
  const datos = (g) => (d.asigna ? [`${g.entregadas} de ${g.asignadas}`, g.a_tiempo, g.vencidas, pct(g.cumplimiento)] : [g.respuestas]);
  const puntaje = d.con_puntaje ? [['Puntaje', 1, 'right']] : [];
  const conPuntaje = (g) => (d.con_puntaje ? [pct(g.puntaje)] : []);
  tabla('Por tienda', [['Tienda', 2], ...conEntregas, ...puntaje], d.por_tienda.map((g) => [g.tienda, ...datos(g), ...conPuntaje(g)]));
  tabla('Por persona', [['Persona', 3], ...conEntregas, ...puntaje], d.por_persona.map((g) => [g.nombre, ...datos(g), ...conPuntaje(g)]));
  tabla('Por pregunta', [['Pregunta', 3], ['Respondidas', 1, 'right'], ['Lo contestado', 4]], d.por_pregunta.map((p) => [
    p.titulo, p.respondidas,
    p.opciones.length ? p.opciones.map((o) => `${o.texto}: ${o.n}`).join(' · ') : (p.promedio !== null && p.promedio !== undefined ? `Promedio ${p.promedio}` : '—'),
  ]));
  if (d.tendencia.tipo === 'repeticion') {
    tabla('Por repetición', [['Fecha', 2], ['Entregadas', 1, 'right'], ['Cumplimiento', 1, 'right']],
      d.tendencia.puntos.map((p) => [`${p.dia.slice(8, 10)}/${p.dia.slice(5, 7)}/${p.dia.slice(0, 4)}`, `${p.entregadas} de ${p.asignadas}`, pct(p.cumplimiento)]));
  }

  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setDrawColor(232, 234, 238); doc.setLineWidth(0.6); doc.line(MARGIN, PAGE_H - 34, PAGE_W - MARGIN, PAGE_H - 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 128, 140);
    doc.text('HERCO OPS · Resultados de formulario', MARGIN, PAGE_H - 19);
    doc.text(`Página ${i} de ${paginas}`, PAGE_W - MARGIN, PAGE_H - 19, { align: 'right' });
  }
  doc.save(`Resultados_${(titulo || 'Formulario').replace(/\s+/g, '_')}.pdf`);
}
