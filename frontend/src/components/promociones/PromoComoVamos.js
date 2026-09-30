import React, { useState } from 'react';
import {
  CheckCircle2, AlertTriangle, AlertOctagon, Hourglass, CalendarClock, TrendingUp, TrendingDown, Minus,
  Trophy, ShieldCheck, Ticket, Timer,
} from 'lucide-react';
import { ESTRATEGIA_COLOR } from '@/lib/promoEstrategia';

// Semáforo del "¿Cómo vamos?" (lo calcula el backend en report.analisis.resumen).
const ESTADO = {
  bien: { label: 'Vamos bien', color: '#16a34a', tint: 'rgba(22,163,74,0.12)', icon: CheckCircle2 },
  en_curso: { label: 'En curso', color: '#00a5df', tint: 'rgba(0,165,223,0.12)', icon: Hourglass },
  atencion: { label: 'Poner atención', color: '#ec9032', tint: 'rgba(236,144,50,0.12)', icon: AlertTriangle },
  riesgo: { label: 'En riesgo', color: '#dc2626', tint: 'rgba(220,38,38,0.12)', icon: AlertOctagon },
};

const pctColor = (p) => (p === null || p === undefined ? '#94a3b8' : p >= 90 ? '#16a34a' : p >= 75 ? '#ec9032' : '#dc2626');

