import React, { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Video, Users, CalendarRange, Activity, Download, Wifi, WifiOff, Clock, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessCams } from '@/lib/constants';
import { ymd } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function downloadFile(url, fallbackName) {
  try {
    const res = await api.get(url, { responseType: 'blob' });
    const disp = res.headers['content-disposition'] || '';
    const m = disp.match(/filename="?([^"]+)"?/);
    const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = blobUrl; a.download = m ? m[1] : fallbackName;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(blobUrl);
  } catch (e) { toast.error('No se pudo generar el archivo'); }
}

const shiftDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

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

export default function ReportesCams() {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [start, setStart] = useState(ymd(shiftDays(new Date(), -6)));
  const [end, setEnd] = useState(ymd(new Date()));
  const [day, setDay] = useState(ymd(new Date()));
  const [sucursal, setSucursal] = useState('');
  const [summary, setSummary] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(false);

  const sucParam = sucursal ? `&sucursal=${encodeURIComponent(sucursal)}` : '';

  const loadMeta = useCallback(async () => {
    try { const { data } = await api.get('/cams/meta'); setMeta(data); } catch (e) {}
  }, []);

  const loadRange = useCallback(async () => {
    if (!start || !end || start > end) return;
    setLoading(true);
    try {
      const [s, r] = await Promise.all([
        api.get(`/cams/summary?start=${start}&end=${end}${sucParam}`),
        api.get(`/cams/recent?limit=15${sucParam}`),
      ]);
      setSummary(s.data);
      setRecent(r.data);
    } catch (e) { toast.error('No se pudieron cargar los datos'); }
    finally { setLoading(false); }
  }, [start, end, sucParam]);

  const loadDay = useCallback(async () => {
    if (!day) return;
    try { const { data } = await api.get(`/cams/hourly?date=${day}${sucParam}`); setHourly(data); } catch (e) {}
  }, [day, sucParam]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadRange(); }, [loadRange]);
  useEffect(() => { loadDay(); }, [loadDay]);

  if (!canAccessCams(user)) return <Navigate to="/" replace />;

  const agent = meta?.agents?.[0];
  const agentSub = agent
    ? (agent.online
        ? `En línea · reportó hace ${Math.max(0, Math.round(agent.mins_since ?? 0))} min`
        : (agent.mins_since != null ? `Sin señal hace ${Math.round(agent.mins_since)} min` : 'Sin señal'))
    : 'Aún no ha reportado';

  const hourData = (hourly?.hours || []).map((v, h) => ({ h: `${String(h).padStart(2, '0')}`, v }));
  const dayData = (summary?.by_day || []).map((d) => ({ ...d, label: d.date.slice(5) }));
  const refresh = () => { loadMeta(); loadRange(); loadDay(); };

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Video className="h-7 w-7 text-[#00a5df]" /> Reportes CAMS
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Conteo de personas que entran, por cámara</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl" onClick={refresh} data-testid="cams-refresh">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Actualizar
          </Button>
          <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="cams-export"
            onClick={() => downloadFile(`/cams/export?start=${start}&end=${end}${sucParam}`, `reportes_cams_${start}_a_${end}.xlsx`)}>
            <Download className="h-4 w-4 mr-1.5" /> Exportar Excel
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="h-10 w-[160px]" data-testid="cams-start" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="h-10 w-[160px]" data-testid="cams-end" />
        </div>
        {(meta?.sucursales?.length || 0) > 1 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Sucursal</Label>
            <Select value={sucursal || 'todas'} onValueChange={(v) => setSucursal(v === 'todas' ? '' : v)}>
              <SelectTrigger className="h-10 w-[150px]" data-testid="cams-sucursal"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {meta.sucursales.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {loading && <span className="text-xs text-muted-foreground pb-2">Cargando…</span>}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <Kpi icon={Users} label="Entradas de hoy" value={summary?.today ?? '—'} sub="personas contadas" color="#00a5df" tint="rgba(0,165,223,0.14)" />
        <Kpi icon={CalendarRange} label="Entradas en el rango" value={summary?.total ?? '—'} sub={`${start} → ${end}`} color="#ec9032" tint="rgba(236,144,50,0.14)" />
        <Kpi
          icon={agent?.online ? Wifi : WifiOff}
          label="Estado del agente"
          value={agent?.online ? 'En línea' : 'Sin señal'}
          sub={agentSub}
          color={agent?.online ? '#16a34a' : '#8a8b8b'}
          tint={agent?.online ? 'rgba(22,163,74,0.14)' : 'rgba(138,139,139,0.14)'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Por hora */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="lg:col-span-2 rounded-[18px] bg-card border shadow-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[#00a5df]" />
              <h3 className="font-heading font-semibold">Entradas por hora</h3>
            </div>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-9 w-[160px]" data-testid="cams-day" />
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.2)" />
                <XAxis dataKey="h" tick={{ fontSize: 11 }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}`, 'Entradas']} labelFormatter={(l) => `${l}:00`} />
                <Bar dataKey="v" fill="#00a5df" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total del día: <b>{hourly?.total ?? 0}</b> · hora local (Honduras)</p>
        </motion.div>

        {/* Actividad reciente */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.05 }}
          className="rounded-[18px] bg-card border shadow-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-5 w-5 text-[#16a34a]" />
            <h3 className="font-heading font-semibold">Actividad reciente</h3>
          </div>
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {recent.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin registros</p>}
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm" data-testid="cams-recent-row">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-[#16a34a]" /> Entrada detectada
                </span>
                <span className="text-xs text-muted-foreground">{r.hora_local}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Por día */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
          className="lg:col-span-3 rounded-[18px] bg-card border shadow-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarRange className="h-5 w-5 text-[#ec9032]" />
            <h3 className="font-heading font-semibold">Entradas por día</h3>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayData} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.2)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}`, 'Entradas']} />
                <Bar dataKey="count" fill="#1e395e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
