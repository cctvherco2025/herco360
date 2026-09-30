// Selector de rango de fechas para actividades de VARIOS DÍAS ("Nueva
// actividad" en Agenda). Un campo del mismo tamaño que el input de fecha; al
// tocarlo abre un calendario flotante debajo:
//   - Se toca el PRIMER día y luego el ÚLTIMO; el rango se resalta (extremos
//     en celeste, días intermedios en celeste suave).
//   - Al elegir el último día el calendario se cierra solo.
//   - Si se toca un día anterior al inicio, pasa a ser el nuevo inicio.
//   - Con un rango ya elegido, tocar un día empieza un rango nuevo.
//   - Se cierra al tocar fuera.
// Fechas como "YYYY-MM-DD" (día de calendario, sin hora ni zona).
import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MESES } from '@/lib/time';

const DIAS_SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const aFecha = (s) => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const aTexto = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// "20 – jue 22 oct" (mismo mes) · "30 sep – jue 2 oct" (meses distintos) ·
// "20 oct – …" mientras falta el último día
export function rangoCorto(inicio, fin) {
  const a = aFecha(inicio);
  const b = aFecha(fin);
  if (!a) return '';
  if (!b) return `${a.getDate()} ${MES_CORTO[a.getMonth()]} – …`;
  const izq = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
    ? `${a.getDate()}` : `${a.getDate()} ${MES_CORTO[a.getMonth()]}`;
  return `${izq} – ${DIA_CORTO[b.getDay()]} ${b.getDate()} ${MES_CORTO[b.getMonth()]}`;
}

export default function RangeDatePicker({ start, end, onChange, disabled = false, autoOpen = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  const [mes, setMes] = useState(() => { const d = aFecha(start) || new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const wrapRef = useRef(null);

  const cambiarAbierto = (v) => { setOpen(v); onOpenChange?.(v); };

  // al activar "Varios días" se abre solo, para tocar el último día
  useEffect(() => { if (autoOpen && !disabled) cambiarAbierto(true); }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onOpenChange?.(false), []);

  // cerrar al tocar fuera
  useEffect(() => {
    if (!open) return undefined;
    const fuera = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) cambiarAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const tocarDia = (dia) => {
    if (!start || end) {            // sin rango, o rango completo: empieza uno nuevo
      onChange({ start: dia, end: '' });
    } else if (dia < start) {       // antes del inicio: nuevo inicio
      onChange({ start: dia, end: '' });
    } else {                        // último día: rango completo y se cierra
      onChange({ start, end: dia });
      cambiarAbierto(false);
    }
  };

  // celdas del mes (semanas de lunes a domingo)
  const primero = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const offset = (primero.getDay() + 6) % 7;
  const diasMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasMes }, (_, i) => aTexto(new Date(mes.getFullYear(), mes.getMonth(), i + 1)))];
  const hoy = aTexto(new Date());

  const esperandoFin = !!start && !end;

  return (
    <div ref={wrapRef} className="relative">
      <button type="button" disabled={disabled} onClick={() => cambiarAbierto(!open)}
        className={`flex h-11 w-full items-center rounded-md border border-input bg-transparent px-3 text-left text-base md:text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open ? 'border-[#00a5df] ring-1 ring-[#00a5df]' : ''} ${esperandoFin ? 'text-muted-foreground' : ''}`}
        data-testid="activity-form-date-range">
        <span className="truncate">{rangoCorto(start, end) || 'Elegir días'}</span>
      </button>

      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-full min-w-[272px] rounded-2xl border bg-popover p-3 shadow-lg" data-testid="range-calendar">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mes anterior"
              className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-sm font-semibold capitalize">{MESES[mes.getMonth()]} {mes.getFullYear()}</span>
            <button type="button" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Mes siguiente"
              className="h-8 w-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-muted-foreground mb-1">
            {DIAS_SEMANA.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {celdas.map((dia, i) => {
              if (!dia) return <span key={`v${i}`} />;
              const extremo = dia === start || dia === end;
              const dentro = start && end && dia > start && dia < end;
              // tramo continuo: fondo suave también detrás de los extremos
              const tramoIzq = end && dia === end && start !== end;
              const tramoDer = end && dia === start && start !== end;
              return (
                <button key={dia} type="button" onClick={() => tocarDia(dia)}
                  className={`relative h-9 text-sm ${dentro ? 'bg-[rgba(0,165,223,0.14)]' : ''} ${tramoIzq ? 'bg-gradient-to-r from-[rgba(0,165,223,0.14)] to-transparent' : ''} ${tramoDer ? 'bg-gradient-to-l from-[rgba(0,165,223,0.14)] to-transparent' : ''}`}
                  data-testid="range-day">
                  <span className={`mx-auto grid h-8 w-8 place-items-center rounded-full transition-colors ${
                    extremo ? 'bg-[#00a5df] text-white font-semibold' : dia === hoy ? 'text-[#00a5df] font-semibold hover:bg-muted' : 'hover:bg-muted'}`}>
                    {Number(dia.slice(8))}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {esperandoFin ? 'Tocá el último día' : 'Tocá un día para cambiar el rango'}
          </p>
        </div>
      )}
    </div>
  );
}
