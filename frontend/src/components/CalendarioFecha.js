// Selector de fecha de "Nueva actividad" (Agenda): el mismo calendario para un
// solo día y para varios días, igual en todos los navegadores (reemplaza al
// <input type="date"> nativo).
//   - Campo con apariencia de input: la fecha a la izquierda y el ícono de
//     calendario a la derecha; borde celeste mientras el calendario está abierto.
//   - Calendario debajo del campo: mes con flechas, L M M J V S D, 6 semanas,
//     hoy en celeste, días de otros meses atenuados, pie con ayuda y "Hoy".
//   - modo "dia": tocar un día lo elige y cierra.
//   - modo "rango": primer toque = inicio, segundo = fin (cierra solo). Si se
//     cierra sin elegir el último día, queda como un solo día (fin = inicio).
//   - Se cierra tocando fuera o con Escape.
// Fechas como "YYYY-MM-DD" (día de calendario, sin hora ni zona).
import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { MESES } from '@/lib/time';

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const aFecha = (s) => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const aTexto = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// "vie 2 oct 2026"
export function fechaCorta(s) {
  const a = aFecha(s);
  return a ? `${DIA_CORTO[a.getDay()]} ${a.getDate()} ${MES_CORTO[a.getMonth()]} ${a.getFullYear()}` : '';
}

