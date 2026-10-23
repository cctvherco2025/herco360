import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarRange, Plus, AlertTriangle, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { ymd } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EstadoPlan, frecuenciaTexto, useMantAcceso } from '@/components/mantenimiento/comunes';
import { fechaCorta } from '@/components/CalendarioFecha';
import Tour, { useTour, BotonTour } from '@/components/Tour';
import Reportes from '@/components/mantenimiento/Reportes';
import Indicadores from '@/components/mantenimiento/Indicadores';

const FILTROS = [
  { key: 'activa', label: 'Activas', fn: (p) => p.estado === 'activa' },
  { key: 'vencidas', label: 'Con vencidas', fn: (p) => p.vencidas > 0 },
  { key: 'pausada', label: 'Pausadas', fn: (p) => p.estado === 'pausada' },
  { key: 'borrador', label: 'Borradores', fn: (p) => p.estado === 'borrador' },
  { key: 'terminadas', label: 'Terminadas', fn: (p) => p.estado === 'finalizada' || p.estado === 'archivada' },
];

function Avance({ ciclo }) {
  if (!ciclo) return <span className="text-xs text-muted-foreground">Sin ciclo en curso</span>;
  const pct = ciclo.total ? Math.round((ciclo.completadas / ciclo.total) * 100) : 0;
  return (
    <div className="min-w-[150px]">
      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
        <span>Ciclo {ciclo.numero} · hasta {fechaCorta(ymd(new Date(new Date(`${ciclo.fin}T00:00`).getTime() - 86400000)))}</span>
        <span className="font-semibold text-foreground">{ciclo.completadas}/{ciclo.total}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-[#16a34a]" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

/* Planificaciones de mantenimiento: lista con filtros, indicadores y reportes. */
export default function MantPlanes() {
  const navigate = useNavigate();
  const acceso = useMantAcceso();
  const [planes, setPlanes] = useState(null);
  const [filtro, setFiltro] = useState('activa');
  const load = useCallback(async () => {
    try { const { data } = await api.get('/mantenimiento/planes'); setPlanes(data); }
    catch (e) { toast.error('No se pudieron cargar las planificaciones'); setPlanes([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const f = FILTROS.find((x) => x.key === filtro);
  const lista = useMemo(() => (planes || []).filter(f.fn), [planes, f]);

  const tour = useTour('tour-planificaciones', planes !== null && acceso !== null);
  const pasos = [
    { target: null, titulo: 'Planificaciones de mantenimiento',
      texto: 'Una planificación dice qué checklist se hace, en qué activos, cada cuánto y quién lo hace. Se repite en ciclos y en cada ciclo las tareas se crean solas.' },
    { target: 'planes-filtros', titulo: 'Filtros',
      texto: 'Activas, con tareas vencidas, pausadas, borradores y terminadas. "Con vencidas" te muestra dónde hay que actuar.' },
    ...(acceso?.planificar ? [{ target: 'planes-nueva', titulo: 'Crear una planificación',
      texto: 'Dos pasos: datos generales (responsable, supervisor, frecuencia, inicio y fin) y tareas (checklist + activos + día, hora y plazo). Antes de activarla ves la vista previa de las fechas.' }] : []),
    { target: 'planes-lista', titulo: 'El avance de cada una',
      texto: 'Cada tarjeta muestra el ciclo en curso y cuántas tareas van hechas. Ábrela para ver el ciclo, cambiar fechas, reasignar o pausar.' },
    ...(acceso?.planificar ? [
      { target: 'planes-indicadores', titulo: 'Indicadores',
        texto: 'Gráficas del periodo: cumplimiento por mes, vencidas por sucursal y dónde se concentran las fallas (activos, categorías y preguntas).' },
      { target: 'planes-cumplimiento', titulo: 'Reportes',
        texto: 'Cumplimiento por planificación, responsable, sucursal y categoría, la lista de fallas con foto y el detalle de cada tarea. Se descarga en Excel o PDF.' },
    ] : []),
  ];

  const listado = (
    <>
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar -mx-1 px-1" role="tablist" data-tour="planes-filtros">
        {FILTROS.map((x) => {
          const n = (planes || []).filter(x.fn).length;
          return (
            <button key={x.key} type="button" role="tab" aria-selected={filtro === x.key} onClick={() => setFiltro(x.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${filtro === x.key ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              data-testid={`planes-filtro-${x.key}`}>
              {x.key === 'vencidas' && n > 0 && <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5 text-[#dc2626]" />}{x.label}{planes ? ` · ${n}` : ''}
            </button>
          );
        })}
      </div>
      {planes === null ? <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p> : !lista.length ? (
        <div className="rounded-[18px] border border-dashed bg-card p-10 text-center">
          <CalendarRange className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">{planes.length ? 'No hay planificaciones con este filtro.' : 'Aún no hay planificaciones de mantenimiento.'}</p>
        </div>
      ) : (
        <div className="space-y-2.5" data-tour="planes-lista">
          {lista.map((p) => (
            <button key={p.id} type="button" onClick={() => navigate(`/mantenimiento/planificaciones/${p.id}`)} data-testid="plan-tarjeta"
              className="w-full text-left rounded-[18px] border bg-card shadow-card p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-[#00a5df]/50 transition">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[12px] font-semibold text-muted-foreground">{p.numero}</span>
                  <EstadoPlan estado={p.estado} />
                  {p.vencidas > 0 && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-[rgba(220,38,38,0.1)] text-[#dc2626]">{p.vencidas} vencida{p.vencidas === 1 ? '' : 's'}</span>}
                </div>
                <p className="font-heading font-semibold mt-1 truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {frecuenciaTexto(p)} · {p.tareas_por_ciclo} tarea{p.tareas_por_ciclo === 1 ? '' : 's'} por ciclo · Responsable: {p.responsable?.name || '—'} · Supervisor: {p.supervisor?.name || '—'}
                </p>
              </div>
              <div className="flex items-center gap-3 sm:w-auto">
                <div className="flex-1"><Avance ciclo={p.ciclo} /></div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2"><CalendarRange className="h-7 w-7 text-[#00a5df]" /> Planificaciones</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Mantenimientos que se repiten solos: cada ciclo genera las tareas del responsable.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {planes !== null && <BotonTour tour={tour} />}
          {acceso?.planificar && (
            <Button onClick={() => navigate('/mantenimiento/planificaciones/nueva')} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white flex-1 sm:flex-none" data-testid="plan-nueva" data-tour="planes-nueva">
              <Plus className="h-4 w-4 mr-1" /> Nueva planificación
            </Button>
          )}
        </div>
      </div>
      {acceso?.planificar ? (
        <Tabs defaultValue="lista">
          <TabsList className="rounded-xl mb-4">
            <TabsTrigger value="lista" className="rounded-lg">Planificaciones</TabsTrigger>
            <TabsTrigger value="indicadores" className="rounded-lg" data-testid="planes-tab-indicadores" data-tour="planes-indicadores">Indicadores</TabsTrigger>
            <TabsTrigger value="reportes" className="rounded-lg" data-testid="planes-tab-reportes" data-tour="planes-cumplimiento">Reportes</TabsTrigger>
          </TabsList>
          <TabsContent value="lista">{listado}</TabsContent>
          <TabsContent value="indicadores"><Indicadores /></TabsContent>
          <TabsContent value="reportes"><Reportes /></TabsContent>
        </Tabs>
      ) : listado}
      <Tour tour={tour} pasos={pasos} />
    </div>
  );
}
