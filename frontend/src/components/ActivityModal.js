import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Check, Trash2, AlertTriangle, Pencil, CalendarDays, Clock, Repeat, Users, Bell, StickyNote, Building2, UserRound, MapPin,
} from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ParticipantPicker from '@/components/ParticipantPicker';
import RangeDatePicker from '@/components/RangeDatePicker';
import RecurrenceDialog from '@/components/RecurrenceDialog';
import AlcanceDialog from '@/components/AlcanceDialog';
import {
  opcionesRepeticion, describirRegla, fechasEnRango, proximasFechas,
  repeticionChoca as chocaRepeticion,
} from '@/lib/recurrence';

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

const TODO_EL_DIA = { start: '08:00', end: '18:00' };

const addHour = (t) => {
  const [h, m] = (t || '09:00').split(':').map(Number);
  const end = Math.min(h * 60 + m + 60, 20 * 60);
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
};

const empty = (date, time) => ({
  title: '', color: DEFAULT_ACTIVITY_COLOR, date: date || ymd(new Date()), end_date: date || ymd(new Date()),
  start_time: time || '09:00', end_time: addHour(time || '09:00'), description: '', location: '',
  participant_ids: [], uses_meeting_room: false,
  reminder_offsets: [...DEFAULT_REMINDERS],
});

