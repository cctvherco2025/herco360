import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Shield, UserCog, Clock, Mail, Plus, Pencil, Trash2, Eye, EyeOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { timeAgoEs } from '@/lib/time';
import {
  SUCURSALES, RETAIL, departamentoDe, puedeGestionarUsuarios, esSuperAdmin, esJefeDepto,
} from '@/lib/constants';
import { useEstructura, nombreDepto, tonoDepto } from '@/lib/organizacion';
import { ExcepcionesAcceso } from '@/components/AccesoAdmin';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { confirmar } from '@/components/ConfirmDialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GruposSection, GrupoDialog, GrupoPills, CrearGrupoButton } from '@/components/GruposUsuarios';

const emptyForm = { name: '', email: '', password: '', departamento: RETAIL, cargo_id: '', area_id: '', sucursal: '', role: 'user', super_admin: false };

// Etiqueta del departamento (la ve el super admin, que ve todos)
function DeptoBadge({ depto, deptos }) {
  return (
    <span className={`rounded-full text-[11px] font-medium px-2 py-0.5 shrink-0 ${tonoDepto(deptos, depto)}`}>
      {nombreDepto(deptos, depto)}
    </span>
  );
}

export default function Usuarios() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const superAdmin = esSuperAdmin(user);
  // aprueban, crean y editan: el super admin a todos; un admin, a su
  // departamento; el jefe de un departamento que no es Retail, a su gente
  // (no a admins ni a otro jefe del departamento)
  const gestor = puedeGestionarUsuarios(user);
  const puedeEditar = (u) => {
    if (superAdmin) return true;
    if (departamentoDe(u) !== departamentoDe(user) || esSuperAdmin(u)) return false;
    return isAdmin || (u.role !== 'admin' && !esJefeDepto(u));
  };
  const [users, setUsers] = useState([]);
  const { estructura } = useEstructura();
  const deptos = estructura?.departamentos || [];
  // el super admin: ver un departamento o todos
  const [verDepto, setVerDepto] = useState('');

  // create / edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null); // user object when editing, null when creating
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  // excepciones de permisos que se cambiaron en el formulario (accion -> true|false|null)
  const [excepciones, setExcepciones] = useState({});

  const load = useCallback(async () => {
    try { const { data } = await api.get('/users'); setUsers(data); } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  // Grupos de usuarios (atajo para agregar participantes en la Agenda)
  const [grupos, setGrupos] = useState([]);
  const [grupoDialog, setGrupoDialog] = useState({ open: false, grupo: null });
  const loadGrupos = useCallback(async () => {
    try { const { data } = await api.get('/groups'); setGrupos(data); } catch (e) {}
  }, []);
  useEffect(() => { loadGrupos(); }, [loadGrupos]);
  const abrirGrupo = (grupo = null) => setGrupoDialog({ open: true, grupo });

  const pending = users.filter((u) => u.status === 'pending');
  const approved = users.filter((u) => u.status === 'approved' && (!verDepto || departamentoDe(u) === verDepto));
  const etiquetaAdmin = (u) => (esSuperAdmin(u) ? 'Super admin' : 'Admin');

  // Buscador del equipo: nombre, correo, cargo, área o tienda; ignora
  // mayúsculas, tildes y espacios de más. Varias palabras = deben estar todas
  // ("ligia h1", "coordinador tienda").
  const [busqueda, setBusqueda] = useState('');
  const norm = (v) => (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const palabras = norm(busqueda).split(' ').filter(Boolean);
  const approvedFiltrados = palabras.length
    ? approved.filter((u) => {
      const texto = norm([u.name, u.email, u.position, u.area, u.sucursal, nombreDepto(deptos, u.departamento), u.role === 'admin' ? 'admin administrador' : ''].join(' '));
      return palabras.every((p) => texto.includes(p));
    })
    : approved;

  const approve = async (id) => { try { await api.post(`/users/${id}/approve`); toast.success('Usuario aprobado'); load(); } catch (e) { toast.error('Error'); } };
  const reject = async (id) => { try { await api.post(`/users/${id}/reject`); toast.success('Usuario rechazado'); load(); } catch (e) { toast.error('Error'); } };
  const setRole = async (id, role) => { try { await api.patch(`/users/${id}/role`, { role }); toast.success('Rol actualizado'); load(); } catch (e) { toast.error('Error'); } };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // cargos y áreas del departamento del formulario (su estructura); quien no
  // es admin no asigna el cargo de jefe del departamento
  const deptoForm = deptos.find((d) => d.id === form.departamento);
  const cargosForm = (deptoForm?.cargos || []).filter((c) => isAdmin || c.nivel !== 'jefe_depto' || c.id === form.cargo_id);
  const areasForm = deptoForm?.areas || [];
  const cargoSel = cargosForm.find((c) => c.id === form.cargo_id);
  const areaOpcional = cargoSel?.nivel === 'jefe_depto';
  const enTienda = areasForm.find((a) => a.id === form.area_id)?.clave === 'Tienda';

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, departamento: departamentoDe(user) });
    setShowPass(false);
    setDialogOpen(true);
  };
  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name || '', email: u.email || '', password: '',
      departamento: departamentoDe(u), cargo_id: u.cargo_id || '', area_id: u.area_id || '',
      sucursal: u.sucursal && u.sucursal !== 'Casa Matriz' ? u.sucursal : '',
      role: u.role || 'user', super_admin: !!u.super_admin,
    });
    setShowPass(false);
    setExcepciones({});
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Ingresa el nombre'); return; }
    if (!form.email.trim()) { toast.error('Ingresa el correo'); return; }
    if (!editing && form.password.length < 4) { toast.error('La contraseña debe tener al menos 4 caracteres'); return; }
    if (!form.cargo_id) { toast.error('Selecciona el cargo'); return; }
    if (!areaOpcional && !form.area_id) { toast.error('Selecciona el área'); return; }
    if (enTienda && !form.sucursal) { toast.error('Selecciona la tienda/sucursal'); return; }
    setSaving(true);
    try {
      if (editing) {
        const payload = {
          name: form.name, email: form.email, cargo_id: form.cargo_id,
          area_id: form.area_id || null, sucursal: enTienda ? form.sucursal : '',
        };
        if (isAdmin) payload.role = form.role;
        if (superAdmin) { payload.departamento = form.departamento; payload.super_admin = form.super_admin; }
        if (form.password) payload.password = form.password;
        await api.patch(`/users/${editing.id}`, payload);
        if (Object.keys(excepciones).length) await api.put(`/acceso/usuario/${editing.id}`, { excepciones });
        toast.success('Usuario actualizado');
      } else {
        await api.post('/users', { ...form, area_id: form.area_id || null, sucursal: enTienda ? form.sucursal : '' });
        toast.success('Usuario creado');
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const confirmDelete = async (u) => {
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar usuario?',
      mensaje: <>Se eliminará a <b>{u.name}</b>{u.email ? <> ({u.email})</> : null}. Ya no podrá ingresar al sistema. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Usuario eliminado',
      accion: () => api.delete(`/users/${u.id}`),
    });
    if (ok) load();
  };

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{gestor ? 'Crea, aprueba y administra el equipo' : 'Directorio del equipo HERCO'}</p>
        </div>
        {/* Crear grupo: cualquier usuario. Crear usuario: solo admin. */}
        <div className="flex flex-wrap items-center gap-2">
          <CrearGrupoButton onClick={() => abrirGrupo()} />
          {gestor && (
            <Button onClick={openCreate} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="create-user-button">
              <Plus className="h-4 w-4 mr-1.5" /> Crear usuario
            </Button>
          )}
        </div>
      </div>

      {gestor && (
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
                <div key={u.id} className="min-w-0 rounded-xl border p-4 flex items-center gap-3" data-testid="pending-user-card">
                  <Avatar className="h-11 w-11 border"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.position}{u.area ? ` · ${u.area}` : ''} · {timeAgoEs(u.created_at)}</p>
                    {superAdmin && <div className="mt-1"><DeptoBadge depto={u.departamento} deptos={deptos} /></div>}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => approve(u.id)} className="h-9 w-9 grid place-items-center rounded-lg bg-[rgba(22,163,74,0.12)] text-[#16a34a] hover:bg-[rgba(22,163,74,0.22)]" data-testid="approve-user-button"><Check className="h-4 w-4" /></button>
                    <button onClick={() => reject(u.id)} className="h-9 w-9 grid place-items-center rounded-lg bg-[rgba(220,38,38,0.1)] text-[#dc2626] hover:bg-[rgba(220,38,38,0.2)]" data-testid="reject-user-button"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Grupos: entre Solicitudes pendientes y Equipo. Cada quien ve los suyos
          (integrante o creador; admin ve todos). */}
      <GruposSection grupos={grupos} usuarios={approved}
        onNuevo={() => abrirGrupo()} onEditar={(g) => abrirGrupo(g)} onEliminado={loadGrupos} />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}
        className="rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-heading text-lg font-semibold">
              Equipo ({palabras.length ? `${approvedFiltrados.length} de ${approved.length}` : approved.length})
            </h2>
            {superAdmin && deptos.length > 1 && (
              <div className="flex gap-1 flex-wrap" data-testid="users-depto-filtro">
                {[['', 'Todos'], ...deptos.map((d) => [d.id, d.nombre])].map(([v, l]) => (
                  <button key={l} type="button" onClick={() => setVerDepto(v)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${verDepto === v
                      ? 'bg-[#1e395e] text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>{l}</button>
                ))}
              </div>
            )}
          </div>
          <div className="relative w-full sm:w-[320px]">
            <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, correo, cargo, área o tienda…"
              className="h-10 pl-9 pr-9 rounded-xl" data-testid="users-search-input" />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {palabras.length > 0 && approvedFiltrados.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8" data-testid="users-search-empty">
            Ningún usuario coincide con “{busqueda.trim()}”
          </p>
        )}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {approvedFiltrados.map((u) => (
            <div key={u.id} className="min-w-0 rounded-xl border p-4 hover:shadow-card transition-shadow" data-testid="user-card">
              <div className="flex items-start gap-3">
  <Avatar className="h-12 w-12 border shrink-0"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
  <div className="flex-1 min-w-0">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <p className="font-medium truncate">{u.name}</p>
      {u.role === 'admin'
        ? <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(30,57,94,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-[11px] font-semibold px-2 py-0.5 shrink-0"><Shield className="h-3 w-3" /> {etiquetaAdmin(u)}</span>
        : <span className="rounded-full bg-muted text-muted-foreground text-[11px] font-medium px-2 py-0.5 shrink-0">Usuario</span>}
    </div>
    <p className="text-xs text-muted-foreground truncate">{u.position}{u.area ? ` · ${u.area}` : ''}</p>
    {superAdmin && <div className="mt-1"><DeptoBadge depto={u.departamento} deptos={deptos} /></div>}
    <GrupoPills userId={u.id} grupos={grupos} />
  </div>
</div>
              <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t">
  <span className="text-xs text-muted-foreground inline-flex items-center gap-1 truncate min-w-0 flex-1"><Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{u.email}</span></span>
  {gestor && puedeEditar(u) && (
    <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(u)} title="Editar" className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#1e395e] dark:hover:text-[#3cbef6] hover:bg-muted" data-testid="edit-user-button"><Pencil className="h-3.5 w-3.5" /></button>
                    {isAdmin && u.id !== user?.id && (
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
                        <button onClick={() => confirmDelete(u)} title="Eliminar" className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="delete-user-button"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      <GrupoDialog open={grupoDialog.open} grupo={grupoDialog.grupo} usuarios={approved} grupos={grupos}
        onOpenChange={(o) => setGrupoDialog((s) => ({ ...s, open: o }))} onSaved={loadGrupos} />

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* En celular: margen a los lados, alto máximo de la pantalla y el
            formulario con scroll propio — el encabezado y los botones quedan
            siempre visibles (antes el botón "Crear usuario" quedaba fuera). */}
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[520px] rounded-[22px] p-0 gap-0 max-h-[90dvh] flex flex-col overflow-hidden">
          <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
            <DialogTitle className="font-heading text-xl">{editing ? 'Editar usuario' : 'Crear usuario'}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-4 space-y-4">
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
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              {superAdmin ? (
                <Select value={form.departamento} onValueChange={(v) => setForm((f) => ({ ...f, departamento: v, cargo_id: '', area_id: '', sucursal: '' }))}>
                  <SelectTrigger className="h-11" data-testid="user-form-departamento"><SelectValue /></SelectTrigger>
                  <SelectContent>{deptos.map((d) => <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <div className="h-11 flex items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground">{nombreDepto(deptos, form.departamento)}</div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 min-w-0">
                <Label>Cargo</Label>
                <Select value={form.cargo_id} onValueChange={(v) => setF('cargo_id', v)}>
                  <SelectTrigger className="h-11" data-testid="user-form-position"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>{cargosForm.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 min-w-0">
                <Label>Área{areaOpcional ? ' (opcional)' : ''}</Label>
                <Select value={form.area_id || '__ninguna'} onValueChange={(v) => setForm((f) => ({ ...f, area_id: v === '__ninguna' ? '' : v }))}>
                  <SelectTrigger className="h-11" data-testid="user-form-area"><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {areaOpcional && <SelectItem value="__ninguna">Sin área (todo el departamento)</SelectItem>}
                    {!areaOpcional && !form.area_id && <SelectItem value="__ninguna" disabled>Selecciona</SelectItem>}
                    {areasForm.map((a) => <SelectItem key={a.id} value={a.id}>{a.etiqueta}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {enTienda && (
              <div className="space-y-1.5">
                <Label>Tienda / Sucursal</Label>
                <Select value={form.sucursal} onValueChange={(v) => setF('sucursal', v)}>
                  <SelectTrigger className="h-11" data-testid="user-form-sucursal"><SelectValue placeholder="Selecciona tu tienda" /></SelectTrigger>
                  <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {isAdmin && <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={form.role} onValueChange={(v) => setF('role', v)}>
                <SelectTrigger className="h-11" data-testid="user-form-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuario</SelectItem>
                  <SelectItem value="admin">Administrador del departamento</SelectItem>
                </SelectContent>
              </Select>
            </div>}
            {editing && (
              <div className="space-y-1.5">
                <Label>Permisos</Label>
                <ExcepcionesAcceso key={editing.id} userId={editing.id} onCambio={setExcepciones} />
              </div>
            )}
            {superAdmin && form.role === 'admin' && (
              <label className="flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer" data-testid="user-form-super">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1e395e]" checked={form.super_admin}
                  disabled={editing?.id === user?.id} onChange={(e) => setF('super_admin', e.target.checked)} />
                <span className="text-sm">
                  <span className="font-medium">Super admin</span>
                  <span className="block text-xs text-muted-foreground">Ve y administra todos los departamentos y crea departamentos nuevos.</span>
                </span>
              </label>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 px-5 sm:px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="user-form-submit">
              {saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear usuario')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
    </div>
  );
}
