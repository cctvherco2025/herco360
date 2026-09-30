import React from 'react';
import { catStyle } from '@/lib/constants';
import { ymd, DIAS_CORTO } from '@/lib/time';
import { useTheme } from '@/context/ThemeContext';

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_H = 56;

// Minimum width (in %) a day column can be shrunk to when resizing manually.
const MIN_COL_PCT = 8;

function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

// Convert a vertical offset (px) inside a day column into a snapped HH:MM time.
function timeFromOffset(offsetY) {
  let minutes = START_HOUR * 60 + (offsetY / HOUR_H) * 60;
  minutes = Math.round(minutes / 30) * 30; // snap to 30-minute steps
  minutes = Math.max(START_HOUR * 60, Math.min(minutes, END_HOUR * 60));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Given a day's events, assign each one a column + total-column-count so that
// events overlapping in time are placed side by side instead of stacked on
// top of each other — the same approach Google Calendar uses.
function layoutDayEvents(dayEvents) {
  const sorted = [...dayEvents].sort((a, b) => {
    const s = toMin(a.start_time) - toMin(b.start_time);
    if (s !== 0) return s;
    return toMin(b.end_time) - toMin(a.end_time);
  });

  const results = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (!cluster.length) return;
    const columnEndTimes = []; // last end time placed in each column
    cluster.forEach((ev) => {
      const s = toMin(ev.start_time);
      const e = toMin(ev.end_time);
      let col = columnEndTimes.findIndex((endT) => endT <= s);
      if (col === -1) { col = columnEndTimes.length; columnEndTimes.push(e); }
      else { columnEndTimes[col] = e; }
      results.push({ ev, col, totalCols: 0 }); // totalCols filled in below
    });
    const totalCols = columnEndTimes.length;
    for (let i = results.length - cluster.length; i < results.length; i++) results[i].totalCols = totalCols;
    cluster = [];
    clusterEnd = -Infinity;
  };

  sorted.forEach((ev) => {
    const s = toMin(ev.start_time);
    if (cluster.length && s >= clusterEnd) flushCluster();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, toMin(ev.end_time));
  });
  flushCluster();

  return results;
}

export function startOfWeek(date) {
  const d = new Date(date); const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d;
}
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

// Sunday is only shown in the week grid during October and November
// (getMonth() is 0-indexed: 9 = octubre, 10 = noviembre). Any other month,
// the week is trimmed to Monday–Saturday.
function isSundayVisibleMonth(date) {
  const m = date.getMonth();
  return m === 9 || m === 10;
}

// Allow events to provide an explicit `color` (e.g. reservation status) that overrides category color.
function evStyle(ev, isDark) {
  if (ev.color) return { solid: ev.color, tint: `${ev.color}${isDark ? '33' : '1f'}` };
  return catStyle(ev.category, isDark);
}

// Line height (px) used by the event title, matched to text-[11px] leading-[14px].
const TITLE_LINE_H = 14;
// Line height (px) used by the owner/time subtitle, matched to text-[9px]/text-[10px] leading-[14px].
const SUBTITLE_LINE_H = 14;
// Vertical padding inside the block (py-1 = 4px top + 4px bottom).
const BLOCK_V_PADDING = 8;

// Multi-line clamp so text wraps to fill the block instead of being forced onto
// a single truncated line — mirrors how Google Calendar sizes event titles.
function clampStyle(lines) {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  };
}

