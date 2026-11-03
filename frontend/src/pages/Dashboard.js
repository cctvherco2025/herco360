import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Percent, ListChecks, Check, ClipboardList, Palmtree } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { greetingEs, capitalize, ymd, fmtHora, DIAS, MESES } from '@/lib/time';
import { catStyle, puedeVerTickets, puede, canAccessVacaciones } from '@/lib/constants';
import ActivityModal from '@/components/ActivityModal';
import { DayView, startOfWeek, addDays, ocupaDia, esVariosDias, rangoCortoCal } from '@/components/CalendarViews';
import { MantResumen, mantComoActividad, rutaMant } from '@/pages/Agenda';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { periodoLabel } from '@/pages/PromocionesHome';
import { ESTADO_TAREA, estadoVisible } from '@/components/promociones/PromoRevision';
import { PlazoChip } from '@/lib/promoPlazos';
import { PrioridadTarea, FechaLimite } from '@/pages/Tareas';
import { cuandoVence } from '@/lib/formularios';

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
          <p className="text-xs text-muted-foreground">{!hayPubs ? 'Seguimientos por atender' : jefe ? `Lo que contestó ${data.publicaciones[0].tienda}` : 'Elige tu tienda y categoría al contestar'}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {tickets > 0 && (
          <div className="rounded-xl border border-[#dc2626]/40 bg-[rgba(220,38,38,0.05)] p-3.5 flex flex-wrap items-center gap-3" data-testid="dashboard-tickets">
            <p className="flex-1 min-w-[180px] text-sm font-medium">
              {tickets} ticket{tickets === 1 ? '' : 's'} por atender
              <span className="block text-xs text-muted-foreground font-normal">{jefe ? 'Correcciones por validar' : 'Inconsistencias por corregir'}</span>
            </p>
            <Button size="sm" className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={() => navigate('/formularios/tickets')}>Ver seguimientos</Button>
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

// Mis formularios en Inicio: cuántos tiene por entregar o revisar y qué vence primero.
function FormulariosInicio() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [c, setC] = useState(null);
  const conModulo = puede(user, 'mis_formularios');
  useEffect(() => { if (conModulo) api.get('/formularios-v2/mis/contador').then(({ data }) => setC(data)).catch(() => {}); }, [conModulo]);
  if (!c?.total && !c?.vencidos) return null;
  const partes = [];
  if (c.proximo) partes.push(`El próximo vence ${cuandoVence(c.proximo).texto}`);
  if (c.devueltos) partes.push(`${c.devueltos} ${c.devueltos === 1 ? 'devuelto' : 'devueltos'}`);
  if (c.revisar) partes.push(`${c.revisar} por revisar`);
  if (c.vencidos) partes.push(`${c.vencidos} ${c.vencidos === 1 ? 'vencido' : 'vencidos'}`);
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.16 }}
      className="rounded-[18px] bg-card border shadow-card p-5 mb-6 flex flex-wrap items-center gap-x-4 gap-y-3" data-testid="dashboard-formularios-card">
      <span className="h-11 w-11 rounded-xl grid place-items-center bg-[#e8eef7] text-[#1e395e] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6] shrink-0"><ClipboardList className="h-5 w-5" /></span>
      <div className="flex-[1_1_220px] min-w-0">
        <p className="font-heading text-[22px] font-semibold leading-tight">{c.pendientes} {c.pendientes === 1 ? 'pendiente' : 'pendientes'}</p>
        <p className="text-[13px] text-muted-foreground">{partes.join(' · ') || 'Mis formularios'}</p>
      </div>
      <Button variant="outline" className="rounded-[10px]" onClick={() => navigate('/mis-formularios')}>Ver pendientes</Button>
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

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const minDeHora = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
// "2 – 8 de noviembre" o "27 de octubre – 2 de noviembre"
const rangoSemana = (lunes) => {
  const dom = addDays(lunes, 6);
  return lunes.getMonth() === dom.getMonth()
    ? `${lunes.getDate()} – ${dom.getDate()} de ${MESES[dom.getMonth()]}`
    : `${lunes.getDate()} de ${MESES[lunes.getMonth()]} – ${dom.getDate()} de ${MESES[dom.getMonth()]}`;
};
// "en 25 min", "en 1 h", "en 2 h 10 min"
const faltaTexto = (m) => {
  if (m < 60) return `en ${Math.max(1, m)} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return `en ${h} h${r ? ` ${r} min` : ''}`;
};

// Tira de la semana: arriba el rango y las flechas; cada día con su número en
// un círculo (azul el elegido, naranja hoy) y un puntito por actividad, hasta
// 3 (rojo si vence algo). Al tocarlo, abajo se ve ese día.
function TiraSemana({ lunes, dia, onDia, onMover, cosasDe }) {
  const hoy = ymd(new Date());
  const flecha = 'grid h-8 w-8 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground';
  return (
    <div className="space-y-2.5" data-testid="inicio-semana">
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-[15px] font-semibold">{rangoSemana(lunes)}</span>
        <div className="flex gap-1.5">
          <button onClick={() => onMover(-1)} aria-label="Semana anterior" className={flecha}><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => onMover(1)} aria-label="Semana siguiente" className={flecha}><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 rounded-[20px] border bg-card px-2 py-3 shadow-card">
        {Array.from({ length: 7 }, (_, i) => {
          const d = addDays(lunes, i); const ds = ymd(d);
          const { puntos, total } = cosasDe(ds);
          const sel = ds === ymd(dia); const esHoy = ds === hoy;
          return (
            <button key={ds} onClick={() => onDia(d)} aria-pressed={sel} data-testid="inicio-dia"
              aria-label={`${DIAS[d.getDay()]} ${d.getDate()}, ${total ? `${total} ${total === 1 ? 'actividad' : 'actividades'}` : 'libre'}`}
              className="group min-w-0 rounded-xl py-0.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a5df]">
              <span className={`block text-[11px] uppercase tracking-[0.06em] ${esHoy ? 'font-semibold text-[#ec9032]' : 'font-medium text-muted-foreground'}`}>
                {esHoy ? 'Hoy' : DIA_CORTO[d.getDay()]}
              </span>
              <span className={`mx-auto mt-1.5 grid h-9 w-9 sm:h-[42px] sm:w-[42px] place-items-center rounded-full font-heading text-[17px] sm:text-[19px] font-semibold tabular-nums transition-colors ${sel ? 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]' : esHoy ? 'text-[#ec9032] group-hover:bg-muted' : 'group-hover:bg-muted'}`}>
                {d.getDate()}
              </span>
              <span className="mt-[7px] flex h-1.5 justify-center gap-[3px]">
                {puntos.slice(0, 3).map((rojo, k) => <i key={k} className={`h-[5px] w-[5px] rounded-full ${rojo ? 'bg-[#dc2626]' : 'bg-[#00a5df]'}`} />)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Vacaciones en Inicio: lo que espera su aprobación, su próxima solicitud y
// quién del equipo falta esta semana (vacas = calendario de la semana). En PC
// va en una columna a la derecha del día; en el teléfono, debajo.
function CuadroVacaciones({ vacas, lunes }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [porAprobar, setPorAprobar] = useState([]);
  const [mias, setMias] = useState([]);
  useEffect(() => {
    api.get('/vacations/to-review').then(({ data }) => setPorAprobar(data)).catch(() => {});
    api.get('/vacations/mine').then(({ data }) => setMias(data)).catch(() => {});
  }, []);
  const hoy = ymd(new Date());
  const proxima = mias.filter((v) => ['pending', 'approved'].includes(v.status) && v.end_date >= hoy)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const ini = ymd(lunes); const fin = ymd(addDays(lunes, 6));
  const faltan = vacas.filter((v) => v.user_id !== user?.id && v.status === 'approved' && v.start_date <= fin && v.end_date >= ini);
  const rango = (v) => rangoCortoCal({ date: v.start_date, end_date: v.end_date });
  const corto = (n) => (n || '').split(' ').slice(0, 2).join(' ');
  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}
      className="rounded-[18px] bg-card border shadow-card p-4 sm:p-5 xl:sticky xl:top-4" data-testid="inicio-vacaciones">
      <div className="flex items-center gap-2.5">
        <span className="h-9 w-9 rounded-full grid place-items-center bg-[rgba(236,144,50,0.14)]"><Palmtree className="h-4 w-4 text-[#ec9032]" /></span>
        <h2 className="font-heading font-semibold flex-1">Vacaciones</h2>
        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => navigate('/vacaciones')}>Pedir</Button>
      </div>
      <div className={`mt-4 grid gap-4 ${porAprobar.length ? 'md:grid-cols-3' : 'md:grid-cols-2'} xl:grid-cols-1 xl:gap-5`}>
      {porAprobar.length > 0 && (
        <button onClick={() => navigate('/vacaciones')} className="w-full self-start text-left rounded-xl border border-[#ec9032]/50 bg-[rgba(236,144,50,0.07)] p-3 flex items-center gap-3" data-testid="inicio-vacaciones-aprobar">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium">{porAprobar.length} {porAprobar.length === 1 ? 'solicitud' : 'solicitudes'} por aprobar</span>
            <span className="block text-xs text-muted-foreground truncate">{porAprobar.slice(0, 3).map((v) => corto(v.user_name)).join(', ')}{porAprobar.length > 3 ? ' y más' : ''}</span>
          </span>
          <span className="text-xs font-semibold text-[#ec9032] shrink-0">Revisar</span>
        </button>
      )}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tu próxima solicitud</p>
        {proxima ? (
          <p className="text-sm mt-1">{proxima.type} · {rango(proxima)}
            <span className={`ml-2 text-[11px] font-semibold rounded-full px-2 py-0.5 ${proxima.status === 'approved' ? 'bg-[rgba(22,163,74,0.12)] text-[#16a34a]' : 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]'}`}>
              {proxima.status === 'approved' ? 'Aprobada' : 'Esperando aprobación'}
            </span>
          </p>
        ) : <p className="text-sm text-muted-foreground mt-1">No tienes solicitudes pendientes.</p>}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Faltan esta semana</p>
        {faltan.length ? (
          <ul className="mt-1 space-y-1">
            {faltan.slice(0, 5).map((v) => (
              <li key={v.id} className="flex items-center gap-2 text-sm"><span className="flex-1 min-w-0 truncate">{corto(v.user_name)}</span><span className="text-xs text-muted-foreground shrink-0">{v.type} · {rango(v)}</span></li>
            ))}
            {faltan.length > 5 && <li className="text-xs text-muted-foreground">y {faltan.length - 5} más</li>}
          </ul>
        ) : <p className="text-sm text-muted-foreground mt-1">Nadie de tu equipo falta esta semana.</p>}
      </div>
      </div>
    </motion.section>
  );
}