export function fmtHoras(h) {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h * 10) / 10} h`;
  return `${Math.round((h / 24) * 10) / 10} días`;
}

function fmtVence(iso) {
  if (!iso) return '';
  const d = new Date(iso); // hora de Honduras sin zona → se lee como hora local
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-HN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function plazoTexto(dias) {
  if (dias === null || dias === undefined) return null;
  if (dias < 0) return 'Plazo vencido';
  if (dias < 1) return `Vence en ${Math.max(1, Math.round(dias * 24))} h`;
  const n = Math.round(dias);
  return `Vence en ${n} día${n === 1 ? '' : 's'}`;
}

function Barra({ label, value, total, color }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}/{total} <span className="text-muted-foreground font-normal">· {pct}%</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// Métricas de la comparación con el mes anterior. mejor: 'alto' → subir es bueno.
const COMPARA = [
  { key: 'cumplimiento', label: 'Cumplimiento', mejor: 'alto', fmt: (v) => `${v}%`, unidad: 'pts' },
  { key: 'avance_pct', label: 'Contestado', mejor: 'alto', fmt: (v) => `${v}%`, unidad: 'pts' },
  { key: 'validadas_pct', label: 'Validado', mejor: 'alto', fmt: (v) => `${v}%`, unidad: 'pts' },
  { key: 'horas_respuesta', label: 'Tiempo de respuesta', mejor: 'bajo', fmt: fmtHoras, unidad: 'h' },
  { key: 'horas_revision', label: 'Tiempo de revisión', mejor: 'bajo', fmt: fmtHoras, unidad: 'h' },
];

function Delta({ actual, anterior, mejor, unidad }) {
  if (actual === null || actual === undefined || anterior === null || anterior === undefined) {
    return <span className="text-[11px] text-muted-foreground">sin dato</span>;
  }
  const d = Math.round((actual - anterior) * 10) / 10;
  if (d === 0) return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Minus className="h-3 w-3" />igual</span>;
  const bueno = mejor === 'alto' ? d > 0 : d < 0;
  const Icon = d > 0 ? TrendingUp : TrendingDown;
  const txt = unidad === 'h' ? fmtHoras(Math.abs(d)) : `${Math.abs(d)} pts`;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold" style={{ color: bueno ? '#16a34a' : '#dc2626' }}>
      <Icon className="h-3 w-3" />{d > 0 ? '+' : '−'}{txt}
    </span>
  );
}

function Comparacion({ comp }) {
  const hay = (v) => v !== null && v !== undefined;
  const filas = COMPARA.filter((c) => hay(comp.actual[c.key]) || hay(comp.anterior[c.key]));
  if (!filas.length) return null;
  return (
    <div className="mt-5 pt-4 border-t">
      <p className="text-xs text-muted-foreground mb-2.5">
        Contra <span className="font-medium text-foreground">{comp.periodo_label}</span>
        {comp.titulo ? <> · {comp.titulo}</> : null}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {filas.map((c) => (
          <div key={c.key} className="rounded-xl bg-muted/50 px-3 py-2 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">{c.label}</p>
            <p className="font-heading font-semibold text-base leading-tight">
              {comp.actual[c.key] !== null && comp.actual[c.key] !== undefined ? c.fmt(comp.actual[c.key]) : '—'}
            </p>
            <Delta actual={comp.actual[c.key]} anterior={comp.anterior[c.key]} mejor={c.mejor} unidad={c.unidad} />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              antes {comp.anterior[c.key] !== null && comp.anterior[c.key] !== undefined ? c.fmt(comp.anterior[c.key]) : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Resumen({ resumen, comparacion }) {
  const e = ESTADO[resumen.estado] || ESTADO.en_curso;
  const Icon = e.icon;
  const { avance, plazo } = resumen;
  const plazoTxt = plazoTexto(plazo?.dias_restantes);
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5 relative overflow-hidden" data-testid="promo-como-vamos">
      <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: e.color }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-full grid place-items-center shrink-0" style={{ background: e.tint }}>
            <Icon className="h-5 w-5" style={{ color: e.color }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">¿Cómo vamos?</p>
            <p className="font-heading text-xl font-semibold" style={{ color: e.color }}>{e.label}</p>
          </div>
        </div>
        {plazoTxt && (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={plazo.dias_restantes < 1 ? { background: 'rgba(220,38,38,0.12)', color: '#dc2626' } : { background: 'rgba(30,57,94,0.08)', color: '#1e395e' }}
            title={fmtVence(plazo.vence)}>
            <CalendarClock className="h-3.5 w-3.5" />{plazoTxt}
            {plazo.vence && <span className="font-normal opacity-80">· {fmtVence(plazo.vence)}</span>}
          </span>
        )}
      </div>

      <p className="text-sm mt-3 leading-relaxed">{resumen.frase}</p>

      {avance.total > 0 && (
        <div className={`grid gap-3 mt-4 ${avance.revisadas !== null ? 'sm:grid-cols-3' : ''}`}>
          <Barra label="Contestadas" value={avance.contestadas} total={avance.total} color="#00a5df" />
          {avance.revisadas !== null && <Barra label="Revisadas" value={avance.revisadas} total={avance.total} color="#1e395e" />}
          {avance.validadas !== null && <Barra label="Validadas" value={avance.validadas} total={avance.total} color="#16a34a" />}
        </div>
      )}

      {comparacion && <Comparacion comp={comparacion} />}
    </div>
  );
}

function FilaRanking({ pos, item }) {
  const valor = item.cumplimiento;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`w-5 text-xs font-semibold tabular-nums ${pos <= 3 ? 'text-foreground' : 'text-muted-foreground'}`}>{pos}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm truncate">{item.nombre}</span>
          <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: pctColor(valor) }}>{valor !== null && valor !== undefined ? `${valor}%` : '—'}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
          <div className="h-full rounded-full" style={{ width: `${valor || 0}%`, background: pctColor(valor) }} />
        </div>
        {item.avance_pct !== null && item.avance_pct !== undefined && item.avance_pct < 100 && (
          <p className="text-[10px] text-muted-foreground mt-0.5">{item.avance_pct}% contestado</p>
        )}
      </div>
    </div>
  );
}

function Rankings({ rankings }) {
  const [vista, setVista] = useState('tiendas');
  const lista = rankings[vista] || [];
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5" data-testid="promo-rankings">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="font-heading font-semibold flex items-center gap-2"><Trophy className="h-4 w-4 text-[#ec9032]" />Rankings</h3>
        <div className="inline-flex rounded-full bg-muted p-0.5 text-xs">
          {[['tiendas', 'Tiendas'], ['categorias', 'Categorías']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setVista(k)}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${vista === k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mb-1">Por cumplimiento (promociones visibles), de mejor a peor.</p>
      <div className="max-h-[320px] overflow-y-auto pr-1">
        {lista.map((it, i) => <FilaRanking key={it.nombre} pos={i + 1} item={it} />)}
        {lista.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Sin datos todavía</p>}
      </div>

      {rankings.peores_promociones?.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Promociones menos visibles</p>
          <div className="space-y-2">
            {rankings.peores_promociones.map((p, i) => (
              <div key={`${p.titulo}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate" title={p.titulo}>
                  {p.titulo}
                  {p.etiqueta && (
                    <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                      style={{ background: ESTRATEGIA_COLOR[p.estrategia] || ESTRATEGIA_COLOR.mixta }}>{p.etiqueta}</span>
                  )}
                  <span className="block text-[11px] text-muted-foreground">{p.categoria} · no visible en {p.no_visibles}</span>
                </span>
                <span className="font-semibold tabular-nums shrink-0" style={{ color: pctColor(p.cumplimiento) }}>{p.cumplimiento}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2.5 min-w-0">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate"><Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />{label}</p>
      <p className="font-heading font-semibold text-lg leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
    </div>
  );
}