function EventBlock({ ev, isDark, onClick, compact, draggable, onDragStart, onDragEnd, col = 0, totalCols = 1 }) {
  const { solid, tint } = evStyle(ev, isDark);
  const top = ((toMin(ev.start_time) - START_HOUR * 60) / 60) * HOUR_H;
  const height = Math.max(30, ((toMin(ev.end_time) - toMin(ev.start_time)) / 60) * HOUR_H - 4);

  const subtitleLines = (esVariosDias(ev) ? 1 : 0) + (ev.owner_name || (!compact && !esVariosDias(ev)) ? 1 : 0);
  const availableForTitle = height - BLOCK_V_PADDING - subtitleLines * SUBTITLE_LINE_H;
  // At least 1 line, but let the title use as many lines as the block's real height allows.
  const titleLines = Math.max(1, Math.min(6, Math.floor(availableForTitle / TITLE_LINE_H)));

  // When two or more events overlap in time, split the column's width between
  // them (like Google Calendar) instead of stacking them on top of each other.
  const widthPct = 100 / totalCols;
  const leftPct = col * widthPct;
  const GUTTER = 2; // px gap between side-by-side events

  // Las de varios días se pintan en cada día que duran; no se arrastran (moverlas
  // un día cambiaría todo el rango) y muestran su rango de fechas.
  const variosDias = esVariosDias(ev);
  // Tampoco las repeticiones de una serie con RRULE: moverlas movería la serie.
  const canDrag = draggable && !ev.foreign && !ev.is_vacation && !variosDias && !ev.rrule;

  return (
    <button
      type="button"
      draggable={canDrag}
      onDragStart={(e) => { if (!canDrag) return; e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; onDragStart?.(ev); }}
      onDragEnd={() => onDragEnd?.()}
      onClick={(e) => { e.stopPropagation(); onClick?.(ev); }}
      className={`absolute rounded-[12px] px-2 py-1 text-left overflow-hidden border shadow-xs hover:shadow-card transition-[transform,box-shadow] z-10 ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
      style={{
        top, height, background: tint, borderColor: solid, borderStyle: ev.pending ? 'dashed' : 'solid',
        left: `calc(${leftPct}% + ${GUTTER}px)`,
        width: `calc(${widthPct}% - ${GUTTER * 2}px)`,
      }}
      data-testid="calendar-event-block">
      <span className="block h-full" style={{ borderLeft: `3px solid ${solid}`, paddingLeft: 6 }}>
        <span
          className="block text-[11px] font-semibold leading-[14px] break-words whitespace-normal"
          style={{ color: solid, ...clampStyle(titleLines) }}
        >
          {seRepite(ev) && <IconoRepite />}{ev.title}
        </span>
        {variosDias && (
          <span className="block text-[9px] font-medium leading-[14px] truncate opacity-80" style={{ color: solid }}>
            {rangoCortoCal(ev)} · {ev.start_time} - {ev.end_time}
          </span>
        )}
        {ev.owner_name && (
          <span className="block text-[9px] font-medium leading-[14px] truncate opacity-80" style={{ color: solid }}>
            {ev.owner_name}
          </span>
        )}
        {!compact && !ev.owner_name && !variosDias && (
          <span className="block text-[10px] leading-[14px] text-muted-foreground truncate">
            {ev.start_time} - {ev.end_time}
          </span>
        )}
      </span>
    </button>
  );
}

/* ── Actividades de VARIOS DÍAS ────────────────────────────────────────────
   Se dibujan como UNA barra continua que cruza los días (arriba de la
   cuadrícula de horas en Semana/Día, arriba de las actividades en Mes). Si la
   actividad sigue en otra semana, en cada semana se ve su tramo: así se "parte
   en dos barras". Los extremos que continúan fuera de la fila van rectos. */
export const esVariosDias = (a) => !!a.end_date && a.end_date !== a.date;
// Actividad que se repite (serie con RRULE o serie vieja de un registro por fecha)
export const seRepite = (a) => !!(a.rrule || a.series_id);
const IconoRepite = () => <span className="font-normal opacity-70" aria-label="Se repite" title="Se repite">↻ </span>;
// ¿La actividad ocupa el día `ds` (YYYY-MM-DD)? Incluye cada día de las de varios días.
const ocupaDia = (a, ds) => (esVariosDias(a) ? a.date <= ds && ds <= a.end_date : a.date === ds);
const LANE_H = 22; // alto de cada carril de barras (px)
const MES_CORTO_CAL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "20 – 22 oct" / "30 sep – 2 oct"
export function rangoCortoCal(a) {
  const [y0, m0, d0] = a.date.split('-').map(Number);
  const [y1, m1, d1] = (a.end_date || a.date).split('-').map(Number);
  const izq = y0 === y1 && m0 === m1 ? `${d0}` : `${d0} ${MES_CORTO_CAL[m0 - 1]}`;
  return `${izq} – ${d1} ${MES_CORTO_CAL[m1 - 1]}`;
}

// Tramos de las actividades de varios días dentro de una fila de días visibles
// (["2026-10-19", …]), con su carril asignado para que no se encimen.
function tramosDeFila(activities, diasFila) {
  const segs = [];
  activities.filter(esVariosDias).forEach((ev) => {
    const i0 = diasFila.findIndex((d) => d >= ev.date);
    let i1 = -1;
    for (let i = diasFila.length - 1; i >= 0; i -= 1) if (diasFila[i] <= ev.end_date) { i1 = i; break; }
    if (i0 === -1 || i1 === -1 || i0 > i1) return;
    segs.push({ ev, i0, i1, abreIzq: ev.date < diasFila[i0], abreDer: ev.end_date > diasFila[i1] });
  });
  segs.sort((a, b) => a.i0 - b.i0 || (b.i1 - b.i0) - (a.i1 - a.i0));
  const finCarril = [];
  segs.forEach((s) => {
    let l = finCarril.findIndex((fin) => fin < s.i0);
    if (l === -1) { l = finCarril.length; finCarril.push(s.i1); } else finCarril[l] = s.i1;
    s.lane = l;
  });
  return { segs, carriles: finCarril.length };
}

function BarraVariosDias({ seg, isDark, onClick, style }) {
  const { ev } = seg;
  const { solid, tint } = evStyle(ev, isDark);
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick?.(ev); }}
      title={`${ev.title} · ${rangoCortoCal(ev)} · ${ev.start_time} – ${ev.end_time}`}
      className={`absolute flex items-center gap-1 overflow-hidden border px-1.5 text-left text-[10px] font-semibold leading-none shadow-xs hover:shadow-card pointer-events-auto ${
        seg.abreIzq ? 'rounded-l-none' : 'rounded-l-md'} ${seg.abreDer ? 'rounded-r-none' : 'rounded-r-md'}`}
      style={{ ...style, height: LANE_H - 4, background: tint, borderColor: solid, color: solid, borderStyle: ev.pending ? 'dashed' : 'solid' }}
      data-testid="calendar-multiday-bar">
      {seg.abreIzq && <span className="opacity-60">‹</span>}
      <span className="truncate">{seRepite(ev) && <IconoRepite />}{ev.title}</span>
      <span className="shrink-0 font-normal opacity-70">{rangoCortoCal(ev)}</span>
      {ev.owner_name && <span className="truncate font-medium opacity-70">· {ev.owner_name}</span>}
      {seg.abreDer && <span className="ml-auto opacity-60">›</span>}
    </button>
  );
}

function TimeRail({ offset = 0 }) {
  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);
  return (
    <div className="w-12 shrink-0" style={{ paddingTop: 34 + offset }}>
      {hours.map((h) => (
        <div key={h} style={{ height: HOUR_H }} className="relative">
          <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
        </div>
      ))}
    </div>
  );
}

// Thin draggable divider placed between two day columns. Dragging it left/right
// shrinks one neighbor and grows the other; double-click resets both to an
// even split of their combined width.
function ColumnResizeHandle({ onResizeStart, onResetPair }) {
  return (
    <div
      onMouseDown={onResizeStart}
      onDoubleClick={onResetPair}
      role="separator"
      aria-orientation="vertical"
      title="Arrastra para ajustar el ancho \u00b7 doble clic para restablecer"
      className="absolute top-0 right-0 translate-x-1/2 w-3 h-full cursor-col-resize z-20 group"
      style={{ touchAction: 'none' }}
    >
      <div className="mx-auto h-full w-[2px] rounded-full bg-transparent group-hover:bg-primary/60 transition-colors" />
    </div>
  );
}

// Manages the manually-adjustable widths (in %) of the visible day columns in
// WeekView. `numCols` can change (e.g. Sunday appearing/disappearing between
// October/November and other months), so widths reset to an even split
// whenever the column count changes.
function useResizableColumns(gridRef, numCols) {
  const [colWidths, setColWidths] = React.useState(() => Array(numCols).fill(100 / numCols));
  const dragState = React.useRef(null); // { index, startX, startWidths }

  // Reset to an even split whenever the number of visible columns changes,
  // so we never keep stale widths for a column that no longer exists.
  React.useEffect(() => {
    setColWidths(Array(numCols).fill(100 / numCols));
  }, [numCols]);

  const handleResizeMove = React.useCallback((e) => {
    const st = dragState.current;
    if (!st || !gridRef.current) return;
    const containerWidth = gridRef.current.getBoundingClientRect().width;
    if (!containerWidth) return;
    const deltaPct = ((e.clientX - st.startX) / containerWidth) * 100;
    const left = st.index;
    const right = st.index + 1;
    let newLeft = st.startWidths[left] + deltaPct;
    let newRight = st.startWidths[right] - deltaPct;
    if (newLeft < MIN_COL_PCT) { newRight -= (MIN_COL_PCT - newLeft); newLeft = MIN_COL_PCT; }
    if (newRight < MIN_COL_PCT) { newLeft -= (MIN_COL_PCT - newRight); newRight = MIN_COL_PCT; }
    setColWidths((prev) => {
      const next = [...prev];
      next[left] = newLeft;
      next[right] = newRight;
      return next;
    });
  }, [gridRef]);

  const handleResizeEnd = React.useCallback(() => {
    dragState.current = null;
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleResizeMove]);

  const startResize = React.useCallback((index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragState.current = { index, startX: e.clientX, startWidths: colWidths };
    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [colWidths, handleResizeMove, handleResizeEnd]);

  const resetPair = React.useCallback((index) => (e) => {
    e.stopPropagation();
    setColWidths((prev) => {
      const next = [...prev];
      const sum = next[index] + next[index + 1];
      next[index] = sum / 2;
      next[index + 1] = sum / 2;
      return next;
    });
  }, []);

  const resetAll = React.useCallback(
    () => setColWidths(Array(numCols).fill(100 / numCols)),
    [numCols]
  );

  // Safety cleanup if the component unmounts mid-drag.
  React.useEffect(() => () => {
    window.removeEventListener('mousemove', handleResizeMove);
    window.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  return { colWidths, startResize, resetPair, resetAll };
}

export const WeekView = React.forwardRef(function WeekView({ anchor, activities, onEventClick, onSlotClick, onEventMove }, ref) {
  const { isDark } = useTheme();
  const [dragEv, setDragEv] = React.useState(null);
  const gridRef = React.useRef(null);

  const start = startOfWeek(anchor);
  const allDays = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  // Sunday (index 6) only stays in the grid during octubre/noviembre.
  const showSunday = isSundayVisibleMonth(allDays[6]);
  const days = showSunday ? allDays : allDays.slice(0, 6);

  const { colWidths, startResize, resetPair, resetAll } = useResizableColumns(gridRef, days.length);

  // Let the parent toolbar (Hoy / Día / Semana / Mes) trigger the column reset,
  // e.g. <WeekView ref={weekViewRef} .../> then weekViewRef.current.resetColumns().
  React.useImperativeHandle(ref, () => ({ resetColumns: resetAll }), [resetAll]);

  const todayStr = ymd(new Date());
  const railHours = END_HOUR - START_HOUR + 1;

  return (
    <div className="flex overflow-x-auto no-scrollbar">
      <TimeRail />
      <div
        ref={gridRef}
        className="relative flex-1 grid min-w-[640px]"
        style={{ gridTemplateColumns: colWidths.map((w) => `${w}%`).join(' ') }}
      >
        {days.map((day, i) => {
          const ds = ymd(day);
          const dayEvents = activities.filter((a) => ocupaDia(a, ds));
          const laidOut = layoutDayEvents(dayEvents);
          const isToday = ds === todayStr;
          return (
            <div key={ds} className="relative border-l first:border-l-0">
              <div className="h-[34px] flex flex-col items-center justify-center sticky top-0">
                <span className="text-[10px] font-medium text-muted-foreground">{DIAS_CORTO[day.getDay()]}</span>
                <span className={`text-xs font-semibold grid place-items-center h-6 w-6 rounded-full ${isToday ? 'bg-[#1e395e] text-white' : 'text-foreground'}`}>{day.getDate()}</span>
              </div>
              <div className="relative" style={{ height: railHours * HOUR_H }}
                onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSlotClick?.(ds, timeFromOffset(e.clientY - r.top)); }}
                onDragOver={(e) => { if (dragEv) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
                onDrop={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); if (dragEv) { onEventMove?.(dragEv, ds, timeFromOffset(e.clientY - r.top)); setDragEv(null); } }}>
                {Array.from({ length: railHours }).map((_, hi) => (
                  <div key={hi} style={{ height: HOUR_H }} className="border-t border-dashed border-border/60" />
                ))}
                {laidOut.map(({ ev, col, totalCols }) => (
                  <EventBlock key={ev.id} ev={ev} isDark={isDark} onClick={onEventClick} col={col} totalCols={totalCols} draggable={!!onEventMove} onDragStart={setDragEv} onDragEnd={() => setDragEv(null)} />
                ))}
              </div>
              {i < days.length - 1 && (
                <ColumnResizeHandle onResizeStart={startResize(i)} onResetPair={resetPair(i)} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function DayView({ anchor, activities, onEventClick, onSlotClick, onEventMove }) {
  const { isDark } = useTheme();
  const [dragEv, setDragEv] = React.useState(null);
  const ds = ymd(anchor);
  const dayEvents = activities.filter((a) => ocupaDia(a, ds));
  const laidOut = layoutDayEvents(dayEvents);
  const railHours = END_HOUR - START_HOUR + 1;
  return (
    <div className="flex">
      <TimeRail />
      <div className="flex-1">
        <div className="h-[34px]" />
        <div className="relative" style={{ height: railHours * HOUR_H }}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSlotClick?.(ds, timeFromOffset(e.clientY - r.top)); }}
          onDragOver={(e) => { if (dragEv) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
          onDrop={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); if (dragEv) { onEventMove?.(dragEv, ds, timeFromOffset(e.clientY - r.top)); setDragEv(null); } }}>
          {Array.from({ length: railHours }).map((_, i) => (
            <div key={i} style={{ height: HOUR_H }} className="border-t border-dashed border-border/60" />
          ))}
          {laidOut.map(({ ev, col, totalCols }) => (
            <EventBlock key={ev.id} ev={ev} isDark={isDark} onClick={onEventClick} col={col} totalCols={totalCols} draggable={!!onEventMove} onDragStart={setDragEv} onDragEnd={() => setDragEv(null)} />
          ))}
          {dayEvents.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground pointer-events-none">No hay actividades este día</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MonthView({ anchor, activities, onEventClick, onSlotClick, onEventMove }) {
  const { isDark } = useTheme();
  const [dragEv, setDragEv] = React.useState(null);
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  // Domingo solo se muestra en octubre/noviembre; el resto del año el mes se
  // arma con semanas de 6 días (lunes-sábado).
  const showSunday = isSundayVisibleMonth(anchor);
  const WEEKS = 6;
  const weeks = Array.from({ length: WEEKS }, (_, w) => {
    const weekDays = Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d));
    return showSunday ? weekDays : weekDays.slice(0, 6);
  });
  const nCols = showSunday ? 7 : 6;
  const GAP = 6; // gap-1.5
  // posición de una barra que va de la columna i0 a la i1, contando el gap
  const posBarra = (i0, i1) => ({
    left: `calc((100% - ${(nCols - 1) * GAP}px) / ${nCols} * ${i0} + ${i0 * GAP}px + 3px)`,
    width: `calc((100% - ${(nCols - 1) * GAP}px) / ${nCols} * ${i1 - i0 + 1} + ${(i1 - i0) * GAP}px - 6px)`,
  });
  const headers = showSunday
    ? ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM']
    : ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
  const gridColsClass = showSunday ? 'grid-cols-7' : 'grid-cols-6';
  const todayStr = ymd(new Date());
  return (
    <div>
      <div className={`grid ${gridColsClass} mb-2`}>
        {headers.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="space-y-1.5">
        {weeks.map((weekDays) => {
          const diasFila = weekDays.map(ymd);
          const { segs, carriles } = tramosDeFila(activities, diasFila);
          const franja = carriles * LANE_H;
          return (
          <div key={diasFila[0]} className={`relative grid ${gridColsClass} gap-1.5`}>
            {/* barras de varios días de esta semana, debajo del número del día */}
            {franja > 0 && (
              <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: 32, height: franja }}>
                {segs.map((s) => (
                  <BarraVariosDias key={`${s.ev.id}-${s.i0}`} seg={s} isDark={isDark} onClick={onEventClick}
                    style={{ top: s.lane * LANE_H, ...posBarra(s.i0, s.i1) }} />
                ))}
              </div>
            )}
            {weekDays.map((day) => {
          const ds = ymd(day);
          const dayEvents = activities.filter((a) => a.date === ds && !esVariosDias(a)).sort((a, b) => a.start_time.localeCompare(b.start_time));
          const inMonth = day.getMonth() === anchor.getMonth();
          const isToday = ds === todayStr;
          return (
            <div key={ds} onClick={() => onSlotClick?.(ds)}
              onDragOver={(e) => { if (dragEv) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDrop={(e) => { e.preventDefault(); if (dragEv) { onEventMove?.(dragEv, ds, dragEv.start_time); setDragEv(null); } }}
              className={`min-h-[104px] rounded-[14px] border p-1.5 cursor-pointer transition-shadow hover:shadow-card ${inMonth ? 'bg-card' : 'bg-muted/30'}`}>
              <div className="flex justify-end">
                <span className={`text-xs font-medium grid place-items-center h-6 w-6 rounded-full ${isToday ? 'bg-[#1e395e] text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground/50'}`}>{day.getDate()}</span>
              </div>
              {/* espacio reservado para las barras de varios días de la semana */}
              <div className="space-y-1 mt-0.5" style={{ paddingTop: franja }}>
                {dayEvents.slice(0, 3).map((ev) => {
                  const { solid, tint } = evStyle(ev, isDark);
                  return (
                    <button key={ev.id}
                      draggable={!!onEventMove && !ev.rrule}
                      onDragStart={(e) => { if (ev.rrule) return; e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDragEv(ev); }}
                      onDragEnd={() => setDragEv(null)}
                      onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                      className={`w-full flex items-center gap-1 rounded-md px-1.5 py-0.5 text-left hover:opacity-90 ${onEventMove ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ background: tint, border: ev.pending ? `1px dashed ${solid}` : 'none' }}>
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: solid }} />
                      <span className="text-[10px] font-medium truncate" style={{ color: solid }}>{ev.start_time} {seRepite(ev) && <IconoRepite />}{ev.title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 3 && <p className="text-[10px] text-muted-foreground px-1.5">+{dayEvents.length - 3} más</p>}
              </div>
            </div>
          );
            })}
          </div>
          );
        })}
      </div>
    </div>
  );
}