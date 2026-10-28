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
export const CARGOS = ['Jefe', 'Jefe de tienda', 'Coordinador', 'Asesor Comercial', 'Gerente', 'Director comercial'];
// Cargos de mando: solo los asigna un admin desde Usuarios (dan acceso a más
// módulos); no aparecen al registrarse (mismo criterio que
// core.CARGOS_SOLO_ADMIN en el servidor).
export const CARGOS_SOLO_ADMIN = ['Jefe de tienda', 'Jefe', 'Gerente', 'Director comercial'];
export const CARGOS_PROPIOS = CARGOS.filter((c) => !CARGOS_SOLO_ADMIN.includes(c));
export const AREAS = [
  'ECCP', 'Negocios País', 'Negocios Remotos', 'Caja', 'Ferrecréditos',
  'Operación Tienda', 'Centro de Servicio', 'Tienda', 'Auditoría',
];

// ---- Departamentos (igual que core.py; estructura en lib/organizacion.js) ----
// Los departamentos están totalmente separados: cada uno ve solo a su gente y
// sus datos. El super admin ve todo; un admin, solo su departamento.
// Sin el campo = Ventas Retail.
export const RETAIL = 'Ventas Retail';
export const LOGISTICA = 'Logística';
const JEFES_DEPTO = { 'Director comercial': RETAIL, 'Gerente de Logística': LOGISTICA };
export const departamentoDe = (user) => user?.departamento || RETAIL;
export const esRetail = (user) => departamentoDe(user) === RETAIL;
export const esSuperAdmin = (user) => user?.role === 'admin' && !!user?.super_admin;
// El jefe del departamento (nivel jefe_depto): Director comercial, Gerente de Logística…
export const esJefeDepto = (user) => (user?.nivel
  ? user.nivel === 'jefe_depto'
  : JEFES_DEPTO[(user?.position || '').trim()] === departamentoDe(user));
// Aprueba, crea y edita usuarios: admins (el super, a todos; los demás, a su
// departamento) y el jefe de los departamentos que no son Retail.
export const puedeGestionarUsuarios = (user) => user?.role === 'admin' || (esJefeDepto(user) && !esRetail(user));
// Módulos de Ventas Retail (tiendas, ECCP, promociones…): los demás
// departamentos no los ven, aunque sean admins del suyo.
const fueraDeRetail = (user) => !!user && !esSuperAdmin(user) && !esRetail(user);

// Inventory branches (sucursales)
export const SUCURSALES = ['H1', 'H2', 'H4', 'H5', 'H6'];

// Report types delivered by ECCP coordinators (mirror of backend models.REPORT_TYPES)
export const REPORT_TYPES = [
  { id: 'auditoria_etiqueta', label: 'Auditoría de etiqueta de precio', color: '#712146', icon: 'Tag' },
  { id: 'productos_faltantes', label: 'Productos faltantes', color: '#ec9032', icon: 'PackageX' },
  { id: 'recorrido_tienda', label: 'Recorrido tienda', color: '#00a5df', icon: 'Footprints' },
  { id: 'auditoria_guardias', label: 'Auditoría guardias', color: '#16a34a', icon: 'ShieldCheck' },
];

export function reportTypeMeta(id) {
  return REPORT_TYPES.find((t) => t.id === id) || { id, label: id, color: '#1e395e', icon: 'FileText' };
}

// ---- Acceso a los módulos (igual que core.py; motor en backend/acceso.py) ----
// Lo que puede cada persona viene calculado del servidor en user.acceso: el
// perfil de su cargo y área con sus excepciones, o el acceso total fijo de
// los admins y del jefe del departamento. Aquí solo se pregunta; sobre qué
// (su tienda, su área, su gente) lo sigue decidiendo cada módulo.
export const puede = (user, permiso) => !!user && (user.acceso || []).includes(permiso);

export const canAccessInventory = (user) => puede(user, 'inventario');
export const canAccessVacaciones = (user) => puede(user, 'vacaciones');
export const canAccessReports = (user) => puede(user, 'reportes');

// Jerarquía y permisos: admins y el jefe de cada departamento (este, con su gente).
export function canAccessOrgChart(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return esJefeDepto(user);
}

export const canAccessCams = (user) => puede(user, 'cams');
export const canAccessFlos = (user) => puede(user, 'flos');
export const canAccessRutina = (user) => puede(user, 'rutina');
export const canFillRutina = (user) => puede(user, 'rutina.llenar');
export const canEditRutinaSchema = (user) => puede(user, 'rutina.esquema');
export const canEditFlosSchema = (user) => puede(user, 'flos.esquema');
// Crear y publicar "Promociones del mes".
export const canManagePromos = (user) => puede(user, 'promos.publicar');

// Promociones del mes: tiendas que participan según la sucursal del perfil
// (mismo mapa que core.PROMO_TIENDAS en el servidor).
export const PROMO_TIENDAS = { H1: 'Herco Max', H2: 'Herco Centro', H6: 'Herco JT' };
export const tiendaPromos = (user) => PROMO_TIENDAS[(user?.sucursal || '').trim()] || '';
// Revisa Promociones del mes de su tienda: jefe o gerente de tienda.
export function esRevisorTienda(user) {
  const cargo = (user?.position || '').trim();
  const area = (user?.area || '').trim();
  return !!tiendaPromos(user) && (cargo === 'Jefe de tienda' || (cargo === 'Gerente' && area === 'Tienda'));
}

