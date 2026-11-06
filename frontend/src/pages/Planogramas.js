import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Box, Footprints, LayoutPanelTop, Loader2, Map as MapIcon, Maximize2, Search } from 'lucide-react';
import api from '@/lib/api';
import { PROMO_TIENDAS } from '@/lib/constants';
import { Button } from '@/components/ui/button';

const VISTAS_PLANOGRAMA = ['general', 'planta', 'entrada', 'pasillo', 'cajas', 'maquinas', 'bodega', 'mezz', 'cliente'];
const ATAJOS = [
  { vista: 'general', titulo: 'Vista 3D', detalle: 'Toda la tienda', icon: Box },
  { vista: 'planta', titulo: 'Planta', detalle: 'Vista desde arriba', icon: LayoutPanelTop },
  { vista: 'cliente', titulo: 'Modo cliente', detalle: 'Recorrer pasillos', icon: Footprints },
];

const numero = (n) => (n ?? 0).toLocaleString('es-HN');
const lempiras = (v) => (v >= 1e6 ? `L ${(v / 1e6).toFixed(2)} M` : v >= 1e3 ? `L ${Math.round(v / 1e3)} k` : `L ${numero(v)}`);
const fecha = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-HN', { day: 'numeric', month: 'long', year: 'numeric' });
};
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Dibujo de la planta de cada local (vista desde arriba), para reconocerlo antes de abrirlo
function PlantaIngcoLocal02({ className }) {
  return (
    <svg viewBox="-10 -10 162 237" className={className} role="img" aria-label="Planta de la Tienda INGCO Local 02">
      <path d="M0 217 L0 102.6 L84.4 102.6 L84.4 0 L141.6 0 L141.6 217 Z" className="fill-white dark:fill-[#1b2433] stroke-[#1e395e] dark:stroke-[#93c5fd]" strokeWidth="2.4" />
      <line x1="84.4" y1="102.6" x2="141.6" y2="102.6" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" />
      <text x="113" y="50" fontSize="7" fill="#64748b" textAnchor="middle">Bodega</text>
      <rect x="2" y="104" width="4" height="108" fill="#5d6b7a" />
      <rect x="6" y="104" width="76" height="4" fill="#7b5cc4" />
      <rect x="137" y="104" width="3.5" height="108" fill="#d68910" />
      <rect x="23" y="120" width="64" height="9.5" rx="1.5" fill="#e09a1f" />
      <rect x="23" y="144" width="64" height="9.5" rx="1.5" fill="#2f6fb5" />
      <rect x="23" y="168" width="64" height="9.5" rx="1.5" fill="#3a9a5c" />
      <rect x="23" y="192" width="64" height="9.5" rx="1.5" fill="#c0392b" />
      <rect x="107" y="138" width="10" height="20" rx="1.5" fill="#7b5cc4" />
      <rect x="108" y="58" width="10" height="40" rx="1.5" fill="#b5651d" />
      <rect x="104" y="112" width="18" height="9.5" rx="1.5" fill="#1f8a9a" />
      <rect x="104" y="88" width="18" height="9.5" rx="1.5" fill="#3a9a5c" opacity="0.9" />
      <rect x="118" y="196" width="10" height="16" rx="1.5" fill="#1d2430" />
      <line x1="0" y1="217" x2="141.6" y2="217" stroke="#00a5df" strokeWidth="3" />
      <text x="70.8" y="226" fontSize="6.5" textAnchor="middle" fontWeight="600" className="fill-[#1e395e] dark:fill-[#93c5fd]">Fachada · 14.46 m</text>
    </svg>
  );
}
const PLANTAS = { 'ingco-local-02': PlantaIngcoLocal02 };

