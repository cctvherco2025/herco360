import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Building2, Plus, MapPin, Users as UsersIcon, CircleCheck, CircleX, Bookmark, Ban, Flag, Clock, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ROOM_STATES } from '@/lib/constants';
import { capitalize, fullDateEs, ymd } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const ICONS = { CircleCheck, CircleX, Bookmark, Ban, Flag };

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

  const load = useCallback(async () => {
    try {
      const [r, res] = await Promise.all([api.get('/rooms'), api.get('/reservations?upcoming=true')]);
      setRooms(r.data); setReservations(res.data);
    } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const room = rooms[0];
  const status = room?.current_status || 'Disponible';

  const save = async () => {
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    if (form.end_time <= form.start_time) { toast.error('La hora de fin debe ser mayor'); return; }
    setSaving(true);
    try { await api.post('/reservations', { ...form, room_id: room?.id }); toast.success('Sala reservada'); setOpen(false); setForm({ title: '', date: ymd(new Date()), start_time: '09:00', end_time: '10:00', notes: '' }); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error al reservar'); }
    finally { setSaving(false); }
  };

  const cancel = async (id) => { try { await api.post(`/reservations/${id}/cancel`); toast.success('Reserva cancelada'); load(); } catch (e) { toast.error('Error'); } };
  const finalize = async (id) => { try { await api.post(`/reservations/${id}/finalize`); toast.success('Reserva finalizada'); load(); } catch (e) { toast.error('Error'); } };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const activeRes = reservations.filter((r) => r.status === 'Reservada' || r.status === 'Ocupada');
  const pastRes = reservations.filter((r) => r.status === 'Cancelada' || r.status === 'Finalizada');

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Sala de Juntas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Consulta el estado y gestiona las reservas</p>
        </div>
        <Button onClick={() => setOpen(true)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="room-reserve-button"><Plus className="h-4 w-4 mr-1" /> Reservar sala</Button>
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
              <div className="space-y-1.5"><Label>Fecha</Label><Input type="date" value={form.date} onChange={set('date')} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Inicio</Label><Input type="time" value={form.start_time} onChange={set('start_time')} className="h-11" /></div>
              <div className="space-y-1.5"><Label>Fin</Label><Input type="time" value={form.end_time} onChange={set('end_time')} className="h-11" /></div>
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Detalles adicionales…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={save} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="reservation-submit">{saving ? 'Reservando…' : 'Reservar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
