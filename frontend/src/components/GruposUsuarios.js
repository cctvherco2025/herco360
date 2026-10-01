// Grupos de usuarios (pantalla Usuarios). Los grupos SOLO sirven para agregar
// varios participantes de una vez en la Agenda: no dan permisos ni cambian
// jerarquías. Aquí viven:
//   - GruposSection: grid de tarjetas + tarjeta punteada "Nuevo grupo".
//   - GrupoDialog: modal Crear / Editar grupo (nombre, descripción, color e
//     integrantes con buscador).
//   - GrupoPills: etiquetas de grupos bajo el cargo en las tarjetas de Equipo.
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserPlus, Pencil, Trash2, Plus, Search, X, Check, Loader2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { ACTIVITY_COLORS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { confirmar } from '@/components/ConfirmDialog';
import { AvatarIniciales, Resaltado, normalizar, palabrasDe, coincide, SIN_AREA } from '@/components/ParticipantPicker';

const MAX_NOMBRE = 50;
const MAX_DESCRIPCION = 80;
const COLOR_DEFAULT = ACTIVITY_COLORS[0].value;

// Ícono de grupo en cuadro redondeado del color del grupo
export function GrupoIcono({ color, className = 'h-10 w-10', iconClass = 'h-5 w-5' }) {
  return (
    <span className={`shrink-0 rounded-xl grid place-items-center text-white ${className}`} style={{ background: color || COLOR_DEFAULT }}>
      <Users className={iconClass} />
    </span>
  );
}

// Etiquetas (pill) de los grupos de un usuario, con el color de cada grupo
export function GrupoPills({ userId, grupos }) {
  const suyos = grupos.filter((g) => (g.miembros || []).includes(userId));
  if (!suyos.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5" data-testid="user-group-pills">
      {suyos.map((g) => (
        <span key={g.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold max-w-full truncate"
          style={{ color: g.color, background: `${g.color}1f` }} title={g.descripcion || g.nombre}>
          {g.nombre}
        </span>
      ))}
    </div>
  );
}

function GrupoCard({ grupo, usersById, onEdit, onDelete }) {
  const integrantes = (grupo.miembros || []).map((id) => usersById.get(id)).filter(Boolean);
  const primeros = integrantes.slice(0, 5);
  const extra = integrantes.length - primeros.length;
  return (
    <div className="rounded-xl border bg-card overflow-hidden flex flex-col hover:shadow-card transition-shadow min-w-0"
      style={{ borderTop: `4px solid ${grupo.color}` }} data-testid="group-card">
      <div className="p-4 flex items-start gap-3 flex-1">
        <GrupoIcono color={grupo.color} />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{grupo.nombre}</p>
          <p className={`text-xs truncate ${grupo.descripcion ? 'text-muted-foreground' : 'text-muted-foreground/60 italic'}`}>
            {grupo.descripcion || 'Sin descripción'}
          </p>
          {/* avatares apilados de los primeros 5 (nombre al pasar el mouse) */}
          <div className="flex items-center mt-3">
            {primeros.map((u, i) => (
              <AvatarIniciales key={u.id} nombre={u.name} title={u.name}
                className={`h-7 w-7 text-[10px] ring-2 ring-card ${i ? '-ml-2' : ''}`} />
            ))}
            {extra > 0 && (
              <span className="-ml-2 h-7 min-w-7 px-1.5 rounded-full ring-2 ring-card bg-muted text-muted-foreground text-[10px] font-semibold grid place-items-center"
                title={integrantes.slice(5).map((u) => u.name).join(', ')}>
                +{extra}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t">
        <span className="text-xs text-muted-foreground">{integrantes.length} integrante{integrantes.length === 1 ? '' : 's'}</span>
        {/* Editar / Eliminar: solo quien lo creó y admins (lo decide el servidor) */}
        {grupo.puede_editar && (
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(grupo)} title="Editar grupo" aria-label="Editar grupo"
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#1e395e] dark:hover:text-[#3cbef6] hover:bg-muted" data-testid="group-edit">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onDelete(grupo)} title="Eliminar grupo" aria-label="Eliminar grupo"
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="group-delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

// Sección "Grupos (N)" de la pantalla Usuarios. Cada usuario ve solo los
// grupos donde es integrante, los que creó (o todos si es admin): el servidor
// ya los filtra.
export function GruposSection({ grupos, usuarios, onNuevo, onEditar, onEliminado }) {
  const usersById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
  const confirmarEliminar = async (g) => {
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar grupo?',
      mensaje: <>Se eliminará el grupo <b>{g.nombre}</b>. Los usuarios que lo forman no se eliminan.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Grupo eliminado',
      accion: () => api.delete(`/groups/${g.id}`),
    });
    if (ok) onEliminado();
  };

  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5 mb-5" data-testid="groups-section">
      <div className="flex items-center gap-2 mb-1">
        <Users className="h-5 w-5 text-[#00a5df]" />
        <h2 className="font-heading text-lg font-semibold">Grupos ({grupos.length})</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">Los grupos sirven para agregar varios participantes de una vez en la Agenda.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {grupos.map((g) => (
          <GrupoCard key={g.id} grupo={g} usersById={usersById} onEdit={onEditar} onDelete={confirmarEliminar} />
        ))}
        <button type="button" onClick={onNuevo}
          className="min-h-[150px] rounded-xl border-2 border-dashed text-muted-foreground hover:text-[#00a5df] hover:border-[#00a5df]/60 hover:bg-[rgba(0,165,223,0.04)] transition-colors flex flex-col items-center justify-center gap-1.5"
          data-testid="group-new-card">
          <Plus className="h-6 w-6" />
          <span className="text-sm font-medium">Nuevo grupo</span>
        </button>
      </div>

    </div>
  );
}

// Modal Crear / Editar grupo
export function GrupoDialog({ open, onOpenChange, grupo, usuarios, grupos, onSaved }) {
  const editando = !!grupo;
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [color, setColor] = useState(COLOR_DEFAULT);
  const [miembros, setMiembros] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorNombre, setErrorNombre] = useState('');

  useEffect(() => {
    if (!open) return;
    setNombre(grupo?.nombre || '');
    setDescripcion(grupo?.descripcion || '');
    setColor(grupo?.color || COLOR_DEFAULT);
    setMiembros(grupo?.miembros || []);
    setBusqueda('');
    setErrorNombre('');
  }, [open, grupo]);

  // "Ya existe un grupo con ese nombre" — sin importar mayúsculas/tildes
  const nombreKey = normalizar(nombre).replace(/\s+/g, ' ').trim();
  const duplicado = !!nombreKey && grupos.some((g) => g.id !== grupo?.id && normalizar(g.nombre).replace(/\s+/g, ' ').trim() === nombreKey);
  const avisoNombre = duplicado ? 'Ya existe un grupo con ese nombre' : errorNombre;

  const palabras = useMemo(() => palabrasDe(busqueda), [busqueda]);
  const areas = useMemo(() => {
    const porArea = new Map();
    usuarios.forEach((u) => {
      const area = (u.area || '').trim() || SIN_AREA;
      if (palabras.length && !coincide(`${u.name || ''} ${u.position || ''} ${area}`, palabras)) return;
      if (!porArea.has(area)) porArea.set(area, []);
      porArea.get(area).push(u);
    });
    return [...porArea.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([area, lista]) => ({ area, personas: lista.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')) }));
  }, [usuarios, palabras]);

  const toggle = (id) => setMiembros((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  // solo sobre las personas visibles con el filtro actual
  const toggleArea = (personas) => {
    const ids = personas.map((u) => u.id);
    const todas = ids.every((id) => miembros.includes(id));
    setMiembros((m) => (todas ? m.filter((id) => !ids.includes(id)) : [...new Set([...m, ...ids])]));
  };

  const puedeGuardar = nombre.trim() && miembros.length > 0 && !duplicado && !guardando;

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    setErrorNombre('');
    const payload = { nombre: nombre.trim(), descripcion: descripcion.trim(), color, miembros };
    try {
      if (editando) {
        await api.put(`/groups/${grupo.id}`, payload);
        toast.success('Grupo actualizado');
      } else {
        await api.post('/groups', payload);
        toast.success(`Grupo "${payload.nombre}" creado · ya disponible en Agenda`);
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      const detail = e?.response?.data?.detail;
      if (e?.response?.status === 409) setErrorNombre(detail || 'Ya existe un grupo con ese nombre');
      else toast.error(detail || 'No se pudo guardar el grupo');
    } finally { setGuardando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[560px] rounded-[22px] p-0 gap-0 max-h-[90dvh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-3 text-left">
          <DialogTitle className="font-heading text-xl">{editando ? 'Editar grupo' : 'Crear grupo'}</DialogTitle>
          <p className="text-sm text-muted-foreground">Elegí un nombre y los integrantes del grupo.</p>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 pb-4 space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre del grupo</Label>
            <Input value={nombre} maxLength={MAX_NOMBRE} onChange={(e) => { setNombre(e.target.value); setErrorNombre(''); }}
              placeholder="Ej. Gerentes de tienda" className={`h-11 ${avisoNombre ? 'border-[#dc2626]' : ''}`} data-testid="group-form-name" />
            {avisoNombre && (
              <p className="text-xs text-[#dc2626] flex items-center gap-1" data-testid="group-form-name-error">
                <AlertTriangle className="h-3.5 w-3.5" /> {avisoNombre}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input value={descripcion} maxLength={MAX_DESCRIPCION} onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. Gerentes de las 5 tiendas" className="h-11" data-testid="group-form-description" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-2.5" data-testid="group-form-color">
              {ACTIVITY_COLORS.map((c) => {
                const activo = color.toLowerCase() === c.value.toLowerCase();
                return (
                  <button key={c.value} type="button" title={c.name} aria-label={c.name} onClick={() => setColor(c.value)}
                    className={`h-8 w-8 rounded-full grid place-items-center transition-transform hover:scale-110 ${activo ? 'ring-2 ring-offset-2 ring-offset-background scale-110' : ''}`}
                    style={{ background: c.value, boxShadow: activo ? `0 0 0 2px ${c.value}` : 'none' }}>
                    {activo && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Integrantes</Label>
              <span className="text-xs text-muted-foreground" data-testid="group-form-count">
                {miembros.length} integrante{miembros.length === 1 ? '' : 's'} seleccionado{miembros.length === 1 ? '' : 's'}
                {miembros.length > 0 && (
                  <button type="button" onClick={() => setMiembros([])} className="ml-2 text-[#00a5df] hover:underline font-medium">Quitar todos</button>
                )}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, puesto o área..."
                className="h-10 pl-9 pr-9" data-testid="group-form-search" />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="rounded-xl border max-h-[280px] overflow-y-auto overscroll-contain p-1.5" data-testid="group-form-members">
              {areas.map((a) => {
                const todas = a.personas.every((u) => miembros.includes(u.id));
                return (
                  <div key={a.area} className="mb-1.5 last:mb-0">
                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 sticky top-0 bg-background/95 backdrop-blur z-10">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                        <Resaltado texto={a.area} palabras={palabras} />
                      </span>
                      <button type="button" onClick={() => toggleArea(a.personas)}
                        className="text-[11px] font-medium text-[#00a5df] hover:underline shrink-0">
                        {todas ? 'Quitar todos' : 'Seleccionar todos'}
                      </button>
                    </div>
                    {a.personas.map((u) => {
                      const sel = miembros.includes(u.id);
                      return (
                        <button key={u.id} type="button" onClick={() => toggle(u.id)}
                          className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted text-left" data-testid="group-form-member">
                          <AvatarIniciales nombre={u.name} className="h-7 w-7 text-[11px]" />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm truncate"><Resaltado texto={u.name} palabras={palabras} /></span>
                            <span className="block text-xs text-muted-foreground truncate"><Resaltado texto={u.position} palabras={palabras} /></span>
                          </span>
                          <span className={`h-5 w-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors ${
                            sel ? 'bg-[#00a5df] border-[#00a5df]' : 'border-muted-foreground/40'}`}>
                            {sel && <Check className="h-3.5 w-3.5 text-white" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              {areas.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No se encontraron personas</p>}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 px-5 sm:px-6 py-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl" disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={!puedeGuardar} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="group-form-submit">
            {guardando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            {guardando ? 'Guardando…' : 'Guardar grupo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Botón del encabezado de Usuarios
export function CrearGrupoButton({ onClick }) {
  return (
    <Button variant="outline" onClick={onClick} className="rounded-xl" data-testid="create-group-button">
      <UserPlus className="h-4 w-4 mr-1.5" /> Crear grupo
    </Button>
  );
}
