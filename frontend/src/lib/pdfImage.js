// Dibuja una foto en jsPDF dentro de un recuadro SIN deformarla: la ajusta
// (contain) y la centra sobre un fondo gris claro. Las fotos del teléfono son
// verticales 3:4 y las capturas de pantalla aún más angostas; estirarlas a un
// cuadrado las aplastaba.
export function addImageContain(doc, src, x, y, w, h, { fondo = [243, 245, 248] } = {}) {
  doc.setFillColor(...fondo);
  doc.rect(x, y, w, h, 'F');
  let iw = w, ih = h;
  try {
    const p = doc.getImageProperties(src);
    if (p?.width && p?.height) {
      const k = Math.min(w / p.width, h / p.height);
      iw = p.width * k; ih = p.height * k;
    }
  } catch (e) { /* sin propiedades: se dibuja al tamaño del recuadro */ }
  doc.addImage(src, src.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}