// ── Vista de detalle (se muestra al abrir una actividad existente) ──
const aHora12 = (t) => {
  const [h, m] = (t || '00:00').split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
};
const aFechaLocal = (s) => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const fechaLarga = (s, conAnio = true) => {
  const d = aFechaLocal(s);
  if (!d) return '';
  const t = d.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', ...(conAnio ? { year: 'numeric' } : {}) });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const ESTADO_PARTICIPANTE = {
  accepted: { label: 'Aceptó', cls: 'bg-[rgba(22,163,74,0.12)] text-[#16a34a]' },
  rejected: { label: 'Rechazó', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' },
  invited: { label: 'Pendiente', cls: 'bg-muted text-muted-foreground' },
};
const iniciales = (n) => (n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

function Fila({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function DetalleActividad({ activity }) {
  const ini = activity.date;
  const fin = activity.end_date || activity.date;
  const todoElDia = activity.start_time === TODO_EL_DIA.start && activity.end_time === TODO_EL_DIA.end;
  const horas = todoElDia ? 'Todo el día' : `${aHora12(activity.start_time)} – ${aHora12(activity.end_time)}`;
  const recordatorios = readOffsets(activity)
    .map((v) => REMINDER_CHOICES.find((c) => c.value === v)?.label || `${v} minutos antes`);
  const participantes = activity.participants || [];
  return (
    <div className="px-6 pb-4 space-y-4" data-testid="activity-detail">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-4 w-4 rounded-full shrink-0" style={{ background: activity.color || DEFAULT_ACTIVITY_COLOR }} />
        <h3 className="font-heading text-lg font-semibold leading-snug break-words min-w-0">{activity.title}</h3>
      </div>

      <div className="rounded-xl border bg-card px-4 py-3 space-y-3">
        <Fila icon={CalendarDays}>
          {fin !== ini ? (
            <>
              <p>{fechaLarga(ini, false)} <span className="text-muted-foreground">({aHora12(activity.start_time)})</span></p>
              <p>hasta {fechaLarga(fin)} <span className="text-muted-foreground">({aHora12(activity.end_time)})</span></p>
            </>
          ) : <p>{fechaLarga(ini)}</p>}
        </Fila>
        {fin === ini && <Fila icon={Clock}><p>{horas}</p></Fila>}
        {activity.rrule && <Fila icon={Repeat}><p>Se repite {describirRegla(activity.rrule)}</p></Fila>}
        {!activity.rrule && activity.series_id && <Fila icon={Repeat}><p>Forma parte de una serie de actividades</p></Fila>}
        {activity.location && <Fila icon={MapPin}><p>{activity.location}</p></Fila>}
        {activity.uses_meeting_room && <Fila icon={Building2}><p>Sala de Juntas reservada</p></Fila>}
        {activity.created_by_name && (
          <Fila icon={UserRound}><p><span className="text-muted-foreground">Organiza:</span> {activity.created_by_name}</p></Fila>
        )}
      </div>

      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          <Users className="h-3.5 w-3.5" /> Participantes {participantes.length > 0 && `(${participantes.length})`}
        </p>
        {participantes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin participantes invitados.</p>
        ) : (
          <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
            {participantes.map((p) => {
              const e = ESTADO_PARTICIPANTE[p.status] || ESTADO_PARTICIPANTE.invited;
              return (
                <div key={p.user_id} className="flex items-center gap-2.5">
                  {p.avatar_url
                    ? <img src={p.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
                    : <span className="h-7 w-7 rounded-full bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6] grid place-items-center text-[10px] font-semibold shrink-0">{iniciales(p.name)}</span>}
                  <span className="flex-1 min-w-0 truncate text-sm">{p.name}</span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${e.cls}`}>{e.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          <Bell className="h-3.5 w-3.5" /> Recordatorios
        </p>
        <p className="text-sm">{recordatorios.length ? recordatorios.join(' · ') : 'Sin recordatorio'}</p>
      </div>

      <div>
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
          <StickyNote className="h-3.5 w-3.5" /> Notas
        </p>
        {activity.description
          ? <p className="text-sm whitespace-pre-wrap break-words">{activity.description}</p>
          : <p className="text-sm text-muted-foreground">Sin notas.</p>}
      </div>
    </div>
  );
}

export default function ActivityModal({ open, onOpenChange, activity, defaultDate, defaultTime, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState(empty(defaultDate, defaultTime));
  // Una actividad existente se abre primero en modo "ver"; el creador (o un
  // admin) pasa a "editar" con el botón Editar.
  const [modo, setModo] = useState('ver');
  const [recarga, setRecarga] = useState(0); // Cancelar en "editar": vuelve a "ver" y descarta cambios
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
      setRecOpen(false);
      setAlcance(null);
      setRepTocada(false);
      setModo(activity ? 'ver' : 'editar');
      if (activity) {
        // Una repetición se abre con SU fecha; al guardar se elige si el
        // cambio aplica solo a esta, a esta y las siguientes o a todas.
        const ini = activity.date;
        const fin = activity.end_date || activity.date;
        setVariosDias(fin !== ini);
        setTodoElDia(activity.start_time === TODO_EL_DIA.start && activity.end_time === TODO_EL_DIA.end);
        const simple = activity.rrule && opcionesRepeticion(ini).find((o) => o.regla === activity.rrule);
        setRepKey(!activity.rrule ? 'none' : simple ? simple.key : 'custom');
        setReglaCustom(activity.rrule && !simple ? activity.rrule : '');
        setForm({
          title: activity.title, color: activity.color || DEFAULT_ACTIVITY_COLOR, date: ini,
          end_date: fin,
          start_time: activity.start_time, end_time: activity.end_time,
          description: activity.description || '', location: activity.location || '',
          participant_ids: (activity.participants || []).map((p) => p.user_id),
          uses_meeting_room: activity.uses_meeting_room || false,
          reminder_offsets: readOffsets(activity),
        });
      } else {
        setVariosDias(false);
        setTodoElDia(false);
        setRepKey('none');
        setReglaCustom('');
        setForm(empty(defaultDate, defaultTime));
      }
    }
  }, [open, activity, defaultDate, defaultTime, user, recarga]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // ¿Está abierta la lista del buscador de participantes o el calendario de
  // "Varios días"? Si lo está, Escape solo la cierra (no cierra el modal).
  const participantsOpenRef = useRef(false);
  const rangoOpenRef = useRef(false);

  // ── Varios días ──────────────────────────────────────────────
  // En modo varios días "Inicio" es la hora del primer día y "Fin" la del
  // último. Una sola actividad con su rango (date → end_date).
  const [variosDias, setVariosDias] = useState(false);
  // "Todo el día": de 8:00 a 18:00 (en varios días, 8:00 del primero a 18:00
  // del último); las horas quedan fijas mientras esté marcado.
  const [todoElDia, setTodoElDia] = useState(false);
  const marcarTodoElDia = (v) => {
    setTodoElDia(v);
    if (v) setForm((f) => ({ ...f, start_time: TODO_EL_DIA.start, end_time: TODO_EL_DIA.end }));
  };
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

  // ── Repetición (RRULE) ───────────────────────────────────────
  // Opciones fijas: No se repite / Cada día / Cada semana / Una vez al mes.
  // "Personalizado…" abre RecurrenceDialog y define la repetición solo de esta
  // actividad (no queda como opción guardada). Las series viejas (un registro
  // por fecha) y las repeticiones editadas aparte no cambian su repetición.
  const puedeRepetir = !isEdit || !(activity?.series_id || activity?.serie_madre);
  const [repKey, setRepKey] = useState('none');
  const [reglaCustom, setReglaCustom] = useState('');
  const [recOpen, setRecOpen] = useState(false);
  const [repTocada, setRepTocada] = useState(false); // el usuario cambió la repetición
  // Actividad de una serie con RRULE (una repetición o una editada aparte):
  // guardar / eliminar pregunta el alcance.
  const esSerie = isEdit && !!(activity?.rrule || activity?.serie_madre);
  const [alcance, setAlcance] = useState(null); // null | 'guardar' | 'eliminar'
  const opciones = useMemo(() => opcionesRepeticion(form.date), [form.date]);
  const reglaActual = repKey === 'custom' ? reglaCustom : (opciones.find((o) => o.key === repKey)?.regla || '');

  const elegirRepeticion = (v) => {
    if (v === 'custom') setRecOpen(true); // se aplica al tocar "Listo"
    else { setRepKey(v); setRepTocada(true); }
  };
  const aplicarPersonalizada = (regla) => {
    setRecOpen(false);
    setRepTocada(true);
    const simple = opciones.find((o) => o.regla === regla);
    setRepKey(simple ? simple.key : 'custom');
    setReglaCustom(simple ? '' : regla);
    // Si la fecha elegida no cumple la regla (miércoles con "cada lunes"), la
    // actividad empieza en la primera fecha que sí la cumple (misma duración).
    const [primera] = proximasFechas(regla, form.date, form.start_time, 1);
    if (primera && primera !== form.date) {
      const fin = aFecha(primera); fin.setDate(fin.getDate() + duracionDias);
      setForm((x) => ({ ...x, date: primera, end_date: faltaUltimoDia ? '' : ymd(fin) }));
    }
  };

  // Una actividad de varios días que se repite no puede volver a empezar
  // antes de terminar (misma regla que valida el servidor).
  const repeticionChoca = useMemo(
    () => puedeRepetir && !faltaUltimoDia && chocaRepeticion(reglaActual, form.date, form.start_time, form.end_time, duracionDias),
    [puedeRepetir, faltaUltimoDia, reglaActual, form.date, form.start_time, form.end_time, duracionDias]);

  // Mondays the meeting room is reserved for Dirección Comercial (en
  // cualquiera de los días del rango y, si se repite, de las repeticiones de
  // los próximos 12 meses: la sala se reserva hasta ese horizonte).
  const MONDAY_MSG = 'Los lunes la Sala de Juntas está reservada para Dirección Comercial';
  const isMondaySelected = diasDelRango.some((d) => d.getDay() === 1);
  const repeticionEnLunes = useMemo(() => {
    if (!form.uses_meeting_room || !reglaActual || !puedeRepetir) return false;
    return fechasEnRango(reglaActual, form.date, form.start_time, 365).some((f) => {
      const d = aFecha(f);
      for (let i = 0; i <= duracionDias; i += 1) { if (d.getDay() === 1) return true; d.setDate(d.getDate() + 1); }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.uses_meeting_room, reglaActual, puedeRepetir, form.date, form.start_time, duracionDias]);
  const roomBlocked = form.uses_meeting_room && (isMondaySelected || repeticionEnLunes);
  const bloqueado = roomBlocked || horaInvalida || faltaUltimoDia || repeticionChoca;

  // Regla que se manda al guardar. Al editar una serie sin tocar la
  // repetición ni la fecha no se manda (el servidor conserva la regla exacta,
  // p. ej. "día 31" en un mes de 30).
  const reglaAEnviar = () => {
    if (!puedeRepetir) return undefined;
    if (isEdit && activity?.rrule && !repTocada && form.date === activity.date) return undefined;
    return reglaActual;
  };
  const reglaCambio = esSerie && !!activity?.rrule && (() => {
    const r = reglaAEnviar();
    return r !== undefined && r !== activity.rrule;
  })();
  // En una serie: la repetición abierta (su fecha original) y el alcance elegido.
  const paramsAlcance = (a) => (a ? { alcance: a, ...(activity.serie_madre ? {} : { ocurrencia: activity.date }) } : undefined);

  const MENSAJES = {
    esta: 'Se actualizó esta actividad', siguientes: 'Se actualizaron esta y las siguientes', todas: 'Se actualizaron todas las repeticiones',
  };
  const guardar = async (alc) => {
    const payload = { ...form, end_date: endDate, recurrence: 'none' };
    // "" = no se repite (al editar, deja de repetirse); sin el campo se
    // conserva lo que tenía.
    const regla = reglaAEnviar();
    if (regla !== undefined) payload.rrule = regla;
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/activities/${activity.id}`, payload, { params: paramsAlcance(alc) });
        toast.success(alc ? MENSAJES[alc] : 'Actividad actualizada');
      } else {
        const { data } = await api.post('/activities', payload);
        toast.success(data?.rrule
          ? `Actividad creada: se repite ${describirRegla(data.rrule, { conFin: false })}`
          : 'Actividad creada');
      }
      setAlcance(null);
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Error al guardar');
    } finally { setSaving(false); }
  };
  const save = () => {
    if (!form.title.trim()) { toast.error('Ingresa un título'); return; }
    if (bloqueado) return;
    if (esSerie) setAlcance('guardar'); // pregunta: solo esta / siguientes / todas
    else guardar(null);
  };

  const ELIMINADAS = {
    esta: 'Se eliminó esta actividad', siguientes: 'Se eliminaron esta y las siguientes', todas: 'Se eliminó toda la serie',
  };
  const eliminar = async (alc) => {
    setSaving(true);
    try {
      await api.delete(`/activities/${activity.id}`, { params: paramsAlcance(alc) });
      toast.success(alc ? ELIMINADAS[alc] : 'Actividad eliminada');
      setAlcance(null);
      onOpenChange(false);
      onSaved?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al eliminar'); } finally { setSaving(false); }
  };
  const remove = () => {
    if (!isEdit) return;
    if (esSerie) setAlcance('eliminar');
    else eliminar(null);
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
          <DialogTitle className="font-heading text-xl">{!isEdit ? 'Nueva actividad' : (modo === 'ver' ? 'Detalle de actividad' : 'Editar actividad')}</DialogTitle>
        </DialogHeader>
        {readOnly && modo === 'ver' && (
          <div className="mx-6 mb-1 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2">
            Fuiste invitado por <span className="font-semibold">{activity?.created_by_name || 'otro usuario'}</span>. Solo el creador puede editar o eliminar esta actividad.
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {isEdit && modo === 'ver' ? <DetalleActividad activity={activity} /> : (
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
                  <div className="flex h-5 items-center justify-between gap-2">
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
                  <Label className="flex h-5 items-center">Inicio</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} disabled={todoElDia} className="h-11" />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <Label className="flex h-5 items-center">Fin</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} disabled={todoElDia} className="h-11" />
                </div>
              </div>
              {!readOnly && (
                <label className="mt-2.5 inline-flex items-center gap-2 text-sm cursor-pointer select-none" data-testid="activity-form-allday">
                  <Checkbox checked={todoElDia} onCheckedChange={(v) => marcarTodoElDia(!!v)} />
                  Todo el día <span className="text-xs text-muted-foreground">(8:00 a. m. a 6:00 p. m.)</span>
                </label>
              )}
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
                <p className="text-xs text-[#dc2626]">
                  {isMondaySelected
                    ? `${MONDAY_MSG}. Elige otro día o desactiva la reserva de sala.`
                    : `${MONDAY_MSG} y alguna repetición cae en lunes. Cambiá la repetición o desactiva la reserva de sala.`}
                </p>
              </div>
            )}

            {puedeRepetir && (
              <div className="space-y-1.5">
                <Label>Repetición</Label>
                <Select value={repKey} onValueChange={elegirRepeticion}>
                  <SelectTrigger className="h-11 [&>span]:truncate" data-testid="activity-form-recurrence-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {opciones.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
                    {/* Si ya estaba en "Personalizado…", elegirlo otra vez no
                        dispara onValueChange: se abre la ventana desde el ítem
                        (mouse, toque o teclado) para poder editar la regla. */}
                    <SelectItem value="custom"
                      onPointerUp={() => setRecOpen(true)}
                      onClick={() => setRecOpen(true)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRecOpen(true); }}>
                      Personalizado…
                    </SelectItem>
                  </SelectContent>
                </Select>
                {/* Una sola línea y solo cuando aporta algo: regla personalizada
                    (con su fin; tocarla la vuelve a abrir) o un conflicto en rojo. */}
                {repeticionChoca ? (
                  <p className="text-xs text-[#dc2626]" data-testid="activity-form-recurrence-error">
                    La actividad dura {duracionDias + 1} días y se repetiría antes de terminar. Cambiá la repetición.
                  </p>
                ) : repKey === 'custom' && reglaCustom && (
                  <button type="button" onClick={() => setRecOpen(true)} title="Cambiar la repetición"
                    className="block w-full text-left text-xs text-muted-foreground truncate hover:underline" data-testid="activity-form-recurrence-hint">
                    Se repite {describirRegla(reglaCustom)}
                  </button>
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
          )}
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          {isEdit && isOwner && (
            <Button variant="ghost" onClick={remove} disabled={saving} className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] mr-auto" data-testid="activity-form-delete">
              <Trash2 className="h-4 w-4 mr-1" /> Eliminar
            </Button>
          )}
          {isEdit && isOwner && modo === 'ver' ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cerrar</Button>
              <Button onClick={() => setModo('editar')} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="activity-edit-button">
                <Pencil className="h-4 w-4 mr-1.5" /> Editar
              </Button>
            </>
          ) : readOnly ? (
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
              <Button variant="outline" className="rounded-xl"
                onClick={() => (isEdit ? setRecarga((n) => n + 1) : onOpenChange(false))}>
                Cancelar
              </Button>
              <Button onClick={save} disabled={saving || bloqueado} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="activity-form-submit-button">
                {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear actividad')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
      <RecurrenceDialog open={recOpen} onOpenChange={setRecOpen} fecha={form.date} horaInicio={form.start_time}
        regla={reglaActual} onListo={aplicarPersonalizada} />
      <AlcanceDialog open={!!alcance} onOpenChange={(o) => { if (!o) setAlcance(null); }} accion={alcance || 'guardar'}
        soloEstaDeshabilitada={alcance === 'guardar' && reglaCambio} ocupado={saving}
        onAceptar={(alc) => (alcance === 'eliminar' ? eliminar(alc) : guardar(alc))} />
    </Dialog>
  );
}