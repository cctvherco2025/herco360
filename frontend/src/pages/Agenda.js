import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, CalendarDays, Check, X as XIcon, Eye, EyeOff, Users as UsersIcon, Palmtree, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessVacaciones } from '@/lib/constants';
import { fullDateEs, capitalize, ymd, MESES, MESES_CORTO, fmtHora } from '@/lib/time';
import ActivityModal from '@/components/ActivityModal';
import { confirmar } from '@/components/ConfirmDialog';
import { opcionesAlcance } from '@/lib/alcance';
import { opcionesRepeticion } from '@/lib/recurrence';
import { WeekView, DayView, MonthView, startOfWeek, addDays, esVariosDias, rangoCortoCal, MANT_COLOR } from '@/components/CalendarViews';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Colores fijos para los calendarios del equipo (fuera del componente: es una
// referencia estable y no entra como dependencia de los hooks).
const TEAM_COLORS = ['#0d9488', '#712146', '#ec9032', '#64748b', '#16a34a', '#dc2626', '#3cbef6', '#1e395e'];

// Resumen de un mantenimiento al tocarlo en el calendario (como una actividad).
function MantResumen({ m, ahora, onClose, onIr }) {
  if (!m) return null;
  const vencido = m.estado === 'pendiente' && m.vence_en <= ahora;
  const estado = m.proyectada ? { t: 'Programado', c: 'bg-muted text-muted-foreground' }
    : m.estado === 'completada' ? { t: m.tardia ? 'Hecho tarde' : 'Hecho', c: 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' }
      : m.estado === 'incompleta' ? { t: 'Incompleto', c: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' }
        : vencido ? { t: 'Vencido', c: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' }
          : m.estado === 'pendiente' ? { t: 'Por hacer', c: 'bg-[rgba(124,58,237,0.12)] text-[#7c3aed]' }
            : { t: 'Programado', c: 'bg-muted text-muted-foreground' };
  const fila = (k, v) => <div className="flex gap-3 text-sm"><span className="w-[92px] shrink-0 text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v}</span></div>;
  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[min(440px,100%)] max-w-none rounded-[22px]" data-testid="agenda-mant-resumen">
        <DialogHeader className="text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: MANT_COLOR }}>
              <Wrench className="h-3 w-3" /> Mantenimiento
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estado.c}`}>{estado.t}</span>
          </div>
          <DialogTitle className="font-heading text-xl pt-1">{m.checklist}</DialogTitle>
          <DialogDescription>{m.activo_codigo} · {m.activo_nombre} · {m.sucursal}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {fila('Cuándo', `${capitalize(fullDateEs(m.fecha))} · ${fmtHora(m.hora)}`)}
          {!m.proyectada && m.estado !== 'completada' && fila('Vence', `${capitalize(fullDateEs(m.vence_en.slice(0, 10)))} · ${fmtHora(m.vence_en.slice(11, 16))}`)}
          {fila('Tu papel', m.rol === 'supervisor' ? 'Lo supervisas' : 'Te toca hacerlo')}
          {fila('Planificación', m.plan_numero)}
          {m.proyectada && <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">Es de un ciclo que todavía no empieza: la tarea se crea sola al empezar su ciclo. Su fecha se puede cambiar desde la planificación.</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>Cerrar</Button>
          <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={() => onIr(m)} data-testid="agenda-mant-ir">
            {m.tarea_id ? (m.rol === 'responsable' && ['pendiente', 'programada'].includes(m.estado) ? 'Ir a llenarlo' : 'Ver el mantenimiento') : 'Ver la planificación'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Agenda() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('Semana');
  const [anchor, setAnchor] = useState(new Date());
  const [activities, setActivities] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDate, setPendingDate] = useState(ymd(new Date()));
  const [pendingTime, setPendingTime] = useState('09:00');
  const [team, setTeam] = useState([]);
  const [visible, setVisible] = useState({});
  const [teamEvents, setTeamEvents] = useState({});
  const [tareas, setTareas] = useState([]); // tareas con fecha límite (todo el día) en el rango
  // mantenimientos de activos (los que hace o supervisa), con un interruptor para verlos u ocultarlos
  const [mants, setMants] = useState({ ahora: '', mantenimientos: [] });
  const [verMant, setVerMant] = useState(() => { try { return localStorage.getItem('herco_agenda_mant') !== '0'; } catch (e) { return true; } });
  // el panel se muestra a quien hace o planifica mantenimientos, aunque no tenga ninguno en el rango
  const [conMant, setConMant] = useState(false);
  useEffect(() => { api.get('/mantenimiento/acceso').then(({ data }) => setConMant(!!(data.mis_tareas || data.planificar))).catch(() => {}); }, []);
  const toggleMant = () => setVerMant((v) => { try { localStorage.setItem('herco_agenda_mant', v ? '0' : '1'); } catch (e) { /* sin almacenamiento */ } return !v; });
  const navTareas = useNavigate();

  const colorFor = useCallback((id) => {
    const i = team.findIndex((m) => m.id === id);
    return TEAM_COLORS[(i >= 0 ? i : 0) % TEAM_COLORS.length];
  }, [team]);

  // Managers (Jefe/Gerente/Director) can overlay same-área calendars.
  useEffect(() => { api.get('/users/team').then(({ data }) => setTeam(data)).catch(() => {}); }, []);

  const load = useCallback(async () => {
    const s = ymd(addDays(startOfWeek(anchor), -7));
    const e = ymd(addDays(startOfWeek(anchor), 49));
    try { const { data } = await api.get(`/activities?start=${s}&end=${e}`); setActivities(data); } catch (err) {}
    try { const { data } = await api.get(`/tareas/agenda?start=${s}&end=${e}`); setTareas(data); } catch (err) { setTareas([]); }
    try { const { data } = await api.get(`/mantenimiento/agenda?start=${s}&end=${e}`); setMants(data); } catch (err) { setMants({ ahora: '', mantenimientos: [] }); }
  }, [anchor]);

  const fetchMember = useCallback(async (id) => {
    const s = ymd(addDays(startOfWeek(anchor), -7));
    const e = ymd(addDays(startOfWeek(anchor), 49));
    try {
      const { data } = await api.get(`/activities?start=${s}&end=${e}&user_id=${id}`);
      const member = team.find((m) => m.id === id);
      const color = colorFor(id);
      const first = (member?.name || 'Equipo').split(' ')[0];
      const tagged = data.map((a) => ({ ...a, foreign: true, owner_name: first, owner_id: id, color }));
      setTeamEvents((prev) => ({ ...prev, [id]: tagged }));
    } catch (err) {}
  }, [anchor, team, colorFor]);

  useEffect(() => { load(); }, [load]);
  // Refetch visible team calendars when the visible range changes.
  useEffect(() => {
    Object.keys(visible).forEach((id) => { if (visible[id]) fetchMember(id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const toggleMember = (id) => {
    setVisible((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      if (next[id]) fetchMember(id);
      return next;
    });
  };
  useEffect(() => {
    if (params.get('new') === '1') { setEditing(null); setModalOpen(true); setParams({}); }
  }, [params, setParams]);

  const filtered = [
    ...activities,
    ...team.filter((m) => visible[m.id]).flatMap((m) => teamEvents[m.id] || []),
  ];
  // Mantenimientos como actividades de 1 hora a su hora (los cruces se ven
  // igual que entre actividades). Fuera del horario del calendario (7:00 a
  // 20:00) se dibujan en su borde; la hora real va en el título y el resumen.
  const comoActividad = (m) => {
    const vencido = m.estado === 'pendiente' && m.vence_en <= mants.ahora;
    const [h, mi] = (m.hora || '08:00').split(':').map(Number);
    const ini = Math.min(Math.max(h * 60 + mi, 7 * 60), 19 * 60);
    const hhmm = (x) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    return {
      id: `mant-${m.id}`, mant: true, foreign: true, datos: m, pending: m.proyectada, date: m.fecha,
      start_time: hhmm(ini), end_time: hhmm(ini + 60),
      title: `${m.activo_codigo} · ${m.checklist}`,
      color: m.estado === 'incompleta' || vencido ? '#dc2626' : m.estado === 'completada' ? '#94a3b8' : MANT_COLOR,
    };
  };
  const enCalendario = [...filtered, ...(verMant ? mants.mantenimientos.map(comoActividad) : [])];
  const proxMant = mants.mantenimientos.filter((m) => m.estado !== 'completada' && m.estado !== 'incompleta' && m.fecha >= ymd(new Date())).slice(0, 5);
  const [mantSel, setMantSel] = useState(null); // mantenimiento del modal de resumen
  const openEvent = (ev) => { if (ev.mant) { setMantSel(ev.datos); return; } setEditing(ev); setModalOpen(true); };
  const openNew = (dateStr, time) => {
    setEditing(null);
    setPendingDate(typeof dateStr === 'string' ? dateStr : ymd(anchor));
    setPendingTime(time || '09:00');
    setModalOpen(true);
  };

  // Drag & drop: move an activity to a new day/time (creator or admin only).
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const minToTime = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const moveEvent = async (ev, newDate, newStart) => {
    if (ev.mant) { toast.message('La fecha de un mantenimiento se cambia en su planificación'); return; }
    if (ev.created_by !== user?.id && user?.role !== 'admin') {
      toast.error('Solo el creador puede mover esta actividad'); return;
    }
    if (ev.date === newDate && ev.start_time === newStart) return;
    // Repetición de una serie: primero se pregunta si mueve solo esta,
    // esta y las siguientes o todas.
    if (ev.rrule || ev.serie_madre) {
      const alc = await confirmar({
        tipo: 'normal',
        titulo: 'Mover actividad que se repite',
        mensaje: <>¿Qué repeticiones de <b>{ev.title}</b> quieres mover al <b>{newDate}</b> a las <b>{newStart}</b>?</>,
        opciones: opcionesAlcance(false),
        textoConfirmar: 'Mover',
        textoCargando: 'Moviendo…',
        accion: (a) => mover(ev, newDate, newStart, a),
      });
      if (alc) { toast.success('Actividad movida'); load(); }
      return;
    }
    try {
      await mover(ev, newDate, newStart, null);
      toast.success('Actividad movida');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'No se pudo mover'); }
  };
  // Envía el cambio de fecha/hora (lanza el error a quien llama).
  const mover = async (ev, newDate, newStart, alcance) => {
    const dur = Math.max(30, toMin(ev.end_time) - toMin(ev.start_time));
    let endM = Math.min(toMin(newStart) + dur, 20 * 60);
    const payload = {
      title: ev.title, color: ev.color, date: newDate,
      start_time: newStart, end_time: minToTime(endM),
      description: ev.description || '', location: ev.location || '',
      participant_ids: (ev.participants || []).map((p) => p.user_id),
      uses_meeting_room: ev.uses_meeting_room || false,
      reminder_offsets: Array.isArray(ev.reminder_offsets)
        ? ev.reminder_offsets
        : (ev.reminder_minutes != null ? (ev.reminder_minutes > 0 ? [ev.reminder_minutes] : []) : [60, 15]),
    };
    // "Cada semana" / "Una vez al mes" siguen al nuevo día al mover la serie
    // (o esta y las siguientes); una regla personalizada se conserva.
    if (alcance && alcance !== 'esta' && ev.rrule) {
      const op = opcionesRepeticion(ev.date).find((o) => o.regla === ev.rrule);
      const nueva = op && opcionesRepeticion(newDate).find((o) => o.key === op.key);
      if (nueva) payload.rrule = nueva.regla;
    }
    const params = alcance ? { alcance, ...(ev.serie_madre ? {} : { ocurrencia: ev.date }) } : undefined;
    await api.put(`/activities/${ev.id}`, payload, { params });
  };

  // incluye las de varios días que ya empezaron y todavía no terminan
  const upcoming = activities
    .filter((a) => (a.end_date || a.date) >= ymd(new Date()))
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
    .slice(0, 6);

  const respond = async (activityId, response, e) => {
    e.stopPropagation();
    try { await api.post(`/activities/${activityId}/respond`, { response }); toast.success(response === 'accepted' ? 'Participación aceptada' : 'Participación rechazada'); load(); }
    catch (err) { toast.error('Error al responder'); }
  };

  const myInvite = (a) => (a.participants || []).find((p) => p.user_id === user?.id && p.status === 'invited');

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
  <div>
    <h1 className="font-heading text-2xl sm:text-3xl font-semibold">Agenda</h1>
    <p className="text-muted-foreground text-sm mt-0.5">Gestiona las actividades y reuniones de tu equipo</p>
  </div>
  <div className="flex items-center gap-2">
    {canAccessVacaciones(user) && (
      <Button asChild variant="outline" className="rounded-xl flex-1 sm:flex-none" data-testid="agenda-vacations-button">
        <Link to="/vacaciones"><Palmtree className="h-4 w-4 mr-1.5" /> Vacaciones</Link>
      </Button>
    )}
    <Button onClick={openNew} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white flex-1 sm:flex-none" data-testid="agenda-new-activity-button"><Plus className="h-4 w-4 mr-1" /> Nueva actividad</Button>
  </div>
</div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="lg:col-span-3 rounded-[18px] bg-card border shadow-card p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
                <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-muted" data-testid="agenda-prev"><ChevronLeft className="h-4 w-4" /></button>
                <button onClick={() => setAnchor(new Date())} className="px-3 py-1 text-sm font-medium rounded-lg hover:bg-muted" data-testid="agenda-today">Hoy</button>
                <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-muted" data-testid="agenda-next"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <span className="text-sm font-medium">{rangeLabel()}</span>
            </div>
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="rounded-xl">
                <TabsTrigger value="Día" className="rounded-lg text-xs" data-testid="agenda-view-dia">Día</TabsTrigger>
                <TabsTrigger value="Semana" className="rounded-lg text-xs" data-testid="agenda-view-semana">Semana</TabsTrigger>
                <TabsTrigger value="Mes" className="rounded-lg text-xs" data-testid="agenda-view-mes">Mes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="overflow-hidden">
            {view === 'Semana' && <WeekView anchor={anchor} activities={enCalendario} onEventClick={openEvent} onSlotClick={(ds, t) => openNew(ds, t)} onEventMove={moveEvent} onNuevoEnDia={(ds) => openNew(ds)} tareas={tareas} onTareaClick={(t) => navTareas(`/tareas/${t.id}`)} />}
            {view === 'Día' && <DayView anchor={anchor} activities={enCalendario} onEventClick={openEvent} onSlotClick={(ds, t) => openNew(ds, t)} onEventMove={moveEvent} onNuevoEnDia={(ds) => openNew(ds)} tareas={tareas} onTareaClick={(t) => navTareas(`/tareas/${t.id}`)} />}
            {view === 'Mes' && <MonthView anchor={anchor} activities={enCalendario} onEventClick={openEvent} onSlotClick={(ds) => openNew(ds)} onEventMove={moveEvent} tareas={tareas} onTareaClick={(t) => navTareas(`/tareas/${t.id}`)} />}
          </div>
        </motion.div>

        {/* Right rail */}
        <div className="space-y-4">
          {team.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.08 }}
              className="rounded-[18px] bg-card border shadow-card p-5" data-testid="team-calendars-panel">
              <div className="flex items-center gap-2 mb-3">
                <UsersIcon className="h-4 w-4 text-[#1e395e] dark:text-[#3cbef6]" />
                <h3 className="font-heading font-semibold">Calendarios del equipo</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-3">Activa para ver el calendario de tu equipo sobre el tuyo.</p>
              <div className="space-y-1.5 max-h-[260px] overflow-y-auto">
                {team.map((m) => {
                  const on = !!visible[m.id];
                  const color = colorFor(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleMember(m.id)} data-testid="team-calendar-toggle"
                      className={`w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-colors ${on ? 'bg-muted/50' : 'hover:bg-muted/40'}`}>
                      <span className="h-3 w-3 rounded-full shrink-0 border-2" style={{ borderColor: color, background: on ? color : 'transparent' }} />
                      <Avatar className="h-7 w-7 shrink-0"><AvatarImage src={m.avatar_url} /><AvatarFallback>{m.name?.[0]}</AvatarFallback></Avatar>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{m.name}</span>
                        <span className="block text-[11px] text-muted-foreground truncate">{m.position}{m.area ? ` · ${m.area}` : ''}</span>
                      </span>
                      {on ? <Eye className="h-4 w-4 text-[#1e395e] dark:text-[#3cbef6] shrink-0" /> : <EyeOff className="h-4 w-4 text-muted-foreground/50 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {(conMant || mants.mantenimientos.length > 0) && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
              className="rounded-[18px] bg-card border shadow-card p-5" data-testid="agenda-mant-panel">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="h-4 w-4" style={{ color: MANT_COLOR }} />
                <h3 className="font-heading font-semibold flex-1">Mantenimientos</h3>
                <Switch checked={verMant} onCheckedChange={toggleMant} aria-label="Mostrar mantenimientos en el calendario" data-testid="agenda-mant-toggle" />
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                En el calendario van a su hora, en violeta con <Wrench className="inline h-3 w-3" />. Borde punteado: programado de un ciclo que todavía no empieza.
              </p>
              <div className="space-y-2">
                {!proxMant.length && <p className="text-sm text-muted-foreground text-center py-2">Sin mantenimientos próximos en este rango</p>}
                {proxMant.map((m) => (
                  <button key={m.id} type="button" onClick={() => setMantSel(m)}
                    className="w-full text-left rounded-xl border p-3 hover:shadow-card transition-shadow"
                    style={{ borderLeft: `3px ${m.proyectada ? 'dashed' : 'solid'} ${m.estado === 'pendiente' && m.vence_en <= mants.ahora ? '#dc2626' : MANT_COLOR}` }}>
                    <span className="block text-sm font-medium truncate">{m.activo_codigo} · {m.checklist}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {capitalize(fullDateEs(m.fecha))} · {fmtHora(m.hora)}{m.rol === 'supervisor' ? ' · lo supervisas' : ''}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12 }}
            className="rounded-[18px] bg-card border shadow-card p-5">
            <h3 className="font-heading font-semibold mb-3">Próximas actividades</h3>
            <div className="space-y-2">
              {upcoming.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Sin actividades próximas</p>}
              {upcoming.map((a) => {
                const solid = a.color || '#00a5df';
                const invite = myInvite(a);
                return (
                  <div key={`${a.id}-${a.date}`} onClick={() => openEvent(a)} className="rounded-xl border p-3 cursor-pointer hover:shadow-card transition-shadow" style={{ borderLeft: `3px solid ${solid}` }}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: solid }} />
                      <span className="text-sm font-medium truncate">{a.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {esVariosDias(a) ? `${rangoCortoCal(a)} · ${fmtHora(a.start_time)}` : `${capitalize(fullDateEs(a.date))} · ${fmtHora(a.start_time)}`}
                    </p>
                    {invite && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={(e) => respond(a.id, 'accepted', e)} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[rgba(22,163,74,0.12)] text-[#16a34a] text-xs font-medium py-1.5 hover:bg-[rgba(22,163,74,0.2)]" data-testid="agenda-accept"><Check className="h-3.5 w-3.5" /> Aceptar</button>
                        <button onClick={(e) => respond(a.id, 'rejected', e)} className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-[rgba(220,38,38,0.1)] text-[#dc2626] text-xs font-medium py-1.5 hover:bg-[rgba(220,38,38,0.18)]" data-testid="agenda-reject"><XIcon className="h-3.5 w-3.5" /> Rechazar</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>

      <MantResumen m={mantSel} ahora={mants.ahora} onClose={() => setMantSel(null)}
        onIr={(m) => { setMantSel(null); navTareas(m.tarea_id ? `/mantenimiento/tareas/${m.tarea_id}` : `/mantenimiento/planificaciones/${m.plan_id}`); }} />
      <ActivityModal open={modalOpen} onOpenChange={setModalOpen} activity={editing} defaultDate={pendingDate} defaultTime={pendingTime} onSaved={load} />
    </div>
  );
}