import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Palmtree, Plus, Check, X, CalendarRange, Inbox, ChevronLeft, ChevronRight, Search, History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { canAccessVacaciones } from '@/lib/constants';
import { fullDateEs, capitalize, ymd, MESES } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { startOfWeek, addDays } from '@/components/CalendarViews';
import { confirmar } from '@/components/ConfirmDialog';

const TYPES = ['Vacaciones', 'Permiso', 'Incapacidad'];
const TYPE_COLOR = { Vacaciones: '#ec9032', Permiso: '#77868d', Incapacidad: '#dc2626' };
const PENDING_COLOR = '#ec9032'; // naranja para toda solicitud pendiente, sea cual sea el tipo
const APPROVED_COLOR = {
  Vacaciones: '#16a34a', // verde
  Permiso: '#3cbef6',    // azul/celeste
  Incapacidad: '#dc2626', // rojo
};
const STATUS = {
  pending: { label: 'Pendiente', color: '#ec9032', bg: 'rgba(236,144,50,0.14)' },
  approved: { label: 'Aprobada', color: '#16a34a', bg: 'rgba(22,163,74,0.14)' },
  rejected: { label: 'Rechazada', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
};

const DIA_CORTO = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const fecha = (s) => new Date(`${s}T00:00:00`);
// "Mar 8 dic"
const fechaCorta = (s) => { const d = fecha(s); return `${DIA_CORTO[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const diasDe = (r) => Math.round((fecha(r.end_date) - fecha(r.start_date)) / 86400000) + 1;
const rangoCorto = (r) => (r.start_date === r.end_date ? fechaCorta(r.start_date) : `${fechaCorta(r.start_date)} – ${fechaCorta(r.end_date)}`);

function TipoChip({ type }) {
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: TYPE_COLOR[type], background: `${TYPE_COLOR[type]}22` }}>{type}</span>;
}

// Desde / Hasta / cuántos días, en una franja
function FranjaFechas({ r }) {
  const n = diasDe(r);
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted px-3.5 py-2.5">
      <div className="flex-1 min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Desde</span><span className="text-sm font-medium">{fechaCorta(r.start_date)}</span></div>
      <div className="flex-1 min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hasta</span><span className="text-sm font-medium">{fechaCorta(r.end_date)}</span></div>
      <div className="border-l pl-3 text-center"><span className="block font-heading text-xl font-semibold leading-tight tabular-nums">{n}</span><span className="text-[11px] text-muted-foreground">{n === 1 ? 'día' : 'días'}</span></div>
    </div>
  );
}

// Detalle de una solicitud por autorizar, con sus botones (panel en PC, hoja en el teléfono)
function DetalleSolicitud({ r, onAprobar, onRechazar }) {
  return (
    <div className="space-y-4" data-testid="review-vacation-detail">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12 border"><AvatarImage src={r.user_avatar} /><AvatarFallback>{r.user_name?.[0]}</AvatarFallback></Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-heading text-lg font-semibold truncate">{r.user_name}</p>
          {r.position && <p className="text-sm text-muted-foreground truncate">{r.position}</p>}
        </div>
        <TipoChip type={r.type} />
      </div>
      <FranjaFechas r={r} />
      {r.reason && (
        <div><span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Motivo</span><p className="text-sm mt-0.5 break-words">{r.reason}</p></div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={onRechazar} className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#dc2626]/30 bg-card text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] text-sm font-medium" data-testid="reject-vacation-button"><X className="h-4 w-4" /> Rechazar</button>
        <button onClick={onAprobar} className="h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-medium" data-testid="approve-vacation-button"><Check className="h-4 w-4" /> Autorizar</button>
      </div>
    </div>
  );
}

// PC (lg en adelante): lista y detalle lado a lado; en el teléfono el detalle sale en una hoja
const esPC = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

// Color de la barra: pendiente en naranja punteado; aprobada, del color de su tipo
const colorBarra = (r) => (r.status === 'approved' ? (APPROVED_COLOR[r.type] || TYPE_COLOR[r.type]) : PENDING_COLOR);
const iniciales = (n) => (n || '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();

// Mes de vacaciones: cada solicitud es una sola barra con el nombre que cruza
// sus días; las que se cruzan van en carriles distintos. En el teléfono
// (compacto) la barra lleva el primer nombre y caben menos carriles.
function MesVacaciones({ anchor, requests, compacto, diaSel, onDia, onBarra }) {
  const inicio = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const hoy = ymd(new Date());
  const max = compacto ? 2 : 3; const alto = compacto ? 18 : 24; const gap = compacto ? 2 : 3; const top = compacto ? 30 : 34;
  const semanas = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(inicio, w * 7 + i)));
  return (
    <div className="overflow-hidden rounded-xl border" data-testid="vacations-month">
      <div className="grid grid-cols-7 border-b bg-card">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <span key={d} className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{compacto ? d[0] : d}</span>
        ))}
      </div>
      {semanas.map((dias) => {
        const a = ymd(dias[0]); const z = ymd(dias[6]);
        // tramos de esta semana, en carriles (los que empiezan antes y los más largos primero)
        const tramos = requests.filter((r) => r.start_date <= z && r.end_date >= a)
          .map((r) => ({ r, c0: dias.findIndex((d) => ymd(d) === (r.start_date > a ? r.start_date : a)), c1: dias.findIndex((d) => ymd(d) === (r.end_date < z ? r.end_date : z)) }))
          .sort((x, y) => x.c0 - y.c0 || (y.c1 - y.c0) - (x.c1 - x.c0));
        const fin = [];
        tramos.forEach((t) => { let k = fin.findIndex((e) => e < t.c0); if (k < 0) { k = fin.length; fin.push(-1); } fin[k] = t.c1; t.carril = k; });
        const vis = tramos.filter((t) => t.carril < max);
        const ocultos = (i) => tramos.filter((t) => t.carril >= max && t.c0 <= i && t.c1 >= i).length;
        const carriles = Math.min(fin.length, max);
        return (
          <div key={a} className="relative grid grid-cols-7 border-b last:border-b-0"
            style={{ minHeight: top + carriles * (alto + gap) + (vis.length < tramos.length ? 16 : 0) + (compacto ? 10 : 16) }}>
            {dias.map((d, i) => {
              const ds = ymd(d); const otro = d.getMonth() !== anchor.getMonth(); const n = ocultos(i);
              return (
                <button key={ds} onClick={() => onDia(ds)} data-testid="vacations-cal-celda"
                  className={`relative flex flex-col border-l first:border-l-0 transition-colors hover:bg-muted/60 ${otro ? 'bg-muted/50' : 'bg-card'} ${compacto ? 'items-center pt-1' : 'items-end px-2 pt-1.5'}`}>
                  <span className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold tabular-nums ${ds === hoy ? 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]' : otro ? 'text-muted-foreground/60' : ''} ${diaSel === ds && ds !== hoy ? 'ring-[1.5px] ring-[#1e395e] dark:ring-[#3cbef6]' : ''}`}>{d.getDate()}</span>
                  {n > 0 && <span className="absolute bottom-1 inset-x-0 text-center text-[10.5px] font-medium text-muted-foreground">+{n}</span>}
                </button>
              );
            })}
            {vis.map((t) => {
              const c = colorBarra(t.r); const pend = t.r.status !== 'approved';
              const sigue0 = t.r.start_date < a; const sigue1 = t.r.end_date > z;
              const m0 = sigue0 ? 0 : 3; const m1 = sigue1 ? 0 : 3;
              return (
                <button key={t.r.id} onClick={() => onBarra(t.r, ymd(dias[t.c0]))} title={`${t.r.user_name} · ${t.r.type} · ${rangoCorto(t.r)}`} data-testid="vacations-cal-barra"
                  className={`absolute flex items-center overflow-hidden whitespace-nowrap font-medium text-foreground ${compacto ? 'px-1 text-[10.5px]' : 'gap-1.5 px-1.5 text-xs'}`}
                  style={{
                    top: top + t.carril * (alto + gap), height: alto,
                    left: `calc(${(t.c0 / 7) * 100}% + ${m0}px)`, width: `calc(${((t.c1 - t.c0 + 1) / 7) * 100}% - ${m0 + m1}px)`,
                    background: `${c}24`, border: pend ? `1.5px dashed ${c}` : 'none', boxShadow: pend ? 'none' : `inset 3px 0 0 ${c}`,
                    borderRadius: `${sigue0 ? 0 : 6}px ${sigue1 ? 0 : 6}px ${sigue1 ? 0 : 6}px ${sigue0 ? 0 : 6}px`,
                  }}>
                  {!compacto && <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[8.5px] font-bold text-white" style={{ background: c }}>{iniciales(t.r.user_name)}</span>}
                  <span className="truncate">{compacto ? t.r.user_name?.split(' ')[0] : t.r.user_name}</span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>{s.label}</span>;
}

// Sin permiso de Vacaciones (override por usuario) se redirige al inicio.
// Va en un envoltorio para no cortar el orden de los hooks de la página.
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Historial: lo ya autorizado o rechazado de un año, por mes (se ven las mismas personas que en el Calendario)
function Historial() {
  const [anio, setAnio] = useState(null);
  const [datos, setDatos] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    setError(false);
    api.get('/vacations/history', { params: anio ? { year: anio } : {} })
      .then(({ data }) => { if (vivo) { setDatos(data); if (!anio) setAnio(data.anio); } })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [anio]);

  const texto = sinAcentos(q.trim());
  const filas = (datos?.solicitudes || []).filter((r) => !texto || sinAcentos(`${r.user_name} ${r.position || ''} ${r.area || ''}`).includes(texto));
  const meses = [];
  filas.forEach((r) => {
    const m = r.start_date.slice(0, 7);
    if (!meses.length || meses[meses.length - 1].m !== m) meses.push({ m, items: [] });
    meses[meses.length - 1].items.push(r);
  });
  const anios = datos ? Array.from(new Set([...(datos.anios || []), String(datos.anio)])).sort().reverse() : [];

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-4" data-testid="vacaciones-historial">
      <div className="flex gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2 h-11 rounded-xl border bg-card px-3">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona" aria-label="Buscar persona en el historial"
            spellCheck={false} autoComplete="off" className="flex-1 min-w-0 bg-transparent text-sm outline-none" data-testid="historial-buscar" />
        </label>
        <select value={anio || ''} onChange={(e) => setAnio(Number(e.target.value))} aria-label="Año" disabled={!datos}
          className="h-11 rounded-xl border bg-card px-3 text-sm" data-testid="historial-anio">
          {anios.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {error ? (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center text-sm text-muted-foreground">No se pudo cargar el historial</div>
      ) : !datos ? (
        <div className="rounded-[18px] bg-card border shadow-card p-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !filas.length ? (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{texto ? 'Nadie coincide con esa búsqueda' : `No hay vacaciones ni permisos revisados en ${datos.anio}`}</p>
        </div>
      ) : meses.map(({ m, items }) => (
        <section key={m} className="space-y-2">
          <h3 className="font-heading text-sm font-semibold text-muted-foreground capitalize">{MESES_LARGO[Number(m.slice(5)) - 1]}</h3>
          <div className="rounded-[18px] bg-card border shadow-card overflow-hidden">
            {items.map((r) => {
              const n = diasDe(r);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-t first:border-t-0" data-testid="historial-item">
                  <Avatar className="h-10 w-10 border shrink-0"><AvatarImage src={r.user_avatar} /><AvatarFallback>{r.user_name?.[0]}</AvatarFallback></Avatar>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{r.user_name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      <span className="inline-block h-2 w-2 rounded-full mr-1.5 align-[1px]" style={{ background: TYPE_COLOR[r.type] }} />
                      {r.type} · {rangoCorto(r)}
                    </span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {r.status === 'approved' ? 'Autorizó' : <><span className="font-semibold text-[#dc2626]">Rechazada</span> por</>} {r.reviewed_by_name || '—'}
                      {r.status === 'rejected' && r.review_comment ? ` · «${r.review_comment}»` : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-heading font-semibold leading-tight tabular-nums">{n}</span>
                    <span className="text-[11px] text-muted-foreground">{n === 1 ? 'día' : 'días'}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </motion.div>
  );
}

export default function Vacaciones() {
  const { user } = useAuth();
  if (!canAccessVacaciones(user)) return <Navigate to="/" replace />;
  return <VacacionesPage />;
}

function VacacionesPage() {
  const { user } = useAuth();
  // "Por autorizar": a quien aprueba (su perfil, Gente a cargo; ver mando.py),
  // a los admins o a quien el servidor le asignó solicitudes para aprobar
  const [toReview, setToReview] = useState([]);
  const aprueba = user?.mando ? user.mando.aprueba
    : ['Jefe', 'Gerente', 'Director comercial'].includes(user?.position) || ['jefe_depto', 'gerente', 'jefe'].includes(user?.nivel);
  const isManager = user?.role === 'admin' || aprueba || toReview.length > 0;

  const [mine, setMine] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const today = ymd(new Date());
  const [form, setForm] = useState({ start_date: today, end_date: today, type: 'Vacaciones', reason: '' });
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectComment, setRejectComment] = useState('');

  const [vista, setVista] = useState(null); // 'autorizar' | 'mias' | 'calendario'
  const [selId, setSelId] = useState(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [pc, setPc] = useState(esPC);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const f = () => setPc(m.matches);
    m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, []);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/vacations/mine'); setMine(data); } catch (e) {}
    try { const { data } = await api.get('/vacations/to-review'); setToReview(data); } catch (e) {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (form.end_date < form.start_date) { toast.error('La fecha de fin no puede ser anterior al inicio'); return; }
    if (form.start_date < today) { toast.error('No puedes solicitar fechas pasadas'); return; }
    const overlap = mine.find((r) =>
      r.id !== editTarget?.id &&
      ['pending', 'approved'].includes(r.status) &&
      r.start_date <= form.end_date && r.end_date >= form.start_date);
    if (overlap) {
      toast.error(`Ya tienes una solicitud de ${overlap.type} (${overlap.status === 'approved' ? 'aprobada' : 'pendiente'}) que se traslapa con esas fechas`);
      return;
    }
    setSaving(true);
    try {
      if (editTarget) {
        await api.put(`/vacations/${editTarget.id}`, form);
        toast.success(editTarget.status === 'approved' ? 'Solicitud actualizada. Vuelve a estar pendiente de autorización.' : 'Solicitud actualizada');
      } else {
        await api.post('/vacations', form);
        toast.success('Solicitud enviada. Tu jefe fue notificado.');
      }
      setOpen(false);
      setEditTarget(null);
      setForm({ start_date: today, end_date: today, type: 'Vacaciones', reason: '' });
      load();
      loadCalendar();
    } catch (err) { toast.error(err?.response?.data?.detail || 'No se pudo guardar la solicitud'); }
    finally { setSaving(false); }
  };

  const approve = async (id) => {
    try { await api.post(`/vacations/${id}/approve`, { comment: '' }); toast.success('Solicitud aprobada'); setHojaAbierta(false); load(); loadCalendar(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error'); }
  };
  const doReject = async () => {
    if (!rejectTarget) return;
    try { await api.post(`/vacations/${rejectTarget.id}/reject`, { comment: rejectComment }); toast.success('Solicitud rechazada'); setRejectTarget(null); setRejectComment(''); setHojaAbierta(false); load(); loadCalendar(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error'); }
  };

  // pestaña inicial: Por autorizar si hay algo que autorizar; si no, Mis solicitudes
  const vistaActual = vista || (toReview.length > 0 ? 'autorizar' : 'mias');
  // en PC siempre hay una elegida (la primera si la elegida ya no está)
  const sel = toReview.find((r) => r.id === selId) || (pc ? toReview[0] : null);
  const abrir = (r) => { setSelId(r.id); if (!pc) setHojaAbierta(true); };

  const openEdit = (r) => {
    setEditTarget(r);
    setForm({ start_date: r.start_date, end_date: r.end_date, type: r.type, reason: r.reason || '' });
    setOpen(true);
  };

  const removeMine = async (r) => {
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar solicitud?',
      mensaje: <>Se eliminará tu solicitud de <b>{r.type || 'vacaciones'}</b> del <b>{r.start_date}</b> al <b>{r.end_date}</b>. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Solicitud eliminada',
      accion: () => api.delete(`/vacations/${r.id}`),
    });
    if (ok) { load(); loadCalendar(); }
  };

  // ---- Calendario de vacaciones (mes con una barra por solicitud) ----
  const [calAnchor, setCalAnchor] = useState(new Date());
  const [calRequests, setCalRequests] = useState([]);
  const [dayModalDate, setDayModalDate] = useState(null);
  const [calDia, setCalDia] = useState(today); // en el teléfono, el día cuya lista se ve abajo

  const loadCalendar = useCallback(async () => {
    const gridStart = startOfWeek(new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1));
    try {
      const { data } = await api.get(`/vacations/calendar?start=${ymd(gridStart)}&end=${ymd(addDays(gridStart, 41))}`);
      setCalRequests(data);
    } catch (e) {}
  }, [calAnchor]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const requestsForDay = (dateStr) => calRequests.filter((r) => r.start_date <= dateStr && r.end_date >= dateStr);
  const moveCal = (dir) => setCalAnchor(new Date(calAnchor.getFullYear(), calAnchor.getMonth() + dir, 1));
  const tocarDia = (ds) => { if (pc) { if (requestsForDay(ds).length) setDayModalDate(ds); } else setCalDia(ds); };
  const delDia = requestsForDay(calDia);

  const RangeRow = ({ r }) => (
    <div className="flex items-center gap-2 text-sm text-foreground">
      <CalendarRange className="h-4 w-4 text-[#00a5df] shrink-0" />
      <span>{capitalize(fullDateEs(r.start_date))}</span>
      <span className="text-muted-foreground">→</span>
      <span>{capitalize(fullDateEs(r.end_date))}</span>
    </div>
  );

  return (
    <div className="max-w-[1100px] mx-auto pt-2">
      <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2"><Palmtree className="h-6 w-6 text-[#ec9032]" /> Vacaciones y permisos</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Solicita días y sigue el estado de tus autorizaciones</p>
        </div>
        <Button onClick={() => { setEditTarget(null); setForm({ start_date: today, end_date: today, type: 'Vacaciones', reason: '' }); setOpen(true); }} className="w-full sm:w-auto h-11 sm:h-10 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="request-vacation-button">
          <Plus className="h-4 w-4 mr-1.5" /> Solicitar
        </Button>
      </div>

      {/* Pestañas */}
      <div className={`mb-5 grid ${isManager ? 'grid-cols-[1.3fr_1fr_1fr_1fr]' : 'grid-cols-3'} rounded-xl border bg-card p-1 sm:max-w-[600px]`} role="tablist">
        {[...(isManager ? [['autorizar', 'Por autorizar']] : []), ['mias', 'Mis solicitudes'], ['calendario', 'Calendario'], ['historial', 'Historial']].map(([k, t]) => (
          <button key={k} role="tab" aria-selected={vistaActual === k} onClick={() => setVista(k)} data-testid={`vacaciones-tab-${k}`}
            className={`min-w-0 inline-flex items-center justify-center rounded-lg px-1 py-1.5 sm:py-2 text-[12px] leading-tight sm:text-sm font-medium transition-colors ${vistaActual === k ? 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0a1220]' : 'text-muted-foreground hover:text-foreground'}`}>
            <span className="text-center sm:truncate sm:whitespace-nowrap">{t}</span>
            {k === 'autorizar' && toReview.length > 0 && <span className={`ml-1.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-semibold ${vistaActual === k ? 'bg-[#ec9032] text-white' : 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]'}`}>{toReview.length}</span>}
          </button>
        ))}
      </div>

      {/* Por autorizar: lista y detalle */}
      {isManager && vistaActual === 'autorizar' && (
        toReview.length === 0 ? (
          <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No tienes solicitudes por autorizar</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
            className="grid grid-cols-[minmax(0,1fr)] gap-5 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <div className="rounded-[18px] bg-card border shadow-card overflow-hidden">
              {toReview.map((r) => {
                const n = diasDe(r); const activa = pc && sel?.id === r.id;
                return (
                  <button key={r.id} onClick={() => abrir(r)} aria-pressed={activa} data-testid="review-vacation-card"
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left border-t first:border-t-0 transition-colors ${activa ? 'bg-[rgba(0,165,223,0.10)]' : 'hover:bg-muted'}`}>
                    <Avatar className="h-10 w-10 border shrink-0"><AvatarImage src={r.user_avatar} /><AvatarFallback>{r.user_name?.[0]}</AvatarFallback></Avatar>
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{r.user_name}</span>
                      <span className="block text-xs text-muted-foreground truncate">{r.type} · {rangoCorto(r)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-heading font-semibold leading-tight tabular-nums">{n}</span>
                      <span className="text-[11px] text-muted-foreground">{n === 1 ? 'día' : 'días'}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
            {pc && sel && (
              <div className="rounded-[18px] bg-card border shadow-card p-5 lg:sticky lg:top-4">
                <DetalleSolicitud r={sel} onAprobar={() => approve(sel.id)} onRechazar={() => { setRejectTarget(sel); setRejectComment(''); }} />
              </div>
            )}
          </motion.div>
        )
      )}

      {/* Teléfono: el detalle sube como hoja desde abajo */}
      <Sheet open={!pc && hojaAbierta && !!sel && !rejectTarget} onOpenChange={setHojaAbierta}>
        <SheetContent side="bottom" className="rounded-t-[22px] px-4 pb-6 pt-3 max-h-[88vh] overflow-y-auto">
          <div className="mx-auto mb-7 h-1 w-10 rounded-full bg-border" />
          <SheetTitle className="sr-only">Solicitud de {sel?.user_name}</SheetTitle>
          {sel && <DetalleSolicitud r={sel} onAprobar={() => approve(sel.id)} onRechazar={() => { setRejectTarget(sel); setRejectComment(''); }} />}
        </SheetContent>
      </Sheet>

      {vistaActual === 'historial' && <Historial />}

      {/* My requests */}
      {vistaActual === 'mias' && (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {mine.length === 0 ? (
          <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
            <Palmtree className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aún no tienes solicitudes. Usa "Solicitar" para pedir días.</p>
          </div>
        ) : (
          <div className="rounded-[18px] bg-card border shadow-card overflow-hidden">
            {mine.map((r) => {
              const n = diasDe(r);
              return (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3 border-t first:border-t-0" data-testid="my-vacation-card">
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLOR[r.type] }} aria-hidden="true" />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{rangoCorto(r)}</span>
                      <StatusBadge status={r.status} />
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {r.type}{r.reason && r.reason !== r.type ? ` · ${r.reason}` : ''}
                    </span>
                    {r.status !== 'pending' && r.reviewed_by_name && (
                      <span className="block text-xs text-muted-foreground">
                        {r.status === 'approved' ? 'Autorizó' : 'Rechazó'} {r.reviewed_by_name}
                        {r.review_comment ? ` · «${r.review_comment}»` : ''}
                      </span>
                    )}
                    <span className="mt-1.5 flex gap-4">
                      <button onClick={() => openEdit(r)} className="text-xs font-medium text-[#1e395e] dark:text-[#3cbef6] hover:underline" data-testid="edit-my-vacation">
                        Editar
                      </button>
                      {r.status !== 'approved' && (
                        <button onClick={() => removeMine(r)} className="text-xs font-medium text-[#dc2626] hover:underline" data-testid="delete-my-vacation">
                          Eliminar
                        </button>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-heading font-semibold leading-tight tabular-nums">{n}</span>
                    <span className="text-[11px] text-muted-foreground">{n === 1 ? 'día' : 'días'}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
      )}

      {/* Calendario de vacaciones */}
      {vistaActual === 'calendario' && (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}
        className="rounded-[18px] bg-card border shadow-card p-5" data-testid="vacations-calendar">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="font-heading text-lg font-semibold">Calendario de vacaciones</h2>
          <div className="flex items-center gap-1.5">
            <button onClick={() => moveCal(-1)} aria-label="Mes anterior" className="grid h-8 w-8 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground" data-testid="vacations-cal-prev"><ChevronLeft className="h-4 w-4" /></button>
            <span className="min-w-[132px] text-center font-heading text-[15px] font-semibold">{capitalize(MESES[calAnchor.getMonth()])} {calAnchor.getFullYear()}</span>
            <button onClick={() => moveCal(1)} aria-label="Mes siguiente" className="grid h-8 w-8 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground" data-testid="vacations-cal-next"><ChevronRight className="h-4 w-4" /></button>
            <button onClick={() => { setCalAnchor(new Date()); setCalDia(today); }} className="ml-1 h-8 rounded-full border bg-card px-3 text-xs font-medium hover:bg-muted" data-testid="vacations-cal-today">Hoy</button>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-dashed" style={{ borderColor: PENDING_COLOR, background: `${PENDING_COLOR}22` }} /> Pendiente</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: APPROVED_COLOR.Vacaciones }} /> Vacaciones</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: APPROVED_COLOR.Permiso }} /> Permiso</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: APPROVED_COLOR.Incapacidad }} /> Incapacidad</span>
        </div>
        <MesVacaciones anchor={calAnchor} requests={calRequests} compacto={!pc} diaSel={pc ? null : calDia} onDia={tocarDia}
          onBarra={(r, ds) => (pc ? setDayModalDate(ds) : setCalDia(ds))} />
        {!pc && (
          <div className="mt-4 space-y-2" data-testid="vacations-cal-dia">
            <h3 className="font-heading text-sm font-semibold">
              {capitalize(fullDateEs(calDia))} · {delDia.length ? `${delDia.length} ${delDia.length === 1 ? 'persona' : 'personas'}` : 'nadie falta'}
            </h3>
            {delDia.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2.5">
                <Avatar className="h-8 w-8 border"><AvatarImage src={r.user_avatar} /><AvatarFallback>{r.user_name?.[0]}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.user_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.type} · {rangoCorto(r)}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </motion.div>
      )}

      {/* Day detail dialog */}
      <Dialog open={!!dayModalDate} onOpenChange={(o) => !o && setDayModalDate(null)}>
        <DialogContent className="sm:max-w-[480px] rounded-[22px]">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {dayModalDate ? capitalize(fullDateEs(dayModalDate)) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1 max-h-[60vh] overflow-y-auto">
            {dayModalDate && requestsForDay(dayModalDate).map((r) => (
              <div key={r.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar className="h-8 w-8 border"><AvatarImage src={r.user_avatar} /><AvatarFallback>{r.user_name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{r.user_name}</p>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: r.status === 'approved' ? (APPROVED_COLOR[r.type] || TYPE_COLOR[r.type]) : PENDING_COLOR, background: `${TYPE_COLOR[r.type]}22` }}>{r.type}</span>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <RangeRow r={r} />
                {r.reason && <p className="text-xs text-muted-foreground mt-1.5">{r.reason}</p>}
              </div>
            ))}
            {dayModalDate && requestsForDay(dayModalDate).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Sin solicitudes este día</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDayModalDate(null)} className="rounded-xl">Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-[22px]">
          <DialogHeader><DialogTitle className="font-heading text-xl">{editTarget ? 'Editar solicitud' : 'Solicitar vacaciones / permiso'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => setF('type', v)}>
                <SelectTrigger className="h-11" data-testid="vacation-type"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Desde</Label>
                <Input type="date" min={today} value={form.start_date} onChange={(e) => setF('start_date', e.target.value)} className="h-11" data-testid="vacation-start" />
              </div>
              <div className="space-y-1.5">
                <Label>Hasta</Label>
                <Input type="date" min={form.start_date} value={form.end_date} onChange={(e) => setF('end_date', e.target.value)} className="h-11" data-testid="vacation-end" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo / comentario</Label>
              <Textarea value={form.reason} onChange={(e) => setF('reason', e.target.value)} placeholder="Detalle de tu solicitud…" rows={3} data-testid="vacation-reason" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => { setOpen(false); setEditTarget(null); }} className="rounded-xl">Cancelar</Button>
            <Button onClick={submit} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="vacation-submit">{saving ? 'Enviando…' : (editTarget ? 'Guardar cambios' : 'Enviar solicitud')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent className="sm:max-w-[440px] rounded-[22px]">
          <DialogHeader><DialogTitle className="font-heading">Rechazar solicitud</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">Rechazar la solicitud de <span className="font-medium text-foreground">{rejectTarget?.user_name}</span>. Puedes agregar un motivo (opcional).</p>
            <Textarea value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="Motivo del rechazo…" rows={3} data-testid="reject-comment" />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setRejectTarget(null)} className="rounded-xl">Cancelar</Button>
            <Button onClick={doReject} className="rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white" data-testid="confirm-reject-vacation">Rechazar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}