function TarjetaPlanograma({ p, i }) {
  const Planta = PLANTAS[p.id];
  const url = (vista) => `/planogramas/${p.id}${vista && vista !== 'general' ? `?vista=${vista}` : ''}`;
  const d = p.datos || {};
  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay: i * 0.05 }}
        className="flex flex-wrap rounded-[22px] bg-card border shadow-card overflow-hidden" data-testid={`planograma-${p.id}`}>
        <Link to={url()} className="relative flex-[1_1_340px] min-w-0 min-h-[300px] sm:min-h-[400px] grid place-items-center bg-[#e9edf3] dark:bg-[#111827] p-5"
          aria-label={`Abrir ${p.nombre}`}>
          {Planta ? <Planta className="h-[260px] sm:h-[360px] max-w-full" /> : <MapIcon className="h-16 w-16 text-muted-foreground/50" />}
          <span className="absolute left-4 top-4 rounded-full bg-white dark:bg-card px-3 py-1.5 text-xs font-semibold text-[#1e395e] dark:text-[#93c5fd]">Vista previa de la planta</span>
        </Link>
        <div className="flex-[1_1_400px] min-w-0 p-5 sm:p-7 flex flex-col gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap gap-1.5">
              {p.marca && <span className="rounded-full bg-[#e6edf6] dark:bg-[rgba(147,197,253,0.14)] px-2.5 py-1 text-xs font-semibold text-[#1e395e] dark:text-[#93c5fd]">{p.marca}</span>}
              {(p.local || p.area_m2) && (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{[p.local, p.area_m2 ? `${p.area_m2} m²` : ''].filter(Boolean).join(' · ')}</span>
              )}
            </div>
            <h2 className="font-heading text-2xl sm:text-[28px] font-semibold">{p.nombre}</h2>
            <p className="text-sm text-muted-foreground">{p.descripcion}{p.actualizado ? ` Actualizado el ${fecha(p.actualizado)}.` : ''}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {[['Productos', numero(d.productos)], ['Unidades', numero(d.unidades)], ['Valor exhibido', lempiras(d.valor)], ['Cámaras', numero(d.camaras)]].map(([k, v]) => (
              <div key={k} className="rounded-[14px] bg-muted/60 px-3 py-2.5">
                <p className="font-heading text-xl font-semibold tabular-nums whitespace-nowrap">{v}</p>
                <p className="text-xs text-muted-foreground">{k}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Entrar directo a</p>
            <div className="grid grid-cols-3 gap-2">
              {ATAJOS.map((a) => (
                <Link key={a.vista} to={url(a.vista)} data-testid={`planograma-atajo-${a.vista}`}
                  className="flex flex-col items-center sm:items-start gap-1 rounded-[14px] border px-2 py-3 sm:p-3 hover:bg-muted/60 transition-colors">
                  <a.icon className="h-5 w-5 text-[#1e395e] dark:text-[#93c5fd]" />
                  <span className="text-[13px] sm:text-sm font-semibold text-center sm:text-left">{a.titulo}</span>
                  <span className="hidden sm:block text-xs text-muted-foreground">{a.detalle}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-auto">
            <Button asChild className="h-12 w-full sm:w-auto rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white px-6 text-[15px]" data-testid="planograma-abrir">
              <Link to={url()}>Abrir planograma <ArrowRight className="h-4 w-4 ml-2" /></Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {(p.zonas || []).length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-heading text-xl font-semibold">Qué hay en la tienda</h3>
            <span className="text-sm text-muted-foreground">Toca una zona para abrirla en el 3D</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {p.zonas.map((z) => (
              <Link key={z.nombre} to={url(z.vista)} data-testid="planograma-zona"
                className="flex items-center gap-3 rounded-[16px] border bg-card p-3.5 hover:shadow-cardmd hover:-translate-y-0.5 transition-[transform,box-shadow]">
                <span className="h-10 w-10 shrink-0 rounded-xl" style={{ background: z.color }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{z.nombre}</span>
                  <span className="block text-xs text-muted-foreground">{z.detalle}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Planogramas: maquetas 3D de tiendas. Solo lo ve quien tiene el módulo
   «Planogramas» (se da persona por persona). */
export default function Planogramas() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    api.get('/planogramas').then(({ data }) => setLista(data))
      .catch((e) => setError(e?.response?.data?.detail || 'No se pudieron cargar los planogramas'));
  }, []);
  const filtro = sinAcentos(q.trim());
  const visibles = useMemo(() => (lista || []).filter((p) => !filtro || sinAcentos(
    [p.nombre, p.marca, p.local, p.descripcion, ...(p.zonas || []).flatMap((z) => [z.nombre, z.detalle])].join(' '),
  ).includes(filtro)), [lista, filtro]);
  // tiendas sin planograma todavía
  const otras = Object.values(PROMO_TIENDAS)
    .filter((t) => !(lista || []).some((p) => sinAcentos(p.nombre).includes(sinAcentos(t))))
    .filter((t) => !filtro || sinAcentos(t).includes(filtro));

  return (
    <div className="max-w-[1120px] mx-auto pt-2 pb-8 space-y-6" data-testid="planogramas">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <MapIcon className="h-7 w-7 text-[#1e395e] dark:text-[#93c5fd]" /> Planogramas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Cómo está montada cada tienda: muebles, productos, precios y equipos según planos.</p>
        </div>
        <label className="flex h-11 w-full sm:w-[300px] items-center gap-2 rounded-xl border bg-card px-3.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tienda o zona"
            aria-label="Buscar tienda o zona" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="planogramas-buscar" />
        </label>
      </div>

      {error && <p className="text-sm text-muted-foreground text-center py-10">{error}</p>}
      {!error && !lista && <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>}
      {lista && visibles.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center text-sm text-muted-foreground">
          {lista.length ? 'Ningún planograma coincide con la búsqueda.' : 'Todavía no hay planogramas.'}
        </div>
      )}

      {visibles.map((p, i) => <TarjetaPlanograma key={p.id} p={p} i={i} />)}

      {lista && otras.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-xl font-semibold">Otras tiendas</h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {otras.map((t) => (
              <div key={t} className="rounded-[16px] border-[1.5px] border-dashed border-[#c7cfdb] dark:border-white/20 p-4">
                <p className="text-sm font-semibold text-foreground/80">{t}</p>
                <p className="text-xs text-muted-foreground">Sin planograma todavía</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Un planograma: la maqueta se carga con la sesión de la persona y se muestra
// aislada en un marco (sin acceso a la app). ?vista= abre en esa vista.
export function PlanogramaVer() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const vista = VISTAS_PLANOGRAMA.includes(params.get('vista')) ? params.get('vista') : '';
  const [html, setHtml] = useState(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState(null);
  // carga en dos partes: bajar el planograma (avance real, hasta 60 %) y
  // armar la maqueta 3D dentro del marco (avanza solo hasta que termina)
  const [avance, setAvance] = useState(0);
  const [listo, setListo] = useState(false);
  const marco = useRef(null);
  useEffect(() => {
    if (!html || listo) return undefined;
    const t = setInterval(() => setAvance((a) => Math.min(95, a + (95 - a) * 0.08)), 200);
    return () => clearInterval(t);
  }, [html, listo]);
  useEffect(() => {
    setHtml(null); setError(null); setAvance(0); setListo(false);
    api.get(`/planogramas/${id}`, {
      responseType: 'text', transformResponse: (d) => d,
      onDownloadProgress: (e) => { if (e.total) setAvance(Math.round((e.loaded / e.total) * 60)); },
    })
      .then(({ data }) => { setAvance((a) => Math.max(a, 60)); setHtml(data); })
      .catch((e) => {
        let msg = 'No se pudo abrir el planograma';
        try { msg = JSON.parse(e?.response?.data || '{}').detail || msg; } catch (_) { /* respuesta sin JSON */ }
        setError(msg);
      });
    api.get('/planogramas').then(({ data }) => setNombre((data.find((p) => p.id === id) || {}).nombre || '')).catch(() => {});
  }, [id]);
  // otra vista del mismo planograma: el marco se arma de nuevo
  const vistaAnterior = useRef(vista);
  useEffect(() => {
    if (vistaAnterior.current === vista) return;
    vistaAnterior.current = vista;
    setListo(false); setAvance(60);
  }, [vista]);
  // la vista pedida va como una variable al principio del planograma
  const doc = useMemo(() => {
    if (!html || !vista) return html;
    const aviso = `<script>window.__VISTA=${JSON.stringify(vista)};</script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + aviso) : aviso + html;
  }, [html, vista]);
  const ampliar = () => {
    const el = marco.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };
  return (
    <div className="max-w-[1400px] mx-auto pt-2 flex flex-col gap-3" data-testid="planograma-ver">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link to="/planogramas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> Planogramas
          </Link>
          {nombre && <h1 className="font-heading text-xl font-semibold truncate">{nombre}</h1>}
        </div>
        {html && (
          <Button variant="outline" size="sm" className="rounded-xl shrink-0" onClick={ampliar} data-testid="planograma-ampliar">
            <Maximize2 className="h-4 w-4 mr-1.5" /> Pantalla completa
          </Button>
        )}
      </div>
      <div className="relative rounded-[18px] border bg-card shadow-card overflow-hidden h-[calc(100dvh-11rem)] min-h-[460px]">
        {error && <p className="text-sm text-muted-foreground text-center py-16">{error}</p>}
        {doc && (
          <iframe key={vista} ref={marco} title={nombre || 'Planograma'} srcDoc={doc} sandbox="allow-scripts allow-popups"
            allow="fullscreen" onLoad={() => { setAvance(100); setTimeout(() => setListo(true), 350); }}
            className="block h-full w-full border-0 bg-[#eef0f3]" data-testid="planograma-marco" />
        )}
        {!error && !listo && (
          <div className="absolute inset-0 grid place-items-center bg-card" role="status" aria-live="polite" data-testid="planograma-cargando">
            <div className="w-[min(320px,80%)] text-center">
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-foreground mb-3">
                <Loader2 className="h-4 w-4 animate-spin text-[#1e395e] dark:text-[#93c5fd]" />
                {html ? 'Armando la maqueta 3D…' : 'Cargando planograma…'}
              </p>
              <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(avance)}>
                <div className="h-full rounded-full bg-[#1e395e] dark:bg-[#93c5fd] transition-[width] duration-200 ease-out" style={{ width: `${Math.max(4, avance)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground tabular-nums">{Math.round(avance)} %</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
