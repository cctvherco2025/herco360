import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, MapPin, Users as UsersIcon, CircleCheck, CircleX, Bookmark, Ban, Flag, Clock, Calendar, ChevronLeft, ChevronRight, QrCode, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROOM_STATES } from '@/lib/constants';
import { capitalize, fullDateEs, ymd, MESES, MESES_CORTO } from '@/lib/time';
import { WeekView, DayView, MonthView, startOfWeek, addDays } from '@/components/CalendarViews';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const ICONS = { CircleCheck, CircleX, Bookmark, Ban, Flag };

function isMondayStr(ds) {
  if (!ds || typeof ds !== 'string') return false;
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 1;
}

// Synthetic recurring "Dirección Comercial" Monday block for the visible range.
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

function StatusBadge({ status, size = 'sm' }) {
  const s = ROOM_STATES[status] || ROOM_STATES['Disponible'];
  const Icon = ICONS[s.icon] || CircleCheck;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${size === 'lg' ? 'px-4 py-2 text-base' : 'px-2.5 py-1 text-xs'}`}
      style={{ background: s.bg, color: s.solid }} data-testid="meeting-room-status-badge">
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'} /> {status}
    </span>
  );
}

export default function SalaDeJuntas() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', date: ymd(new Date()), start_time: '09:00', end_time: '10:00', notes: '' });
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('Mes');
  const [anchor, setAnchor] = useState(new Date());
  const [qrOpen, setQrOpen] = useState(false);

  // Public booking link (no login required) — points to the current domain.
  const salaUrl = (typeof window !== 'undefined' ? window.location.origin : '') + '/sala';

  const copySalaLink = async () => {
    try { await navigator.clipboard.writeText(salaUrl); toast.success('Enlace copiado'); }
    catch (e) { toast.error('No se pudo copiar'); }
  };

  const downloadQr = () => {
    const canvas = document.getElementById('sala-qr-canvas');
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'sala-de-juntas-qr.png';
    document.body.appendChild(a); a.click(); a.remove();
    toast.success('QR descargado');
  };

  const load = useCallback(async () => {
    try {
      const [r, res] = await Promise.all([api.get('/rooms'), api.get('/reservations')]);
      setRooms(r.data); setReservations(res.data);
    } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const room = rooms[0];
  const status = room?.current_status || 'Disponible';

  // Calendar events from reservations (color by status), excludes cancelled to keep the calendar clean
  const calendarEvents = [
    ...mondayBlocks(anchor),
    ...reservations
      .filter((r) => r.status !== 'Cancelada')
      .map((r) => ({
        id: r.id, title: r.title, date: r.date,
        start_time: r.start_time, end_time: r.end_time,
        color: (ROOM_STATES[r.status] || ROOM_STATES['Reservada']).solid,
        status: r.status,
      })),
  ];

  const openReserve = (dateStr) => {
    if (typeof dateStr === 'string') {
      if (isMondayStr(dateStr)) { toast.error('Los lunes la Sala de Juntas está reservada para Dirección Comercial'); return; }
      setForm({ title: '', date: dateStr, start_time: '09:00', end_time: '10:00', notes: '' });
    } else {
      let d = ymd(new Date());
      if (isMondayStr(d)) d = ymd(addDays(new Date(), 1));  // skip Monday default
      setForm({ title: '', date: d, start_time: '09:00', end_time: '10:00', notes: '' });
    }
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    if (isMondayStr(form.date)) { toast.error('Los lunes la sala está reservada para Dirección Comercial. Elige otro día.'); return; }
    if (form.end_time <= form.start_time) { toast.error('La hora de fin debe ser mayor'); return; }
    setSaving(true);
    try { await api.post('/reservations', { ...form, room_id: room?.id }); toast.success('Sala reservada'); setOpen(false); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error al reservar'); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => { try { await api.post(`/reservations/${id}/cancel`); toast.success('Reserva cancelada'); load(); } catch (e) { toast.error('Error'); } };
  const finalize = async (id) => { try { await api.post(`/reservations/${id}/finalize`); toast.success('Reserva finalizada'); load(); } catch (e) { toast.error('Error'); } };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const activeRes = reservations.filter((r) => r.status === 'Reservada' || r.status === 'Ocupada')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const pastRes = reservations.filter((r) => r.status === 'Cancelada' || r.status === 'Finalizada')
    .sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));

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

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Sala de Juntas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Consulta el estado y gestiona las reservas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setQrOpen(true)} variant="outline" className="rounded-xl" data-testid="room-qr-button"><QrCode className="h-4 w-4 mr-1.5" /> QR para reservar</Button>
          <Button onClick={() => openReserve()} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="room-reserve-button"><Plus className="h-4 w-4 mr-1" /> Reservar sala</Button>
        </div>
      </div>

      {/* Hero status card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="rounded-[20px] border shadow-card p-6 sm:p-8 mb-6 relative overflow-hidden auth-bg">
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="h-20 w-20 rounded-2xl grid place-items-center bg-white/70 backdrop-blur shadow-card">
            <Building2 className="h-10 w-10 text-[#1e395e]" />
          </div>
          <div className="flex-1">
            <h2 className="font-heading text-2xl font-semibold text-[#1e395e]">{room?.name || 'Sala de Juntas Principal'}</h2>
            <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-[#5b667a]">
              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" /> {room?.location || 'Edificio Corporativo HERCO'}</span>
              <span className="inline-flex items-center gap-1.5"><UsersIcon className="h-4 w-4" /> Capacidad {room?.capacity || 12} personas</span>
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-2">
            <StatusBadge status={status} size="lg" />
            {room?.current_reservation && (
              <p className="text-xs text-[#5b667a]">{room.current_reservation.title} · {room.current_reservation.start_time}-{room.current_reservation.end_time}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Calendar */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.04 }}
        className="rounded-[18px] bg-card border shadow-card p-4 sm:p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
              <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-muted" data-testid="room-cal-prev"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setAnchor(new Date())} className="px-3 py-1 text-sm font-medium rounded-lg hover:bg-muted" data-testid="room-cal-today">Hoy</button>
              <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-muted" data-testid="room-cal-next"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <span className="text-sm font-medium">{rangeLabel()}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* status legend */}
            <div className="hidden md:flex items-center gap-3">
              {['Reservada', 'Ocupada', 'Finalizada'].map((st) => (
                <span key={st} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROOM_STATES[st].solid }} /> {st}
                </span>
              ))}
            </div>
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="rounded-xl">
                <TabsTrigger value="Día" className="rounded-lg text-xs" data-testid="room-view-dia">Día</TabsTrigger>
                <TabsTrigger value="Semana" className="rounded-lg text-xs" data-testid="room-view-semana">Semana</TabsTrigger>
                <TabsTrigger value="Mes" className="rounded-lg text-xs" data-testid="room-view-mes">Mes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Haz clic en una fecha para reservar la sala ese día. <span className="text-[#712146] font-medium">Los lunes están reservados para Dirección Comercial.</span></p>
        <div className="overflow-hidden">
          {view === 'Mes' && <MonthView anchor={anchor} activities={calendarEvents} onEventClick={(ev) => openReserve(ev.date)} onSlotClick={(ds) => openReserve(ds)} />}
          {view === 'Semana' && <WeekView anchor={anchor} activities={calendarEvents} onEventClick={(ev) => openReserve(ev.date)} onSlotClick={(ds) => openReserve(ds)} />}
          {view === 'Día' && <DayView anchor={anchor} activities={calendarEvents} onEventClick={(ev) => openReserve(ev.date)} onSlotClick={(ds) => openReserve(ds)} />}
        </div>
      </motion.div>

      {/* State legend */}
      <div className="flex flex-wrap gap-2 mb-6">
        {Object.keys(ROOM_STATES).map((st) => <StatusBadge key={st} status={st} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}
          className="rounded-[18px] bg-card border shadow-card p-5">
          <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><Calendar className="h-4 w-4 text-[#00a5df]" /> Reservas activas</h3>
          <div className="space-y-3">
            {activeRes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No hay reservas activas</p>}
            {activeRes.map((r) => (
              <div key={r.id} className="rounded-xl border p-4" data-testid="reservation-item">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {capitalize(fullDateEs(r.date))} · {r.start_time} - {r.end_time}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Reservada por {r.reserved_by_name}</p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {(user?.role === 'admin' || r.reserved_by === user?.id) && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" onClick={() => finalize(r.id)} className="rounded-lg text-xs"><Flag className="h-3.5 w-3.5 mr-1" /> Finalizar</Button>
                    <Button size="sm" variant="ghost" onClick={() => cancel(r.id)} className="rounded-lg text-xs text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]"><Ban className="h-3.5 w-3.5 mr-1" /> Cancelar</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}
          className="rounded-[18px] bg-card border shadow-card p-5">
          <h3 className="font-heading font-semibold mb-4 flex items-center gap-2"><Flag className="h-4 w-4 text-[#8a8b8b]" /> Historial</h3>
          <div className="space-y-3">
            {pastRes.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin historial reciente</p>}
            {pastRes.map((r) => (
              <div key={r.id} className="rounded-xl border p-4 flex items-start justify-between gap-3 opacity-80">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{capitalize(fullDateEs(r.date))} · {r.start_time} - {r.end_time}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Reserve dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px] rounded-[22px]">
          <DialogHeader><DialogTitle className="font-heading">Reservar Sala de Juntas</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Motivo / Título</Label><Input value={form.title} onChange={set('title')} placeholder="Ej. Reunión de planeación" className="h-11" data-testid="reservation-title-input" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={form.date} onChange={set('date')} className="h-11" data-testid="reservation-date-input" /></div>
              <div className="space-y-1.5"><Label>Inicio</Label><Input type="time" value={form.start_time} onChange={set('start_time')} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Fin</Label><Input type="time" value={form.end_time} onChange={set('end_time')} className="h-11" /></div>
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Detalles adicionales…" /></div>
            {isMondayStr(form.date) && (
              <div className="rounded-xl bg-[rgba(113,33,70,0.1)] text-[#712146] text-xs font-medium px-3 py-2 flex items-center gap-2">
                <Ban className="h-4 w-4 shrink-0" /> Los lunes la sala está reservada para Dirección Comercial. Elige otro día.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={save} disabled={saving || isMondayStr(form.date)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="reservation-submit">{saving ? 'Reservando…' : 'Reservar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-[420px] rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2"><QrCode className="h-5 w-5 text-[#00a5df]" /> Reservar por QR</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center text-center py-2">
            <p className="text-sm text-muted-foreground mb-4">
              Escanea este código para abrir la página pública y apartar la Sala de Juntas, sin necesidad de iniciar sesión.
            </p>
            <div className="rounded-2xl bg-white p-5 shadow-card border" data-testid="sala-qr-box">
              <QRCodeCanvas id="sala-qr-canvas" value={salaUrl} size={220} level="M" marginSize={2} fgColor="#1e395e" bgColor="#ffffff" />
            </div>
            <div className="mt-4 w-full rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground break-all" data-testid="sala-qr-url">{salaUrl}</div>
            <div className="mt-4 flex gap-2 w-full">
              <Button variant="outline" onClick={copySalaLink} className="flex-1 rounded-xl" data-testid="sala-qr-copy"><Copy className="h-4 w-4 mr-1.5" /> Copiar enlace</Button>
              <Button onClick={downloadQr} className="flex-1 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="sala-qr-download"><Download className="h-4 w-4 mr-1.5" /> Descargar QR</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