// Lo que tiene fecha y hora para entregar o revisar: formularios y promociones.
function vencimientosDe(forms, promos) {
  const out = [];
  if (forms) {
    for (const a of [...(forms.pendientes || []), ...(forms.proceso || []), ...(forms.devueltos || [])]) {
      if (!a.vence) continue;
      out.push({ id: `f-${a.id}`, fecha: a.vence.slice(0, 10), hora: a.vence.slice(11, 16), texto: `Vence: ${a.titulo}`, ruta: `/mis-formularios/${a.id}` });
    }
  }
  if (promos?.rol) {
    const rev = promos.rol === 'revisor';
    for (const p of promos.publicaciones || []) {
      const v = rev ? (p.por_revisar ? p.vence_revision : null) : (p.pendientes ? p.vence_respuesta : null);
      if (!v) continue;
      out.push({ id: `p-${p.id}`, fecha: v.slice(0, 10), hora: v.slice(11, 16), texto: `${rev ? 'Revisar' : 'Contestar'}: ${p.titulo}`, ruta: `/formularios/custom/${p.id}${rev ? '?tab=revision' : ''}` });
    }
  }
  return out;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const conAgenda = puede(user, 'agenda'); // sin Agenda en su perfil no ve actividades
  const [dia, setDia] = useState(() => new Date());
  // cada minuto, para que "en 25 min" y la próxima actividad se mantengan al día
  const [, setMinuto] = useState(0);
  useEffect(() => { const t = setInterval(() => setMinuto((n) => n + 1), 60000); return () => clearInterval(t); }, []);
  const lunes = startOfWeek(dia);
  const ini = ymd(lunes); const fin = ymd(addDays(lunes, 6));
  const [acts, setActs] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [mants, setMants] = useState({ ahora: '', mantenimientos: [] });
  const [vacas, setVacas] = useState([]);
  const [forms, setForms] = useState(null);
  const [promos, setPromos] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [pendingDate, setPendingDate] = useState(ymd(new Date()));
  const [pendingTime, setPendingTime] = useState('09:00');
  const [mantSel, setMantSel] = useState(null);

  const load = useCallback(async () => {
    const r = `start=${ini}&end=${fin}`;
    try { const { data } = await api.get(`/activities?${r}`); setActs(data); } catch (e) { setActs([]); }
    try { const { data } = await api.get(`/tareas/agenda?${r}`); setTareas(data); } catch (e) { setTareas([]); }
    try { const { data } = await api.get(`/mantenimiento/agenda?${r}`); setMants(data); } catch (e) { setMants({ ahora: '', mantenimientos: [] }); }
    if (canAccessVacaciones(user)) {
      try { const { data } = await api.get(`/vacations/calendar?${r}`); setVacas(data); } catch (e) { setVacas([]); }
    }
  }, [ini, fin, user]);
  useEffect(() => { if (conAgenda) load(); }, [load, conAgenda]);
  useEffect(() => {
    if (!conAgenda) return;
    if (puede(user, 'mis_formularios')) api.get('/formularios-v2/mis').then(({ data }) => setForms(data)).catch(() => {});
    api.get('/promo-tareas/mias').then(({ data }) => setPromos(data)).catch(() => {});
  }, [user, conAgenda]);

  const enCalendario = [...acts, ...mants.mantenimientos.map((m) => mantComoActividad(m, mants.ahora))];
  const vences = vencimientosDe(forms, promos);
  // vacaciones y permisos del equipo (las propias aprobadas ya salen como actividad)
  const ausencias = (ds) => vacas.filter((v) => v.user_id !== user?.id && v.start_date <= ds && ds <= v.end_date).map((v) => ({
    id: `v-${v.id}`, color: '#ec9032', icono: Palmtree, onClick: () => navigate('/vacaciones'),
    texto: `${v.user_name?.split(' ').slice(0, 2).join(' ')} · ${(v.type || 'Vacaciones').toLowerCase()}${v.status === 'pending' ? ' (por aprobar)' : ''}`,
  }));
  const cosasDe = (ds) => {
    const evs = enCalendario.filter((a) => ocupaDia(a, ds));
    const rojos = vences.filter((v) => v.fecha === ds).length + tareas.filter((t) => t.fecha_limite === ds && t.estado !== 'cerrada').length;
    // los vencimientos primero, para que el puntito rojo no se quede fuera de los 3
    return { puntos: [...Array(rojos).fill(true), ...evs.map(() => false)], total: evs.length + rojos };
  };

  const openEvent = (ev) => { if (ev.mant) { setMantSel(ev.datos); return; } setEditing(ev); setModalOpen(true); };
  const openNew = (ds, t) => { setEditing(null); setPendingDate(typeof ds === 'string' ? ds : ymd(dia)); setPendingTime(t || '09:00'); setModalOpen(true); };

  // la actividad de ahora o la próxima de hoy, para la tarjetita del saludo
  const ahoraD = new Date(); const hoyDs = ymd(ahoraD); const ya = hhmm(ahoraD);
  const deHoy = enCalendario.filter((a) => a.date === hoyDs && !esVariosDias(a)).sort((a, b) => a.start_time.localeCompare(b.start_time));
  const enCurso = deHoy.find((a) => a.start_time <= ya && ya < a.end_time);
  const sigue = deHoy.find((a) => a.start_time > ya);
  const destacada = enCurso || sigue;
  const faltan = sigue && !enCurso ? minDeHora(sigue.start_time) - (ahoraD.getHours() * 60 + ahoraD.getMinutes()) : 0;

  const ds = ymd(dia);
  const esHoy = ds === hoyDs;
  const delDia = enCalendario.filter((a) => ocupaDia(a, ds)).length;
  const vencesDia = vences.filter((v) => v.fecha === ds);

  return (
    <div className="max-w-[1320px] mx-auto pt-2 space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{DIAS[ahoraD.getDay()]} {ahoraD.getDate()} de {MESES[ahoraD.getMonth()]}</p>
          <h1 className="font-heading text-3xl sm:text-4xl font-semibold text-foreground">
            {greetingEs()}, {user?.name?.split(' ')[0]} <span className="inline-block">👋</span>
          </h1>
          {conAgenda && destacada && (
            <button type="button" onClick={() => openEvent(destacada)} data-testid="inicio-proxima"
              className="mt-4 flex max-w-full items-center gap-3 rounded-[14px] border bg-card py-2.5 pl-2.5 pr-4 text-left shadow-card transition-colors hover:border-[#1e395e] dark:hover:border-[#3cbef6]">
              <span className="grid h-11 min-w-[56px] shrink-0 place-items-center rounded-[10px] bg-[rgba(0,165,223,0.12)] px-2 font-heading text-[15px] font-semibold tabular-nums text-[#1e395e] dark:text-[#3cbef6]">
                {fmtHora(destacada.start_time)}
              </span>
              <span className="min-w-0">
                <span className="block text-[11.5px] font-medium text-muted-foreground">
                  {enCurso ? <>Ahora · <span className="font-semibold text-[#ec9032]">hasta las {fmtHora(enCurso.end_time)}</span></>
                    : <>Tu próxima actividad · <span className="font-semibold text-[#ec9032]">{faltaTexto(faltan)}</span></>}
                </span>
                <span className="block truncate text-[14.5px] font-medium">{destacada.title.trim()}</span>
              </span>
            </button>
          )}
        </div>
        {conAgenda && (
          <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto">
            <Button onClick={() => openNew(ymd(dia))} className="h-11 sm:h-10 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="dashboard-new-activity"><Plus className="h-4 w-4 mr-1" /> Nueva actividad</Button>
            <Button variant="outline" onClick={() => navigate('/agenda')} className="h-11 sm:h-10 rounded-xl"><CalendarDays className="h-4 w-4 mr-1" /> Abrir agenda</Button>
          </div>
        )}
      </motion.div>

      {conAgenda ? (
        <>
          <TiraSemana lunes={lunes} dia={dia} onDia={setDia} onMover={(n) => setDia(addDays(dia, n * 7))} cosasDe={cosasDe} />
          <div className={`grid gap-6 items-start ${canAccessVacaciones(user) ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
          <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}
            className="rounded-[18px] bg-card border shadow-card p-4 sm:p-5 min-w-0" data-testid="dashboard-today-activities-card">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h2 className="font-heading text-lg font-semibold">{esHoy ? 'Hoy, ' : ''}{(esHoy ? (s) => s : capitalize)(`${DIAS[dia.getDay()]} ${dia.getDate()} de ${MESES[dia.getMonth()]}`)}</h2>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {delDia} {delDia === 1 ? 'actividad' : 'actividades'}{vencesDia.length ? ` · ${vencesDia.length} ${vencesDia.length === 1 ? 'vencimiento' : 'vencimientos'}` : ''}
                </span>
                {!esHoy && <button onClick={() => setDia(new Date())} className="text-xs font-medium text-[#00a5df] hover:underline">Ir a hoy</button>}
              </div>
            </div>
            <DayView anchor={dia} activities={enCalendario} onEventClick={openEvent} onSlotClick={(d, t) => openNew(d, t)} onNuevoEnDia={(d) => openNew(d)}
              tareas={tareas} onTareaClick={(t) => navigate(`/tareas/${t.id}`)} extrasDia={ausencias(ds)}
              vencimientos={vencesDia.map((v) => ({ ...v, onClick: () => navigate(v.ruta) }))} marcarAhora />
          </motion.section>
          {canAccessVacaciones(user) && <CuadroVacaciones vacas={vacas} lunes={lunes} />}
          </div>
        </>
      ) : (
        <>
          <PromosPendientes />
          <FormulariosInicio />
          <TareasInicio />
        </>
      )}

      <ActivityModal open={modalOpen} onOpenChange={setModalOpen} activity={editing} defaultDate={pendingDate} defaultTime={pendingTime} onSaved={load} />
      <MantResumen m={mantSel} ahora={mants.ahora} onClose={() => setMantSel(null)} onIr={(m) => { setMantSel(null); navigate(rutaMant(m)); }} />
    </div>
  );
}