// Contesta Promociones del mes: coordinador del área Tienda de una tienda que participa.
export function esCoordinadorTienda(user) {
  return !!tiendaPromos(user) && (user?.position || '').trim() === 'Coordinador' && (user?.area || '').trim() === 'Tienda';
}
// Formulario → Tickets: quien contesta, quien revisa o quien administra Promociones.
export const puedeVerTickets = (user) => puede(user, 'seguimientos') && (esCoordinadorTienda(user) || esRevisorTienda(user) || canAdminPromos(user));

// ---- Tareas de tienda (módulo aparte de Tickets) ----
// Supervisor = admin o Director comercial (ven y validan todas las tiendas);
// mismo criterio que _es_supervisor en backend/tareas.py.
export const esSupervisorTareas = (user) => user?.role === 'admin' || (user?.position || '').trim() === 'Director comercial';
// Logística: por mando y sin tiendas; todos la ven, crean el Gerente y los Jefes.
const deLogistica = fueraDeRetail;
// Permisos por acción ('tareas.crear'…), del perfil de la persona.
export const tienePermiso = (user, accion) => puede(user, accion);
export const puedeVerTareas = (user) => puede(user, 'tareas') && (esRevisorTienda(user) || esCoordinadorTienda(user) || esSupervisorTareas(user) || deLogistica(user)
  || tienePermiso(user, 'tareas.ver_equipo') || tienePermiso(user, 'tareas.crear'));
// Crea quien tiene el permiso y gente a cargo: gerente y jefe de tienda (a
// su tienda); el jefe del departamento y los admins (a todo el
// departamento); un jefe o gerente de área (a su área y subáreas).
const mandaEnArea = (user) => !!user?.area_id && (['jefe', 'gerente'].includes(user?.nivel)
  || ['Jefe', 'Gerente'].includes((user?.position || '').trim()));
export const puedeCrearTareas = (user) => tienePermiso(user, 'tareas.crear')
  && (esRevisorTienda(user) || user?.role === 'admin' || esJefeDepto(user) || mandaEnArea(user));
export const PRIORIDADES_TAREA = ['alta', 'media', 'baja'];

// "Administrar Promociones del mes": ver y administrar TODAS las publicaciones.
export const canAdminPromos = (user) => puede(user, 'promos.admin');
// Pantalla /formularios (Hub) y su listado de formularios personalizados.
export const canAccessFormulariosPrincipal = (user) => puede(user, 'formularios');
// Tarjeta y pantalla "Promociones del mes".
export const canAccessPromocionesMes = (user) => puede(user, 'promos');
// Botón "Haz tu form personalizado".
export const canCreateCustomFormulario = (user) => puede(user, 'formularios.crear');

// Revisión de Guardias, Recorridos Preventivos y Auditoría de Etiquetas (ECCP):
// registran quienes tienen el permiso; administran (ven, editan y eliminan
// todo) los admins y el Director comercial.
export const canFillGuardias = (user) => puede(user, 'guardias.registrar');

export function canAdminGuardias(user) {
  if (!user) return false;
  if (fueraDeRetail(user)) return false;
  return user.role === 'admin' || (user.position || '').trim() === 'Director comercial';
}

export const canAccessGuardias = (user) => puede(user, 'guardias');
export const canFillRecorridos = (user) => puede(user, 'recorridos.registrar');
export const canAdminRecorridos = (user) => canAdminGuardias(user);
export const canAccessRecorridos = (user) => puede(user, 'recorridos');
export const canFillEtiquetas = (user) => puede(user, 'etiquetas.registrar');
export const canAdminEtiquetas = (user) => canAdminGuardias(user);

// Gerente de una tienda (área Tienda de Retail): su tienda, o '' si no lo es.
export const sucursalGerenteTienda = (user) => {
  if (!user || !esRetail(user) || (user.position || '').trim() !== 'Gerente' || (user.area || '').trim() !== 'Tienda') return '';
  const s = (user.sucursal || '').trim();
  return s === 'Casa Matriz' ? '' : s;
};

// Ver las auditorías de etiquetas de todas las tiendas.
export const canVerTodasEtiquetas = (user) => puede(user, 'etiquetas.todas');
export const canAccessEtiquetas = (user) => puede(user, 'etiquetas');
// '' si ve todas; si no, la única tienda que ve (igual que core.etiquetas_solo_su_tienda).
export const etiquetasSoloSuTienda = (user) => (canVerTodasEtiquetas(user) ? '' : (sucursalGerenteTienda(user) || '—'));

// Activos: administran (categorías y todos los activos) quienes tienen el
// permiso. Quién ve el módulo depende además de ser responsable de alguna
// categoría: eso lo responde GET /activos/acceso.
export const canAdminActivos = (user) => puede(user, 'activos.administrar');
