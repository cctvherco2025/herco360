import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Home, CalendarDays, Building2, Users, Settings, Plus, X, LogOut, Moon, Sun, Boxes } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { canAccessInventory } from '@/lib/constants';
import { Logo } from '@/components/Logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const baseNavItems = [
  { to: '/', label: 'Inicio', icon: Home, testid: 'sidebar-nav-inicio', end: true },
  { to: '/agenda', label: 'Agenda', icon: CalendarDays, testid: 'sidebar-nav-agenda' },
  { to: '/sala-de-juntas', label: 'Sala de Juntas', icon: Building2, testid: 'sidebar-nav-sala' },
  { to: '/usuarios', label: 'Usuarios', icon: Users, testid: 'sidebar-nav-usuarios' },
  { to: '/configuracion', label: 'Configuración', icon: Settings, testid: 'sidebar-nav-configuracion' },
];

function SidebarContent({ onNavigate }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Build nav: insert "Inventario" (Tienda-only) right after Sala de Juntas
  const navItems = [...baseNavItems];
  if (canAccessInventory(user)) {
    navItems.splice(3, 0, { to: '/inventario', label: 'Inventario', icon: Boxes, testid: 'sidebar-nav-inventario' });
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
          <NavLink
            key={item.to}
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)} className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" />
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
