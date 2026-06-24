// HERCO360 shared constants: event categories + meeting room states
export const CATEGORIES = {
  'Reunión':      { solid: '#00a5df', tintLight: 'rgba(0,165,223,0.12)',  tintDark: 'rgba(0,165,223,0.22)' },
  'Auditoría':    { solid: '#712146', tintLight: 'rgba(113,33,70,0.10)',  tintDark: 'rgba(113,33,70,0.30)' },
  'Capacitación': { solid: '#e0a800', tintLight: 'rgba(254,211,0,0.18)',  tintDark: 'rgba(254,211,0,0.18)' },
  'Seguimiento':  { solid: '#3cbef6', tintLight: 'rgba(60,190,246,0.14)',  tintDark: 'rgba(60,190,246,0.22)' },
  'Reporte':      { solid: '#1e395e', tintLight: 'rgba(30,57,94,0.10)',   tintDark: 'rgba(60,120,200,0.28)' },
  'Personal':     { solid: '#ec9032', tintLight: 'rgba(236,144,50,0.14)', tintDark: 'rgba(236,144,50,0.22)' },
};

export const CATEGORY_LIST = Object.keys(CATEGORIES);

export const ROOM_STATES = {
  'Disponible': { solid: '#16a34a', icon: 'CircleCheck', bg: 'rgba(22,163,74,0.12)' },
  'Ocupada':    { solid: '#dc2626', icon: 'CircleX',     bg: 'rgba(220,38,38,0.12)' },
  'Reservada':  { solid: '#00a5df', icon: 'Bookmark',    bg: 'rgba(0,165,223,0.12)' },
  'Cancelada':  { solid: '#8a8b8b', icon: 'Ban',         bg: 'rgba(138,139,139,0.14)' },
  'Finalizada': { solid: '#1e395e', icon: 'Flag',        bg: 'rgba(30,57,94,0.12)' },
};

export function catStyle(category, isDark) {
  const c = CATEGORIES[category] || CATEGORIES['Reunión'];
  return { solid: c.solid, tint: isDark ? c.tintDark : c.tintLight };
}


// Color palette the user can pick for an activity (replaces fixed categories).
// HERCO institutional + complementary tones. No purple/pink per brand guidelines.
export const ACTIVITY_COLORS = [
  { name: 'Cian HERCO', value: '#00a5df' },
  { name: 'Azul claro', value: '#3cbef6' },
  { name: 'Azul marino', value: '#1e395e' },
  { name: 'Verde', value: '#16a34a' },
  { name: 'Amarillo', value: '#e0a800' },
  { name: 'Naranja', value: '#ec9032' },
  { name: 'Vino', value: '#712146' },
  { name: 'Rojo', value: '#dc2626' },
  { name: 'Teal', value: '#0d9488' },
  { name: 'Gris', value: '#64748b' },
];

export const DEFAULT_ACTIVITY_COLOR = '#00a5df';

export function colorTint(hex, isDark) {
  return `${hex}${isDark ? '33' : '1f'}`;
}

// User cargo (job title) and área (department) options
export const CARGOS = ['Jefe', 'Coordinador', 'Gerente', 'Director comercial'];
export const AREAS = [
  'ECCP', 'Negocios País', 'Negocios Remotos', 'Caja', 'Ferrecréditos',
  'Operación Tienda', 'Centro de Servicio', 'Tienda', 'Auditoría',
];

// Inventory branches (sucursales)
export const SUCURSALES = ['H1', 'H2', 'H4', 'H5', 'H6'];

// Report types delivered by ECCP coordinators (mirror of backend models.REPORT_TYPES)
export const REPORT_TYPES = [
  { id: 'auditoria_etiqueta', label: 'Auditoría de etiqueta de precio', color: '#712146', icon: 'Tag' },
  { id: 'productos_faltantes', label: 'Productos faltantes', color: '#ec9032', icon: 'PackageX' },
  { id: 'recorrido_tienda', label: 'Recorrido tienda', color: '#00a5df', icon: 'Footprints' },
];

export function reportTypeMeta(id) {
  return REPORT_TYPES.find((t) => t.id === id) || { id, label: id, color: '#1e395e', icon: 'FileText' };
}

// Inventario module access: Tienda staff, store managers, Jefe ECCP,
// Operación manager, Director comercial (and admins to supervise).
export function canAccessInventory(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const area = (user.area || '').trim();
  const cargo = (user.position || '').trim();
  if (area === 'Tienda') return true;
  if (cargo === 'Director comercial') return true;
  if (cargo === 'Jefe' && area === 'ECCP') return true;
  if (cargo === 'Gerente' && (area === 'Operación Tienda' || area === 'Tienda')) return true;
  return false;
}

// Reportes module: same access group as Inventario (Tienda staff & managers).
export function canAccessReports(user) {
  return canAccessInventory(user);
}
