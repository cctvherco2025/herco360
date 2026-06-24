import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Bell, Moon, Sun, Menu, Check, ChevronDown, Settings, LogOut, CalendarDays, User as UserIcon, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { timeAgoEs } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [unread, setUnread] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ activities: [], users: [] });
  const searchRef = useRef();

  const loadNotifs = useCallback(async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifs(data);
      setUnread(data.filter((n) => !n.read).length);
    } catch (e) {}
  }, []);

  useEffect(() => {
    loadNotifs();
    const id = setInterval(loadNotifs, 30000);
    return () => clearInterval(id);
  }, [loadNotifs]);

  useEffect(() => {
    if (!q || q.length < 1) { setResults({ activities: [], users: [] }); return; }
    const t = setTimeout(async () => {
      try { const { data } = await api.get(`/search?q=${encodeURIComponent(q)}`); setResults(data); } catch (e) {}
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    loadNotifs();
  };
  const markAll = async () => { await api.post('/notifications/read-all'); loadNotifs(); };

  return (
    <header className="sticky top-0 z-30 px-4 sm:px-6 pt-4 pb-2 bg-background/60 backdrop-blur-xl">
      <div className="glass rounded-[18px] border shadow-card px-3 sm:px-4 py-2.5 flex items-center gap-2">
        <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-muted text-muted-foreground" data-testid="header-menu-button">
          <Menu className="h-5 w-5" />
        </button>

        {/* Global search */}
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <button data-testid="topbar-global-search"
              className="flex-1 max-w-md flex items-center gap-2 rounded-xl border bg-card/60 px-3 h-10 text-sm text-muted-foreground hover:bg-card transition-colors">
              <Search className="h-4 w-4" />
              <span className="truncate">Buscar actividades, usuarios…</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(92vw,460px)] p-0 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 border-b px-3 h-12">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} data-testid="global-search-input"
                placeholder="Buscar…" className="flex-1 bg-transparent outline-none text-sm" />
              {q && <button onClick={() => setQ('')}><X className="h-4 w-4 text-muted-foreground" /></button>}
            </div>
            <div className="max-h-[320px] overflow-y-auto p-2">
              {q && results.activities.length === 0 && results.users.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Sin resultados</p>
              )}
              {results.activities.length > 0 && (
                <div className="mb-2">
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Actividades</p>
                  {results.activities.map((a) => (
                    <button key={a.id} onClick={() => { setSearchOpen(false); navigate('/agenda'); }}
                      className="w-full flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted text-left">
                      <CalendarDays className="h-4 w-4 text-[#00a5df]" />
                      <span className="text-sm truncate">{a.title}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{a.date}</span>
                    </button>
                  ))}
                </div>
              )}
              {results.users.length > 0 && (
                <div>
                  <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Usuarios</p>
                  {results.users.map((u) => (
                    <button key={u.id} onClick={() => { setSearchOpen(false); navigate('/usuarios'); }}
                      className="w-full flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted text-left">
                      <Avatar className="h-6 w-6"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                      <span className="text-sm truncate">{u.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{u.position}</span>
                    </button>
                  ))}
                </div>
              )}
              {!q && <p className="text-sm text-muted-foreground text-center py-6">Escribe para buscar en HERCO360</p>}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex-1" />

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <button data-testid="topbar-notifications-button" className="relative p-2.5 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ec9032] text-white text-[10px] font-bold grid place-items-center">{unread}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(92vw,380px)] p-0 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="font-heading font-semibold text-foreground">Notificaciones</p>
              {unread > 0 && <button onClick={markAll} className="text-xs text-[#00a5df] hover:underline font-medium" data-testid="notif-mark-all">Marcar todas</button>}
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {notifs.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Sin notificaciones</p>}
              {notifs.slice(0, 12).map((n) => (
                <button key={n.id} onClick={() => markRead(n.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left border-b last:border-0 hover:bg-muted/60 transition-colors ${!n.read ? 'bg-[rgba(0,165,223,0.05)]' : ''}`}>
                  <span className="mt-0.5 h-9 w-9 shrink-0 rounded-full grid place-items-center" style={{ background: `${n.color}1f` }}>
                    {n.actor_avatar ? <Avatar className="h-9 w-9"><AvatarImage src={n.actor_avatar} /><AvatarFallback>{n.actor_name?.[0]}</AvatarFallback></Avatar>
                      : <Bell className="h-4 w-4" style={{ color: n.color }} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-foreground leading-snug">{n.message}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{timeAgoEs(n.created_at)}</span>
                  </span>
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ background: n.color }} />}
                </button>
              ))}
            </div>
            <button onClick={() => navigate('/notificaciones')} className="w-full py-2.5 text-sm text-[#00a5df] hover:bg-muted font-medium">Ver todas</button>
          </PopoverContent>
        </Popover>

        {/* Theme toggle */}
        <button onClick={toggleTheme} data-testid="topbar-theme-toggle" className="p-2.5 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={isDark ? 'd' : 'l'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }} className="block">
              {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </motion.span>
          </AnimatePresence>
        </button>

        {/* Avatar menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button data-testid="topbar-avatar-menu" className="flex items-center gap-2 rounded-xl hover:bg-muted py-1 pl-1 pr-2 transition-colors">
              <Avatar className="h-8 w-8 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
              <span className="hidden sm:block text-sm font-medium text-foreground max-w-[120px] truncate">{user?.name}</span>
              <ChevronDown className="hidden sm:block h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel>
              <p className="font-semibold">{user?.name}</p>
              <p className="text-xs text-muted-foreground font-normal">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/configuracion')}><UserIcon className="h-4 w-4 mr-2" /> Mi perfil</DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/configuracion')}><Settings className="h-4 w-4 mr-2" /> Configuración</DropdownMenuItem>
            <DropdownMenuItem onClick={toggleTheme}>{isDark ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />} {isDark ? 'Modo claro' : 'Modo oscuro'}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-[#dc2626] focus:text-[#dc2626]"><LogOut className="h-4 w-4 mr-2" /> Cerrar sesión</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
