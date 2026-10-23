import React, { useState, useEffect, useLayoutEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, HelpCircle, Route as RouteIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useEsMovil from '@/lib/useEsMovil';
import { useVistos } from '@/lib/novedades';

/* Recorridos guiados: oscurecen la pantalla, resaltan una parte real (un
   elemento con data-tour='…') y la explican con un globo, paso a paso.
   pasos = [{ ruta?, target?, titulo, texto }]: con `ruta` el recorrido lleva
   a esa pantalla y espera a que cargue (recorrido completo, de pantalla en
   pantalla); sin `target`, o si no aparece, el globo va al centro.
   - De una pantalla: <Tour tour={useTour('tour-…')} pasos={…} /> y el botón
     <BotonTour> para repetirlo.
   - Completo: <RecorridoProvider> en el layout; se arranca con iniciar(pasos, clave). */

// El elemento visible con data-tour (puede haber dos: menú de PC y de celular).
function buscar(target) {
  if (!target) return null;
  return [...document.querySelectorAll(`[data-tour="${target}"]`)].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) || null;
}

const PAD = 6;
const ANCHO = 340;
const ESPERA_MAX = 4000; // ms que se espera a que aparezca el elemento de una pantalla nueva

function Globo({ pasos, onCerrar }) {
  const esMovil = useEsMovil();
  const navigate = useNavigate();
  const location = useLocation();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const paso = pasos[i];

  const medir = useCallback(() => {
    const el = buscar(paso?.target);
    if (!el) { setRect(null); return false; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
    return true;
  }, [paso]);

  // ir a la pantalla del paso
  useEffect(() => {
    if (paso?.ruta && location.pathname !== paso.ruta) navigate(paso.ruta);
  }, [paso, location.pathname, navigate]);

  // esperar a que aparezca el elemento, llevarlo a la vista y resaltarlo
  useLayoutEffect(() => {
    if (!paso) return undefined;
    let vivo = true;
    const inicio = Date.now();
    setRect(null);
    setBuscando(!!paso.target);
    const intento = () => {
      if (!vivo) return;
      if (paso.ruta && window.location.pathname !== paso.ruta) { setTimeout(intento, 150); return; }
      const el = buscar(paso.target);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 80 || r.bottom > window.innerHeight - 200) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        medir();
        setTimeout(() => { if (vivo) { medir(); setBuscando(false); } }, 350);
      } else if (paso.target && Date.now() - inicio < ESPERA_MAX) {
        setTimeout(intento, 200);
      } else {
        setBuscando(false); // no está en pantalla: globo al centro
      }
    };
    intento();
    return () => { vivo = false; };
  }, [paso, medir]);

  useEffect(() => {
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    const tecla = (e) => {
      if (e.key === 'Escape') onCerrar();
      if (e.key === 'ArrowRight') setI((x) => Math.min(x + 1, pasos.length - 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(x - 1, 0));
    };
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); window.removeEventListener('keydown', tecla); };
  }, [medir, onCerrar, pasos.length]);

  if (!paso) return null;
  const ultimo = i === pasos.length - 1;

  // Posición del globo: debajo del elemento si cabe, si no arriba; en celular, abajo fijo.
  let estilo;
  if (esMovil) {
    estilo = { left: 16, right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' };
  } else if (!rect) {
    estilo = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: ANCHO };
  } else {
    const abajo = window.innerHeight - (rect.top + rect.height);
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - ANCHO - 16);
    estilo = abajo > 230
      ? { top: rect.top + rect.height + 12, left, width: ANCHO }
      : { top: Math.max(16, rect.top - 12), left, width: ANCHO, transform: 'translateY(-100%)' };
  }

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={paso.titulo} data-testid="tour">
      {rect ? (
        <div className="fixed rounded-xl transition-all duration-200 pointer-events-none ring-2 ring-[#00a5df]"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height, boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)' }} />
      ) : <div className="fixed inset-0 bg-[rgba(15,23,42,0.6)]" />}
      {buscando ? (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-popover p-3 shadow-xl">
          <Loader2 className="h-5 w-5 animate-spin text-[#00a5df]" />
        </div>
      ) : (
        <div className="fixed rounded-[18px] border bg-popover text-popover-foreground shadow-2xl p-5" style={estilo}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#00a5df]">
              {paso.etapa ? `${paso.etapa} · ` : ''}Paso {i + 1} de {pasos.length}
            </p>
            <button type="button" onClick={onCerrar} aria-label="Cerrar recorrido" className="-mt-1 -mr-1 h-7 w-7 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <h3 className="font-heading text-lg font-semibold mt-1">{paso.titulo}</h3>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-line">{paso.texto}</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex gap-1 flex-1 flex-wrap">
              {pasos.length <= 16 && pasos.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-[#00a5df]' : 'w-1.5 bg-muted-foreground/30'}`} />)}
            </div>
            {i > 0 && <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setI(i - 1)}>Atrás</Button>}
            <Button size="sm" className="rounded-lg bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="tour-siguiente"
              onClick={() => (ultimo ? onCerrar() : setI(i + 1))}>
              {ultimo ? 'Terminar' : 'Siguiente'}
            </Button>
          </div>
          {!ultimo && (
            <button type="button" onClick={onCerrar} className="mt-2 text-xs text-muted-foreground hover:text-foreground">Saltar recorrido</button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── Recorrido completo (de pantalla en pantalla) ─────────────────
const RecorridoCtx = createContext({ activo: false, iniciar: () => {} });
export const useRecorrido = () => useContext(RecorridoCtx);

export function RecorridoProvider({ children }) {
  const { marcar } = useVistos();
  const [actual, setActual] = useState(null); // { pasos, claves }
  const iniciar = useCallback((pasos, claves = []) => { if (pasos?.length) setActual({ pasos, claves }); }, []);
  const cerrar = useCallback(() => {
    if (actual?.claves.length) marcar(actual.claves);
    setActual(null);
  }, [actual, marcar]);
  return (
    <RecorridoCtx.Provider value={{ activo: !!actual, iniciar }}>
      {children}
      {actual && <Globo pasos={actual.pasos} onCerrar={cerrar} />}
    </RecorridoCtx.Provider>
  );
}

// ── Recorrido de una pantalla ────────────────────────────────────
// Se abre solo la primera vez cuando `listo` (salvo auto=false o si hay un
// recorrido completo en curso).
export function useTour(clave, listo = true, { auto = true } = {}) {
  const { vistos, marcar, listo: hayUsuario } = useVistos();
  const { activo: recorrido } = useRecorrido();
  const [abierto, setAbierto] = useState(false);
  const visto = vistos.includes(clave);
  useEffect(() => {
    if (!auto || !listo || !hayUsuario || visto || recorrido) return undefined;
    const t = setTimeout(() => setAbierto(true), 700); // que la pantalla termine de cargar
    return () => clearTimeout(t);
  }, [auto, listo, hayUsuario, visto, recorrido]);
  const cerrar = useCallback(() => { setAbierto(false); marcar(clave); }, [marcar, clave]);
  return { abierto, abrir: () => setAbierto(true), cerrar };
}

export default function Tour({ tour, pasos }) {
  if (!tour.abierto || !pasos.length) return null;
  return <Globo pasos={pasos} onCerrar={tour.cerrar} />;
}

// Botón para repetir el recorrido de la pantalla.
export function BotonTour({ tour, className = '' }) {
  return (
    <Button variant="ghost" size="sm" onClick={tour.abrir} className={`rounded-xl text-muted-foreground hover:text-foreground ${className}`} data-testid="tour-repetir">
      <HelpCircle className="h-4 w-4 mr-1.5" /> ¿Cómo funciona?
    </Button>
  );
}

// Botón para el recorrido completo.
export function BotonRecorrido({ onClick, className = '' }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className={`rounded-xl ${className}`} data-testid="recorrido-completo">
      <RouteIcon className="h-4 w-4 mr-1.5 text-[#00a5df]" /> Recorrido completo
    </Button>
  );
}
