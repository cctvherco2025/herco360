import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, Trash2, AlertTriangle } from 'lucide-react';
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
import ParticipantPicker from '@/components/ParticipantPicker';
import RangeDatePicker from '@/components/RangeDatePicker';

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

const REMINDER_CHOICES = [
  { value: 1440, label: '1 día antes' },
  { value: 60, label: '1 hora antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 15, label: '15 minutos antes' },
  { value: 10, label: '10 minutos antes' },
];
// Recordatorios por defecto cuando no se elige nada (coincide con el backend).
const DEFAULT_REMINDERS = [60, 15];

// Normaliza lo que llega del backend (nuevo campo lista o el antiguo entero).
function readOffsets(activity) {
  if (Array.isArray(activity?.reminder_offsets)) return activity.reminder_offsets;
  if (activity?.reminder_minutes != null) {
    return activity.reminder_minutes > 0 ? [activity.reminder_minutes] : [];
  }
  return [...DEFAULT_REMINDERS];
}

const addHour = (t) => {
  const [h, m] = (t || '09:00').split(':').map(Number);
  const end = Math.min(h * 60 + m + 60, 20 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
};

const empty = (date, time) => ({
  title: '', color: DEFAULT_ACTIVITY_COLOR, date: date || ymd(new Date()), end_date: date || ymd(new Date()),
  start_time: time || '09:00', end_time: addHour(time || '09:00'), description: '', location: '',
  participant_ids: [], uses_meeting_room: false, recurrence: 'none',
  reminder_offsets: [...DEFAULT_REMINDERS],
});

export default function ActivityModal({ open, onOpenChange, activity, defaultDate, defaultTime, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState(empty(defaultDate, defaultTime));
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]); // grupos de usuarios: atajo para agregar participantes
  const [saving, setSaving] = useState(false);
  const isEdit = !!activity;
  const isOwner = activity ? (activity.created_by === user?.id || user?.role === 'admin') : true;
  const readOnly = isEdit && !isOwner;
  const myPart = (activity?.participants || []).find((p) => p.user_id === user?.id);

  useEffect(() => {
    if (open) {
      api.get('/users?status=approved').then(({ data }) => setUsers(data.filter((u) => u.id !== user?.id))).catch(() => {});
      api.get('/groups').then(({ data }) => setGroups(data)).catch(() => setGroups([]));
      setAbrirRango(false);
      if (activity) {
        const fin = activity.end_date || activity.date;
        setVariosDias(fin !== activity.date);
        setForm({
          title: activity.title, color: activity.color || DEFAULT_ACTIVITY_COLOR, date: activity.date,
          end_date: fin,
          start_time: activity.start_time, end_time: activity.end_time,
          description: activity.description || '', location: activity.location || '',
          participant_ids: (activity.participants || []).map((p) => p.user_id),
          uses_meeting_room: activity.uses_meeting_room || false,
          recurrence: 'none',
          reminder_offsets: readOffsets(activity),
        });
      } else {
        setVariosDias(false);
        setForm(empty(defaultDate, defaultTime));
      }
    }
  }, [open, activity, defaultDate, defaultTime, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ¿Está abierta la lista del buscador de participantes o el calendario de
  // "Varios días"? Si lo está, Escape solo la cierra (no cierra el modal).
  const participantsOpenRef = useRef(false);
  const rangoOpenRef = useRef(false);

  // ── Varios días ──────────────────────────────────────────────
  // En modo varios días "Inicio" es la hora del primer día y "Fin" la del
  // último. Una sola actividad con su rango (date → end_date).
  const [variosDias, setVariosDias] = useState(false);
  const [abrirRango, setAbrirRango] = useState(false);
  const activarVariosDias = () => {
    setVariosDias(true);
    setForm((f) => ({ ...f, end_date: '' })); // falta tocar el último día
    setAbrirRango(true);
  };
  const activarUnDia = () => {
    setVariosDias(false);
    setAbrirRango(false);
    setForm((f) => ({ ...f, end_date: f.date }));
  };
  const endDate = variosDias ? form.end_date : form.date;
  const faltaUltimoDia = variosDias && !form.end_date;
  // un solo día (o rango de un mismo día): Fin debe ser mayor que Inicio
  const horaInvalida = !faltaUltimoDia && endDate === form.date && form.end_time <= form.start_time;

  // Días del rango (para la regla de los lunes y el choque de repetición)
  const aFecha = (s) => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
  const diasDelRango = (() => {
    const a = aFecha(form.date); const b = aFecha(endDate) || a;
    if (!a) return [];
    const out = [];
    for (let d = new Date(a); d <= b && out.length < 40; d.setDate(d.getDate() + 1)) out.push(new Date(d));
    return out;
  })();
  const duracionDias = Math.max(0, diasDelRango.length - 1);

  // Una actividad de varios días que se repite no puede volver a empezar
  // antes de terminar (misma regla que valida el servidor).
  const repeticionChoca = (() => {
    if (isEdit || duracionDias === 0 || form.recurrence === 'none') return false;
    const inicio = aFecha(form.date);
    const siguiente = new Date(inicio);
    if (form.recurrence === 'daily') siguiente.setDate(siguiente.getDate() + 1);
    else if (form.recurrence === 'weekly') siguiente.setDate(siguiente.getDate() + 7);
    else if (form.recurrence === 'monthly') siguiente.setMonth(siguiente.getMonth() + 1);
    else return false;
    const [hi, mi] = form.start_time.split(':').map(Number);
    const [hf, mf] = form.end_time.split(':').map(Number);
    const fin = new Date(inicio); fin.setDate(fin.getDate() + duracionDias); fin.setHours(hf, mf, 0, 0);
    siguiente.setHours(hi, mi, 0, 0);
    return siguiente < fin;
  })();

  // Mondays the meeting room is reserved for Dirección Comercial (en
  // cualquiera de los días del rango).
  const MONDAY_MSG = 'Los lunes la Sala de Juntas está reservada para Dirección Comercial';
  const isMondaySelected = diasDelRango.some((d) => d.getDay() === 1);
  const roomBlocked = form.uses_meeting_room && isMondaySelected;
  const bloqueado = roomBlocked || horaInvalida || faltaUltimoDia || repeticionChoca;

  const save = async () => {
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    if (bloqueado) return;
    const payload = { ...form, end_date: endDate };
    setSaving(true);
    try {
      if (isEdit) { await api.put(`/activities/${activity.id}`, payload); toast.success('Actividad actualizada'); }
      else {
        const { data } = await api.post('/activities', payload);
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
    catch (err) { toast.error(err?.response?.data?.detail || 'Error al eliminar'); } finally { setSaving(false); }
  };

  const respond = async (response) => {
    setSaving(true);
    try {
      await api.post(`/activities/${activity.id}/respond`, { response });
      toast.success(response === 'accepted' ? 'Invitación aceptada' : 'Invitación rechazada');
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al responder');
    } finally { setSaving(false); }
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] rounded-[22px] p-0 overflow-hidden max-h-[92vh] flex flex-col"
        onEscapeKeyDown={(e) => { if (participantsOpenRef.current || rangoOpenRef.current) e.preventDefault(); }}>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-xl">{!isEdit ? 'Nueva actividad' : (readOnly ? 'Detalle de actividad' : 'Editar actividad')}</DialogTitle>
        </DialogHeader>
        {readOnly && (
          <div className="mx-6 mb-1 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2">
            Fuiste invitado por <span className="font-semibold">{activity?.created_by_name || 'otro usuario'}</span>. Solo el creador puede editar o eliminar esta actividad.
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <fieldset disabled={readOnly} className="px-6 pb-2 space-y-4 min-w-0 border-0">
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

            {/* Fecha · Inicio · Fin. En celular la fecha ocupa todo el ancho y
                las horas van debajo, lado a lado. "Varios días" cambia el input
                de fecha por un campo con calendario de rango. */}
            <div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-2 sm:col-span-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Fecha</Label>
                    {!readOnly && (
                      <button type="button" onClick={variosDias ? activarUnDia : activarVariosDias}
                        className="text-[11px] font-medium text-[#00a5df] hover:underline" data-testid="activity-form-multiday-toggle">
                        {variosDias ? 'Un solo día' : 'Varios días'}
                      </button>
                    )}
                  </div>
                  {variosDias ? (
                    <RangeDatePicker start={form.date} end={form.end_date} disabled={readOnly} autoOpen={abrirRango}
                      onChange={({ start, end }) => setForm((f) => ({ ...f, date: start, end_date: end }))}
                      onOpenChange={(o) => { rangoOpenRef.current = o; if (!o) setAbrirRango(false); }} />
                  ) : (
                    <Input data-testid="activity-form-date-picker" type="date" value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, end_date: e.target.value }))} className="h-11" />
                  )}
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label>Inicio</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} className="h-11" />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label>Fin</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className="h-11" />
                </div>
              </div>
              {horaInvalida && (
                <p className="text-xs text-[#dc2626] mt-1.5" data-testid="activity-form-time-error">La hora de fin debe ser mayor a la de inicio</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Participantes</Label>
              {/* Buscador de participantes: el valor sigue siendo form.participant_ids,
                  que se envía igual que antes al crear/editar la actividad. */}
              <ParticipantPicker
                users={users}
                groups={groups}
                value={form.participant_ids}
                onChange={(ids) => set('participant_ids', ids)}
                disabled={readOnly}
                onOpenChange={(o) => { participantsOpenRef.current = o; }}
              />
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
                {repeticionChoca ? (
                  <p className="text-xs text-[#dc2626]" data-testid="activity-form-recurrence-error">
                    La actividad dura {duracionDias + 1} días y se repetiría antes de terminar. Cambiá la repetición.
                  </p>
                ) : RECURRENCE_HINT[form.recurrence] && (
                  <p className="text-xs text-muted-foreground">{RECURRENCE_HINT[form.recurrence]}</p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Recordatorios</Label>
              <div className="flex flex-wrap gap-2" data-testid="activity-form-reminders">
                {REMINDER_CHOICES.map((c) => {
                  const on = (form.reminder_offsets || []).includes(c.value);
                  return (
                    <button
                      key={c.value}
                      type="button"
                      data-testid={`reminder-chip-${c.value}`}
                      onClick={() => set('reminder_offsets',
                        on
                          ? (form.reminder_offsets || []).filter((x) => x !== c.value)
                          : [...(form.reminder_offsets || []), c.value].sort((a, b) => b - a))}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                        on ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:bg-muted'
                      }`}>
                      {on && <Check className="h-3 w-3" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {(form.reminder_offsets || []).length === 0
                  ? 'Sin recordatorio: no se enviará ningún aviso.'
                  : 'Se avisará al creador y a los participantes (campana y notificación push si está activada).'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Detalles de la actividad…" rows={2} />
            </div>
          </fieldset>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          {isEdit && isOwner && (
            <Button variant="ghost" onClick={remove} disabled={saving} className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] mr-auto" data-testid="activity-form-delete">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
          {readOnly ? (
            myPart ? (
              <>
                <Button variant="outline" onClick={() => respond('rejected')} disabled={saving}
                  className="rounded-xl text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="activity-form-reject">
                  Rechazar
                </Button>
                <Button onClick={() => respond('accepted')} disabled={saving}
                  className="rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" data-testid="activity-form-accept">
                  {myPart.status === 'accepted' ? 'Aceptada ✓' : 'Aceptar'}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cerrar</Button>
            )
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
              <Button onClick={save} disabled={saving || bloqueado} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="activity-form-submit-button">
                {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear actividad')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}