import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User as UserIcon, Palette, Save, Moon, Sun, Shield, Bell, BellRing, BellOff, Info } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CARGOS, AREAS, SUCURSALES } from '@/lib/constants';
import { pushSupported, getPushState, enablePush, disablePush, sendTestPush } from '@/lib/push';

function isIosNonStandalone() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

function NotificationsSettings() {
  const [state, setState] = useState('loading'); // loading|unsupported|denied|granted-on|granted-off|default
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    if (!pushSupported()) { setState('unsupported'); return; }
    try { setState(await getPushState()); } catch (e) { setState('granted-off'); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const on = state === 'granted-on';
  const canToggle = state === 'granted-on' || state === 'granted-off' || state === 'default';

  const toggle = async (next) => {
    setWorking(true);
    try {
      if (next) {
        await enablePush();
        toast.success('Notificaciones activadas en este dispositivo');
      } else {
        await disablePush();
        toast.success('Notificaciones desactivadas en este dispositivo');
      }
      await refresh();
    } catch (e) {
      if (e?.code === 'denied' || Notification?.permission === 'denied') {
        setState('denied');
        toast.error('El navegador bloqueó las notificaciones. Actívalas en los ajustes del sitio.');
      } else if (e?.response?.status === 503) {
        toast.error('El servidor aún no tiene configuradas las notificaciones push');
      } else {
        toast.error(e?.message || 'No se pudo cambiar la preferencia');
      }
    } finally {
      setWorking(false);
    }
  };

  const test = async () => {
    setWorking(true);
    try {
      const { devices } = await sendTestPush();
      toast.success(`Enviada a ${devices} dispositivo(s). Cierra la app y espera unos segundos.`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo enviar la prueba');
    } finally {
      setWorking(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="rounded-[18px] bg-card border shadow-card p-6" data-testid="config-notifications-panel">
      <h3 className="font-heading font-semibold mb-1 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-[#00a5df]" /> Notificaciones push
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Recibe un aviso en este dispositivo cuando te asignen una actividad, aprueben tus vacaciones,
        reserven la sala y más — aunque no tengas la app abierta.
      </p>

      {state === 'loading' && <p className="text-sm text-muted-foreground">Comprobando…</p>}

      {state === 'unsupported' && (
        <div className="flex items-start gap-2 rounded-xl border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          Este navegador no soporta notificaciones push. Prueba con Chrome, Edge o Firefox actualizados.
        </div>
      )}

      {state === 'denied' && (
        <div className="flex items-start gap-2 rounded-xl border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-[#dc2626]">
          <BellOff className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Las notificaciones están <b>bloqueadas</b> para este sitio en tu navegador.
            Ábrelas desde el candado de la barra de direcciones → Notificaciones → Permitir, y recarga.
          </span>
        </div>
      )}

      {canToggle && (
        <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 grid place-items-center rounded-full" style={{ background: on ? 'rgba(0,165,223,0.14)' : 'rgba(138,139,139,0.14)' }}>
              {on ? <Bell className="h-4 w-4 text-[#00a5df]" /> : <BellOff className="h-4 w-4 text-muted-foreground" />}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Activar en este dispositivo</p>
              <p className="text-xs text-muted-foreground">{on ? 'Estás recibiendo notificaciones aquí' : 'Actualmente desactivadas'}</p>
            </div>
          </div>
          <Switch checked={on} disabled={working} onCheckedChange={toggle} data-testid="config-push-switch" />
        </div>
      )}

      {on && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={test} disabled={working} data-testid="config-push-test"
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
            <BellRing className="h-3.5 w-3.5" /> Enviar notificación de prueba
          </button>
          <span className="text-[11px] text-muted-foreground">Pulsa, cierra la app y verifica que llega igual.</span>
        </div>
      )}

      {isIosNonStandalone() && (
        <p className="mt-3 flex items-start gap-1.5 text-[12px] text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          En iPhone/iPad primero añade la app a la pantalla de inicio (Compartir → Añadir a inicio) y ábrela desde ahí. Requiere iOS 16.4 o superior.
        </p>
      )}
    </motion.div>
  );
}

export default function Configuracion() {
  const { user, refreshUser } = useAuth();
  const { theme, isDark, setTheme } = useTheme();
  const [form, setForm] = useState({ name: user?.name || '', position: user?.position || '', area: user?.area || '', sucursal: user?.sucursal || '', phone: user?.phone || '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setVal = (k) => (v) => setForm({ ...form, [k]: v });

  const save = async () => {
    setSaving(true);
    try { await api.patch('/users/me', form); await refreshUser(); toast.success('Perfil actualizado'); }
    catch (e) { toast.error('Error al guardar'); } finally { setSaving(false); }
  };

  return (
    <div className="max-w-[900px] mx-auto pt-2">
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Configuración</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Administra tu perfil y preferencias</p>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="perfil" className="rounded-lg" data-testid="config-tab-perfil"><UserIcon className="h-4 w-4 mr-1.5" /> Perfil</TabsTrigger>
          <TabsTrigger value="preferencias" className="rounded-lg" data-testid="config-tab-preferencias"><Palette className="h-4 w-4 mr-1.5" /> Preferencias</TabsTrigger>
          <TabsTrigger value="notificaciones" className="rounded-lg" data-testid="config-tab-notificaciones"><Bell className="h-4 w-4 mr-1.5" /> Notificaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="rounded-[18px] bg-card border shadow-card p-6">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="h-20 w-20 border-2"><AvatarImage src={user?.avatar_url} /><AvatarFallback className="text-xl">{user?.name?.[0]}</AvatarFallback></Avatar>
              <div>
                <p className="font-heading text-xl font-semibold">{user?.name}</p>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
                {user?.role === 'admin' && <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-[rgba(30,57,94,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-[11px] font-semibold px-2 py-0.5"><Shield className="h-3 w-3" /> Administrador</span>}
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Nombre completo</Label><Input value={form.name} onChange={set('name')} className="h-11" data-testid="config-name-input" /></div>
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select value={form.position} onValueChange={(v) => setForm((f) => ({ ...f, position: v, area: v === 'Director comercial' ? 'Casa Matriz' : (f.area === 'Casa Matriz' ? '' : f.area), sucursal: '' }))}>
                  <SelectTrigger className="h-11" data-testid="config-position-select"><SelectValue placeholder="Selecciona un cargo" /></SelectTrigger>
                  <SelectContent>{CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Área</Label>
                {form.position === 'Director comercial' ? (
                  <div className="h-11 flex items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground" data-testid="config-area-fixed">Casa Matriz</div>
                ) : (
                  <Select value={form.area} onValueChange={(v) => setForm({ ...form, area: v, sucursal: v === 'Tienda' ? form.sucursal : '' })}>
                    <SelectTrigger className="h-11" data-testid="config-area-select"><SelectValue placeholder="Selecciona un área" /></SelectTrigger>
                    <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              {form.area === 'Tienda' && (
              <div className="space-y-1.5">
                <Label>Tienda / Sucursal</Label>
                <Select value={form.sucursal} onValueChange={setVal('sucursal')}>
                  <SelectTrigger className="h-11" data-testid="config-sucursal-select"><SelectValue placeholder="Selecciona tu tienda" /></SelectTrigger>
                  <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              )}
              <div className="space-y-1.5"><Label>Teléfono</Label><Input value={form.phone} onChange={set('phone')} placeholder="Opcional" className="h-11" /></div>
              <div className="space-y-1.5"><Label>Correo</Label><Input value={user?.email} disabled className="h-11 opacity-60" /></div>
            </div>
            <div className="mt-6 flex justify-end">
              <Button onClick={save} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="config-save-button"><Save className="h-4 w-4 mr-1.5" /> {saving ? 'Guardando…' : 'Guardar cambios'}</Button>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="preferencias">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="rounded-[18px] bg-card border shadow-card p-6">
            <h3 className="font-heading font-semibold mb-4">Apariencia</h3>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button onClick={() => setTheme('light')} className={`rounded-xl border-2 p-4 text-left transition-colors ${!isDark ? 'border-[#00a5df]' : 'border-border'}`} data-testid="theme-light-option">
                <Sun className="h-5 w-5 text-[#ec9032] mb-2" />
                <p className="font-medium text-sm">Modo claro</p>
                <p className="text-xs text-muted-foreground">Limpio y luminoso</p>
              </button>
              <button onClick={() => setTheme('dark')} className={`rounded-xl border-2 p-4 text-left transition-colors ${isDark ? 'border-[#3cbef6]' : 'border-border'}`} data-testid="theme-dark-option">
                <Moon className="h-5 w-5 text-[#3cbef6] mb-2" />
                <p className="font-medium text-sm">Modo oscuro</p>
                <p className="text-xs text-muted-foreground">Elegante tipo Linear</p>
              </button>
            </div>
          </motion.div>
        </TabsContent>

        <TabsContent value="notificaciones">
          <NotificationsSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
