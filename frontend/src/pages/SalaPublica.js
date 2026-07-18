import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Building2, MapPin, Users as UsersIcon, Clock, Calendar, ChevronLeft, ChevronRight,
  Plus, Ban, CalendarCheck, CircleCheck, CircleX, Bookmark, Flag,
} from 'lucide-react';
import { API } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { ROOM_STATES } from '@/lib/constants';
import { capitalize, fullDateEs, ymd, MESES, MESES_CORTO } from '@/lib/time';
import { WeekView, DayView, MonthView, startOfWeek, addDays } from '@/components/CalendarViews';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const pub = axios.create({ baseURL: API });
const LS_KEY = 'herco_guest_reservas';
const ICONS = { CircleCheck, CircleX, Bookmark, Ban, Flag };

function isMondayStr(ds) {
  if (!ds || typeof ds !== 'string') return false;
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 1;
}

function mondayBlocks(anchor) {
  const start = addDays(startOfWeek(anchor), -35);
  const out = [];
  for (let i = 0; i < 91; i++) {
    const d = addDays(start, i);
    if (d.getDay() === 1) {
      out.push({
        id: `dc-${ymd(d)}`, title: 'Reunión Dirección Comercial', date: ymd(d),
        start_time: '08:00', end_time: '18:00', color: '#712146', status: 'Bloqueado', locked: true,
      });
    }
  }
  return out;
}

function StatusBadge({ status }) {
  const s = ROOM_STATES[status] || ROOM_STATES['Disponible'];
  const Icon = ICONS[s.icon] || CircleCheck;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: s.bg, color: s.solid }}>
      <Icon className="h-3.5 w-3.5" /> {status}
    </span>
  );
}

function loadMine() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; }
}
function saveMine(list) { localStorage.setItem(LS_KEY, JSON.stringify(list)); }

