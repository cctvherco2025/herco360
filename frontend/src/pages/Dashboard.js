import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Users, Clock, Activity, ArrowRight, Plus, ChevronLeft, ChevronRight, Bookmark, Bell, Percent, ListChecks, Check } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { greetingEs, fullDateEs, timeAgoEs, capitalize, ymd, MESES_CORTO, fmtHora } from '@/lib/time';
import { catStyle, ROOM_STATES, puedeVerTickets } from '@/lib/constants';
import ActivityModal from '@/components/ActivityModal';
import { WeekView, DayView, MonthView, startOfWeek, addDays } from '@/components/CalendarViews';
import { useTheme } from '@/context/ThemeContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { periodoLabel } from '@/pages/PromocionesHome';
import { ESTADO_TAREA, estadoVisible } from '@/components/promociones/PromoRevision';
import { PlazoChip } from '@/lib/promoPlazos';
import { PrioridadTarea, FechaLimite } from '@/pages/Tareas';

// Promociones del mes en Inicio: al coordinador de tienda, lo que falta por
// contestar y lo que ya contestó; al jefe y al gerente de tienda (revisan),
// cada categoría de su tienda. A nadie más se le muestra.
function PromosPendientes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [tickets, setTickets] = useState(0);
  useEffect(() => { api.get('/promo-tareas/mias').then(({ data: d }) => setData(d)).catch(() => {}); }, []);
  useEffect(() => {
    if (!puedeVerTickets(user)) return;
    api.get('/tickets/contador').then(({ data: d }) => setTickets(d.pendientes || 0)).catch(() => {});
  }, [user]);
  const hayPubs = !!data?.rol && data.publicaciones.length > 0;
  if (!hayPubs && !tickets) return null;
  const jefe = data?.rol === 'revisor';
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.16 }}
      className="rounded-[18px] bg-card border shadow-card p-5 mb-6" data-testid="dashboard-promos-card">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="h-9 w-9 rounded-full grid place-items-center bg-[rgba(22,163,74,0.12)]"><Percent className="h-4 w-4 text-[#16a34a]" /></span>
        <div>
          <h2 className="font-heading font-semibold">Promociones del mes</h2>
          <p className="text-xs text-muted-foreground">{!hayPubs ? 'Tickets por atender' : jefe ? `Lo que contestó ${data.publicaciones[0].tienda}` : 'Elige tu tienda y categoría al contestar'}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {tickets > 0 && (
          <div className="rounded-xl border border-[#dc2626]/40 bg-[rgba(220,38,38,0.05)] p-3.5 flex flex-wrap items-center gap-3" data-testid="dashboard-tickets">
            <p className="flex-1 min-w-[180px] text-sm font-medium">
              {tickets} ticket{tickets === 1 ? '' : 's'} por atender
              <span className="block text-xs text-muted-foreground font-normal">{jefe ? 'Correcciones por validar' : 'Inconsistencias por corregir'}</span>
            </p>
            <Button size="sm" className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={() => navigate('/formularios/tickets')}>Ver tickets</Button>
          </div>
        )}
        {hayPubs && data.publicaciones.map((p) => {
          return (
            <div key={p.id} className="rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.titulo} · {periodoLabel(p.periodo)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {jefe
                    ? `${p.tareas.length - p.tareas.filter((t) => t.estado === 'pendiente').length} de ${p.tareas.length} categorías contestadas${p.por_revisar ? ` · ${p.por_revisar} por revisar` : ''}`
                    : p.pendientes ? `${p.pendientes} categoría${p.pendientes === 1 ? '' : 's'} sin contestar entre las tiendas` : 'Todas las categorías tienen respuesta'}
                </p>
                {jefe ? (p.por_revisar > 0 && <PlazoChip vence={p.vence_revision} prefijo="Revisar: " />)
                  : (p.pendientes > 0 && <PlazoChip vence={p.vence_respuesta} prefijo="Contestar: " />)}
                {p.tareas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {p.tareas.map((t) => (
                      <span key={`${t.tienda}-${t.categoria}`} className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${(ESTADO_TAREA[estadoVisible(t)] || ESTADO_TAREA.pendiente).cls}`}>
                        {jefe ? t.categoria : `${t.tienda} · ${t.categoria}`} · {(ESTADO_TAREA[estadoVisible(t)] || ESTADO_TAREA.pendiente).label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {(() => {
                const destacar = jefe ? p.por_revisar > 0 : p.pendientes > 0;
                return (
                  <Button size="sm" onClick={() => navigate(`/formularios/custom/${p.id}${jefe ? '?tab=revision' : ''}`)}
                    className={`rounded-xl shrink-0 ${destacar ? 'bg-[#1e395e] hover:bg-[#162c49] text-white' : ''}`}
                    variant={destacar ? 'default' : 'outline'} data-testid="dashboard-promos-open">
                    {jefe ? (p.por_revisar ? 'Revisar' : 'Ver') : p.pendientes ? 'Contestar' : 'Ver'}
                  </Button>
                );
              })()}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// Tareas en Inicio: al coordinador, lo suyo por hacer (pendientes y devueltas,
// vencidas arriba); al gerente/jefe, lo que espera su validación.
function TareasInicio() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/tareas/inicio').then(({ data: d }) => setData(d)).catch(() => {}); }, []);
  if (!data?.rol || !data.tareas.length) return null;
  const rev = data.rol === 'revisor';
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.18 }}
      className="rounded-[18px] bg-card border shadow-card p-5 mb-6" data-testid="dashboard-tareas-card">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="h-9 w-9 rounded-full grid place-items-center bg-[rgba(0,165,223,0.12)]"><ListChecks className="h-4 w-4 text-[#00a5df]" /></span>
        <div>
          <h2 className="font-heading font-semibold">Tareas</h2>
          <p className="text-xs text-muted-foreground">{rev ? 'Por validar' : 'Lo que tienes que hacer'}</p>
        </div>
        <button onClick={() => navigate('/tareas')} className="ml-auto text-xs font-medium text-[#00a5df] hover:underline">Ver todas →</button>
      </div>
      <div className="space-y-2">
        {data.tareas.slice(0, 6).map((t) => {
          const terminada = !rev && t.mi_estado === 'validada';
          const etiqueta = rev ? 'Validar'
            : t.mi_estado === 'validada' ? 'Validada'
            : t.mi_estado === 'hecha' ? 'Esperando validación'
            : t.mi_estado === 'devuelta' ? 'Corregir' : 'Abrir';
          return (
            <button key={t.id} onClick={() => navigate(`/tareas/${t.id}`)}
              className={`w-full text-left rounded-xl border p-3 flex flex-wrap items-center gap-x-3 gap-y-1 hover:shadow-card transition-shadow ${t.vencida ? 'border-[#dc2626]/40 bg-[rgba(220,38,38,0.04)]' : ''} ${terminada ? 'opacity-60' : ''}`}
              data-testid="dashboard-tarea-row">
              <span className="flex-1 min-w-[160px]">
                <span className="block text-sm font-medium truncate">{t.titulo}</span>
                <span className="block text-xs text-muted-foreground">
                  {rev ? `${t.por_validar} ${t.por_validar === 1 ? 'parte marcada hecha' : 'partes marcadas hechas'} · ${t.tienda}` : `Asignó ${t.creado_por?.name}`}
                </span>
              </span>
              <PrioridadTarea prioridad={t.prioridad} />
              {!rev && <FechaLimite fecha={t.fecha_limite} vencida={t.vencida} />}
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${terminada ? 'text-[#16a34a]' : 'text-[#00a5df]'}`}>
                {terminada && <Check className="h-3.5 w-3.5" strokeWidth={3} />}{etiqueta}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, tint, onClick, testid, delay }) {
  return (
    <motion.button initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }}
      onClick={onClick} data-testid={testid}
      className="text-left rounded-[18px] bg-card border shadow-card hover:shadow-cardmd hover:-translate-y-0.5 transition-[transform,box-shadow] p-5 group">
      <div className="flex items-start justify-between">
        <div className="h-11 w-11 rounded-full grid place-items-center" style={{ background: tint }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl font-semibold mt-0.5" style={{ color: typeof value === 'string' && isNaN(value) ? color : undefined }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium" style={{ color }}>
        Ver detalle <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </motion.button>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [weekActs, setWeekActs] = useState([]);
  const [tareasCal, setTareasCal] = useState([]);
  const [view, setView] = useState('Semana');
  const [anchor, setAnchor] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDate, setPendingDate] = useState(ymd(new Date()));
  const load = useCallback(async () => {
    try {
      const [dash, acts] = await Promise.all([
        api.get('/dashboard'),
        api.get(`/activities?start=${ymd(addDays(startOfWeek(new Date()), -7))}&end=${ymd(addDays(startOfWeek(new Date()), 42))}`),
      ]);
      setData(dash.data);
      setWeekActs(acts.data);
    } catch (e) {}
    try {
      const { data: ts } = await api.get(`/tareas/agenda?start=${ymd(addDays(startOfWeek(new Date()), -7))}&end=${ymd(addDays(startOfWeek(new Date()), 42))}`);
      setTareasCal(ts);
    } catch (e) { setTareasCal([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEvent = (ev) => { setEditing(ev); setModalOpen(true); };
  const openNew = (dateStr) => { setEditing(null); setPendingDate(typeof dateStr === 'string' ? dateStr : ymd(anchor)); setModalOpen(true); };

  const stats = data?.stats || {};
  const roomState = ROOM_STATES[stats.room_status] || ROOM_STATES['Disponible'];

  const rangeLabel = () => {
    if (view === 'Mes') return `${capitalize(['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][anchor.getMonth()])} ${anchor.getFullYear()}`;
    if (view === 'Día') return fullDateEs(anchor);
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
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-6">
        <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground">
          {greetingEs()}, {user?.name?.split(' ')[0]} <span className="inline-block">👋</span>
        </h1>
        <p className="text-muted-foreground mt-1">{capitalize(fullDateEs())}. Bienvenido a HERCO CCTV.</p>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={CalendarDays} label="Actividades de hoy" value={stats.today_count ?? 0} sub="actividades programadas" color="#00a5df" tint="rgba(0,165,223,0.14)" onClick={() => navigate('/agenda')} testid="dashboard-card-today" delay={0.02} />
        <KpiCard icon={Clock} label="Próximas actividades" value={stats.upcoming_count ?? 0} sub="en los próximos 7 días" color="#ec9032" tint="rgba(236,144,50,0.14)" onClick={() => navigate('/agenda')} testid="dashboard-card-upcoming" delay={0.06} />
        <KpiCard icon={Activity} label="Estado Sala de Juntas" value={stats.room_status || 'Disponible'} sub={stats.room_name} color={roomState.solid} tint={roomState.bg} onClick={() => navigate('/sala-de-juntas')} testid="dashboard-card-room" delay={0.1} />
        <KpiCard icon={user?.role === 'admin' ? Users : Bell} label={user?.role === 'admin' ? 'Usuarios pendientes' : 'Notificaciones'} value={user?.role === 'admin' ? (stats.pending_users ?? 0) : (stats.unread_notifications ?? 0)} sub={user?.role === 'admin' ? 'por aprobar' : 'sin leer'} color="#712146" tint="rgba(113,33,70,0.12)" onClick={() => navigate(user?.role === 'admin' ? '/usuarios' : '/notificaciones')} testid="dashboard-card-pending" delay={0.14} />
      </div>

      <PromosPendientes />
      <TareasInicio />

      {/* Today + Recent */}
      <div className="lg:col-span-3 rounded-[18px] bg-card border shadow-card p-5">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="lg:col-span-2 rounded-[18px] bg-card border shadow-card p-5" data-testid="dashboard-today-activities-card">
          <div className="flex items-center gap-2.5 mb-1">
            <CalendarDays className="h-5 w-5 text-[#00a5df]" />
            <h2 className="font-heading text-lg font-semibold">Actividades de hoy</h2>
          </div>
          <p className="text-sm text-[#00a5df] mb-4">{capitalize(fullDateEs())}</p>
          <div className="space-y-1">
            {(data?.today_activities || []).length === 0 && (
              <div className="py-10 text-center">
                <p className="text-sm text-muted-foreground">No tienes actividades para hoy.</p>
                <Button onClick={openNew} variant="outline" className="mt-3 rounded-xl"><Plus className="h-4 w-4 mr-1" /> Crear actividad</Button>
              </div>
            )}
            {(data?.today_activities || []).map((a, i) => {
              const solid = a.color || '#00a5df';
              return (
                <button key={a.id} onClick={() => openEvent(a)} className="w-full flex gap-4 rounded-xl p-3 hover:bg-muted/50 transition-colors text-left">
                  <div className="flex flex-col items-center pt-0.5">
                    <span className="text-sm font-semibold text-[#1e395e] dark:text-[#3cbef6]">{fmtHora(a.start_time)}</span>
                    <span className="text-xs text-muted-foreground">{fmtHora(a.end_time)}</span>
                  </div>
                  <div className="relative flex flex-col items-center">
                    <span className="h-3 w-3 rounded-full mt-1" style={{ background: solid }} />
                    {i < (data.today_activities.length - 1) && <span className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: solid }} />
                      <span className="font-medium text-foreground">{a.title}</span>
                    </div>
                    {a.participants?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">Participantes: {a.participants.map((p) => p.name).join(', ')}</p>
                    )}
                    {a.uses_meeting_room && (
                      <span className="inline-flex items-center gap-1 text-xs text-[#00a5df] mt-1"><Bookmark className="h-3 w-3" /> Sala de Juntas reservada</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={() => navigate('/agenda')} className="mt-3 w-full text-center text-sm font-medium text-[#00a5df] hover:underline">Ver todas mis actividades →</button>
        </motion.div>

        {/* Recent activity */}
           {/*<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.16 }}
          className="rounded-[18px] bg-card border shadow-card p-5" data-testid="dashboard-recent-activity">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <Activity className="h-5 w-5 text-[#ec9032]" />
              <h2 className="font-heading text-lg font-semibold">Actividad reciente</h2>
            </div>
          </div>
          <div className="space-y-1">
            {(data?.recent_activity || []).map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-xl p-2.5 hover:bg-muted/50 transition-colors">
                <Avatar className="h-9 w-9 border"><AvatarImage src={r.actor_avatar} /><AvatarFallback>{r.actor_name?.[0]}</AvatarFallback></Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground"><span className="font-semibold">{r.actor_name}</span> <span className="text-muted-foreground">{r.action}</span>{r.target && <span className="font-medium"> {r.target}</span>}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{timeAgoEs(r.created_at)}</p>
                </div>
              </div>
            ))}
            {(data?.recent_activity || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Sin actividad reciente</p>}
          </div>
        </motion.div>*/}
      </div>

      {/* Mini calendar */}
      {/*
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
        className="rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
              <button onClick={() => move(-1)} className="p-1.5 rounded-lg hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setAnchor(new Date())} className="px-3 py-1 text-sm font-medium rounded-lg hover:bg-muted">Hoy</button>
              <button onClick={() => move(1)} className="p-1.5 rounded-lg hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <span className="text-sm font-medium text-foreground">{rangeLabel()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={view} onValueChange={setView}>
              <TabsList className="rounded-xl">
                <TabsTrigger value="Día" className="rounded-lg text-xs">Día</TabsTrigger>
                <TabsTrigger value="Semana" className="rounded-lg text-xs">Semana</TabsTrigger>
                <TabsTrigger value="Mes" className="rounded-lg text-xs">Mes</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={openNew} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="dashboard-new-activity"><Plus className="h-4 w-4 mr-1" /> Nueva actividad</Button>
          </div>
        </div>
        <div className="overflow-hidden">
          {view === 'Semana' && <WeekView anchor={anchor} activities={weekActs} onEventClick={openEvent} onSlotClick={(ds) => openNew(ds)} onNuevoEnDia={(ds) => openNew(ds)} tareas={tareasCal} onTareaClick={(t) => navigate(`/tareas/${t.id}`)} />}
          {view === 'Día' && <DayView anchor={anchor} activities={weekActs} onEventClick={openEvent} onSlotClick={(ds) => openNew(ds)} onNuevoEnDia={(ds) => openNew(ds)} tareas={tareasCal} onTareaClick={(t) => navigate(`/tareas/${t.id}`)} />}
          {view === 'Mes' && <MonthView anchor={anchor} activities={weekActs} onEventClick={openEvent} onSlotClick={(ds) => openNew(ds)} tareas={tareasCal} onTareaClick={(t) => navigate(`/tareas/${t.id}`)} />}
        </div>
      </motion.div>*/}

      <ActivityModal open={modalOpen} onOpenChange={setModalOpen} activity={editing} defaultDate={pendingDate} onSaved={load} />
    </div>
  );
}
