import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ListChecks, Plus, Loader2, CalendarClock } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { timeAgoEs } from '@/lib/time';
import { puedeCrearTareas, PRIORIDADES_TAREA } from '@/lib/constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CalendarioFecha, { fechaCorta } from '@/components/CalendarioFecha';

export const ESTADO_TAREA_T = {
  abierta: { label: 'Abierta', cls: 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]' },
  cerrada: { label: 'Cerrada', cls: 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' },
  cancelada: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground' },
};
export const PRIORIDAD_META = {
  alta: { label: 'Alta', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' },
  media: { label: 'Media', cls: 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]' },
  baja: { label: 'Baja', cls: 'bg-muted text-muted-foreground' },
};

export function EstadoTarea({ estado }) {
  const e = ESTADO_TAREA_T[estado] || ESTADO_TAREA_T.abierta;
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}
export function PrioridadTarea({ prioridad }) {
  const p = PRIORIDAD_META[prioridad] || PRIORIDAD_META.media;
  return <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${p.cls}`}>{p.label}</span>;
}
// Fecha límite: "vie 2 oct 2026"; rojo si ya venció.
export function FechaLimite({ fecha, vencida, prefijo = '' }) {
  if (!fecha) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${vencida ? 'text-[#dc2626]' : 'text-muted-foreground'}`} data-testid="tarea-fecha">
      <CalendarClock className="h-3.5 w-3.5" />{prefijo}{vencida ? 'Venció ' : ''}{fechaCorta(fecha)}
    </span>
  );
}

// "Por atender": lo que espera algo de la persona (hacer lo suyo, o validar).
const porAtender = (t) => (
  (['pendiente', 'devuelta'].includes(t.mi_estado) && t.estado === 'abierta')
  || (t.soy_validador && t.por_validar > 0)
);
const FILTROS = [
  { key: 'atender', label: 'Por atender', fn: porAtender },
  { key: 'abierta', label: 'Abiertas', fn: (t) => t.estado === 'abierta' },
  { key: 'cerrada', label: 'Cerradas', fn: (t) => t.estado === 'cerrada' || t.estado === 'cancelada' },
  { key: 'todos', label: 'Todas', fn: () => true },
];

function NuevaTarea({ open, onOpenChange, onCreada }) {
  const vacio = { titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '' };
  const [form, setForm] = useState(vacio);
  const [conFecha, setConFecha] = useState(false);
  const [gente, setGente] = useState([]);
  const [sel, setSel] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(vacio); setConFecha(false); setSel([]);
    api.get('/tareas/asignables').then(({ data }) => setGente(data)).catch(() => setGente([]));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const crear = async () => {
    if (!form.titulo.trim()) { toast.error('Escribe un título'); return; }
    if (!sel.length) { toast.error('Elige al menos una persona'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/tareas', {
        titulo: form.titulo.trim(), descripcion: form.descripcion.trim(), prioridad: form.prioridad,
        fecha_limite: conFecha && form.fecha_limite ? form.fecha_limite : null, asignados: sel,
      });
      toast.success(`Tarea creada: ${data.numero}`);
      onOpenChange(false);
      onCreada?.();
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo crear la tarea'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(485px,100%)] max-w-none rounded-[22px] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2"><DialogTitle className="font-heading text-xl">Nueva tarea</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2 space-y-4">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Ej. Ordenar góndolas de pintura" className="h-11" data-testid="tarea-titulo" />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={3} placeholder="Detalle de lo que hay que hacer…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={(v) => set('prioridad', v)}>
                <SelectTrigger className="h-11" data-testid="tarea-prioridad"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES_TAREA.map((p) => <SelectItem key={p} value={p}>{PRIORIDAD_META[p].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex h-5 items-center justify-between">Fecha límite
                <button type="button" onClick={() => setConFecha((v) => !v)} className="text-[11px] font-medium text-[#00a5df] hover:underline">
                  {conFecha ? 'Quitar' : 'Agregar'}
                </button>
              </Label>
              {conFecha ? (
                <CalendarioFecha modo="dia" start={form.fecha_limite} end={form.fecha_limite}
                  onChange={({ start }) => set('fecha_limite', start)} />
              ) : <div className="h-11 flex items-center rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground">Sin fecha</div>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            {gente.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay a quién asignar en tu tienda.</p>
            ) : (
              <div className="space-y-1.5 rounded-xl border p-2 max-h-[200px] overflow-y-auto">
                {gente.map((g) => (
                  <label key={g.id} className="flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted/50 cursor-pointer" data-testid="tarea-asignable">
                    <Checkbox checked={sel.includes(g.id)} onCheckedChange={() => toggle(g.id)} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate">{g.name}</span>
                      <span className="block text-[11px] text-muted-foreground">{g.position}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={crear} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="tarea-crear">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear tarea'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Tareas de tienda: un gerente o jefe asigna encargos a coordinadores; cada
   responsable sube foto al terminar y el gerente/jefe valida. */
export default function Tareas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tareas, setTareas] = useState(null);
  const [filtro, setFiltro] = useState('atender');
  const [nueva, setNueva] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/tareas'); setTareas(data); }
    catch (e) { toast.error('No se pudieron cargar las tareas'); setTareas([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const f = FILTROS.find((x) => x.key === filtro);
  const lista = (tareas || []).filter(f.fn);

  return (
    <div className="max-w-[900px] mx-auto pt-2">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-[#00a5df]" /> Tareas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Encargos de la tienda: el coordinador sube foto al terminar y el gerente o jefe valida.</p>
        </div>
        {puedeCrearTareas(user) && (
          <Button onClick={() => setNueva(true)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="tareas-nueva">
            <Plus className="h-4 w-4 mr-1" /> Nueva tarea
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist">
        {FILTROS.map((x) => {
          const n = (tareas || []).filter(x.fn).length;
          return (
            <button key={x.key} type="button" role="tab" aria-selected={filtro === x.key} onClick={() => setFiltro(x.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${filtro === x.key ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              data-testid={`tareas-filtro-${x.key}`}>
              {x.label}{tareas ? ` · ${n}` : ''}
            </button>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-[18px] bg-card border shadow-card overflow-hidden">
        {tareas === null && <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>}
        {tareas && lista.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            {filtro === 'atender' ? 'No tienes tareas por atender.' : 'Sin tareas en este filtro.'}
          </p>
        )}
        {lista.map((t) => {
          const total = (t.asignados || []).length;
          const val = (t.asignados || []).filter((a) => a.estado === 'validada').length;
          return (
            <button key={t.id} type="button" onClick={() => navigate(`/tareas/${t.id}`)}
              className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 border-b last:border-0 hover:bg-muted/40 transition-colors"
              data-testid="tarea-row">
              <span className="font-mono text-xs text-muted-foreground w-[92px] shrink-0">{t.numero}</span>
              <span className="flex-1 min-w-[180px]">
                <span className="block text-sm font-medium">{t.titulo}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.tienda} · {total === 1 ? t.asignados[0].name : `${total} personas`} · asignó {t.creado_por?.name}
                </span>
              </span>
              <PrioridadTarea prioridad={t.prioridad} />
              <FechaLimite fecha={t.fecha_limite} vencida={t.vencida} />
              {t.estado === 'abierta' && <span className="text-xs text-muted-foreground">{val}/{total} validadas</span>}
              <EstadoTarea estado={t.estado} />
              <span className="text-xs text-muted-foreground w-[90px] text-right">{timeAgoEs(t.updated_at)}</span>
            </button>
          );
        })}
      </motion.div>

      <NuevaTarea open={nueva} onOpenChange={setNueva} onCreada={load} />
    </div>
  );
}
