import React from 'react';
import { motion } from 'framer-motion';
import { catStyle } from '@/lib/constants';
import { ymd, DIAS_CORTO } from '@/lib/time';
import { useTheme } from '@/context/ThemeContext';

const START_HOUR = 7;
const END_HOUR = 20;
const HOUR_H = 56;

function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function startOfWeek(date) {
  const d = new Date(date); const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d;
}
export function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

// Allow events to provide an explicit `color` (e.g. reservation status) that overrides category color.
function evStyle(ev, isDark) {
  if (ev.color) return { solid: ev.color, tint: `${ev.color}${isDark ? '33' : '1f'}` };
  return catStyle(ev.category, isDark);
}

function EventBlock({ ev, isDark, onClick, compact }) {
  const { solid, tint } = evStyle(ev, isDark);
  const top = ((toMin(ev.start_time) - START_HOUR * 60) / 60) * HOUR_H;
  const height = Math.max(26, ((toMin(ev.end_time) - toMin(ev.start_time)) / 60) * HOUR_H - 4);
  return (
    <motion.button initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      onClick={(e) => { e.stopPropagation(); onClick?.(ev); }}
      className="absolute left-1 right-1 rounded-[12px] px-2 py-1 text-left overflow-hidden border shadow-xs hover:shadow-card hover:-translate-y-px transition-[transform,box-shadow] z-10"
      style={{ top, height, background: tint, borderColor: solid }}>
      <span className="block h-full" style={{ borderLeft: `3px solid ${solid}`, paddingLeft: 6 }}>
        <span className="block text-[11px] font-semibold truncate" style={{ color: solid }}>{ev.title}</span>
        {!compact && <span className="block text-[10px] text-muted-foreground truncate">{ev.start_time} - {ev.end_time}</span>}
      </span>
    </motion.button>
  );
}

function TimeRail() {
  const hours = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hours.push(h);
  return (
    <div className="w-12 shrink-0 pt-[34px]">
      {hours.map((h) => (
        <div key={h} style={{ height: HOUR_H }} className="relative">
          <span className="absolute -top-2 right-2 text-[10px] text-muted-foreground">{String(h).padStart(2, '0')}:00</span>
        </div>
      ))}
    </div>
  );
}

export function WeekView({ anchor, activities, onEventClick, onSlotClick }) {
  const { isDark } = useTheme();
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const todayStr = ymd(new Date());
  const railHours = END_HOUR - START_HOUR + 1;
  return (
    <div className="flex overflow-x-auto no-scrollbar">
      <TimeRail />
      <div className="flex-1 grid grid-cols-7 min-w-[640px]">
        {days.map((day) => {
          const ds = ymd(day);
          const dayEvents = activities.filter((a) => a.date === ds);
          const isToday = ds === todayStr;
          return (
            <div key={ds} className="border-l first:border-l-0">
              <div className="h-[34px] flex flex-col items-center justify-center sticky top-0">
                <span className="text-[10px] font-medium text-muted-foreground">{DIAS_CORTO[day.getDay()]}</span>
                <span className={`text-xs font-semibold grid place-items-center h-6 w-6 rounded-full ${isToday ? 'bg-[#1e395e] text-white' : 'text-foreground'}`}>{day.getDate()}</span>
              </div>
              <div className="relative" style={{ height: railHours * HOUR_H }} onClick={() => onSlotClick?.(ds)}>
                {Array.from({ length: railHours }).map((_, i) => (
                  <div key={i} style={{ height: HOUR_H }} className="border-t border-dashed border-border/60" />
                ))}
                {dayEvents.map((ev) => <EventBlock key={ev.id} ev={ev} isDark={isDark} onClick={onEventClick} compact />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DayView({ anchor, activities, onEventClick, onSlotClick }) {
  const { isDark } = useTheme();
  const ds = ymd(anchor);
  const dayEvents = activities.filter((a) => a.date === ds);
  const railHours = END_HOUR - START_HOUR + 1;
  return (
    <div className="flex">
      <TimeRail />
      <div className="flex-1">
        <div className="h-[34px]" />
        <div className="relative" style={{ height: railHours * HOUR_H }} onClick={() => onSlotClick?.(ds)}>
          {Array.from({ length: railHours }).map((_, i) => (
            <div key={i} style={{ height: HOUR_H }} className="border-t border-dashed border-border/60" />
          ))}
          {dayEvents.map((ev) => <EventBlock key={ev.id} ev={ev} isDark={isDark} onClick={onEventClick} />)}
          {dayEvents.length === 0 && (
            <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">No hay actividades este día</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MonthView({ anchor, activities, onEventClick, onSlotClick }) {
  const { isDark } = useTheme();
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const todayStr = ymd(new Date());
  return (
    <div>
      <div className="grid grid-cols-7 mb-2">
        {['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'].map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const ds = ymd(day);
          const dayEvents = activities.filter((a) => a.date === ds).sort((a, b) => a.start_time.localeCompare(b.start_time));
          const inMonth = day.getMonth() === anchor.getMonth();
          const isToday = ds === todayStr;
          return (
            <div key={ds} onClick={() => onSlotClick?.(ds)}
              className={`min-h-[104px] rounded-[14px] border p-1.5 cursor-pointer transition-shadow hover:shadow-card ${inMonth ? 'bg-card' : 'bg-muted/30'}`}>
              <div className="flex justify-end">
                <span className={`text-xs font-medium grid place-items-center h-6 w-6 rounded-full ${isToday ? 'bg-[#1e395e] text-white' : inMonth ? 'text-foreground' : 'text-muted-foreground/50'}`}>{day.getDate()}</span>
              </div>
              <div className="space-y-1 mt-0.5">
                {dayEvents.slice(0, 3).map((ev) => {
                  const { solid, tint } = evStyle(ev, isDark);
                  return (
                    <button key={ev.id} onClick={(e) => { e.stopPropagation(); onEventClick?.(ev); }}
                      className="w-full flex items-center gap-1 rounded-md px-1.5 py-0.5 text-left hover:opacity-90" style={{ background: tint }}>
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: solid }} />
                      <span className="text-[10px] font-medium truncate" style={{ color: solid }}>{ev.start_time} {ev.title}</span>
                    </button>
                  );
                })}
                {dayEvents.length > 3 && <p className="text-[10px] text-muted-foreground px-1.5">+{dayEvents.length - 3} más</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
