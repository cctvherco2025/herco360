import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Clock, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { ENTREGAS, cuando, cuandoVence, diaCorto, haceCuanto } from '@/lib/formularios';

/* Mis formularios: lo que a la persona le toca llenar y lo que le toca revisar.
   Sale del servidor ya repartido por pestaña (GET /formularios-v2/mis). */

const FILTROS = [
  ['pendientes', 'Pendientes'], ['proceso', 'En proceso'], ['devueltos', 'Devueltos'], ['revisar', 'Por revisar'],
  ['vencidos', 'Vencidos'], ['completados', 'Completados'], ['disponibles', 'Disponibles'],
];
const VACIO = {
  pendientes: 'No tienes nada pendiente.', proceso: 'No tienes nada a medias.', devueltos: 'No te han devuelto nada.', revisar: 'No tienes nada por revisar.',
  vencidos: 'No tienes nada vencido.', completados: 'Todavía no has entregado nada.', disponibles: 'No hay formularios disponibles para ti.',
};

const nombre = (it) => (it.sucursal ? `${it.titulo} · Tienda ${it.sucursal}` : it.titulo);
const preguntas = (n) => `${n} ${n === 1 ? 'pregunta' : 'preguntas'}`;

function datosDe(it, filtro) {
  const v = cuandoVence(it.vence);
  if (filtro === 'disponibles') {
    return { estado: 'disponible', accion: 'Llenar', to: `/formularios/v2/${it.form_id}/llenar`, detalle: `${preguntas(it.preguntas)} · llénalo cuando lo necesites`,
      linea: it.veces ? `Lo has llenado ${it.veces === 1 ? '1 vez' : `${it.veces} veces`}` : 'Sin fecha límite' };
  }
  const to = `/mis-formularios/${it.id}`;
  if (filtro === 'revisar') {
    const r = cuandoVence(it.revisar_antes);
    return { estado: 'revision', etiqueta: 'Por revisar', accion: 'Revisar', to, detalle: `Enviado por ${it.enviada_por?.name} · ${cuando(it.enviada_at)}`,
      linea: it.revisar_antes ? `Revisar ${r.pasada ? 'desde' : 'antes de'} ${r.texto}` : 'Sin plazo', urgente: it.revisar_antes && r.pronto };
  }
  if (filtro === 'completados') {
    const aprobado = it.ultimo?.accion === 'aprobado' ? it.ultimo : null;
    const linea = it.estado === 'revision' ? `En revisión: lo tiene ${it.supervisores?.[0]?.name || 'tu supervisor'}`
      : aprobado ? `Aprobado por ${aprobado.por?.name}` : 'Entregado';
    return { estado: it.estado, accion: 'Ver respuestas', to, detalle: `${cuando(it.enviada_at)}${it.tardia ? ' · entregado tarde' : ''}`, linea, secundario: true };
  }
  if (filtro === 'vencidos') {
    return { estado: 'vencido', accion: it.permite_tarde ? 'Entregar tarde' : 'Ver', to, detalle: `${preguntas(it.preguntas)}`, linea: `Venció ${v.texto} sin entregarse`, urgente: true, secundario: !it.permite_tarde };
  }
  if (filtro === 'devueltos') {
    return { estado: 'devuelto', accion: 'Corregir', to, detalle: `Enviado ${cuando(it.enviada_at)}`, linea: 'Corrígelo y vuelve a enviarlo', comentario: it.ultimo };
  }
  return {
    estado: filtro === 'proceso' ? 'proceso' : 'pendiente', accion: filtro === 'proceso' ? 'Continuar' : 'Empezar', to,
    detalle: preguntas(it.preguntas), linea: it.vence ? `Vence ${v.texto}` : 'Sin fecha límite', urgente: it.vence && v.pronto,
    progreso: filtro === 'proceso' && it.total ? { hechas: it.hechas || 0, total: it.total, guardado: it.guardado_at } : null,
  };
}

