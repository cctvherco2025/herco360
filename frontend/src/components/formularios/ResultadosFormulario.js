import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useTheme } from '@/context/ThemeContext';
import { generarResultadosPdf } from '@/lib/formularioResultadosPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';

/* Panel de resultados de un formulario, igual para todos: lo arma el servidor
   (GET /formularios-v2/{id}/resultados). Una sola fila de filtros manda sobre
   todo el panel; Excel y PDF salen con esos mismos filtros. */

const VACIOS = { desde: '', hasta: '', sucursal: '', persona: '', estado: '' };
const LABEL = 'flex flex-col gap-1 text-xs text-muted-foreground min-w-0';
const TARJETA = 'rounded-2xl border bg-card p-4';
const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
const dmy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const Tile = ({ etiqueta, valor, nota }) => (
  <div className="rounded-xl border bg-card px-3.5 py-3 min-w-0">
    <p className="text-xs text-muted-foreground">{etiqueta}</p>
    <p className="font-heading text-2xl font-semibold mt-0.5">{valor}</p>
    {nota && <p className="text-[11px] text-muted-foreground mt-0.5">{nota}</p>}
  </div>
);

const Barra = ({ valor }) => (
  <div className="h-2 mt-1 rounded-full bg-muted overflow-hidden">
    <div className="h-full rounded-r bg-[#00a5df] dark:bg-[#3cbef6]" style={{ width: `${valor || 0}%`, minWidth: valor ? 4 : 0 }} />
  </div>
);

function Globo({ active, payload, repeticion }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover text-popover-foreground shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-0.5">{dmy(p.dia)}/{p.dia.slice(0, 4)}</p>
      {repeticion ? <p>{p.entregadas} de {p.asignadas} entregadas · {pct(p.cumplimiento)}</p> : <p>{p.respuestas} {p.respuestas === 1 ? 'respuesta' : 'respuestas'}</p>}
      {p.puntaje !== null && p.puntaje !== undefined && <p className="text-muted-foreground">Puntaje {p.puntaje}%</p>}
    </div>
  );
}

