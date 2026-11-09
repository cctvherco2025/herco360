import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ListChecks, Plus, Loader2, CalendarClock, Search, X, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
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

// ---- Lista: grupos por urgencia y qué le toca a la persona ----
const MES_TAREA = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const aDia = (s) => {
  const [a, m, d] = (s || '').slice(0, 10).split('-').map(Number);
  return a && m && d ? new Date(a, m - 1, d) : null;
};
const diasHasta = (s) => {
  const d = aDia(s);
  if (!d) return null;
  const h = new Date();
  return Math.round((d - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
};
const nombreCorto = (n) => (n || '').trim().split(/\s+/).slice(0, 2).join(' ');
const PESO_PRIORIDAD = { alta: 0, media: 1, baja: 2 };
const porFecha = (a, b) => (a.fecha_limite || '').localeCompare(b.fecha_limite || '')
  || (PESO_PRIORIDAD[a.prioridad] ?? 1) - (PESO_PRIORIDAD[b.prioridad] ?? 1);
const porRecientes = (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '');
const GRUPOS_TAREA = [
  { key: 'vencidas', label: 'Vencidas', rojo: true, orden: porFecha },
  { key: 'semana', label: 'Esta semana', orden: porFecha },
  { key: 'adelante', label: 'Más adelante', orden: porFecha },
  { key: 'sin', label: 'Sin fecha', orden: porRecientes },
  { key: 'cerradas', label: 'Cerradas', orden: porRecientes },
];
function grupoDe(t) {
  if (t.estado !== 'abierta') return 'cerradas';
  if (t.vencida) return 'vencidas';
  const n = diasHasta(t.fecha_limite);
  if (n === null) return 'sin';
  const hastaDomingo = (7 - new Date().getDay()) % 7;
  return n <= hastaDomingo ? 'semana' : 'adelante';
}
function plazoDe(t) {
  if (t.estado !== 'abierta') return null;
  const n = diasHasta(t.fecha_limite);
  if (n === null) return null;
  if (t.vencida) return n === -1 ? 'Venció ayer' : `Venció hace ${-n} días`;
  if (n === 0) return 'Vence hoy';
  if (n === 1) return 'Vence mañana';
  return n > 1 ? `Faltan ${n} días` : null;
}
// Lo que la tarea espera de la persona; sin nada suyo, a quién se está esperando.
const ACCION_CLS = {
  hacer: 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]',
  validar: 'bg-[rgba(0,165,223,0.14)] text-[#1e395e] dark:text-[#3cbef6]',
  devuelta: 'bg-[rgba(236,144,50,0.16)] text-[#a85c10] dark:text-[#ec9032]',
  espera: 'bg-muted text-muted-foreground',
};
function accionDe(t) {
  if (t.mi_estado === 'devuelta') return { label: 'Te la devolvieron', cls: ACCION_CLS.devuelta };
  if (t.mi_estado === 'pendiente') return { label: 'Te toca hacerla', cls: ACCION_CLS.hacer };
  if (t.soy_validador && t.por_validar > 0) {
    return { label: `Te toca validar${t.por_validar > 1 ? ` · ${t.por_validar}` : ''}`, cls: ACCION_CLS.validar };
  }
  const faltan = (t.asignados || []).filter((a) => ['pendiente', 'devuelta'].includes(a.estado));
  if (faltan.length === 1) return { label: `Esperando a ${nombreCorto(faltan[0].name)}`, cls: ACCION_CLS.espera };
  if (faltan.length > 1) return { label: `Esperando a ${faltan.length} personas`, cls: ACCION_CLS.espera };
  return { label: 'Esperando validación', cls: ACCION_CLS.espera };
}

function FilaTarea({ t, yoId, onAbrir }) {
  const dia = aDia(t.fecha_limite);
  const abierta = t.estado === 'abierta';
  const total = (t.asignados || []).length;
  const val = (t.asignados || []).filter((a) => a.estado === 'validada').length;
  const accion = abierta ? accionDe(t) : null;
  const plazo = plazoDe(t);
  const lugar = t.tienda || t.area;
  const para = total > 1 ? `${total} personas` : (t.mi_estado ? '' : t.asignados?.[0]?.name);
  const asigno = t.creado_por?.id === yoId ? 'asignada por ti' : `asignó ${t.creado_por?.name || ''}`;
  const detalle = [lugar, para, asigno].filter(Boolean).join(' · ');
  return (
    <button type="button" onClick={onAbrir} data-testid="tarea-row"
      className="grid w-full grid-cols-[48px_minmax(0,1fr)_16px] items-center gap-x-3 gap-y-1.5 border-t px-3 py-3 text-left transition-colors first:border-t-0 hover:bg-muted/40 sm:grid-cols-[54px_minmax(0,1fr)_auto_16px] sm:gap-x-3.5 sm:gap-y-0 sm:px-4">
      {dia ? (
        <span className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl leading-none sm:h-[54px] sm:w-[54px] ${t.vencida ? 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' : 'bg-muted text-[#1e395e] dark:text-[#3cbef6]'}`} data-testid="tarea-dia">
          <span className="font-heading text-lg font-semibold sm:text-xl">{dia.getDate()}</span>
          <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">{MES_TAREA[dia.getMonth()]}</span>
        </span>
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-muted text-center text-[10.5px] font-medium leading-tight text-muted-foreground sm:h-[54px] sm:w-[54px]" data-testid="tarea-dia">Sin fecha</span>
      )}
      <span className="min-w-0">
        <span className="block break-words text-[14.5px] font-semibold leading-snug sm:flex sm:items-start sm:gap-2 sm:text-[15px]">
          <span className="sm:min-w-0">{t.titulo}</span>
          <span className="ml-1.5 inline-block align-[1px] sm:ml-0 sm:shrink-0"><PrioridadTarea prioridad={t.prioridad} /></span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
          <span className="font-mono text-[11.5px]">{t.numero}</span>{detalle ? ` · ${detalle}` : ''}
        </span>
        {abierta && total > 1 && (
          <span className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground" data-testid="tarea-avance">
            <span className="block h-[5px] w-[90px] overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-[#00a5df]" style={{ width: `${Math.round((val / total) * 100)}%` }} />
            </span>
            {val} de {total} validadas
          </span>
        )}
      </span>
      <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-2 sm:col-start-3 sm:row-start-1 sm:flex-col sm:flex-nowrap sm:items-end sm:gap-1 sm:whitespace-nowrap">
        {accion
          ? <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${accion.cls}`} data-testid="tarea-accion">{accion.label}</span>
          : <EstadoTarea estado={t.estado} />}
        {plazo && <span className={`text-xs ${t.vencida ? 'font-medium text-[#dc2626]' : 'text-muted-foreground'}`} data-testid="tarea-plazo">{plazo}</span>}
      </span>
      <ChevronRight className="col-start-3 row-start-1 h-4 w-4 text-muted-foreground sm:col-start-4" />
    </button>
  );
}

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
            <SelectorPersonas gente={gente} sel={sel} onToggle={toggle} />
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
  const [busca, setBusca] = useState('');
  const [nueva, setNueva] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/tareas'); setTareas(data); }
    catch (e) { toast.error('No se pudieron cargar las tareas'); setTareas([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const f = FILTROS.find((x) => x.key === filtro);
  const palabras = normalizar(busca).split(/\s+/).filter(Boolean);
  const coincide = (t) => {
    if (!palabras.length) return true;
    const texto = normalizar([t.titulo, t.numero, t.tienda, t.area, t.creado_por?.name, ...(t.asignados || []).map((a) => a.name)].join(' '));
    return palabras.every((p) => texto.includes(p));
  };
  const lista = (tareas || []).filter((t) => f.fn(t) && coincide(t));
  const grupos = GRUPOS_TAREA
    .map((g) => ({ ...g, items: lista.filter((t) => grupoDe(t) === g.key).sort(g.orden) }))
    .filter((g) => g.items.length);

  return (
    <div className="max-w-[960px] mx-auto pt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ListChecks className="h-7 w-7 text-[#00a5df]" /> Tareas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Lo que te toca hacer o validar</p>
        </div>
        {puedeCrearTareas(user) && (
          <Button onClick={() => setNueva(true)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white max-sm:w-full" data-testid="tareas-nueva">
            <Plus className="h-4 w-4 mr-1" /> Nueva tarea
          </Button>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex justify-between gap-1 max-[340px]:gap-0 sm:shrink-0 sm:justify-start sm:gap-1.5" role="tablist" aria-label="Filtrar tareas">
          {FILTROS.map((x) => {
            const n = (tareas || []).filter(x.fn).length;
            const activo = filtro === x.key;
            return (
              <button key={x.key} type="button" role="tab" aria-selected={activo} onClick={() => setFiltro(x.key)}
                className={`min-h-9 whitespace-nowrap rounded-full border px-[9px] text-[12.5px] font-medium transition-colors max-[340px]:px-[7px] max-[340px]:text-xs sm:px-3 sm:text-sm ${activo ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                data-testid={`tareas-filtro-${x.key}`}>
                {x.label}{tareas ? <span className={activo ? '' : 'hidden sm:inline'}> · {n}</span> : ''}
              </button>
            );
          })}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar tarea, número o persona"
            aria-label="Buscar tarea" className="h-10 rounded-xl bg-card pl-9" data-testid="tareas-buscar" />
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {(tareas === null || lista.length === 0) && (
          <p className="mt-4 rounded-[18px] border bg-card py-12 text-center text-sm text-muted-foreground shadow-card">
            {tareas === null ? 'Cargando…'
              : palabras.length ? `Ninguna tarea coincide con “${busca.trim()}”.`
                : filtro === 'atender' ? 'No tienes tareas por atender.' : 'Sin tareas en este filtro.'}
          </p>
        )}
        {grupos.map((g) => (
          <section key={g.key} data-testid={`tareas-grupo-${g.key}`}>
            <h2 className={`mx-0.5 mb-2 mt-4 text-xs font-semibold uppercase tracking-wide ${g.rojo ? 'text-[#dc2626]' : 'text-muted-foreground'}`}>{g.label} · {g.items.length}</h2>
            <div className="overflow-hidden rounded-[18px] border bg-card shadow-card">
              {g.items.map((t) => <FilaTarea key={t.id} t={t} yoId={user?.id} onAbrir={() => navigate(`/tareas/${t.id}`)} />)}
            </div>
          </section>
        ))}
      </motion.div>

      <NuevaTarea open={nueva} onOpenChange={setNueva} onCreada={load} />
    </div>
  );
}

// Elegir personas para una tarea: buscador (nombre, cargo o área; sin
// importar tildes ni mayúsculas), las elegidas arriba como etiquetas (se
// quitan ahí mismo, aunque el buscador las oculte) y la lista con casillas.
// `bloqueadas`: ids que no se pueden quitar (ya avanzaron en su parte).
const normalizar = (v) => (v || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function SelectorPersonas({ gente, sel, onToggle, bloqueadas = [], vacio = 'No hay a quién asignar en tu equipo.' }) {
  const [q, setQ] = useState('');
  if (!gente.length) return <p className="text-sm text-muted-foreground">{vacio}</p>;
  const palabras = normalizar(q).split(/\s+/).filter(Boolean);
  const visibles = palabras.length
    ? gente.filter((g) => { const t = normalizar(`${g.name} ${g.position || ''} ${g.area || ''}`); return palabras.every((p) => t.includes(p)); })
    : gente;
  const elegidas = gente.filter((g) => sel.includes(g.id));
  return (
    <div className="space-y-2" data-testid="selector-personas">
      {elegidas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elegidas.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,165,223,0.12)] pl-2.5 pr-1 py-0.5 text-xs font-medium text-[#0284c7] dark:text-[#3cbef6]">
              {g.name}
              {!bloqueadas.includes(g.id) && (
                <button type="button" onClick={() => onToggle(g.id)} aria-label={`Quitar a ${g.name}`}
                  className="h-5 w-5 grid place-items-center rounded-full hover:bg-[rgba(0,165,223,0.2)]"><X className="h-3 w-3" /></button>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, cargo o área…"
          className="h-10 pl-9 pr-9" aria-label="Buscar persona" data-testid="selector-personas-buscar" />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 h-6 w-6 grid place-items-center rounded-md text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="space-y-1 rounded-xl border p-2 max-h-[220px] overflow-y-auto">
        {visibles.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted-foreground">Nadie coincide con “{q.trim()}”</p>}
        {visibles.map((g) => {
          const bloqueada = bloqueadas.includes(g.id);
          return (
            <label key={g.id} className={`flex items-center gap-2.5 rounded-lg px-2 py-2 ${bloqueada ? 'opacity-70' : 'hover:bg-muted/50 cursor-pointer'}`} data-testid="tarea-asignable">
              <Checkbox checked={sel.includes(g.id)} disabled={bloqueada} onCheckedChange={() => onToggle(g.id)} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{g.name}</span>
                <span className="block text-[11px] text-muted-foreground">{bloqueada ? 'ya avanzó en su parte' : `${g.position || ''}${g.area ? ` · ${g.area}` : ''}`}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">{sel.length} persona{sel.length === 1 ? '' : 's'} elegida{sel.length === 1 ? '' : 's'}</p>
    </div>
  );
}
