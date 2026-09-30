import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Store, ListChecks, Clock, Lock } from 'lucide-react';
import api from '@/lib/api';
import { ESTRATEGIA_COLOR } from '@/lib/promoEstrategia';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EstadoTarea, estadoVisible } from '@/components/promociones/PromoRevision';
import PromoComoVamos from '@/components/promociones/PromoComoVamos';

// Publicaciones con tareas: cada celda es una tienda × categoría con su estado.
function Matriz({ report }) {
  const celda = (tienda, cat) => report.matriz.find((m) => m.tienda === tienda && m.categoria === cat);
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5" data-testid="promo-report-matriz">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-heading font-semibold">Tienda × categoría</h3>
        <span className="text-xs text-muted-foreground">
          {report.kpis.validadas} validadas · {report.kpis.con_observaciones} con observaciones · {report.kpis.pendientes} sin contestar
          {report.kpis.vencidas ? ` (${report.kpis.vencidas} vencidas)` : ''}{report.kpis.tarde ? ` · ${report.kpis.tarde} fuera de plazo` : ''}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs text-muted-foreground uppercase tracking-wide">
              <th className="text-left font-semibold pb-2 pr-3">Tienda</th>
              {report.categorias.map((c) => <th key={c} className="text-left font-semibold pb-2 pr-3">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {report.tiendas.map((t) => (
              <tr key={t} className="border-t align-top">
                <td className="py-2.5 pr-3 font-medium whitespace-nowrap">{t}</td>
                {report.categorias.map((c) => {
                  const m = celda(t, c);
                  return (
                    <td key={c} className="py-2.5 pr-3">
                      {m ? (
                        <div className="space-y-0.5">
                          <EstadoTarea estado={estadoVisible(m)} />
                          <p className="text-[11px] text-muted-foreground">
                            {m.coordinador_name || '—'}{m.cumplimiento !== null && m.cumplimiento !== undefined ? ` · ${m.cumplimiento}%` : ''}{m.tarde ? ' · tarde' : ''}
                          </p>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, color, tint }) {
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5">
      <div className="h-11 w-11 rounded-full grid place-items-center" style={{ background: tint }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ComplianceBadge({ pct }) {
  if (pct === null || pct === undefined) return <span className="text-xs text-muted-foreground">—</span>;
  const color = pct >= 90 ? '#16a34a' : pct >= 75 ? '#ec9032' : '#dc2626';
  return <span className="text-sm font-semibold" style={{ color }}>{pct}%</span>;
}

const ESTADOS = ['Completo', 'Parcial', 'Pendiente'];

export default function PromoResultados({ formId }) {
  const [report, setReport] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sucFilter, setSucFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [catFilter, setCatFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setForbidden(false);
    try { const { data } = await api.get(`/formularios-custom/${formId}/reporte`); setReport(data); }
    catch (e) {
      if (e?.response?.status === 403) setForbidden(true);
      else toast.error('No se pudo cargar el reporte');
    } finally { setLoading(false); }
  }, [formId]);
  useEffect(() => { load(); }, [load]);

  const porSucursalFiltrado = useMemo(() => {
    if (!report) return [];
    return report.por_sucursal.filter((s) =>
      (!sucFilter || s.sucursal === sucFilter) && (!estadoFilter || s.estado === estadoFilter));
  }, [report, sucFilter, estadoFilter]);

  const categorias = useMemo(() => (
    report ? [...new Set(report.por_promocion.map((p) => p.categoria).filter(Boolean))] : []
  ), [report]);
  const porPromocionFiltrado = useMemo(() => (
    report ? report.por_promocion.filter((p) => !catFilter || p.categoria === catFilter) : []
  ), [report, catFilter]);

  if (loading) return <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>;

  if (forbidden) {
    return (
      <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Solo quien publicó este formulario, Director comercial o un administrador pueden ver el reporte agregado.</p>
      </div>
    );
  }
  if (!report) return null;

  const { kpis, por_sucursal } = report;

  return (
    <div className="space-y-4">
      <PromoComoVamos analisis={report.analisis} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={CheckCircle2} label="Cumplimiento general" value={kpis.cumplimiento_general !== null ? `${kpis.cumplimiento_general}%` : '—'}
          sub={report.flujo_tareas ? `${kpis.respondieron}/${kpis.asignados} categorías contestadas` : `${kpis.respondieron}/${kpis.asignados} respondieron`}
          color="#16a34a" tint="rgba(22,163,74,0.14)" />
        <Kpi icon={Store} label="Tiendas reportadas" value={`${kpis.tiendas_reportadas}/${kpis.tiendas_total}`} sub="con al menos 1 respuesta" color="#00a5df" tint="rgba(0,165,223,0.14)" />
        <Kpi icon={ListChecks} label="Promociones evaluadas" value={kpis.promociones_evaluadas} sub="en este formulario" color="#712146" tint="rgba(113,33,70,0.14)" />
        <Kpi icon={Clock} label="Pendientes de respuesta" value={kpis.pendientes} sub={report.flujo_tareas ? 'categorías sin contestar' : 'usuarios asignados'}
          color="#ec9032" tint="rgba(236,144,50,0.14)" />
      </div>

      {report.flujo_tareas && <Matriz report={report} />}

      <div className="rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-heading font-semibold">Reporte por promoción</h3>
          {categorias.length > 1 && (
            <Select value={catFilter || '__all'} onValueChange={(v) => setCatFilter(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 w-[170px]" data-testid="promo-report-categoria-filter"><SelectValue placeholder="Categoría" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas las categorías</SelectItem>
                {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[620px]">
            <div className="grid grid-cols-[1fr_110px_80px_90px_80px_100px] gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-2 border-b">
              <span>Promoción</span><span>Categoría</span><span className="text-right">Visibles</span><span className="text-right">No visibles</span><span className="text-right">No aplica</span><span className="text-right">Cumplimiento</span>
            </div>
            {porPromocionFiltrado.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_110px_80px_90px_80px_100px] gap-2 text-sm px-2 py-2.5 border-b last:border-0 items-center">
                <span className="truncate" title={p.titulo}>
                  {p.titulo}
                  {p.lineas > 1 && <span className="ml-1.5 text-xs text-muted-foreground">({p.lineas} líneas)</span>}
                  {p.etiqueta && (
                    <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: ESTRATEGIA_COLOR[p.estrategia] || ESTRATEGIA_COLOR.mixta }}>{p.etiqueta}</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{p.categoria}</span>
                <span className="text-right text-[#16a34a] font-medium">{p.visibles}</span>
                <span className="text-right text-[#dc2626] font-medium">{p.no_visibles}</span>
                <span className="text-right text-muted-foreground">{p.no_aplica}</span>
                <span className="text-right"><ComplianceBadge pct={p.cumplimiento} /></span>
              </div>
            ))}
            {porPromocionFiltrado.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sin promociones</p>}
          </div>
        </div>
      </div>

      <div className="rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-heading font-semibold">Reporte por sucursal</h3>
          <div className="flex gap-2">
            <Select value={sucFilter || '__all'} onValueChange={(v) => setSucFilter(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 w-[140px]" data-testid="promo-report-sucursal-filter"><SelectValue placeholder="Sucursal" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todas las sucursales</SelectItem>
                {por_sucursal.map((s) => <SelectItem key={s.sucursal} value={s.sucursal}>{s.sucursal}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={estadoFilter || '__all'} onValueChange={(v) => setEstadoFilter(v === '__all' ? '' : v)}>
              <SelectTrigger className="h-9 w-[130px]" data-testid="promo-report-estado-filter"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos los estados</SelectItem>
                {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="grid grid-cols-[1fr_110px_150px_120px] gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-2 border-b">
              <span>Sucursal</span><span>Estado</span><span className="text-right">Promociones evaluadas</span><span className="text-right">Cumplimiento</span>
            </div>
            {porSucursalFiltrado.map((s) => (
              <div key={s.sucursal} className="grid grid-cols-[1fr_110px_150px_120px] gap-2 text-sm px-2 py-2.5 border-b last:border-0 items-center">
                <span className="truncate">{s.sucursal}</span>
                <span>
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                    s.estado === 'Completo' ? 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]'
                      : s.estado === 'Parcial' ? 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]'
                      : 'bg-muted text-muted-foreground'}`}>{s.estado}</span>
                </span>
                <span className="text-right text-muted-foreground">{s.promociones_evaluadas} <span className="text-xs">({s.respondieron}/{s.asignados})</span></span>
                <span className="text-right"><ComplianceBadge pct={s.cumplimiento} /></span>
              </div>
            ))}
            {porSucursalFiltrado.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sin resultados con estos filtros</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
