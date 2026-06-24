import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { User as UserIcon, Palette, Save, Moon, Sun, Shield } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CARGOS, AREAS, SUCURSALES } from '@/lib/constants';

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
                <Select value={form.position} onValueChange={setVal('position')}>
                  <SelectTrigger className="h-11" data-testid="config-position-select"><SelectValue placeholder="Selecciona un cargo" /></SelectTrigger>
                  <SelectContent>{CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Área</Label>
                <Select value={form.area} onValueChange={setVal('area')}>
                  <SelectTrigger className="h-11" data-testid="config-area-select"><SelectValue placeholder="Selecciona un área" /></SelectTrigger>
                  <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tienda / Sucursal</Label>
                <Select value={form.sucursal} onValueChange={setVal('sucursal')}>
                  <SelectTrigger className="h-11" data-testid="config-sucursal-select"><SelectValue placeholder="Selecciona tu tienda" /></SelectTrigger>
                  <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
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
      </Tabs>
    </div>
  );
}
