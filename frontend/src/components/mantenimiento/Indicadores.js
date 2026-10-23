import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import api from '@/lib/api';
import { BarraFiltros, Kpis, useFiltrosMant } from '@/components/mantenimiento/Reportes';

// Estados (colores de estado, siempre con su nombre en la leyenda) y una
// sola tinta para las barras de fallas.
const C = { aTiempo: '#16a34a', tarde: '#ec9032', incompleta: '#dc2626', vencida: '#ec9032', serie: '#1e395e' };
const eje = { fontSize: 11, fill: '#64748b' };
// Leyenda propia (orden fijo; texto en tinta normal, el color va en el punto).
const Leyenda = ({ items }) => (
  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2 text-xs text-foreground">
    {items.map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l}</span>)}
  </div>
);
const grilla = <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120,120,120,0.2)" />;
const cursor = { fill: 'rgba(0,165,223,0.08)' };

function Caja({ titulo, ayuda, children, alto = 260, vacio }) {
  return (
    <div className="rounded-[18px] border bg-card shadow-card p-4 sm:p-5">
      <h3 className="font-heading font-semibold">{titulo}</h3>
      {ayuda && <p className="text-xs text-muted-foreground mt-0.5">{ayuda}</p>}
      <div className="mt-3" style={{ height: alto, minHeight: 120 }}>
        {vacio ? <div className="h-full grid place-items-center text-sm text-muted-foreground">{vacio}</div> : children}
      </div>
    </div>
  );
}

function TooltipMes({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold mb-1">{d.etiqueta}</p>
      <p>Cumplimiento: <b>{d.cumplimiento == null ? '—' : `${d.cumplimiento}%`}</b></p>
      <p style={{ color: C.aTiempo }}>A tiempo: {d.a_tiempo}</p>
      <p style={{ color: C.tarde }}>Tarde: {d.tardias}</p>
      <p style={{ color: C.incompleta }}>Incompletas: {d.incompletas}</p>
      {d.abiertas > 0 && <p className="text-muted-foreground">Abiertas: {d.abiertas}</p>}
    </div>
  );
}

// Barras horizontales de una sola serie (fallas por activo / pregunta / categoría).
function Horizontal({ data }) {
  const alto = Math.max(120, data.length * 34 + 20);
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(120,120,120,0.2)" />
        <XAxis type="number" allowDecimals={false} tick={eje} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="nombre" width={170} tick={{ ...eje, width: 165 }} tickLine={false} axisLine={false} />
        <Tooltip cursor={cursor} formatter={(v) => [v, 'Fallas']} />
        <Bar isAnimationActive={false} dataKey="fallas" fill={C.serie} radius={[0, 4, 4, 0]} maxBarSize={18}>
          <LabelList dataKey="fallas" position="right" style={{ fontSize: 11, fill: 'currentColor' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* Indicadores de mantenimiento: cumplimiento por mes, vencidas por sucursal
   y dónde se concentran las fallas. */
export default function Indicadores() {
  const f = useFiltrosMant('semestre');
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!f.desde || !f.hasta) return;
    api.get('/mantenimiento/indicadores', { params: f.params })
      .then(({ data }) => setD(data))
      .catch((e) => { toast.error(e?.response?.data?.detail || 'No se pudieron cargar los indicadores'); setD(null); });
  }, [f.params]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <BarraFiltros f={f} />
      {!d ? <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p> : (
        <div className="space-y-4">
          <Kpis r={d.resumen} />
          <Caja titulo="Cumplimiento por mes" ayuda="Tareas cerradas cada mes: a tiempo, tarde e incompletas. Arriba de cada barra, el % de cumplimiento."
            vacio={d.por_mes.every((m) => !m.cerradas) && 'Sin tareas cerradas en el periodo'}>
            <ResponsiveContainer width="100%" height="88%">
              <BarChart data={d.por_mes} margin={{ top: 22, right: 8, left: -18, bottom: 0 }}>
                {grilla}
                <XAxis dataKey="etiqueta" tick={eje} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={eje} tickLine={false} axisLine={false} />
                <Tooltip content={<TooltipMes />} cursor={cursor} />
                <Bar isAnimationActive={false} dataKey="a_tiempo" name="A tiempo" stackId="m" fill={C.aTiempo} maxBarSize={48} stroke="var(--card, #fff)" strokeWidth={1} />
                <Bar isAnimationActive={false} dataKey="tardias" name="Tarde" stackId="m" fill={C.tarde} maxBarSize={48} stroke="var(--card, #fff)" strokeWidth={1} />
                <Bar isAnimationActive={false} dataKey="incompletas" name="Incompletas" stackId="m" fill={C.incompleta} radius={[4, 4, 0, 0]} maxBarSize={48} stroke="var(--card, #fff)" strokeWidth={1}>
                  <LabelList dataKey="cumplimiento" position="top" formatter={(v) => (v == null ? '' : `${Math.round(v)}%`)} style={{ fontSize: 11, fontWeight: 600, fill: 'currentColor' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Leyenda items={[['A tiempo', C.aTiempo], ['Tarde', C.tarde], ['Incompletas', C.incompleta]]} />
          </Caja>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Caja titulo="Vencidas e incompletas por sucursal" ayuda="Vencidas: abiertas que pasaron su plazo. Incompletas: no se hicieron."
              vacio={!d.por_sucursal.length && 'Nada vencido ni incompleto en el periodo'}>
              <ResponsiveContainer width="100%" height="88%">
                <BarChart data={d.por_sucursal} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
                  {grilla}
                  <XAxis dataKey="sucursal" tick={eje} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={eje} tickLine={false} axisLine={false} />
                  <Tooltip cursor={cursor} />
                  <Bar isAnimationActive={false} dataKey="vencidas" name="Vencidas" fill={C.vencida} radius={[4, 4, 0, 0]} maxBarSize={36}>
                    <LabelList dataKey="vencidas" position="top" style={{ fontSize: 11, fill: 'currentColor' }} />
                  </Bar>
                  <Bar isAnimationActive={false} dataKey="incompletas" name="Incompletas" fill={C.incompleta} radius={[4, 4, 0, 0]} maxBarSize={36}>
                    <LabelList dataKey="incompletas" position="top" style={{ fontSize: 11, fill: 'currentColor' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <Leyenda items={[['Vencidas', C.vencida], ['Incompletas', C.incompleta]]} />
            </Caja>
            <Caja titulo="Fallas por categoría" alto="auto" vacio={!d.fallas_por_categoria.length && 'Sin fallas en el periodo'}>
              <Horizontal data={d.fallas_por_categoria} />
            </Caja>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Caja titulo="Activos con más fallas" ayuda="Los 10 con más fallas reportadas en el periodo." alto="auto"
              vacio={!d.fallas_por_activo.length && 'Sin fallas en el periodo'}>
              <Horizontal data={d.fallas_por_activo} />
            </Caja>
            <Caja titulo="Preguntas con más fallas" ayuda="Qué revisión falla más seguido." alto="auto"
              vacio={!d.fallas_por_pregunta.length && 'Sin fallas en el periodo'}>
              <Horizontal data={d.fallas_por_pregunta} />
            </Caja>
          </div>
        </div>
      )}
    </div>
  );
}
