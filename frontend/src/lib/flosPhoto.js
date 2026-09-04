// Comprime una foto tomada/subida (cámaras de celular suelen dar 3-10 MB) antes
// de guardarla en memoria: más rápido para la vista previa, el PDF y la subida.

const MAX_DIM = 1600;
const QUALITY = 0.82;

export function compressImage(file, maxDim = MAX_DIM, quality = QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('No se pudo procesar la imagen')); return; }
        resolve({ blob, dataUrl, width, height });
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('No se pudo leer la imagen')); };
    img.src = objectUrl;
  });
}
