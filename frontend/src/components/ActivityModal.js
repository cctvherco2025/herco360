import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Trash2, Users as UsersIcon, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ACTIVITY_COLORS, DEFAULT_ACTIVITY_COLOR } from '@/lib/constants';
import { ymd } from '@/lib/time';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'No se repite' },
  { value: 'daily', label: 'Cada día' },
  { value: 'weekly', label: 'Cada semana' },
  { value: 'monthly', label: 'Una vez al mes' },
];
const RECURRENCE_HINT = {
  daily: 'Se crearán 30 actividades diarias.',
  weekly: 'Se crearán 12 actividades semanales (mismo día de la semana).',
  monthly: 'Se crearán 6 actividades mensuales (mismo día del mes).',
};

const empty = (date) => ({
  title: '', color: DEFAULT_ACTIVITY_COLOR, date: date || ymd(new Date()),
  start_time: '09:00', end_time: '10:00', description: '', location: '',
  participant_ids: [], uses_meeting_room: false, recurrence: 'none',
});

export default function ActivityModal({ open, onOpenChange, activity, defaultDate, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState(empty(defaultDate));
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!activity;

  useEffect(() => {
    if (open) {
      api.get('/users?status=approved').then(({ data }) => setUsers(data.filter((u) => u.id !== user?.id))).catch(() => {});
      if (activity) {
        setForm({
          title: activity.title, color: activity.color || DEFAULT_ACTIVITY_COLOR, date: activity.date,
          start_time: activity.start_time, end_time: activity.end_time,
          description: activity.description || '', location: activity.location || '',
          participant_ids: (activity.participants || []).map((p) => p.user_id),
          uses_meeting_room: activity.uses_meeting_room || false,
          recurrence: 'none',
        });
      } else {
        setForm(empty(defaultDate));
      }
    }
  }, [open, activity, defaultDate, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleParticipant = (id) => set('participant_ids', form.participant_ids.includes(id)
    ? form.participant_ids.filter((x) => x !== id) : [...form.participant_ids, id]);

  // Mondays the meeting room is reserved for Dirección Comercial.
  const MONDAY_MSG = 'Los lunes la Sala de Juntas está reservada para Dirección Comercial';
  const isMondaySelected = (() => {
    if (!form.date) return false;
    const parts = form.date.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !n)) return false;
    return new Date(parts[0], parts[1] - 1, parts[2]).getDay() === 1; // 1 = Monday
  })();
  const roomBlocked = form.uses_meeting_room && isMondaySelected;

  const save = async () => {
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    if (form.end_time <= form.start_time) { toast.error('La hora de fin debe ser mayor a la de inicio'); return; }
    if (roomBlocked) { toast.error(MONDAY_MSG); return; }
    setSaving(true);
    try {
      if (isEdit) { await api.put(`/activities/${activity.id}`, form); toast.success('Actividad actualizada'); }
      else {
        const { data } = await api.post('/activities', form);
        toast.success(data?.series_count > 1 ? `Serie creada: ${data.series_count} actividades` : 'Actividad creada');
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!isEdit) return;
    setSaving(true);
    try { await api.delete(`/activities/${activity.id}`); toast.success('Actividad eliminada'); onOpenChange(false); onSaved?.(); }
    catch (err) { toast.error('Error al eliminar'); } finally { setSaving(false); }
  };

  const selectedUsers = users.filter((u) => form.participant_ids.includes(u.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] rounded-[22px] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-xl">{isEdit ? 'Editar actividad' : 'Nueva actividad'}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input data-testid="activity-form-title-input" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ej. Reunión de seguimiento" className="h-11" />
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-2.5" data-testid="activity-form-color-select">
              {ACTIVITY_COLORS.map((c) => {
                const active = (form.color || '').toLowerCase() === c.value.toLowerCase();
                return (
                  <button key={c.value} type="button" title={c.name} onClick={() => set('color', c.value)}
                    aria-label={c.name}
                    className={`h-8 w-8 rounded-full transition-transform hover:scale-110 grid place-items-center ${active ? 'ring-2 ring-offset-2 ring-offset-background scale-110' : ''}`}
                    style={{ background: c.value, boxShadow: active ? `0 0 0 2px ${c.value}` : 'none' }}>
                    {active && <Check className="h-4 w-4 text-white" />}
                  </button>
                );
              })}
              {/* Custom color */}
              <label className="relative h-8 w-8 rounded-full cursor-pointer border-2 border-dashed border-border grid place-items-center overflow-hidden hover:border-foreground/40" title="Color personalizado">
                <span className="text-[10px] font-bold text-muted-foreground">+</span>
                <input type="color" value={form.color} onChange={(e) => set('color', e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer" data-testid="activity-form-color-custom" />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input data-testid="activity-form-date-picker" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Inicio</Label>
              <Input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Fin</Label>
              <Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className="h-11" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Participantes</Label>
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" data-testid="activity-form-participants" className="w-full min-h-11 flex items-center gap-2 flex-wrap rounded-xl border bg-card px-3 py-2 text-sm text-left hover:bg-muted/50">
                  <UsersIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                  {selectedUsers.length === 0 && <span className="text-muted-foreground">Añadir participantes</span>}
                  {selectedUsers.map((u) => (
                    <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6] px-2 py-0.5 text-xs">
                      {u.name}
                    </span>
                  ))}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1.5 rounded-2xl max-h-[260px] overflow-y-auto">
                {users.map((u) => {
                  const active = form.participant_ids.includes(u.id);
                  return (
                    <button key={u.id} type="button" onClick={() => toggleParticipant(u.id)}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-muted text-left">
                      <Avatar className="h-7 w-7"><AvatarImage src={u.avatar_url} /><AvatarFallback>{u.name?.[0]}</AvatarFallback></Avatar>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{u.name}</span>
                        <span className="block text-xs text-muted-foreground truncate">{u.position}</span>
                      </span>
                      {active && <Check className="h-4 w-4 text-[#00a5df]" />}
                    </button>
                  );
                })}
                {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sin usuarios</p>}
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Reservar Sala de Juntas</p>
              <p className="text-xs text-muted-foreground">Bloquea la sala para esta actividad</p>
            </div>
            <Switch checked={form.uses_meeting_room} onCheckedChange={(v) => set('uses_meeting_room', v)} data-testid="activity-form-room-switch" />
          </div>

          {roomBlocked && (
            <div className="flex items-start gap-2 rounded-xl border border-[rgba(220,38,38,0.35)] bg-[rgba(220,38,38,0.08)] px-4 py-3" data-testid="activity-form-monday-warning">
              <AlertTriangle className="h-4 w-4 text-[#dc2626] shrink-0 mt-0.5" />
              <p className="text-xs text-[#dc2626]">{MONDAY_MSG}. Elige otro día o desactiva la reserva de sala.</p>
            </div>
          )}

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Repetición</Label>
              <Select value={form.recurrence} onValueChange={(v) => set('recurrence', v)}>
                <SelectTrigger className="h-11" data-testid="activity-form-recurrence-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {RECURRENCE_HINT[form.recurrence] && (
                <p className="text-xs text-muted-foreground">{RECURRENCE_HINT[form.recurrence]}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Detalles de la actividad…" rows={2} />
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          {isEdit && (
            <Button variant="ghost" onClick={remove} disabled={saving} className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] mr-auto" data-testid="activity-form-delete">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={save} disabled={saving || roomBlocked} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="activity-form-submit-button">
            {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear actividad')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
