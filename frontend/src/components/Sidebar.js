import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, CalendarDays, Building2, Users, Settings, Plus, X, LogOut, Moon, Sun, Boxes, FileText,
  Palmtree, Network, Video, ClipboardCheck, ClipboardList, ChevronDown, Percent, Ticket,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  canAccessInventory, canAccessReports, canAccessOrgChart, canAccessCams, canAccessFlos, canAccessRutina,
  canAccessFormulariosPrincipal, canAccessPromocionesMes, canAccessVacaciones, puedeVerTickets,
} from '@/lib/constants';
import { Logo } from '@/components/Logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const baseNavItems = [
  { to: '/', label: 'Inicio', icon: Home, testid: 'sidebar-nav-inicio', end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, testid: 'sidebar-nav-agenda' },
  { to: '/vacaciones', label: 'Vacaciones', icon: Palmtree, testid: 'sidebar-nav-vacaciones' },
  { to: '/sala-de-juntas', label: 'Sala de Juntas', icon: Building2, testid: 'sidebar-nav-sala' },
  { to: '/usuarios', label: 'Usuarios', icon: Users, testid: 'sidebar-nav-usuarios' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, testid: 'sidebar-nav-configuracion' },
];

function NavItem({ item, onNavigate }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      data-testid={item.testid}
      onClick={() => onNavigate?.()}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]'
            : 'text-muted-foreground hover:bg-[rgba(60,190,246,0.08)] hover:text-foreground'
        }`
      }>
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="sidebar-active" className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-[#00a5df]" />
          )}
          <item.icon className="h-[18px] w-[18px] shrink-0" />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

// Item de navegación con subitems plegables (ej. "Formulario" -> Formularios /
// Evaluación FLOS). Se abre solo si uno de sus hijos está activo, y se puede
// desplegar/plegar a mano con la flecha. Los subitems van con el mismo estilo
// que el resto de la barra (sin tarjeta), colgando de una línea guía, y solo
// el subitem activo se resalta.
function NavGroup({ item, onNavigate }) {
  const location = useLocation();
  const childActive = item.children.some((c) => location.pathname === c.to || location.pathname.startsWith(`${c.to}/`));
  const [open, setOpen] = useState(childActive);
  const pendientes = item.children.reduce((n, c) => n + (c.count || 0), 0);

  useEffect(() => { if (childActive) setOpen(true); }, [childActive]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid={item.testid}
        aria-expanded={open}
        className={`group relative w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors hover:bg-[rgba(60,190,246,0.08)] ${
          childActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}>
        <item.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        {pendientes > 0 && !open && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#dc2626] text-white text-[11px] font-semibold grid place-items-center">{pendientes}</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="ml-[22px] mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2">
              {item.children.map((c) => (
                <NavLink key={c.to} to={c.to} data-testid={c.testid} onClick={() => onNavigate?.()}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]'
                        : 'text-muted-foreground hover:bg-[rgba(60,190,246,0.08)] hover:text-foreground'
                    }`
                  }>
                  {({ isActive }) => (
                    <>
                      {/* la marca celeste del item activo, sobre la línea guía */}
                      {isActive && (
                        <motion.span layoutId="sidebar-active" className="absolute -left-[10.5px] top-1/2 -translate-y-1/2 h-6 w-1 rounded-full bg-[#00a5df]" />
                      )}
                      <c.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{c.label}</span>
                      {c.count > 0 && (
                        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#dc2626] text-white text-[11px] font-semibold grid place-items-center"
                          data-testid={`${c.testid}-count`}>{c.count}</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  // Tickets que esperan algo de la persona (se refresca al cambiar de pantalla).
  const verTickets = puedeVerTickets(user);
  const [ticketsPendientes, setTicketsPendientes] = useState(0);
  useEffect(() => {
    if (!verTickets) return;
    api.get('/tickets/contador').then(({ data }) => setTicketsPendientes(data.pendientes || 0)).catch(() => {});
  }, [verTickets, location.pathname]);

  // Build nav: insert "Inventario" y "Reportes" (Tienda-only) right after Sala de Juntas
  const navItems = [...baseNavItems];
  if (canAccessInventory(user)) {
    navItems.splice(3, 0, { to: '/inventario', label: 'Inventario', icon: Boxes, testid: 'sidebar-nav-inventario' });
  }
  if (canAccessReports(user)) {
    const idx = navItems.findIndex((n) => n.to === '/inventario');
    navItems.splice(idx >= 0 ? idx + 1 : 3, 0, { to: '/reportes', label: 'Reportes', icon: FileText, testid: 'sidebar-nav-reportes' });
  }
  if (canAccessCams(user)) {
    const idx = navItems.findIndex((n) => n.to === '/reportes');
    navItems.splice(idx >= 0 ? idx + 1 : 4, 0, { to: '/reportes-cams', label: 'Reportes CAMS', icon: Video, testid: 'sidebar-nav-reportes-cams' });
  }
  // Cada hijo valida su propio permiso independiente (formularios.*); el
  // padre "Formulario" solo se arma/muestra si queda al menos un hijo visible.
  const formularioChildren = [];
  if (canAccessFormulariosPrincipal(user)) {
    formularioChildren.push({ to: '/formularios', label: 'Formularios', icon: FileText, testid: 'sidebar-nav-formularios' });
  }
  if (canAccessFlos(user)) {
    formularioChildren.push({ to: '/formulario', label: 'Evaluación FLOS', icon: ClipboardCheck, testid: 'sidebar-nav-formulario-flos' });
  }
  if (canAccessRutina(user)) {
    formularioChildren.push({ to: '/rutina-operativa', label: 'Rutina Operativa', icon: ClipboardList, testid: 'sidebar-nav-rutina-operativa' });
  }
  if (canAccessPromocionesMes(user)) {
    formularioChildren.push({ to: '/formularios/promociones', label: 'Promociones del mes', icon: Percent, testid: 'sidebar-nav-promociones-mes' });
  }
  if (verTickets) {
    formularioChildren.push({ to: '/formularios/tickets', label: 'Tickets', icon: Ticket, testid: 'sidebar-nav-tickets', count: ticketsPendientes });
  }
  if (formularioChildren.length > 0) {
    const idx = navItems.findIndex((n) => n.to === '/reportes-cams');
    navItems.splice(idx >= 0 ? idx + 1 : 4, 0, { label: 'Formulario', icon: ClipboardCheck, testid: 'sidebar-nav-formulario', children: formularioChildren });
  }
  if (canAccessOrgChart(user)) {
    const idx = navItems.findIndex((n) => n.to === '/usuarios');
    navItems.splice(idx >= 0 ? idx + 1 : navItems.length - 1, 0, { to: '/organigrama', label: 'Jerarquía y permisos', icon: Network, testid: 'sidebar-nav-organigrama' });
  }
  // Vacaciones se quita al final (no antes) para no mover los índices en los
  // que se insertan Inventario/Reportes arriba.
  if (!canAccessVacaciones(user)) {
    const idx = navItems.findIndex((n) => n.to === '/vacaciones');
    if (idx >= 0) navItems.splice(idx, 1);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-5 pb-3">
        <Logo size="md" />
      </div>

      <button
        data-testid="sidebar-new-activity"
        onClick={() => { navigate('/agenda?new=1'); onNavigate?.(); }}
        className="mx-4 mt-2 mb-4 flex items-center justify-center gap-2 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white py-2.5 text-sm font-medium shadow-card transition-colors active:scale-[0.98]">
        <Plus className="h-4 w-4" /> Nueva actividad
      </button>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto no-scrollbar">
        {navItems.map((item) => (
          item.children
            ? <NavGroup key={item.label} item={item} onNavigate={onNavigate} />
            : <NavItem key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="px-3 pb-3">
        <button onClick={toggleTheme} data-testid="sidebar-theme-toggle"
          className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-[rgba(60,190,246,0.08)] hover:text-foreground transition-colors">
          {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          {isDark ? 'Modo claro' : 'Modo oscuro'}
        </button>
      </div>

      <div className="border-t p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <Avatar className="h-9 w-9 border">
            <AvatarImage src={user?.avatar_url} alt={user?.name} />
            <AvatarFallback>{user?.name?.[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{user?.name}</p>
            <p className="truncate text-xs text-[#00a5df] capitalize">{user?.role === 'admin' ? 'Administrador' : user?.position || 'Usuario'}</p>
          </div>
          <button onClick={logout} data-testid="sidebar-logout" title="Cerrar sesión"
            className="text-muted-foreground hover:text-[#dc2626] transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  return (
    <>
      {/* Desktop floating sidebar */}
      <aside className="hidden lg:block fixed left-4 top-4 bottom-4 w-[272px] z-40">
        <div className="h-full glass rounded-[22px] border shadow-float overflow-hidden">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
           <motion.div
  initial={{ opacity: 0, pointerEvents: 'none' }}
  animate={{ opacity: 1, pointerEvents: 'auto' }}
  exit={{ opacity: 0, pointerEvents: 'none' }}
  onClick={() => setMobileOpen(false)}
  className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="lg:hidden fixed left-3 top-3 bottom-3 w-[272px] z-50">
              <div className="h-full glass rounded-[22px] border shadow-float overflow-hidden relative">
                <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 text-muted-foreground"><X className="h-5 w-5" /></button>
                <SidebarContent onNavigate={() => setMobileOpen(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
