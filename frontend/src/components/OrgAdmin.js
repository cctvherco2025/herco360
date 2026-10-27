import React, { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X, Briefcase, Building2, Lock } from 'lucide-react';
import api from '@/lib/api';
import { RETAIL } from '@/lib/constants';
import { NIVELES } from '@/lib/organizacion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { confirmar } from '@/components/ConfirmDialog';

/* Administración de la estructura en Jerarquía (backend/organizacion.py):
   - Departamentos: los crea, renombra y elimina el super admin.
   - Cargos de cada departamento con su nivel de mando: los gestionan el super
     admin y, en su departamento, sus admins y su jefe. Los del sistema (los
     que usan los módulos de tienda de Retail) solo se renombran. */

const AYUDA_NIVEL = {
  jefe_depto: 'Manda en todo el departamento; aprueba usuarios y da accesos.',
  gerente: 'Manda en su área y sus subáreas (sobre jefes, coordinadores y colaboradores).',
  jefe: 'Manda en su área y sus subáreas (sobre coordinadores y colaboradores).',
  coordinador: 'No manda sobre nadie; se puede registrar solo.',
  colaborador: 'No manda sobre nadie; se puede registrar solo.',
};

const LEYENDA_NIVEL = {
  jefe_depto: 'todo el departamento',
  gerente: 'su área y subáreas',
  jefe: 'su área y subáreas',
  coordinador: 'no manda',
  colaborador: 'no manda',
};

async function llamar(fn, ok, recargar) {
  try {
    await fn();
    toast.success(ok);
    await recargar();
    return true;
  } catch (e) {
    toast.error(e?.response?.data?.detail || 'No se pudo guardar');
    return false;
  }
}

