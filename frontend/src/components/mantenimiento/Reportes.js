import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FileSpreadsheet, FileText, Loader2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { ymd } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { fechaCorta } from '@/components/CalendarioFecha';
import { MantFoto } from '@/components/mantenimiento/comunes';
import { generateReporteMantPdf } from '@/lib/mantenimientoPdf';

// ── Filtro de periodo y alcance (compartido con Indicadores) ─────
const hoy = () => new Date();
const PERIODOS = {
  mes: { label: 'Este mes', rango: () => { const d = hoy(); return [new Date(d.getFullYear(), d.getMonth(), 1), d]; } },
  mes_anterior: { label: 'Mes anterior', rango: () => { const d = hoy(); return [new Date(d.getFullYear(), d.getMonth() - 1, 1), new Date(d.getFullYear(), d.getMonth(), 0)]; } },
  trimestre: { label: 'Últimos 3 meses', rango: () => { const d = hoy(); return [new Date(d.getFullYear(), d.getMonth() - 2, 1), d]; } },
  semestre: { label: 'Últimos 6 meses', rango: () => { const d = hoy(); return [new Date(d.getFullYear(), d.getMonth() - 5, 1), d]; } },
  anio: { label: 'Este año', rango: () => { const d = hoy(); return [new Date(d.getFullYear(), 0, 1), d]; } },
  otro: { label: 'Otro periodo…', rango: null },
};

export function useFiltrosMant(periodoInicial = 'mes') {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [desde, setDesde] = useState(() => ymd(PERIODOS[periodoInicial].rango()[0]));
  const [hasta, setHasta] = useState(() => ymd(PERIODOS[periodoInicial].rango()[1]));
  const [sucursal, setSucursal] = useState('');
  const [categoria, setCategoria] = useState('');
  const [plan, setPlan] = useState('');
  const [opciones, setOpciones] = useState({ sucursales: [], categorias: [], planes: [] });
  useEffect(() => { api.get('/mantenimiento/reportes/filtros').then(({ data }) => setOpciones(data)).catch(() => {}); }, []);
  const elegirPeriodo = (p) => {
    setPeriodo(p);
    if (PERIODOS[p].rango) { const [a, b] = PERIODOS[p].rango(); setDesde(ymd(a)); setHasta(ymd(b)); }
  };
  const params = useMemo(() => ({ desde, hasta, sucursal: sucursal || undefined, categoria: categoria || undefined, plan_id: plan || undefined }),
    [desde, hasta, sucursal, categoria, plan]);
  const texto = [sucursal, opciones.categorias.find((c) => c.id === categoria)?.nombre, opciones.planes.find((p) => p.id === plan)?.numero].filter(Boolean).join(' · ');
  return { periodo, elegirPeriodo, desde, setDesde, hasta, setHasta, sucursal, setSucursal, categoria, setCategoria, plan, setPlan, opciones, params, texto };
}