function Calidad({ calidad }) {
  const { tiempos, tickets, inconsistencias } = calidad;
  const hayPlazo = calidad.a_tiempo !== null && calidad.a_tiempo !== undefined;
  const enviados = hayPlazo ? calidad.a_tiempo + calidad.tarde : 0;
  const maxInc = Math.max(1, ...inconsistencias.map((x) => x.n));
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5" data-testid="promo-calidad">
      <h3 className="font-heading font-semibold flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-[#00a5df]" />Calidad y tiempos</h3>

      <div className="grid grid-cols-2 gap-2">
        <Mini icon={Timer} label="Respuesta promedio" value={fmtHoras(tiempos.horas_respuesta)} sub="desde la publicación" color="#00a5df" />
        {tiempos.horas_revision !== null && tiempos.horas_revision !== undefined
          ? <Mini icon={Timer} label="Revisión promedio" value={fmtHoras(tiempos.horas_revision)} sub="desde que se envió" color="#1e395e" />
          : <Mini icon={Timer} label="Revisión promedio" value="—" sub={tickets ? 'sin revisiones aún' : 'no aplica'} color="#1e395e" />}
      </div>

      {hayPlazo && enviados > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-muted-foreground">Entregas a tiempo</span>
            <span className="font-semibold tabular-nums">
              <span className="text-[#16a34a]">{calidad.a_tiempo} a tiempo</span>
              {calidad.tarde > 0 && <span className="text-[#dc2626]"> · {calidad.tarde} tarde</span>}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden flex">
            <div className="h-full bg-[#16a34a]" style={{ width: `${(calidad.a_tiempo / enviados) * 100}%` }} />
            <div className="h-full bg-[#dc2626]" style={{ width: `${(calidad.tarde / enviados) * 100}%` }} />
          </div>
        </div>
      )}

      {tickets && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" />Tickets de inconsistencias</p>
          {tickets.total === 0 ? (
            <p className="text-sm text-muted-foreground">Sin tickets en esta publicación.</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[['Abiertos', tickets.abiertos, '#dc2626'], ['Corregidos', tickets.corregidos, '#ec9032'], ['Cerrados', tickets.cerrados, '#16a34a']].map(([l, n, c]) => (
                  <div key={l} className="rounded-xl bg-muted/50 py-2">
                    <p className="font-heading text-lg font-semibold" style={{ color: n ? c : undefined }}>{n}</p>
                    <p className="text-[11px] text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">
                {tickets.total} en total
                {tickets.horas_cierre !== null && tickets.horas_cierre !== undefined ? ` · cierre promedio ${fmtHoras(tickets.horas_cierre)}` : ''}
                {tickets.reaperturas ? ` · ${tickets.reaperturas} reapertura${tickets.reaperturas === 1 ? '' : 's'}` : ''}
              </p>
            </>
          )}
        </div>
      )}

      {inconsistencias.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inconsistencias más comunes</p>
          <div className="space-y-1.5">
            {inconsistencias.map((x) => (
              <div key={x.tipo} className="flex items-center gap-2 text-sm">
                <span className="w-[45%] truncate" title={x.tipo}>{x.tipo}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-[#ec9032]" style={{ width: `${(x.n / maxInc) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-xs font-semibold tabular-nums">{x.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PromoComoVamos({ analisis }) {
  if (!analisis) return null;
  return (
    <div className="space-y-4">
      <Resumen resumen={analisis.resumen} comparacion={analisis.comparacion} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Rankings rankings={analisis.rankings} />
        <Calidad calidad={analisis.calidad} />
      </div>
    </div>
  );
}