// "14 – vie 16 oct" · "30 sep – vie 2 oct" · "vie 14 – …" mientras falta el último día
export function rangoCorto(inicio, fin) {
  const a = aFecha(inicio);
  const b = aFecha(fin);
  if (!a) return '';
  if (!b) return `${DIA_CORTO[a.getDay()]} ${a.getDate()} – …`;
  const izq = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()}` : `${a.getDate()} ${MES_CORTO[a.getMonth()]}`;
  return `${izq} – ${DIA_CORTO[b.getDay()]} ${b.getDate()} ${MES_CORTO[b.getMonth()]}`;
}

export default function CalendarioFecha({
  modo = 'dia', start, end, onChange, disabled = false, autoOpen = false, onOpenChange, invalido = false, name = 'date', id,
}) {
  const rango = modo === 'rango';
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(() => { const d = aFecha(start) || new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const estado = useRef({ start, end, rango });
  estado.current = { start, end, rango };

  const cambiarAbierto = (v) => {
    if (!v && open) {
      // varios días cerrado sin el último día: queda como un solo día
      const { start: s, end: e, rango: r } = estado.current;
      if (r && s && !e) onChange({ start: s, end: s });
    }
    if (v) { const d = aFecha(start) || new Date(); setMes(new Date(d.getFullYear(), d.getMonth(), 1)); }
    setOpen(v);
    onOpenChange?.(v);
  };

  // al activar "Varios días" se abre solo, para tocar el último día
  useEffect(() => { if (autoOpen && !disabled) cambiarAbierto(true); }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onOpenChange?.(false), []);

  // El calendario tiene su propio ancho (no el del campo, que puede ser angosto)
  // y se alinea a la izquierda o a la derecha del campo para no salirse de la
  // pantalla. Queda dentro del modal (no en un portal), para no cerrarlo al tocar.
  const popRef = useRef(null);
  const [alinearDer, setAlinearDer] = useState(false);
  useEffect(() => {
    if (!open) return;
    const b = btnRef.current?.getBoundingClientRect();
    if (b) {
      const ancho = Math.min(300, window.innerWidth - 16);
      const cont = btnRef.current?.closest('[role="dialog"]');
      const limiteDer = (cont ? cont.getBoundingClientRect().right : window.innerWidth) - 8;
      setAlinearDer(b.left + ancho > limiteDer);
    }
    requestAnimationFrame(() => popRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }, [open]);

  // cerrar al tocar fuera o con Escape
  useEffect(() => {
    if (!open) return undefined;
    const fuera = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) cambiarAbierto(false); };
    const esc = (e) => { if (e.key === 'Escape') { cambiarAbierto(false); btnRef.current?.focus(); } };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tocarDia = (dia) => {
    if (!rango) { onChange({ start: dia, end: dia }); cambiarAbierto(false); return; }
    if (!start || end || dia < start) {   // sin rango, rango completo o antes del inicio: empieza uno nuevo
      onChange({ start: dia, end: '' });
    } else {                              // último día: rango completo y se cierra
      onChange({ start, end: dia });
      estado.current = { start, end: dia, rango };
      setOpen(false); onOpenChange?.(false);
    }
  };
  const irAHoy = () => {
    const hoy = aTexto(new Date());
    setMes(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    if (!rango) { onChange({ start: hoy, end: hoy }); cambiarAbierto(false); return; }
    onChange({ start: hoy, end: '' });
  };

  // 6 semanas (42 días) de lunes a domingo, con los días de los meses vecinos
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const inicioGrilla = new Date(primero);
  inicioGrilla.setDate(1 - ((primero.getDay() + 6) % 7));
  const celdas = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrilla); d.setDate(inicioGrilla.getDate() + i);
    return { dia: aTexto(d), num: d.getDate(), otroMes: d.getMonth() !== mes.getMonth() };
  });
  const hoy = aTexto(new Date());
  const esperandoFin = rango && !!start && !end;
  const texto = rango ? rangoCorto(start, end) : fechaCorta(start);
  const ayuda = !rango ? 'Elegí el día' : (esperandoFin ? 'Tocá el último día' : 'Tocá un día para cambiar el rango');

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name={name} value={start || ''} />
      {rango && <input type="hidden" name={`${name}_fin`} value={end || ''} />}
      <button ref={btnRef} id={id} type="button" disabled={disabled} onClick={() => cambiarAbierto(!open)}
        aria-haspopup="dialog" aria-expanded={open} aria-invalid={invalido || undefined}
        className={`flex h-11 w-full items-center gap-2 rounded-md border bg-transparent px-3 text-left text-base md:text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00a5df] disabled:cursor-not-allowed disabled:opacity-50 ${
          invalido ? 'border-[#dc2626] ring-1 ring-[#dc2626]' : open ? 'border-[#00a5df] ring-1 ring-[#00a5df]' : 'border-input'}`}
        data-testid={rango ? 'activity-form-date-range' : 'activity-form-date-picker'}>
        <span className={`min-w-0 flex-1 truncate ${!texto || esperandoFin ? 'text-muted-foreground' : ''}`}>{texto || (rango ? 'Elegir días' : 'Elegir fecha')}</span>
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div ref={popRef} role="dialog" aria-label={rango ? 'Elegir días' : 'Elegir fecha'}
          className={`absolute z-50 mt-1.5 rounded-2xl border bg-popover p-3 text-popover-foreground shadow-xl ${alinearDer ? 'right-0' : 'left-0'}`}
          style={{ width: 'min(300px, calc(100vw - 1rem))' }}
          data-testid="date-calendar">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mes anterior"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize">{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
            <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Mes siguiente"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground">
            {DIAS_SEMANA.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {celdas.map(({ dia, num, otroMes }) => {
              const fin = rango ? end : start;
              const extremo = dia === start || dia === fin;
              const dentro = rango && start && end && dia > start && dia < end;
              // tramo continuo: fondo suave también detrás de los extremos
              const tramoIzq = rango && end && dia === end && start !== end;
              const tramoDer = rango && end && dia === start && start !== end;
              return (
                <button key={dia} type="button" onClick={() => tocarDia(dia)} aria-pressed={extremo}
                  aria-label={fechaCorta(dia)}
                  className={`relative h-10 text-sm md:h-9 ${dentro ? 'bg-[rgba(0,165,223,0.14)]' : ''} ${tramoIzq ? 'bg-gradient-to-r from-[rgba(0,165,223,0.14)] to-transparent' : ''} ${tramoDer ? 'bg-gradient-to-l from-[rgba(0,165,223,0.14)] to-transparent' : ''}`}
                  data-testid="calendar-day">
                  <span className={`mx-auto grid h-9 w-9 place-items-center rounded-full transition-colors md:h-8 md:w-8 ${
                    extremo ? 'bg-[#00a5df] font-semibold text-white'
                      : dia === hoy ? 'font-bold text-[#00a5df] hover:bg-muted'
                        : otroMes ? 'text-muted-foreground/45 hover:bg-muted' : 'hover:bg-muted'}`}>
                    {num}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="text-[11px] text-muted-foreground">{ayuda}</span>
            <button type="button" onClick={irAHoy} className="text-xs font-semibold text-[#00a5df] hover:underline" data-testid="calendar-today">Hoy</button>
          </div>
        </div>
      )}
    </div>
  );
}