function Tendencia({ tendencia }) {
  const { isDark } = useTheme();
  const repeticion = tendencia.tipo === 'repeticion';
  const clave = repeticion ? 'cumplimiento' : 'respuestas';
  const datos = useMemo(() => tendencia.puntos.map((p) => ({ ...p, corto: dmy(p.dia) })), [tendencia]);
  if (datos.length < 2) return null;
  const color = isDark ? '#3cbef6' : '#00a5df';
  const eje = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' };
  const titulo = repeticion ? 'Cumplimiento por repetición' : 'Respuestas por día';
  return (
    <section className={TARJETA}>
      <h3 className="font-heading font-semibold mb-3">{titulo}</h3>
      <div className="h-[220px]" role="img" aria-label={`${titulo}: ${datos.map((p) => `${p.corto} ${p[clave]}${repeticion ? '%' : ''}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 18, right: 24, left: -18, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="corto" tick={eje} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} minTickGap={20} />
            <YAxis domain={repeticion ? [0, 100] : [0, 'auto']} ticks={repeticion ? [0, 25, 50, 75, 100] : undefined} allowDecimals={false}
              unit={repeticion ? '%' : ''} tick={eje} tickLine={false} axisLine={false} />
            <Tooltip content={<Globo repeticion={repeticion} />} cursor={{ stroke: 'hsl(var(--border))' }} />
            <Line dataKey={clave} type="linear" stroke={color} strokeWidth={2} isAnimationActive={false}
              dot={{ r: 4, fill: color, stroke: 'hsl(var(--card))', strokeWidth: 2 }} activeDot={{ r: 6, fill: color, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              label={({ index, x, y, value }) => (index === datos.length - 1
                ? <text key="fin" x={x} y={y - 10} textAnchor="middle" fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">{value}{repeticion ? '%' : ''}</text> : <g key={index} />)} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">Ver los datos</summary>
        <table className="w-full mt-2">
          <tbody>
            {datos.map((p) => (
              <tr key={p.dia} className="border-t">
                <td className="py-1">{dmy(p.dia)}/{p.dia.slice(0, 4)}</td>
                <td className="py-1 text-right tabular-nums">{repeticion ? `${p.entregadas} de ${p.asignadas} · ${pct(p.cumplimiento)}` : p.respuestas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

function PorTienda({ d }) {
  const mayor = Math.max(1, ...d.por_tienda.map((t) => t.respuestas));
  return (
    <section className={TARJETA}>
      <h3 className="font-heading font-semibold mb-3">Por tienda</h3>
      <ul className="space-y-3">
        {d.por_tienda.map((t) => (
          <li key={t.tienda}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{t.tienda}</span>
              <span className="shrink-0 tabular-nums font-semibold">
                {d.asigna ? pct(t.cumplimiento) : t.respuestas}
                <span className="text-xs font-normal text-muted-foreground">
                  {d.asigna ? ` · ${t.entregadas} de ${t.asignadas}` : ` ${t.respuestas === 1 ? 'respuesta' : 'respuestas'}`}{d.con_puntaje && t.puntaje !== null ? ` · puntaje ${t.puntaje}%` : ''}
                </span>
              </span>
            </div>
            <Barra valor={d.asigna ? t.cumplimiento : Math.round((t.respuestas / mayor) * 100)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PorPersona({ d }) {
  return (
    <section className={`${TARJETA} min-w-0`}>
      <h3 className="font-heading font-semibold mb-3">Por persona</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground text-left">
              <th className="font-medium pb-2 pr-3">Persona</th><th className="font-medium pb-2 pr-3">Tienda</th>
              {d.asigna ? <><th className="font-medium pb-2 pr-3 text-right">Entregadas</th><th className="font-medium pb-2 pr-3 text-right">A tiempo</th><th className="font-medium pb-2 pr-3 text-right">Vencidas</th></>
                : <th className="font-medium pb-2 pr-3 text-right">Respuestas</th>}
              {d.con_puntaje && <th className="font-medium pb-2 text-right">Puntaje</th>}
            </tr>
          </thead>
          <tbody>
            {d.por_persona.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="py-1.5 pr-3 min-w-[140px]">{p.nombre}</td><td className="py-1.5 pr-3 text-muted-foreground">{p.tienda || '—'}</td>
                {d.asigna ? <><td className="py-1.5 pr-3 text-right tabular-nums">{p.entregadas} de {p.asignadas}</td><td className="py-1.5 pr-3 text-right tabular-nums">{p.a_tiempo}</td><td className="py-1.5 pr-3 text-right tabular-nums">{p.vencidas}</td></>
                  : <td className="py-1.5 pr-3 text-right tabular-nums">{p.respuestas}</td>}
                {d.con_puntaje && <td className="py-1.5 text-right tabular-nums">{pct(p.puntaje)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PorPregunta({ preguntas }) {
  return (
    <section className={TARJETA}>
      <h3 className="font-heading font-semibold mb-3">Por pregunta</h3>
      <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
        {preguntas.map((p) => (
          <div key={p.id} className="min-w-0">
            <p className="text-sm font-semibold">{p.titulo}</p>
            <p className="text-xs text-muted-foreground">
              {p.respondidas} {p.respondidas === 1 ? 'respuesta' : 'respuestas'}{p.puntaje !== null ? ` · puntaje ${p.puntaje}%` : ''}{p.promedio !== null ? ` · promedio ${p.promedio}` : ''}
            </p>
            {p.opciones.length > 0 && (
              <ul className="mt-1.5 space-y-1.5">
                {p.opciones.map((o) => (
                  <li key={o.texto}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate">{o.texto}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{o.n}{o.pct !== null ? ` · ${o.pct}%` : ''}</span>
                    </div>
                    <Barra valor={o.pct} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ResultadosFormulario({ formId, titulo, puedeExportar }) {
  const [filtros, setFiltros] = useState(VACIOS);
  const [d, setD] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [exportando, setExportando] = useState(null);
  const params = useMemo(() => Object.fromEntries(Object.entries(filtros).filter(([, v]) => v)), [filtros]);
  const hayFiltros = Object.keys(params).length > 0;

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    api.get(`/formularios-v2/${formId}/resultados`, { params })
      .then(({ data }) => { if (vigente) { setD(data); setError(null); } })
      .catch((e) => { if (vigente) setError(e?.response?.data?.detail || 'No se pudieron cargar los resultados'); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [formId, params]);

  const poner = (k) => (v) => setFiltros((f) => ({ ...f, [k]: v?.target ? v.target.value : v }));

  const describir = () => {
    const persona = d?.opciones.personas.find((p) => p.id === filtros.persona)?.nombre;
    const estado = d?.opciones.estados.find((e) => e.id === filtros.estado)?.nombre;
    const partes = [filtros.desde && `Desde ${filtros.desde}`, filtros.hasta && `Hasta ${filtros.hasta}`, filtros.sucursal, persona, estado].filter(Boolean);
    return partes.length ? `Filtros: ${partes.join(' · ')}` : 'Todas las entregas';
  };

  const excel = async () => {
    setExportando('excel');
    try {
      const res = await api.get(`/formularios-v2/${formId}/resultados/excel`, { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `Resultados_${(titulo || 'Formulario').replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast.error('No se pudo generar el Excel'); }
    finally { setExportando(null); }
  };

  const pdf = async () => {
    setExportando('pdf');
    try { await generarResultadosPdf({ titulo, filtros: describir(), d }); }
    catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExportando(null); }
  };

  if (error && !d) return <p className="text-sm text-muted-foreground text-center py-10">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>;
  const s = d.resumen;
  const sinDatos = !s.asignadas && !s.respuestas;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border bg-card p-3.5 flex flex-wrap items-end gap-2.5">
        <label className={`flex-[1_1_130px] ${LABEL}`}>Desde<Input type="date" value={filtros.desde} onChange={poner('desde')} className="h-10 text-sm text-foreground" /></label>
        <label className={`flex-[1_1_130px] ${LABEL}`}>Hasta<Input type="date" value={filtros.hasta} onChange={poner('hasta')} className="h-10 text-sm text-foreground" /></label>
        <label className={`flex-[1_1_110px] ${LABEL}`}>Tienda
          <NativeSelect value={filtros.sucursal} onChange={poner('sucursal')} className="h-10 text-foreground">
            <option value="">Todas</option>{d.opciones.sucursales.map((x) => <option key={x} value={x}>{x}</option>)}
          </NativeSelect>
        </label>
        <label className={`flex-[1_1_150px] ${LABEL}`}>Persona
          <NativeSelect value={filtros.persona} onChange={poner('persona')} className="h-10 text-foreground">
            <option value="">Todas</option>{d.opciones.personas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </NativeSelect>
        </label>
        <label className={`flex-[1_1_120px] ${LABEL}`}>Estado
          <NativeSelect value={filtros.estado} onChange={poner('estado')} className="h-10 text-foreground">
            <option value="">Todos</option>{d.opciones.estados.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </NativeSelect>
        </label>
        {hayFiltros && <Button variant="ghost" className="rounded-xl h-10" onClick={() => setFiltros(VACIOS)}>Quitar filtros</Button>}
        {puedeExportar && (
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" className="rounded-xl h-10" onClick={excel} disabled={!!exportando}>
              {exportando === 'excel' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-1.5" />} Excel
            </Button>
            <Button variant="outline" className="rounded-xl h-10" onClick={pdf} disabled={!!exportando}>
              {exportando === 'pdf' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />} PDF
            </Button>
          </div>
        )}
      </div>

      {sinDatos ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">{hayFiltros ? 'Nada con estos filtros.' : 'Todavía no hay entregas.'}</div>
      ) : (
        <div className={`flex flex-col gap-3 transition-opacity ${cargando ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
            {d.asigna ? (
              <>
                <Tile etiqueta="Entregadas" valor={`${s.entregadas} de ${s.asignadas}`} nota={s.pendientes ? `${s.pendientes} por entregar` : null} />
                <Tile etiqueta="Cumplimiento" valor={pct(s.cumplimiento)} />
                <Tile etiqueta="A tiempo" valor={pct(s.puntualidad)} nota={`${s.a_tiempo} de ${s.entregadas}`} />
                <Tile etiqueta="Vencidas" valor={s.vencidas} nota={s.en_revision || s.devueltas ? `${s.en_revision} en revisión · ${s.devueltas} ${s.devueltas === 1 ? 'devuelta' : 'devueltas'}` : null} />
              </>
            ) : <Tile etiqueta="Respuestas" valor={s.respuestas} />}
            {d.con_puntaje && <Tile etiqueta="Puntaje promedio" valor={pct(s.puntaje)} />}
          </div>
          <Tendencia tendencia={d.tendencia} />
          <div className="grid gap-3 items-start lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <PorTienda d={d} />
            <PorPersona d={d} />
          </div>
          <PorPregunta preguntas={d.por_pregunta} />
        </div>
      )}
    </div>
  );
}