export function BarraFiltros({ f }) {
  return (
    <div className="flex flex-wrap items-end gap-2 mb-4" data-testid="mant-filtros">
      <div className="space-y-1">
        <Label className="text-xs">Periodo</Label>
        <NativeSelect value={f.periodo} onChange={f.elegirPeriodo} className="h-10 w-[170px]" aria-label="Periodo">
          {Object.entries(PERIODOS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
        </NativeSelect>
      </div>
      {f.periodo === 'otro' && (
        <>
          <div className="space-y-1"><Label className="text-xs" htmlFor="mf-desde">Desde</Label><Input id="mf-desde" type="date" value={f.desde} onChange={(e) => f.setDesde(e.target.value)} className="h-10 w-[160px]" /></div>
          <div className="space-y-1"><Label className="text-xs" htmlFor="mf-hasta">Hasta</Label><Input id="mf-hasta" type="date" value={f.hasta} onChange={(e) => f.setHasta(e.target.value)} className="h-10 w-[160px]" /></div>
        </>
      )}
      <div className="space-y-1">
        <Label className="text-xs">Sucursal</Label>
        <NativeSelect value={f.sucursal} onChange={f.setSucursal} className="h-10 w-[140px]" aria-label="Sucursal">
          <option value="">Todas</option>
          {f.opciones.sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Categoría</Label>
        <NativeSelect value={f.categoria} onChange={f.setCategoria} className="h-10 w-[170px]" aria-label="Categoría">
          <option value="">Todas</option>
          {f.opciones.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </NativeSelect>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Planificación</Label>
        <NativeSelect value={f.plan} onChange={f.setPlan} className="h-10 w-[200px]" aria-label="Planificación">
          <option value="">Todas</option>
          {f.opciones.planes.map((p) => <option key={p.id} value={p.id}>{p.numero} · {p.nombre}</option>)}
        </NativeSelect>
      </div>
      {f.periodo !== 'otro' && <p className="text-xs text-muted-foreground pb-3">{fechaCorta(f.desde)} – {fechaCorta(f.hasta)}</p>}
    </div>
  );
}

const colorPct = (v) => (v == null ? 'text-muted-foreground' : v >= 90 ? 'text-[#16a34a]' : v >= 70 ? 'text-[#ec9032]' : 'text-[#dc2626]');

export function Kpis({ r }) {
  const tiles = [
    ['Cumplimiento', r.cumplimiento == null ? '—' : `${r.cumplimiento}%`, colorPct(r.cumplimiento)],
    ['Tareas', r.total, ''], ['A tiempo', r.a_tiempo, 'text-[#16a34a]'], ['Tarde', r.tardias, 'text-[#ec9032]'],
    ['Incompletas', r.incompletas, 'text-[#dc2626]'], ['Fallas', r.fallas, r.fallas ? 'text-[#dc2626]' : ''],
  ];
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-2">
      {tiles.map(([l, v, c]) => (
        <div key={l} className="rounded-[18px] border bg-card shadow-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">{l}</p>
          <p className={`font-heading text-2xl sm:text-3xl font-semibold mt-1 ${c}`}>{v}</p>
        </div>
      ))}
    </div>
  );
}

function Tabla({ titulo, filas }) {
  if (!filas.length) return null;
  return (
    <div className="rounded-[18px] border bg-card shadow-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr className="text-left">
            <th className="px-4 py-2.5">{titulo}</th><th className="px-3 py-2.5 text-right">Tareas</th><th className="px-3 py-2.5 text-right">A tiempo</th>
            <th className="px-3 py-2.5 text-right">Tarde</th><th className="px-3 py-2.5 text-right">Incompletas</th>
            <th className="px-3 py-2.5 text-right">Abiertas</th><th className="px-3 py-2.5 text-right">Fallas</th><th className="px-3 py-2.5 text-right">Cumplimiento</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {filas.map((f) => (
            <tr key={f.id || f.nombre}>
              <td className="px-4 py-2.5 font-medium">{f.nombre}</td><td className="px-3 py-2.5 text-right">{f.total}</td>
              <td className="px-3 py-2.5 text-right">{f.a_tiempo}</td><td className="px-3 py-2.5 text-right">{f.tardias}</td>
              <td className="px-3 py-2.5 text-right">{f.incompletas}</td><td className="px-3 py-2.5 text-right">{f.abiertas}{f.vencidas ? ` (${f.vencidas} venc.)` : ''}</td>
              <td className="px-3 py-2.5 text-right">{f.fallas}</td>
              <td className={`px-3 py-2.5 text-right font-semibold ${colorPct(f.cumplimiento)}`}>{f.cumplimiento == null ? '—' : `${f.cumplimiento}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* Reportes del periodo: resumen, tablas por planificación / responsable /
   sucursal / categoría, las fallas con foto y descargas en Excel y PDF. */
export default function Reportes() {
  const navigate = useNavigate();
  const f = useFiltrosMant('mes');
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [bajando, setBajando] = useState(null);
  const [vista, setVista] = useState('por_plan');

  useEffect(() => {
    if (!f.desde || !f.hasta) return;
    setCargando(true);
    api.get('/mantenimiento/reportes', { params: f.params })
      .then(({ data }) => setD(data))
      .catch((e) => { toast.error(e?.response?.data?.detail || 'No se pudo cargar el reporte'); setD(null); })
      .finally(() => setCargando(false));
  }, [f.params]); // eslint-disable-line react-hooks/exhaustive-deps

  const excel = async () => {
    setBajando('excel');
    try {
      const res = await api.get('/mantenimiento/reportes/excel', { params: f.params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `Mantenimiento_${f.desde}_a_${f.hasta}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast.error('No se pudo generar el Excel'); }
    finally { setBajando(null); }
  };
  const pdf = async (conFallas) => {
    setBajando(conFallas ? 'pdf-fallas' : 'pdf');
    try { await generateReporteMantPdf(d, f.texto, { conFallas }); }
    catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setBajando(null); }
  };

  const VISTAS = [['por_plan', 'Planificación'], ['por_responsable', 'Responsable'], ['por_sucursal', 'Sucursal'], ['por_categoria', 'Categoría']];
  return (
    <div>
      <BarraFiltros f={f} />
      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="outline" className="rounded-xl" onClick={excel} disabled={!d || !!bajando} data-testid="rep-excel">
          {bajando === 'excel' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5 text-[#16a34a]" />} Excel
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={() => pdf(false)} disabled={!d || !!bajando} data-testid="rep-pdf">
          {bajando === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5 text-[#dc2626]" />} PDF de cumplimiento
        </Button>
        <Button variant="outline" className="rounded-xl" onClick={() => pdf(true)} disabled={!d || !!bajando} data-testid="rep-pdf-fallas">
          {bajando === 'pdf-fallas' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-1.5 text-[#dc2626]" />} PDF con fallas y fotos
        </Button>
      </div>

      {!d ? (
        <p className="text-sm text-muted-foreground text-center py-12">{cargando ? 'Cargando…' : 'Sin datos'}</p>
      ) : (
        <div className={`space-y-5 ${cargando ? 'opacity-60' : ''}`}>
          <div>
            <Kpis r={d.resumen} />
            <p className="text-xs text-muted-foreground">
              Cumplimiento = hechas (a tiempo o tarde) / cerradas (hechas + incompletas). Abiertas: {d.resumen.abiertas}{d.resumen.vencidas ? `, ${d.resumen.vencidas} vencidas` : ''}.
            </p>
          </div>

          <div>
            <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar" role="tablist">
              {VISTAS.map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={vista === k} onClick={() => setVista(k)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${vista === k ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                  Por {l.toLowerCase()}
                </button>
              ))}
            </div>
            {d[vista].length ? <Tabla titulo={VISTAS.find((v) => v[0] === vista)[1]} filas={d[vista]} />
              : <p className="text-sm text-muted-foreground rounded-[18px] border border-dashed p-6 text-center">No hay tareas en el periodo.</p>}
          </div>

          <div>
            <h3 className="font-heading font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#dc2626]" /> Fallas del periodo · {d.fallas.length}
            </h3>
            {!d.fallas.length ? (
              <p className="text-sm text-muted-foreground rounded-[18px] border border-dashed p-6 text-center">Sin fallas reportadas en el periodo.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {d.fallas.map((x, i) => (
                  <button key={`${x.tarea_id}-${i}`} type="button" onClick={() => navigate(`/mantenimiento/tareas/${x.tarea_id}`)} data-testid="rep-falla"
                    className="text-left rounded-[18px] border border-[#dc2626]/30 bg-card shadow-card p-3 flex gap-3 hover:border-[#dc2626]/60">
                    {x.fotos[0] && <MantFoto tareaId={x.tarea_id} fotoId={x.fotos[0]} className="h-20 w-20 rounded-xl object-cover shrink-0" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{x.activo_codigo} · {x.activo_nombre}</span>
                      <span className="block text-xs text-muted-foreground truncate">{fechaCorta(x.fecha)} · {x.numero} · {x.sucursal}</span>
                      <span className="block text-xs font-semibold text-[#dc2626] mt-1 truncate">{x.pregunta}: {x.respuesta}</span>
                      {x.comentario && <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5">"{x.comentario}"</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-heading font-semibold mb-2">Detalle · {d.tareas.length} tareas</h3>
            <div className="rounded-[18px] border bg-card shadow-card overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground sticky top-0">
                  <tr className="text-left"><th className="px-4 py-2.5">Tarea</th><th className="px-3 py-2.5">Activo</th><th className="px-3 py-2.5">Checklist</th>
                    <th className="px-3 py-2.5">Responsable</th><th className="px-3 py-2.5">Fecha</th><th className="px-3 py-2.5">Estado</th></tr>
                </thead>
                <tbody className="divide-y">
                  {d.tareas.map((t) => (
                    <tr key={t.id} onClick={() => navigate(`/mantenimiento/tareas/${t.id}`)} className="cursor-pointer hover:bg-[rgba(60,190,246,0.06)]">
                      <td className="px-4 py-2 font-mono text-[12px] whitespace-nowrap">{t.numero}</td>
                      <td className="px-3 py-2">{t.activo_codigo} · {t.activo_nombre}<span className="block text-xs text-muted-foreground">{t.sucursal}</span></td>
                      <td className="px-3 py-2">{t.checklist}</td><td className="px-3 py-2">{t.responsable}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fechaCorta(t.fecha)}</td>
                      <td className={`px-3 py-2 font-semibold whitespace-nowrap ${t.estado === 'incompleta' || t.estado === 'vencida' ? 'text-[#dc2626]' : t.estado === 'tardia' ? 'text-[#ec9032]' : t.estado === 'completada' ? 'text-[#16a34a]' : 'text-muted-foreground'}`}>
                        {t.estado_txt}{t.fallas ? ` · ${t.fallas} falla${t.fallas === 1 ? '' : 's'}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
