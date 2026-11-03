import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { fmtHora, getTimeFormat } from '@/lib/time';
import { cn } from '@/lib/utils';

// Selector de hora según el formato que la persona eligió en Configuración:
// 12 horas, reloj de manecillas; 24 horas, ruedas de hora y minutos (en PC y en
// el teléfono). El campo nativo del navegador seguía el formato del equipo y
// mostraba a. m./p. m. a quien había elegido 24 horas.
// value y onChange van en "HH:MM" (24 h), igual que un <input type="time">.
// Se ve como el calendario de fechas (CalendarioFecha) y, como él, queda dentro
// del modal (no en un portal): en un portal el modal bloquea girar y arrastrar.
const dos = (n) => String(n).padStart(2, '0');
// "11:00" -> "12:00" (sin pasar de 23:59): el fin por defecto al elegir el inicio
export const unaHoraDespues = (hhmm) => {
  const [h, m] = (hhmm || '09:00').split(':').map(Number);
  const t = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${dos(Math.floor(t / 60))}:${dos(t % 60)}`;
};
const AZUL = 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]';

const ALTO = 40; // alto de cada fila de la rueda (px)
const VISIBLES = 5;
const DIAL = 232; const RADIO = 96;
const pos = (n) => { const a = (n / 12) * 2 * Math.PI; return { left: DIAL / 2 + RADIO * Math.sin(a), top: DIAL / 2 - RADIO * Math.cos(a) }; };

// ---------- 24 horas: ruedas ----------
function Rueda({ items, indice, onIndice, etiqueta }) {
  const ref = useRef(null);
  const espera = useRef(null);
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = indice * ALTO; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(espera.current), []);
  const ir = (i) => {
    const j = Math.max(0, Math.min(items.length - 1, i));
    ref.current?.scrollTo({ top: j * ALTO, behavior: 'smooth' });
    onIndice(j);
  };
  // mientras gira se marca la fila del centro; al soltar queda elegida
  const alMover = () => {
    const el = ref.current; if (!el) return;
    const i = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ALTO)));
    if (i !== indice) onIndice(i);
    clearTimeout(espera.current);
    espera.current = setTimeout(() => { if (Math.abs(el.scrollTop - i * ALTO) > 1) el.scrollTo({ top: i * ALTO, behavior: 'smooth' }); }, 120);
  };
  return (
    <div ref={ref} role="listbox" aria-label={etiqueta} tabIndex={0} onScroll={alMover}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); ir(indice + 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); ir(indice - 1); }
      }}
      className="relative z-10 w-14 overflow-y-auto overscroll-contain snap-y snap-mandatory touch-pan-y rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00a5df]"
      style={{ height: ALTO * VISIBLES, paddingBlock: ALTO * Math.floor(VISIBLES / 2) }}>
      {items.map((it, i) => {
        const d = Math.abs(i - indice);
        return (
          <div key={it} role="option" aria-selected={i === indice} onClick={() => ir(i)}
            className={cn('snap-center grid place-items-center cursor-pointer select-none tabular-nums transition-colors',
              i === indice ? 'text-lg font-semibold text-[#1e395e] dark:text-[#3cbef6]' : d === 1 ? 'text-base text-muted-foreground' : 'text-sm text-muted-foreground/50')}
            style={{ height: ALTO }}>
            {it}
          </div>
        );
      })}
    </div>
  );
}

function Ruedas({ H, M, setH, setM }) {
  return (
    <div className="relative flex items-center justify-center gap-1">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 rounded-xl bg-[rgba(0,165,223,0.14)]" style={{ top: ALTO * 2, height: ALTO }} />
      <Rueda etiqueta="Hora" items={Array.from({ length: 24 }, (_, i) => dos(i))} indice={H} onIndice={setH} />
      <span className="relative z-10 text-lg font-semibold text-muted-foreground">:</span>
      <Rueda etiqueta="Minutos" items={Array.from({ length: 60 }, (_, i) => dos(i))} indice={M} onIndice={setM} />
    </div>
  );
}

// ---------- 12 horas: reloj ----------
// Horas del 1 al 12 (al elegir 12 queda en p. m., mediodía); minutos marcados
// de 5 en 5, pero al arrastrar se puede dejar cualquiera.
function Reloj({ H, M, setH, setM, modo, setModo }) {
  const ref = useRef(null);
  const arrastrando = useRef(false);
  const pm = H >= 12;
  const elegir = (e, soltar) => {
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2); const dy = e.clientY - (r.top + r.height / 2);
    const ang = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    if (modo === 'h') {
      const i = Math.round(ang / 30) % 12;
      setH(i === 0 ? 12 : i + (pm ? 12 : 0));
      if (soltar) setModo('m');
    } else {
      setM(Math.round(ang / 6) % 60);
    }
  };
  const h12 = (H % 12) || 12;
  const marcas = modo === 'h'
    ? Array.from({ length: 12 }, (_, i) => ({ v: i || 12, n: i, label: String(i || 12) }))
    : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, n: i, label: dos(i * 5) }));
  const actual = modo === 'h' ? h12 : M;
  const angMano = modo === 'h' ? ((H % 12) / 12) * 360 : (M / 60) * 360;
  const sobreMarca = modo === 'h' || M % 5 === 0;
  const segmento = (activo) => cn('rounded-lg px-2 py-0.5', activo ? 'bg-[rgba(0,165,223,0.14)] text-[#1e395e] dark:text-[#3cbef6]' : 'text-muted-foreground');
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-baseline gap-1 font-heading text-4xl font-semibold tabular-nums">
          <button type="button" onClick={() => setModo('h')} aria-pressed={modo === 'h'} className={segmento(modo === 'h')}>{dos(h12)}</button>
          <span className="text-muted-foreground">:</span>
          <button type="button" onClick={() => setModo('m')} aria-pressed={modo === 'm'} className={segmento(modo === 'm')}>{dos(M)}</button>
        </div>
        <div className="ml-1 flex flex-col overflow-hidden rounded-lg border text-xs font-semibold">
          {[['a. m.', false], ['p. m.', true]].map(([t, p]) => (
            <button key={t} type="button" onClick={() => setH((H % 12) + (p ? 12 : 0))} aria-pressed={pm === p}
              className={cn('px-2 py-1', pm === p ? AZUL : 'text-muted-foreground')}>{t}</button>
          ))}
        </div>
      </div>
      <div ref={ref} role="group" aria-label={modo === 'h' ? 'Elegir la hora en el reloj' : 'Elegir los minutos en el reloj'}
        className="relative touch-none select-none rounded-full bg-muted/70" style={{ width: DIAL, height: DIAL }}
        onPointerDown={(e) => { arrastrando.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); elegir(e, false); }}
        onPointerMove={(e) => { if (arrastrando.current) elegir(e, false); }}
        onPointerUp={(e) => { if (arrastrando.current) { arrastrando.current = false; elegir(e, true); } }}
        onPointerCancel={() => { arrastrando.current = false; }}>
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1e395e] dark:bg-[#3cbef6]" />
        <div className="absolute left-1/2 top-1/2 w-0.5 origin-bottom bg-[#1e395e] dark:bg-[#3cbef6]"
          style={{ height: RADIO, transform: `translate(-50%, -100%) rotate(${angMano}deg)` }} />
        {!sobreMarca && <div className={cn('absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full', AZUL)} style={pos((M / 60) * 12)} />}
        {marcas.map((k) => (
          <span key={k.v} className={cn('absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-sm font-medium tabular-nums',
            k.v === actual && sobreMarca ? AZUL : 'text-foreground')} style={pos(k.n)}>{k.label}</span>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{modo === 'h' ? 'Toca o arrastra para elegir la hora' : 'Toca o arrastra para elegir los minutos'}</p>
    </div>
  );
}

const aHM = (hhmm) => {
  const [h, m] = (hhmm && /^\d{1,2}:\d{2}/.test(hhmm) ? hhmm : '09:00').split(':').map(Number);
  return { H: h, M: m };
};

export default function SelectorHora({ value, onChange, id, disabled, className, invalido, placeholder = 'Elegir hora', ...rest }) {
  const [abierto, setAbierto] = useState(false);
  const h12 = getTimeFormat() === '12h';
  const [sel, setSel] = useState(() => aHM(value));
  const [modo, setModo] = useState('h');
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [alinearDer, setAlinearDer] = useState(false);
  // Lo elegido se guarda con Guardar y también al cerrar tocando fuera o el
  // campo; solo Cancelar y Escape lo descartan.
  const ultimo = useRef({});
  ultimo.current = { sel, value, onChange };
  const confirmar = () => {
    const { sel: s, value: v, onChange: cb } = ultimo.current;
    const nuevo = `${dos(s.H)}:${dos(s.M)}`;
    if (nuevo !== v) cb?.(nuevo);
    setAbierto(false);
  };
  const tocarCampo = () => { if (abierto) { confirmar(); return; } setSel(aHM(value)); setModo('h'); setAbierto(true); };

  // se alinea a la izquierda o a la derecha del campo para no salirse del modal
  useEffect(() => {
    if (!abierto) return;
    const b = btnRef.current?.getBoundingClientRect();
    if (b) {
      const cont = btnRef.current?.closest('[role="dialog"]');
      const limiteDer = (cont ? cont.getBoundingClientRect().right : window.innerWidth) - 8;
      setAlinearDer(b.left + Math.min(h12 ? 300 : 248, window.innerWidth - 16) > limiteDer);
    }
    requestAnimationFrame(() => popRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [abierto, h12]);
  // tocar fuera guarda y cierra; Escape cierra sin guardar
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) confirmar(); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', esc, true);
    };
  }, [abierto]); // eslint-disable-line react-hooks/exhaustive-deps

  const setH = (H) => setSel((s) => ({ ...s, H: typeof H === 'function' ? H(s.H) : H }));
  const setM = (M) => setSel((s) => ({ ...s, M }));
  const guardar = () => { confirmar(); btnRef.current?.focus(); };

  return (
    <div ref={wrapRef} className="relative">
      <button ref={btnRef} type="button" id={id} disabled={disabled} onClick={tocarCampo}
        aria-haspopup="dialog" aria-expanded={abierto} aria-invalid={invalido || undefined} {...rest}
        className={cn('flex h-11 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-base md:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00a5df] disabled:cursor-not-allowed disabled:opacity-50',
          invalido ? 'border-[#dc2626] ring-1 ring-[#dc2626]' : abierto ? 'border-[#00a5df] ring-1 ring-[#00a5df]' : 'border-input', className)}>
        <span className={cn('min-w-0 flex-1 truncate tabular-nums', !value && 'text-muted-foreground')}>{value ? fmtHora(value) : placeholder}</span>
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {abierto && (
        <div ref={popRef} role="dialog" aria-label="Elegir hora"
          className={cn('absolute z-50 mt-1.5 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl', alinearDer ? 'right-0' : 'left-0')}
          style={{ width: `min(${h12 ? 300 : 248}px, calc(100vw - 1rem))` }} data-testid="selector-hora">
          <p className="mb-2 text-center text-sm font-semibold">Elegir hora</p>
          {h12
            ? <Reloj H={sel.H} M={sel.M} setH={setH} setM={setM} modo={modo} setModo={setModo} />
            : <Ruedas H={sel.H} M={sel.M} setH={setH} setM={setM} />}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <button type="button" onClick={() => setAbierto(false)} className="text-xs font-semibold text-muted-foreground hover:underline">Cancelar</button>
            <button type="button" onClick={guardar} data-testid="selector-hora-guardar"
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold hover:opacity-90', AZUL)}>Guardar</button>
          </div>
        </div>
      )}
    </div>
  );
}
