import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Shield, UserCog, Clock, Mail, Plus, Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { timeAgoEs } from '@/lib/time';
import { CARGOS, AREAS, SUCURSALES } from '@/lib/constants';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const emptyForm = { name: '', email: '', password: '', position: '', area: '', sucursal: '', role: 'user' };

export default function Usuarios() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [users, setUsers] = useState([]);

  // create / edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // user object when editing, null when creating
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/users'); setUsers(data); } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const pending = users.filter((u) => u.status === 'pending');
  const approved = users.filter((u) => u.status === 'approved');

  const approve = async (id) => { try { await api.post(`/users/${id}/approve`); toast.success('Usuario aprobado'); load(); } catch (e) { toast.error('Error'); } };
  const reject = async (id) => { try { await api.post(`/users/${id}/reject`); toast.success('Usuario rechazado'); load(); } catch (e) { toast.error('Error'); } };
  const setRole = async (id, role) => { try { await api.patch(`/users/${id}/role`, { role }); toast.success('Rol actualizado'); load(); } catch (e) { toast.error('Error'); } };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowPass(false); setDialogOpen(true); };
  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name || '', email: u.email || '', password: '',
      position: u.position || '', area: u.area || '',
      sucursal: u.sucursal && u.sucursal !== 'Casa Matriz' ? u.sucursal : '',
      role: u.role || 'user',
    });
    setShowPass(false);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Ingresa el nombre'); return; }
    if (!form.email.trim()) { toast.error('Ingresa el correo'); return; }
    if (!editing && form.password.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    if (form.area === 'Tienda' && !form.sucursal) { toast.error('Selecciona la tienda/sucursal'); return; }
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          name: form.name, email: form.email, position: form.position,
          area: form.area, sucursal: form.sucursal, role: form.role,
        };
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editing.id}`, payload);
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', form);
        toast.success('Usuario creado');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/users/${deleteTarget.id}`);
      toast.success('Usuario eliminado');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al eliminar');
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{isAdmin ? 'Crea, aprueba y administra el equipo' : 'Directorio del equipo HERCO'}</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="create-user-button">
            <Plus className="h-4 w-4 mr-1.5" /> Crear usuario
          </Button>
        )}
      </div>

      {isAdmin && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="rounded-[18px] bg-card border shadow-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-[#ec9032]" />
            <h2 className="font-heading text-lg font-semibold">Solicitudes pendientes</h2>
            {pending.length > 0 && <span className="rounded-full bg-[rgba(236,144,50,0.14)] text-[#ec9032] text-xs font-semibold px-2 py-0.5">{pending.length}</span>}
          </div>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay solicitudes pendientes</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {pending.map((u) => (
                <div key={u.id} className="rounded-xl border p-4 flex items-center gap-3" data-testid="pending-user-card">
                  <Avatar className="h-11 w-11 border"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.position} · {timeAgoEs(u.created_at)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => approve(u.id)} className="h-9 w-9 grid place-items-center rounded-lg bg-[rgba(22,163,74,0.12)] text-[#16a34a] hover:bg-[rgba(22,163,74,0.22)]" data-testid="approve-user-button"><Check className="h-4 w-4" /></button>
                    <button onClick={() => reject(u.id)} className="h-9 w-9 grid place-items-center rounded-lg bg-[rgba(220,38,38,0.1)] text-[#dc2626] hover:bg-[rgba(220,38,38,0.2)]" data-testid="reject-user-button"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}
        className="rounded-[18px] bg-card border shadow-card p-5">
        <h2 className="font-heading text-lg font-semibold mb-4">Equipo ({approved.length})</h2>
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {approved.map((u) => (
            <div key={u.id} className="rounded-xl border p-4 hover:shadow-card transition-shadow" data-testid="user-card">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 border"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.position}{u.area ? ` · ${u.area}` : ''}</p>
                </div>
                {u.role === 'admin'
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(30,57,94,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-[11px] font-semibold px-2 py-0.5"><Shield className="h-3 w-3" /> Admin</span>
                  : <span className="rounded-full bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5">Usuario</span>}
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t">
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" /> {u.email}</span>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(u)} title="Editar" className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#1e395e] dark:hover:text-[#3cbef6] hover:bg-muted" data-testid="edit-user-button"><Pencil className="h-3.5 w-3.5" /></button>
                    {u.id !== user?.id && (
                      <>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#00a5df] hover:bg-muted" title="Cambiar rol" data-testid="user-role-menu"><UserCog className="h-3.5 w-3.5" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onClick={() => setRole(u.id, 'admin')}><Shield className="h-4 w-4 mr-2" /> Hacer administrador</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setRole(u.id, 'user')}><UserCog className="h-4 w-4 mr-2" /> Hacer usuario</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button onClick={() => setDeleteTarget(u)} title="Eliminar" className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="delete-user-button"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">{editing ? 'Editar usuario' : 'Crear usuario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Nombre completo</Label>
              <Input value={form.name} onChange={(e) => setF('name', e.target.value)} placeholder="Nombre" className="h-11" data-testid="user-form-name" />
            </div>
            <div className="space-y-1.5">
              <Label>Correo corporativo</Label>
              <Input type="email" value={form.email} onChange={(e) => setF('email', e.target.value)} placeholder="nombre@herco.com" className="h-11" data-testid="user-form-email" />
            </div>
            <div className="space-y-1.5">
              <Label>{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</Label>
              <div className="relative">
                <Input type={showPass ? 'text' : 'password'} value={form.password} onChange={(e) => setF('password', e.target.value)}
                  placeholder={editing ? 'Dejar en blanco para no cambiar' : 'Mínimo 4 caracteres'} className="h-11 pr-10" data-testid="user-form-password" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cargo</Label>
                <Select value={form.position} onValueChange={(v) => setForm((f) => ({ ...f, position: v, area: v === 'Director comercial' ? 'Casa Matriz' : (f.area === 'Casa Matriz' ? '' : f.area), sucursal: '' }))}>
                  <SelectTrigger className="h-11" data-testid="user-form-position"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{CARGOS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Área</Label>
                {form.position === 'Director comercial' ? (
                  <div className="h-11 flex items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground" data-testid="user-form-area-fixed">Casa Matriz</div>
                ) : (
                  <Select value={form.area} onValueChange={(v) => setForm((f) => ({ ...f, area: v, sucursal: v === 'Tienda' ? f.sucursal : '' }))}>
                    <SelectTrigger className="h-11" data-testid="user-form-area"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                    <SelectContent>{AREAS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
            </div>
            {form.area === 'Tienda' && (
              <div className="space-y-1.5">
                <Label>Tienda / Sucursal</Label>
                <Select value={form.sucursal} onValueChange={(v) => setF('sucursal', v)}>
                  <SelectTrigger className="h-11" data-testid="user-form-sucursal"><SelectValue placeholder="Selecciona tu tienda" /></SelectTrigger>
                  <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setF('role', v)}>
                <SelectTrigger className="h-11" data-testid="user-form-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuario</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="user-form-submit">
              {saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear usuario')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-[22px]">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que deseas eliminar a <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white" data-testid="confirm-delete-user">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
