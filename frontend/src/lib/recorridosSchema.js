// Recorridos Preventivos en Tienda (ECCP): catálogos y utilidades compartidas.
// Deben coincidir EXACTO con backend/routes_recorridos.py (SUCURSALES,
// CATEGORIAS, TIPOS). Sucursal y categoría son cerradas; el tipo además
// acepta texto libre (el servidor lo normaliza contra los ya existentes).
import { fmtHora } from '@/lib/time';

export const RECORRIDO_SUCURSALES = ['H1', 'H2', 'H4', 'H6'];
export const RECORRIDO_CATEGORIAS = ['Herramientas', 'Hogar', 'Ferretería', 'Iluminación', 'Pinturas', 'Revestimiento'];
export const RECORRIDO_TIPOS = [
  'Producto sin etiqueta de precio.',
  'Precio incorrecto o mal colocado.',
  'Dispositivo de seguridad ausente.',
  'Dispositivo de seguridad mal colocado.',
  'Dispositivo de seguridad defectuoso.',
  'Candado en mal estado.',
  'Vitrina o exhibidor sin asegurar.',
  'Basura en góndolas o exhibidores.',
  'Producto fuera de su ubicación.',
  'Pasillos obstruidos.',
  'Equipo de exhibición o publicidad sin funcionar.',
  'Otros.',
];

// "Producto sin etiqueta de precio." -> "Producto sin etiqueta de precio"
export const tipoLabel = (t) => (t || '').replace(/\.$/, '');

// Fecha y hora local con que se registró (las pone el servidor).
export function fmtFechaRecorrido(rec) {
  const f = rec?.fecha_local || '';
  const d = f.length === 10 ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : '—';
  return rec?.hora_local ? `${d} · ${fmtHora(rec.hora_local)}` : d;
}