function Tarjeta({ it, filtro }) {
  const d = datosDe(it, filtro);
  const [estado, chip] = ENTREGAS[d.estado] || ENTREGAS.pendiente;
  return (
    <article className="rounded-2xl border bg-card px-4 py-3.5 flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-x-4 gap-y-2.5 items-start">
        <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-base font-semibold">{nombre(it)}</h2>
            <span className={`text-xs px-2 py-px rounded-full font-medium ${chip}`}>{d.etiqueta || estado}</span>
          </div>
          <p className="text-[13px] text-muted-foreground">{it.abre ? `Del ${diaCorto(it.abre)} · ` : ''}{d.detalle}</p>
          <p className={`text-[13px] font-medium ${d.urgente ? 'text-[#b42318] dark:text-[#f87171]' : d.estado === 'devuelto' ? 'text-[#8a4b0f] dark:text-[#f5b56b]' : ''}`}>{d.linea}</p>
        </div>
        <Link to={d.to} className={`h-10 px-4 rounded-[10px] border border-[#1e395e] dark:border-[#3cbef6] font-semibold text-sm inline-flex items-center ${d.secundario ? 'text-[#1e395e] dark:text-[#3cbef6] bg-card hover:bg-muted' : 'bg-[#1e395e] hover:bg-[#162c49] text-white dark:bg-[#3cbef6] dark:text-[#0b1424]'}`}>{d.accion}</Link>
      </div>
      {d.progreso && (
        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={d.progreso.total} aria-valuenow={d.progreso.hechas}>
            <div className="h-full bg-[#00a5df]" style={{ width: `${Math.round((d.progreso.hechas / d.progreso.total) * 100)}%` }} />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">Vas en {d.progreso.hechas} de {d.progreso.total}{d.progreso.guardado ? ` · guardado ${haceCuanto(d.progreso.guardado)}` : ''}</span>
        </div>
      )}
      {d.comentario && (
        <div className="rounded-xl bg-muted/50 border px-3 py-2.5 text-[13px]">
          <p className="text-xs text-muted-foreground mb-0.5">{d.comentario.por?.name} lo devolvió:</p>
          <p>«{d.comentario.comentario}»</p>
        </div>
      )}
    </article>
  );
}

export default function MisFormularios() {
  const [params, setParams] = useSearchParams();
  const [mis, setMis] = useState(null);
  useEffect(() => { api.get('/formularios-v2/mis').then(({ data }) => setMis(data)).catch(() => { setMis({}); toast.error('No se pudieron cargar tus formularios'); }); }, []);

  const conAlgo = FILTROS.find(([k]) => mis?.[k]?.length)?.[0];
  const filtro = params.get('tab') || conAlgo || 'pendientes';
  const elegir = (k) => setParams({ tab: k }, { replace: true });

  // lo más urgente arriba: lo que vence hoy o mañana
  const urgente = useMemo(() => {
    const abiertas = [...(mis?.pendientes || []), ...(mis?.proceso || [])].filter((it) => it.vence && cuandoVence(it.vence).pronto);
    return abiertas.sort((a, b) => a.vence.localeCompare(b.vence))[0];
  }, [mis]);

  if (!mis) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;
  const items = mis[filtro] || [];
  return (
    <div className="max-w-[860px] mx-auto pt-2 flex flex-col gap-4">
      <header>
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2"><ClipboardCheck className="h-7 w-7 text-[#00a5df]" /> Mis formularios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Lo que te toca llenar y lo que te toca revisar, en un solo lugar.</p>
      </header>

      {urgente && (
        <Link to={`/mis-formularios/${urgente.id}`} className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 py-3.5 rounded-2xl bg-[#fff3e6] dark:bg-[rgba(236,144,50,0.14)] border border-[#f3d3a8] dark:border-[rgba(236,144,50,0.4)]">
          <span className="h-10 w-10 rounded-xl bg-[#ec9032] text-white grid place-items-center shrink-0"><Clock className="h-5 w-5" /></span>
          <span className="flex-[1_1_240px] min-w-0">
            <span className="block font-semibold">Vence {cuandoVence(urgente.vence).texto}</span>
            <span className="block text-[13px] text-[#6b3d0b] dark:text-[#f5b56b]">{nombre(urgente)}</span>
          </span>
          <span className="h-10 px-4 rounded-[10px] bg-[#1e395e] text-white font-semibold text-sm inline-flex items-center">{urgente.estado === 'proceso' ? 'Continuar' : 'Empezar'}</span>
        </Link>
      )}

      <div role="tablist" aria-label="Estado" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTROS.map(([k, n]) => (
          <button key={k} type="button" role="tab" aria-selected={filtro === k} onClick={() => elegir(k)}
            className={`shrink-0 min-h-[40px] px-3.5 rounded-full text-sm ${filtro === k ? 'border-2 border-[#1e395e] bg-[#1e395e] text-white font-semibold dark:border-[#3cbef6] dark:bg-[#3cbef6] dark:text-[#0b1424]' : 'border bg-card text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted'}`}>
            {n} · {(mis[k] || []).length}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {items.map((it) => <Tarjeta key={it.id || it.form_id} it={it} filtro={filtro} />)}
        {!items.length && <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">{VACIO[filtro]}</div>}
      </div>
      <p className="text-xs text-muted-foreground">Cada persona ve solo lo que le asignaron o lo que le toca revisar. Si es uno por sucursal, le aparece a toda la tienda hasta que alguien lo entregue.</p>
    </div>
  );
}