export default function SalaPublica() {
  const [room, setRoom] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [mine, setMine] = useState(loadMine());
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('Mes');
  const [anchor, setAnchor] = useState(new Date());
  const [form, setForm] = useState({ guest_name: '', title: '', date: ymd(new Date()), start_time: '09:00', end_time: '10:00' });

  const load = useCallback(async () => {
    try {
      const [r, res] = await Promise.all([pub.get('/public/room'), pub.get('/public/reservations')]);
      setRoom(r.data.room); setReservations(res.data);
    } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const calendarEvents = [
    ...mondayBlocks(anchor),
    ...reservations.map((r) => ({
      id: r.id, title: r.title, date: r.date, start_time: r.start_time, end_time: r.end_time,
      color: (ROOM_STATES[r.status] || ROOM_STATES['Reservada']).solid, status: r.status,
    })),
  ];

  const lastName = mine.length ? mine[0].guest_name : '';

  const openReserve = (dateStr) => {
    let d;
    if (typeof dateStr === 'string') {
      if (isMondayStr(dateStr)) { toast.error('Los lunes la sala está reservada para Dirección Comercial'); return; }
      d = dateStr;
    } else {
      d = ymd(new Date());
      if (isMondayStr(d)) d = ymd(addDays(new Date(), 1));
    }
    setForm({ guest_name: lastName || '', title: '', date: d, start_time: '09:00', end_time: '10:00' });
    setOpen(true);
  };

  const save = async () => {
    if (!form.guest_name.trim()) { toast.error('Escribe tu nombre'); return; }
    if (!form.title.trim()) { toast.error('Escribe el motivo'); return; }
    if (form.date < ymd(new Date())) { toast.error('No puedes reservar la sala en fechas pasadas'); return; }
    if (isMondayStr(form.date)) { toast.error('Los lunes la sala está reservada para Dirección Comercial. Elige otro día.'); return; }
    if (form.end_time <= form.start_time) { toast.error('La hora de fin debe ser mayor'); return; }
    setSaving(true);
    try {
      const { data } = await pub.post('/public/reservations', form);
      const next = [{ ...data, guest_name: form.guest_name.trim() }, ...mine];
      saveMine(next); setMine(next);
      toast.success('¡Sala reservada!');
      setOpen(false); load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al reservar'); }
    finally { setSaving(false); }
  };

  const cancelMine = async (item) => {
    try {
      await pub.post(`/public/reservations/${item.id}/cancel`, { guest_token: item.guest_token });
      const next = mine.filter((m) => m.id !== item.id);
      saveMine(next); setMine(next);
      toast.success('Reserva cancelada'); load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'No se pudo cancelar'); }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const rangeLabel = () => {
    if (view === 'Mes') return `${capitalize(MESES[anchor.getMonth()])} ${anchor.getFullYear()}`;
    if (view === 'Día') return capitalize(fullDateEs(anchor));
    const s = startOfWeek(anchor); const e = addDays(s, 6);
    return `${s.getDate()} ${MESES_CORTO[s.getMonth()]} - ${e.getDate()} ${MESES_CORTO[e.getMonth()]} ${e.getFullYear()}`;
  };
  const move = (dir) => {
    if (view === 'Mes') setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1));
    else if (view === 'Día') setAnchor(addDays(anchor, dir));
    else setAnchor(addDays(anchor, dir * 7));
  };

  const today = ymd(new Date());
  const upcomingMine = mine.filter((m) => m.date >= today).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="sm" />
            <span className="font-heading font-semibold text-foreground hidden sm:block">Sala de Juntas</span>
          </div>
          <Button onClick={() => openReserve()} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="public-reserve-button">
            <Plus className="h-4 w-4 mr-1" /> Reservar
          </Button>
        </div>
      </header>

      <main className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="rounded-[20px] border shadow-card p-6 sm:p-8 mb-6 relative overflow-hidden auth-bg">
          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="h-16 w-16 rounded-2xl grid place-items-center bg-white/70 backdrop-blur shadow-card">
              <Building2 className="h-8 w-8 text-[#1e395e]" />
            </div>
            <div className="flex-1">
              <h1 className="font-heading text-2xl font-semibold text-[#1e395e]">{room?.name || 'Sala de Juntas Principal'}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-[#5b667a]">
                <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {room?.location || 'Edificio Corporativo HERCO'}</span>
                <span className="inline-flex items-center gap-1.5"><UsersIcon className="h-4 w-4" /> Capacidad {room?.capacity || 12} personas</span>
              </div>
            </div>
            <p className="text-xs text-[#5b667a] max-w-[220px]">Reserva la sala sin necesidad de cuenta. Solo escribe tu nombre.</p>
          </div>
        </motion.div>

        {/* My reservations */}
        {upcomingMine.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="rounded-[18px] bg-card border shadow-card p-5 mb-6">
            <h2 className="font-heading font-semibold mb-3 flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-[#00a5df]" /> Mis reservas</h2>
            <div className="space-y-2">
              {upcomingMine.map((m) => (
                <div key={m.id} className="rounded-xl border p-3 flex items-center justify-between gap-3" data-testid="my-guest-reservation">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {capitalize(fullDateEs(m.date))} · {m.start_time} - {m.end_time}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => cancelMine(m)}
                    className="rounded-lg text-xs text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="cancel-guest-reservation">
                    <Ban className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Calendar */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.04 }}
          className="rounded-[18px] bg-card border shadow-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
                <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-muted" data-testid="pub-cal-prev"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setAnchor(new Date())} className="px-3 py-1 text-sm font-medium rounded-lg hover:bg-muted" data-testid="pub-cal-today">Hoy</button>
                <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-muted" data-testid="pub-cal-next"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <span className="text-sm font-medium">{rangeLabel()}</span>
            </div>
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="rounded-xl">
                <TabsTrigger value="Día" className="rounded-lg text-xs">Día</TabsTrigger>
                <TabsTrigger value="Semana" className="rounded-lg text-xs">Semana</TabsTrigger>
                <TabsTrigger value="Mes" className="rounded-lg text-xs">Mes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <p className="text-xs text-muted-foreground mb-3">Haz clic en una fecha para reservar la sala ese día. <span className="text-[#712146] font-medium">Los lunes están reservados para Dirección Comercial.</span></p>
          <div className="overflow-hidden">
            {view === 'Mes' && <MonthView anchor={anchor} activities={calendarEvents} onEventClick={(ev) => openReserve(ev.date)} onSlotClick={(ds) => openReserve(ds)} />}
            {view === 'Semana' && <WeekView anchor={anchor} activities={calendarEvents} onEventClick={(ev) => openReserve(ev.date)} onSlotClick={(ds) => openReserve(ds)} />}
            {view === 'Día' && <DayView anchor={anchor} activities={calendarEvents} onEventClick={(ev) => openReserve(ev.date)} onSlotClick={(ds) => openReserve(ds)} />}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {['Reservada', 'Ocupada'].map((st) => <StatusBadge key={st} status={st} />)}
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(113,33,70,0.12)', color: '#712146' }}>
              <Ban className="h-3.5 w-3.5" /> Lunes (Dirección Comercial)
            </span>
          </div>
        </motion.div>

        <p className="text-center text-xs text-muted-foreground mt-6">HERCO CCTV · El Universo Ferretero</p>
      </main>

      {/* Reserve dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px] rounded-[22px]">
          <DialogHeader><DialogTitle className="font-heading">Reservar Sala de Juntas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Tu nombre</Label><Input value={form.guest_name} onChange={set('guest_name')} placeholder="Ej. Juan Pérez" className="h-11" data-testid="guest-name-input" /></div>
            <div className="space-y-1.5"><Label>Motivo / Título</Label><Input value={form.title} onChange={set('title')} placeholder="Ej. Reunión de equipo" className="h-11" data-testid="guest-title-input" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" min={ymd(new Date())} value={form.date} onChange={set('date')} className="h-11" data-testid="guest-date-input" /></div>
              <div className="space-y-1.5"><Label>Inicio</Label><Input type="time" value={form.start_time} onChange={set('start_time')} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Fin</Label><Input type="time" value={form.end_time} onChange={set('end_time')} className="h-11" /></div>
            </div>
            {isMondayStr(form.date) && (
              <div className="rounded-xl bg-[rgba(113,33,70,0.1)] text-[#712146] text-xs font-medium px-3 py-2 flex items-center gap-2">
                <Ban className="h-4 w-4 shrink-0" /> Los lunes la sala está reservada para Dirección Comercial. Elige otro día.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={save} disabled={saving || isMondayStr(form.date)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="guest-reserve-submit">{saving ? 'Reservando…' : 'Reservar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
