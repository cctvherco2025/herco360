import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, Loader2, Route, AlertTriangle, CheckCircle2, MessageSquareText, Trophy } from 'lucide-react';
import api from '@/lib/api';
import { ymd } from '@/lib/time';
import { RECORRIDO_SUCURSALES, tipoLabel } from '@/lib/recorridosSchema';
import { generateRecorridosPdf } from '@/lib/recorridosPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';

const BAR = '#00a5df';

// 'YYYY-MM-DD' -> lunes y domingo de esa semana
function semanaDe(s) {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const lunes = new Date(dt); lunes.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
  return [ymd(lunes), ymd(domingo)];
}
function mesDe(ym) {
  const [y, m] = ym.split('-').map(Number);
  return [`${ym}-01`, ymd(new Date(y, m, 0))];
}
const dmy = (s) => s.split('-').reverse().join('/');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function Tile({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-[16px] bg-card border shadow-card p-4">
      <span className="h-9 w-9 rounded-full grid place-items-center" style={{ background: `${color}1f` }}><Icon className="h-4 w-4" style={{ color }} /></span>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold mt-0.5 text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Lista de barras horizontales (una sola serie: conteo de hallazgos).
function BarList({ title, rows, total }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5">
      <h3 className="font-heading font-semibold mb-4">{title}</h3>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} title={`${r.label}: ${r.n} hallazgo${r.n === 1 ? '' : 's'}${total ? ` (${Math.round((r.n / total) * 100)}%)` : ''}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-foreground">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {r.n}{total ? <span className="text-xs text-muted-foreground font-normal ml-1">{Math.round((r.n / total) * 100)}%</span> : null}
              </span>
            </div>
            <div className="h-2 mt-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-[4px]" style={{ width: `${(r.n / max) * 100}%`, background: BAR, minWidth: r.n ? 6 : 0 }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Indicadores() {
  const hoy = ymd(new Date());
  const [modo, setModo] = useState('mes'); // semana | mes
  const [dia, setDia] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [sucursal, setSucursal] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null); // 'xlsx' | 'pdf'

  const [desde, hasta] = useMemo(() => (modo === 'semana' ? semanaDe(dia || hoy) : mesDe(mes || hoy.slice(0, 7))), [modo, dia, mes, hoy]);
  const periodoTxt = modo === 'semana'
    ? `Semana del ${dmy(desde)} al ${dmy(hasta)}`
    : `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    const params = new URLSearchParams({ desde, hasta });
    if (sucursal) params.set('sucursal', sucursal);
    api.get(`/recorridos/estadisticas?${params.toString()}`)
      .then(({ data }) => { if (alive) setStats(data); })
      .catch(() => toast.error('No se pudieron cargar los indicadores'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [desde, hasta, sucursal]);

  const params = () => {
    const p = new URLSearchParams({ desde, hasta });
    if (sucursal) p.set('sucursal', sucursal);
    return p.toString();
  };
  const sufijo = `${sucursal ? `${sucursal}_` : ''}${desde}_a_${hasta}`;

  const excel = async () => {
    setExporting('xlsx');
    try {
      const res = await api.get(`/recorridos/informe.xlsx?${params()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `Recorridos_Preventivos_${sufijo}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error('No se pudo generar el Excel'); }
    finally { setExporting(null); }
  };

  const pdf = async () => {
    setExporting('pdf');
    try {
      const { data } = await api.get(`/recorridos/informe?${params()}`);
      await generateRecorridosPdf({
        recorridos: data,
        titulo: modo === 'semana' ? 'Informe semanal de recorridos' : 'Informe mensual de recorridos',
        subtitulo: `${periodoTxt.charAt(0).toUpperCase()}${periodoTxt.slice(1)} · ${sucursal || 'Todas las sucursales'}`,
        filename: `Informe_Recorridos_${sufijo}.pdf`,
        conResumen: true,
      });
    } catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExporting(null); }
  };

  const total = stats?.total_hallazgos || 0;
  const top = stats?.por_categoria?.[0];

  return (
    <div>
      {/* periodo y sucursal: aplican a los indicadores y a los informes */}
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-4 flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Periodo</label>
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 w-fit">
            {[['semana', 'Semanal'], ['mes', 'Mensual']].map(([k, l]) => (
              <button key={k} onClick={() => setModo(k)} data-testid={`recorridos-periodo-${k}`}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${modo === k ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:flex lg:items-end">
          <div className="space-y-1.5 min-w-0">
            <label className="text-xs text-muted-foreground">{modo === 'semana' ? 'Cualquier día de la semana' : 'Mes'}</label>
            {modo === 'semana'
              ? <Input type="date" value={dia} max={hoy} onChange={(e) => setDia(e.target.value)} className="h-10 w-full lg:w-[170px] px-2.5" />
              : <Input type="month" value={mes} max={hoy.slice(0, 7)} onChange={(e) => setMes(e.target.value)} className="h-10 w-full lg:w-[170px] px-2.5" />}
          </div>
          <div className="space-y-1.5 min-w-0">
            <label className="text-xs text-muted-foreground">Sucursal</label>
            <NativeSelect value={sucursal} onChange={setSucursal} className="h-10 lg:w-[150px]">
              <option value="">Todas</option>
              {RECORRIDO_SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <Button variant="outline" className="rounded-xl flex-1 lg:flex-none" onClick={excel} disabled={!!exporting} data-testid="recorridos-informe-excel">
            {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5 text-[#16a34a]" />} Excel
          </Button>
          <Button variant="outline" className="rounded-xl flex-1 lg:flex-none" onClick={pdf} disabled={!!exporting} data-testid="recorridos-informe-pdf">
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5 text-[#dc2626]" />} PDF
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 first-letter:uppercase">{periodoTxt} · {sucursal || 'todas las sucursales'}</p>

      {loading && !stats && <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={loading ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Tile icon={Route} label="Recorridos realizados" value={stats.total_recorridos} sub={`${stats.recorridos_sin_novedades} sin novedades`} color="#1e395e" />
            <Tile icon={AlertTriangle} label="Hallazgos registrados" value={total}
              sub={stats.total_recorridos ? `${(total / stats.total_recorridos).toFixed(1)} por recorrido` : '—'} color="#ec9032" />
            <Tile icon={MessageSquareText} label="Hallazgos con seguimiento" value={stats.hallazgos_con_seguimiento}
              sub={total ? `${Math.round((stats.hallazgos_con_seguimiento / total) * 100)}% del total` : '—'} color="#16a34a" />
            <Tile icon={Trophy} label="Departamento con más irregularidades" value={top && top.n ? top.categoria : '—'}
              sub={top && top.n ? `${top.n} hallazgo${top.n === 1 ? '' : 's'}` : 'Sin hallazgos'} color="#dc2626" />
          </div>

          {total === 0 ? (
            <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
              <CheckCircle2 className="h-8 w-8 mx-auto text-[#16a34a] mb-2" />
              <p className="text-sm text-muted-foreground">No hay hallazgos registrados en este periodo.</p>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              <BarList title="Hallazgos por departamento" total={total} rows={stats.por_categoria.map((c) => ({ label: c.categoria, n: c.n }))} />
              <BarList title="Hallazgos por sucursal" total={total} rows={stats.por_sucursal.map((s) => ({ label: s.sucursal, n: s.n }))} />
              <div className="lg:col-span-2">
                <BarList title="Hallazgos por tipo de irregularidad" total={total}
                  rows={stats.por_tipo.filter((t) => t.n > 0).map((t) => ({ label: tipoLabel(t.tipo), n: t.n }))} />
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