// ── Cargos ───────────────────────────────────────────────────────
function CargoFila({ cargo, editable, recargar }) {
  const [edit, setEdit] = useState(null); // { nombre, nivel }
  const guardar = async (e) => {
    e.preventDefault();
    if (await llamar(() => api.put(`/org/cargos/${cargo.id}`, edit), 'Cargo actualizado', recargar)) setEdit(null);
  };
  const quitar = async () => {
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Quitar el cargo ${cargo.nombre}?`, mensaje: 'Nadie lo tiene asignado. No se puede deshacer.',
      textoConfirmar: 'Quitar', textoCargando: 'Quitando…', textoExito: 'Cargo quitado',
      accion: () => api.delete(`/org/cargos/${cargo.id}`),
    });
    if (ok) recargar();
  };
  if (edit) {
    return (
      <li className="rounded-xl border p-3">
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-2 items-center">
          <Input autoFocus value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} className="h-10" aria-label="Nombre del cargo" />
          <NativeSelect value={edit.nivel} onChange={(v) => setEdit({ ...edit, nivel: v })} disabled={cargo.sistema} className="h-10" aria-label="Nivel de mando">
            {Object.entries(NIVELES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="h-10 rounded-lg bg-[#1e395e] hover:bg-[#162c49] text-white"><Check className="h-4 w-4" /></Button>
            <Button type="button" size="sm" variant="ghost" className="h-10 rounded-lg" onClick={() => setEdit(null)}><X className="h-4 w-4" /></Button>
          </div>
        </form>
        {cargo.sistema && <p className="mt-1.5 text-[11px] text-muted-foreground">Cargo del sistema: se cambia el nombre que se ve, no su nivel.</p>}
      </li>
    );
  }
  return (
    <li className="flex items-center gap-3 rounded-xl border px-3 py-2.5" data-testid="org-cargo">
      <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {cargo.nombre}
          {cargo.sistema && <Lock className="inline h-3 w-3 ml-1.5 -mt-0.5 text-muted-foreground" aria-label="del sistema" />}
        </p>
        <p className="text-[11px] text-muted-foreground">{NIVELES[cargo.nivel]} · {cargo.personas} persona{cargo.personas === 1 ? '' : 's'}</p>
      </div>
      {editable && (
        <div className="flex shrink-0">
          <button type="button" aria-label={`Editar ${cargo.nombre}`} onClick={() => setEdit({ nombre: cargo.nombre, nivel: cargo.nivel })}
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label={`Quitar ${cargo.nombre}`} disabled={cargo.sistema || cargo.personas > 0}
            title={cargo.sistema ? 'Lo usa el sistema: solo se renombra' : cargo.personas ? 'Tiene personas: cámbialas de cargo primero' : 'Quitar'}
            onClick={quitar}
            className="h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-[#dc2626] disabled:opacity-30 disabled:hover:bg-transparent"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </li>
  );
}

export function CargosDepto({ depto, recargar }) {
  const [nuevo, setNuevo] = useState(null); // { nombre, nivel }
  const orden = Object.keys(NIVELES);
  const cargos = [...depto.cargos].sort((a, b) => orden.indexOf(a.nivel) - orden.indexOf(b.nivel) || a.nombre.localeCompare(b.nombre));
  const crear = async (e) => {
    e.preventDefault();
    if (await llamar(() => api.post('/org/cargos', { departamento: depto.id, ...nuevo }), `Cargo ${nuevo.nombre.trim()} creado`, recargar)) setNuevo(null);
  };
  return (
    <section className="mb-8 rounded-[22px] border bg-card p-5 sm:p-7 shadow-card no-print" data-testid="org-cargos">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-6 w-1.5 rounded-full bg-[#00a5df]" />
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">Cargos de {depto.nombre}</h2>
            <p className="text-[12px] text-muted-foreground">Cada cargo tiene el nombre que usa el departamento y un nivel de mando: los permisos salen del nivel.</p>
          </div>
        </div>
        {depto.puede_editar && !nuevo && (
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setNuevo({ nombre: '', nivel: 'colaborador' })} data-testid="org-cargo-nuevo">
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo cargo
          </Button>
        )}
      </div>
      {nuevo && (
        <form onSubmit={crear} className="mb-3 rounded-xl border border-dashed p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px_auto] gap-2 items-center">
            <Input autoFocus value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              placeholder="Nombre del cargo (ej. Supervisor de bodega)" className="h-10" data-testid="org-cargo-nombre" />
            <NativeSelect value={nuevo.nivel} onChange={(v) => setNuevo({ ...nuevo, nivel: v })} className="h-10" aria-label="Nivel de mando" data-testid="org-cargo-nivel">
              {Object.entries(NIVELES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </NativeSelect>
            <div className="flex gap-1.5">
              <Button type="submit" size="sm" disabled={!nuevo.nombre.trim()} className="h-10 rounded-lg bg-[#1e395e] hover:bg-[#162c49] text-white">Crear</Button>
              <Button type="button" size="sm" variant="ghost" className="h-10 rounded-lg" onClick={() => setNuevo(null)}><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{AYUDA_NIVEL[nuevo.nivel]}</p>
        </form>
      )}
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {cargos.map((c) => <CargoFila key={c.id} cargo={c} editable={depto.puede_editar} recargar={recargar} />)}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Niveles: {Object.entries(NIVELES).map(([k, v]) => `${v}: ${LEYENDA_NIVEL[k]}`).join(' · ')}.
      </p>
    </section>
  );
}

// ── Departamentos (super admin) ──────────────────────────────────
export function NuevoDepartamento({ recargar, onCreado }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);
  const crear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const { data } = await api.post('/org/departamentos', { nombre });
      toast.success(`Departamento ${data.nombre} creado`);
      await recargar();
      onCreado?.(data.id);
      setOpen(false);
      setNombre('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo crear el departamento');
    } finally { setGuardando(false); }
  };
  return (
    <>
      <Button variant="outline" size="sm" className="rounded-full h-8 no-print" onClick={() => setOpen(true)} data-testid="org-depto-nuevo">
        <Plus className="h-3.5 w-3.5 mr-1" /> Departamento
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[440px] rounded-[22px]">
          <form onSubmit={crear}>
            <DialogHeader>
              <DialogTitle className="font-heading text-xl">Nuevo departamento</DialogTitle>
              <DialogDescription>
                Queda separado de los demás: su gente solo ve a su departamento. Arranca con los cargos Jefe del departamento, Jefe,
                Coordinador y Colaborador; después agregas sus áreas y renombras o creas cargos.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="depto-nombre">Nombre</Label>
              <Input id="depto-nombre" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Finanzas" className="h-11" data-testid="org-depto-nombre" />
            </div>
            <DialogFooter className="mt-5 gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={guardando || !nombre.trim()} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white">Crear departamento</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AccionesDepartamento({ depto, recargar, onEliminado }) {
  const [edit, setEdit] = useState(null);
  const renombrar = async (e) => {
    e.preventDefault();
    if (await llamar(() => api.put(`/org/departamentos/${depto.id}`, { nombre: edit }), 'Departamento renombrado', recargar)) setEdit(null);
  };
  const eliminar = async () => {
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Eliminar ${depto.nombre}?`,
      mensaje: 'Se borran sus áreas y cargos. Solo se puede si no tiene personas. No se puede deshacer.',
      textoConfirmar: 'Eliminar', textoCargando: 'Eliminando…', textoExito: 'Departamento eliminado',
      accion: () => api.delete(`/org/departamentos/${depto.id}`),
    });
    if (ok) { await recargar(); onEliminado?.(); }
  };
  if (edit !== null) {
    return (
      <form onSubmit={renombrar} className="flex gap-1.5 no-print">
        <Input autoFocus value={edit} onChange={(e) => setEdit(e.target.value)} className="h-8 w-48" aria-label="Nombre del departamento" />
        <Button type="submit" size="sm" className="h-8 rounded-lg bg-[#1e395e] hover:bg-[#162c49] text-white"><Check className="h-3.5 w-3.5" /></Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg" onClick={() => setEdit(null)}><X className="h-3.5 w-3.5" /></Button>
      </form>
    );
  }
  return (
    <div className="flex items-center gap-1 no-print">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <button type="button" onClick={() => setEdit(depto.nombre)} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline" data-testid="org-depto-renombrar">
        Renombrar
      </button>
      {!depto.sistema && depto.id !== RETAIL && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <button type="button" onClick={eliminar} className="text-xs text-[#dc2626] hover:underline underline-offset-2" data-testid="org-depto-eliminar">Eliminar</button>
        </>
      )}
    </div>
  );
}

// Áreas a las que se puede mover un área: todas las del departamento menos
// ella misma y sus subáreas (no puede quedar debajo de sí misma).
export function destinosPosibles(areas, areaId) {
  const prohibidas = new Set([areaId]);
  let cambio = true;
  while (cambio) {
    cambio = false;
    areas.forEach((a) => {
      if (a.padre_id && prohibidas.has(a.padre_id) && !prohibidas.has(a.id)) { prohibidas.add(a.id); cambio = true; }
    });
  }
  return areas.filter((a) => !prohibidas.has(a.id));
}
