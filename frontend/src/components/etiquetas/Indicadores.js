import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ReferenceLine,
} from 'recharts';
import { FileDown, FileSpreadsheet, Loader2, ClipboardCheck, Tags, CheckCircle2, AlertTriangle, Gauge, Settings2 } from 'lucide-react';
import api from '@/lib/api';
import { ymd } from '@/lib/time';
import { ETQ_SUCURSALES, ETQ_DEPARTAMENTOS, etqTone, ETQ_TONE_COLOR, ETQ_TONE_LABEL } from '@/lib/etiquetasSchema';
import { generateEtiquetasPdf } from '@/lib/etiquetasPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

function Tile({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-[16px] bg-card border shadow-card p-4">
      <span className="h-9 w-9 rounded-full grid place-items-center" style={{ background: `${color}1f` }}><Icon className="h-4 w-4" style={{ color }} /></span>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold mt-0.5" style={{ color: label === 'Cumplimiento general' ? color : undefined }}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// Cumplimiento por grupo: barra de 0 a 100 con el color del semáforo y el % escrito.
function CumplimientoList({ title, rows, cfg }) {
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5">
      <h3 className="font-heading font-semibold mb-4">{title}</h3>
      <ul className="space-y-3">
        {rows.map((r) => {
          const t = etqTone(r.cumplimiento, cfg);
          const c = ETQ_TONE_COLOR[t];
          return (
            <li key={r.label} title={r.cumplimiento == null ? `${r.label}: sin auditorías` : `${r.label}: ${r.cumplimiento}% · ${r.auditorias} auditoría(s), ${r.etiquetas} etiquetas`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground">{r.label}</span>
                {r.cumplimiento == null
                  ? <span className="text-xs text-muted-foreground">Sin auditorías</span>
                  : <span className="font-semibold tabular-nums text-foreground">{r.cumplimiento}% <span className="text-xs font-normal text-muted-foreground">· {r.auditorias} aud.</span></span>}
              </div>
              <div className="h-2 mt-1 rounded-full bg-muted overflow-hidden">
                {r.cumplimiento != null && <div className="h-full rounded-[4px]" style={{ width: `${r.cumplimiento}%`, background: c, minWidth: 6 }} />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TooltipBox({ active, payload, cfg }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const t = etqTone(d.cumplimiento, cfg);
  return (
    <div className="rounded-xl border bg-popover text-popover-foreground shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-0.5">{d.titulo}</p>
      {d.cumplimiento == null ? <p className="text-muted-foreground">Sin auditorías</p> : (
        <>
          <p><span style={{ color: ETQ_TONE_COLOR[t] }}>●</span> {d.cumplimiento}% · {ETQ_TONE_LABEL[t]}</p>
          <p className="text-muted-foreground">{d.auditorias} auditoría(s) · {d.correctas}/{d.etiquetas} correctas</p>
        </>
      )}
    </div>
  );
}

// Comparativo: una columna por semana o mes, color según el semáforo.
function Comparativo({ title, data, cfg }) {
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5">
      <h3 className="font-heading font-semibold mb-3">{title}</h3>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 18, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.2)" />
            <XAxis dataKey="corto" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
            <ReferenceLine y={cfg.verde_min} stroke={ETQ_TONE_COLOR.g} strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={cfg.amarillo_min} stroke={ETQ_TONE_COLOR.a} strokeDasharray="4 4" strokeOpacity={0.6} />
            <Tooltip content={<TooltipBox cfg={cfg} />} cursor={{ fill: 'rgba(0,165,223,0.08)' }} />
            <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={44}>
              {data.map((d) => <Cell key={d.corto} fill={ETQ_TONE_COLOR[etqTone(d.cumplimiento, cfg)] || 'transparent'} />)}
              <LabelList dataKey="cumplimiento" position="top" formatter={(v) => (v == null ? '' : `${Math.round(v)}%`)}
                style={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1">Líneas punteadas: verde ≥ {cfg.verde_min}% · amarillo ≥ {cfg.amarillo_min}%</p>
    </div>
  );
}

/* ─────────────── Configuración (administrador) ─────────── */
export function ConfigDialog({ open, cfg, onClose, onSaved }) {
  const [form, setForm] = useState(cfg);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm({ cantidad: cfg.cantidad, verde_min: cfg.verde_min, amarillo_min: cfg.amarillo_min }); }, [open, cfg]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    const body = { cantidad: Number(form.cantidad), verde_min: Number(form.verde_min), amarillo_min: Number(form.amarillo_min) };
    setSaving(true);
    try {
      await api.put('/etiquetas/config', body);
      toast.success('Configuración guardada');
      onSaved();
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[440px] rounded-[22px]">
        <DialogHeader className="text-left"><DialogTitle className="font-heading">Configuración de la auditoría</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cfg-cant">Etiquetas por auditoría</Label>
            <Input id="cfg-cant" type="number" inputMode="numeric" min="1" max="100" value={form.cantidad} onChange={set('cantidad')} className="h-11" />
            <p className="text-xs text-muted-foreground">Aplica a las auditorías nuevas; las ya guardadas no cambian.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-verde"><span className="inline-block h-2 w-2 rounded-full bg-[#16a34a] mr-1.5" />Verde desde (%)</Label>
              <Input id="cfg-verde" type="number" inputMode="decimal" min="0" max="100" step="0.1" value={form.verde_min} onChange={set('verde_min')} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-amarillo"><span className="inline-block h-2 w-2 rounded-full bg-[#eab308] mr-1.5" />Amarillo desde (%)</Label>
              <Input id="cfg-amarillo" type="number" inputMode="decimal" min="0" max="100" step="0.1" value={form.amarillo_min} onChange={set('amarillo_min')} className="h-11" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Rojo: menos de {form.amarillo_min || '—'}%. Los colores se recalculan en todo el historial.</p>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={save} disabled={saving} data-testid="etiquetas-config-save">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Indicadores({ cfg, onConfigChanged }) {
  const hoy = ymd(new Date());
  const [modo, setModo] = useState('semana');
  const [dia, setDia] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [sucursal, setSucursal] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(null);
  const [cfgOpen, setCfgOpen] = useState(false);

  const [desde, hasta] = useMemo(() => (modo === 'semana' ? semanaDe(dia || hoy) : mesDe(mes || hoy.slice(0, 7))), [modo, dia, mes, hoy]);
  const periodoTxt = modo === 'semana' ? `Semana del ${dmy(desde)} al ${dmy(hasta)}` : `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
  const filtrosTxt = [sucursal || 'todas las sucursales', departamento || 'todos los departamentos'].join(' · ');

  const qs = () => {
    const p = new URLSearchParams({ desde, hasta });
    if (sucursal) p.set('sucursal', sucursal);
    if (departamento) p.set('departamento', departamento);
    return p.toString();
  };
  const sufijo = `${[sucursal, departamento].filter(Boolean).map((x) => `${x}_`).join('')}${desde}_a_${hasta}`;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get(`/etiquetas/estadisticas?${qs()}`)
      .then(({ data }) => { if (alive) setStats(data); })
      .catch(() => toast.error('No se pudieron cargar los indicadores'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, sucursal, departamento]);

  const excel = async () => {
    setExporting('xlsx');
    try {
      const res = await api.get(`/etiquetas/informe.xlsx?${qs()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `Auditoria_Etiquetas_${sufijo}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error('No se pudo generar el Excel'); }
    finally { setExporting(null); }
  };

  const pdf = async () => {
    setExporting('pdf');
    try {
      const { data } = await api.get(`/etiquetas/informe?${qs()}`);
      await generateEtiquetasPdf({
        auditorias: data, cfg, conResumen: true,
        titulo: modo === 'semana' ? 'Informe semanal de etiquetas' : 'Informe mensual de etiquetas',
        subtitulo: `${periodoTxt.charAt(0).toUpperCase()}${periodoTxt.slice(1)} · ${filtrosTxt}`,
        filename: `Informe_Etiquetas_${sufijo}.pdf`,
      });
    } catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExporting(null); }
  };

  const semanal = (stats?.semanal || []).map((s) => {
    const [, d1] = s.desde.split('-').slice(1);
    return { ...s, corto: `S${Number(s.semana.split('-W')[1])}`, titulo: `Semana ${Number(s.semana.split('-W')[1])} (desde ${d1}/${s.desde.slice(5, 7)})`, valor: s.cumplimiento ?? 0 };
  });
  const mensual = (stats?.mensual || []).map((m) => ({
    ...m, corto: MESES_CORTO[Number(m.mes.slice(5, 7)) - 1], titulo: `${MESES[Number(m.mes.slice(5, 7)) - 1]} ${m.mes.slice(0, 4)}`, valor: m.cumplimiento ?? 0,
  }));
  const r = stats?.resumen;
  const tGeneral = etqTone(r?.cumplimiento, cfg);

  return (
    <div>
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-3 flex flex-col xl:flex-row xl:items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Periodo</label>
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 w-fit">
            {[['semana', 'Semanal'], ['mes', 'Mensual']].map(([k, l]) => (
              <button key={k} onClick={() => setModo(k)} data-testid={`etiquetas-periodo-${k}`}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${modo === k ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 xl:flex xl:items-end">
          <div className="space-y-1.5 min-w-0 col-span-2 sm:col-span-1">
            <label className="text-xs text-muted-foreground">{modo === 'semana' ? 'Cualquier día de la semana' : 'Mes'}</label>
            {modo === 'semana'
              ? <Input type="date" value={dia} max={hoy} onChange={(e) => setDia(e.target.value)} className="h-10 w-full xl:w-[160px] px-2.5" />
              : <Input type="month" value={mes} max={hoy.slice(0, 7)} onChange={(e) => setMes(e.target.value)} className="h-10 w-full xl:w-[160px] px-2.5" />}
          </div>
          <div className="space-y-1.5 min-w-0">
            <label className="text-xs text-muted-foreground">Sucursal</label>
            <NativeSelect value={sucursal} onChange={setSucursal} className="h-10 xl:w-[120px]">
              <option value="">Todas</option>
              {ETQ_SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          </div>
          <div className="space-y-1.5 min-w-0">
            <label className="text-xs text-muted-foreground">Departamento</label>
            <NativeSelect value={departamento} onChange={setDepartamento} className="h-10 xl:w-[150px]">
              <option value="">Todos</option>
              {ETQ_DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
            </NativeSelect>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:ml-auto">
          <Button variant="outline" className="rounded-xl flex-1 xl:flex-none" onClick={excel} disabled={!!exporting} data-testid="etiquetas-informe-excel">
            {exporting === 'xlsx' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5 text-[#16a34a]" />} Excel
          </Button>
          <Button variant="outline" className="rounded-xl flex-1 xl:flex-none" onClick={pdf} disabled={!!exporting} data-testid="etiquetas-informe-pdf">
            {exporting === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5 text-[#dc2626]" />} PDF
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={() => setCfgOpen(true)} title="Configuración" data-testid="etiquetas-config-button">
            <Settings2 className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Configuración</span>
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4 first-letter:uppercase">{periodoTxt} · {filtrosTxt} · {cfg.cantidad} etiquetas por auditoría</p>

      {loading && !stats && <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>}
      {stats && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`space-y-4 ${loading ? 'opacity-60 transition-opacity' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Tile icon={ClipboardCheck} label="Auditorías realizadas" value={r.auditorias} color="#1e395e" />
            <Tile icon={Tags} label="Etiquetas verificadas" value={r.etiquetas} color="#00a5df" />
            <Tile icon={CheckCircle2} label="Etiquetas correctas" value={r.correctas} color="#16a34a" />
            <Tile icon={AlertTriangle} label="Irregularidades" value={r.irregularidades}
              sub={r.irregularidades ? `${r.precio_incorrecto} precio · ${r.sin_etiqueta} sin etiqueta · ${r.deterioradas} deterioradas` : null} color="#dc2626" />
            <div className="col-span-2 lg:col-span-1">
              <Tile icon={Gauge} label="Cumplimiento general" value={r.cumplimiento == null ? '—' : `${r.cumplimiento}%`}
                sub={r.cumplimiento == null ? 'Sin auditorías' : ETQ_TONE_LABEL[tGeneral]} color={ETQ_TONE_COLOR[tGeneral] || '#9aa1ad'} />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <CumplimientoList title="Cumplimiento por sucursal" cfg={cfg}
              rows={stats.por_sucursal.map((s) => ({ label: s.sucursal, ...s }))} />
            <CumplimientoList title="Cumplimiento por departamento" cfg={cfg}
              rows={stats.por_departamento.map((d) => ({ label: d.departamento, ...d }))} />
            <Comparativo title="Comparativo semanal (últimas 8 semanas)" data={semanal} cfg={cfg} />
            <Comparativo title="Comparativo mensual (últimos 6 meses)" data={mensual} cfg={cfg} />
          </div>
        </motion.div>
      )}

      <ConfigDialog open={cfgOpen} cfg={cfg} onClose={() => setCfgOpen(false)} onSaved={onConfigChanged} />
    </div>
  );
}
