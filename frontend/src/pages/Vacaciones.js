import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Palmtree, Plus, Check, X, Clock, CalendarRange, Inbox, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { fullDateEs, capitalize, ymd, MESES } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthView, WeekView, DayView, startOfWeek, addDays } from '@/components/CalendarViews';

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

function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>{s.label}</span>;
}

export default function Vacaciones() {
  const { user } = useAuth();
  const isManager = user?.role === 'admin' || ['Jefe', 'Gerente', 'Director comercial'].includes(user?.position);

  const [mine, setMine] = useState([]);
  const [toReview, setToReview] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const today = ymd(new Date());
  const [form, setForm] = useState({ start_date: today, end_date: today, type: 'Vacaciones', reason: '' });
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectComment, setRejectComment] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get('/vacations/mine'); setMine(data); } catch (e) {}
    if (isManager) { try { const { data } = await api.get('/vacations/to-review'); setToReview(data); } catch (e) {} }
  }, [isManager]);
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
    try { await api.post(`/vacations/${id}/approve`, { comment: '' }); toast.success('Solicitud aprobada'); load(); loadCalendar(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error'); }
  };
  const doReject = async () => {
    if (!rejectTarget) return;
    try { await api.post(`/vacations/${rejectTarget.id}/reject`, { comment: rejectComment }); toast.success('Solicitud rechazada'); setRejectTarget(null); setRejectComment(''); load(); loadCalendar(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error'); }
  };

  const openEdit = (r) => {
    setEditTarget(r);
    setForm({ start_date: r.start_date, end_date: r.end_date, type: r.type, reason: r.reason || '' });
    setOpen(true);
  };

  const removeMine = async (id) => {
    try { await api.delete(`/vacations/${id}`); toast.success('Solicitud eliminada'); load(); loadCalendar(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'No se pudo eliminar'); }
  };

  // ---- Calendario de vacaciones ----
  const [calAnchor, setCalAnchor] = useState(new Date());
  const [calView, setCalView] = useState('Mes');
  const [calRequests, setCalRequests] = useState([]);
  const [calEvents, setCalEvents] = useState([]);
  const [dayModalDate, setDayModalDate] = useState(null);

  const expandRequests = (rows) => {
    const events = [];
    rows.forEach((r) => {
      let d = new Date(`${r.start_date}T00:00:00`);
      const endD = new Date(`${r.end_date}T00:00:00`);
      while (d <= endD) {
        events.push({
          id: `${r.id}-${ymd(d)}`,
          title: `${r.type} — ${r.user_name}`,
          color: r.status === 'approved' ? (APPROVED_COLOR[r.type] || TYPE_COLOR[r.type]) : PENDING_COLOR,
          date: ymd(d),
          start_time: '08:00',
          end_time: '18:00',
          pending: r.status === 'pending',
        });
        d = new Date(d.getTime() + 86400000);
      }
    });
    return events;
  };

  const loadCalendar = useCallback(async () => {
    let gridStart, gridEnd;
    if (calView === 'Día') {
      gridStart = calAnchor;
      gridEnd = calAnchor;
    } else if (calView === 'Semana') {
      gridStart = startOfWeek(calAnchor);
      gridEnd = addDays(gridStart, 6);
    } else {
      const first = new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1);
      gridStart = startOfWeek(first);
      gridEnd = addDays(gridStart, 41);
    }
    try {
      const { data } = await api.get(`/vacations/calendar?start=${ymd(gridStart)}&end=${ymd(gridEnd)}`);
      setCalRequests(data);
      setCalEvents(expandRequests(data));
    } catch (e) {}
  }, [calAnchor, calView]);

  useEffect(() => { loadCalendar(); }, [loadCalendar]);

  const requestsForDay = (dateStr) => calRequests.filter((r) => r.start_date <= dateStr && r.end_date >= dateStr);

  const moveCal = (dir) => {
    if (calView === 'Mes') setCalAnchor(new Date(calAnchor.getFullYear(), calAnchor.getMonth() + dir, 1));
    else if (calView === 'Día') setCalAnchor(addDays(calAnchor, dir));
    else setCalAnchor(addDays(calAnchor, dir * 7));
  };

  const calRangeLabel = () => {
    if (calView === 'Mes') return `${capitalize(MESES[calAnchor.getMonth()])} ${calAnchor.getFullYear()}`;
    if (calView === 'Día') return capitalize(fullDateEs(ymd(calAnchor)));
    const s = startOfWeek(calAnchor); const e = addDays(s, 6);
    return `${s.getDate()} ${MESES[s.getMonth()].slice(0, 3)} - ${e.getDate()} ${MESES[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`;
  };

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
        <Button onClick={() => { setEditTarget(null); setForm({ start_date: today, end_date: today, type: 'Vacaciones', reason: '' }); setOpen(true); }} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="request-vacation-button">
          <Plus className="h-4 w-4 mr-1.5" /> Solicitar
        </Button>
      </div>

      {/* Manager inbox */}
      {isManager && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="rounded-[18px] bg-card border shadow-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Inbox className="h-5 w-5 text-[#ec9032]" />
            <h2 className="font-heading text-lg font-semibold">Por autorizar</h2>
            {toReview.length > 0 && <span className="rounded-full bg-[rgba(236,144,50,0.14)] text-[#ec9032] text-xs font-semibold px-2 py-0.5">{toReview.length}</span>}
          </div>
          {toReview.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No hay solicitudes pendientes de tu área</p>
          ) : (
            <div className="space-y-3">
              {toReview.map((r) => (
                <div key={r.id} className="rounded-xl border p-4" data-testid="review-vacation-card">
                  <div className="flex items-center gap-3 mb-2">
                    <Avatar className="h-9 w-9 border"><AvatarImage src={r.user_avatar} /><AvatarFallback>{r.user_name?.[0]}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{r.user_name} <span className="text-xs text-muted-foreground">· {r.position}</span></p>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: TYPE_COLOR[r.type], background: `${TYPE_COLOR[r.type]}22` }}>{r.type}</span>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => approve(r.id)} className="h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-[rgba(22,163,74,0.12)] text-[#16a34a] hover:bg-[rgba(22,163,74,0.22)] text-sm font-medium" data-testid="approve-vacation-button"><Check className="h-4 w-4" /> Autorizar</button>
                      <button onClick={() => { setRejectTarget(r); setRejectComment(''); }} className="h-9 px-3 inline-flex items-center gap-1 rounded-lg bg-[rgba(220,38,38,0.1)] text-[#dc2626] hover:bg-[rgba(220,38,38,0.2)] text-sm font-medium" data-testid="reject-vacation-button"><X className="h-4 w-4" /> Rechazar</button>
                    </div>
                  </div>
                  <RangeRow r={r} />
                  {r.reason && <p className="text-sm text-muted-foreground mt-1.5">{r.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* My requests */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 }}
        className="rounded-[18px] bg-card border shadow-card p-5">
        <h2 className="font-heading text-lg font-semibold mb-4">Mis solicitudes</h2>
        {mine.length === 0 ? (
          <div className="text-center py-10">
            <Palmtree className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Aún no tienes solicitudes. Usa "Solicitar" para pedir días.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mine.map((r) => (
              <div key={r.id} className="rounded-xl border p-4" data-testid="my-vacation-card">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ color: TYPE_COLOR[r.type], background: `${TYPE_COLOR[r.type]}22` }}>{r.type}</span>
                  <StatusBadge status={r.status} />
                </div>
                <RangeRow r={r} />
                {r.reason && <p className="text-sm text-muted-foreground mt-1.5">{r.reason}</p>}
                {r.status !== 'pending' && r.reviewed_by_name && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {r.status === 'approved' ? 'Autorizada' : 'Rechazada'} por {r.reviewed_by_name}
                    {r.review_comment ? ` — "${r.review_comment}"` : ''}
                  </p>
                )}
                <div className="flex gap-2 mt-3 pt-3 border-t">
                  <button onClick={() => openEdit(r)} className="text-xs font-medium text-[#1e395e] dark:text-[#3cbef6] hover:underline" data-testid="edit-my-vacation">
                    Editar
                  </button>
                  {r.status !== 'approved' && (
                    <button onClick={() => removeMine(r.id)} className="text-xs font-medium text-[#dc2626] hover:underline" data-testid="delete-my-vacation">
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Calendario de vacaciones */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
        className="rounded-[18px] bg-card border shadow-card p-5 mt-5" data-testid="vacations-calendar">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
          <h2 className="font-heading text-lg font-semibold">Calendario de vacaciones</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
              <button
                onClick={() => moveCal(-1)}
                className="p-1.5 rounded-lg hover:bg-muted" data-testid="vacations-cal-prev">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCalAnchor(new Date())}
                className="px-3 py-1 text-sm font-medium rounded-lg hover:bg-muted" data-testid="vacations-cal-today">
                Hoy
              </button>
              <button
                onClick={() => moveCal(1)}
                className="p-1.5 rounded-lg hover:bg-muted" data-testid="vacations-cal-next">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm font-medium">{calRangeLabel()}</span>
            <Tabs value={calView} onValueChange={setCalView}>
              <TabsList className="rounded-xl">
                <TabsTrigger value="Día" className="rounded-lg text-xs" data-testid="vacations-view-dia">Día</TabsTrigger>
                <TabsTrigger value="Semana" className="rounded-lg text-xs" data-testid="vacations-view-semana">Semana</TabsTrigger>
                <TabsTrigger value="Mes" className="rounded-lg text-xs" data-testid="vacations-view-mes">Mes</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
        <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: PENDING_COLOR }} /> Pendiente (cualquier tipo)</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: APPROVED_COLOR.Vacaciones }} /> Vacaciones aprobadas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: APPROVED_COLOR.Permiso }} /> Permiso aprobado</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: APPROVED_COLOR.Incapacidad }} /> Incapacidad aprobada</span>
        </div>
        <div className="overflow-hidden">
          {calView === 'Semana' && (
            <WeekView
              anchor={calAnchor}
              activities={calEvents}
              onEventClick={(ev) => setDayModalDate(ev.date)}
              onSlotClick={(ds) => { if (requestsForDay(ds).length > 0) setDayModalDate(ds); }}
            />
          )}
          {calView === 'Día' && (
            <DayView
              anchor={calAnchor}
              activities={calEvents}
              onEventClick={(ev) => setDayModalDate(ev.date)}
              onSlotClick={(ds) => { if (requestsForDay(ds).length > 0) setDayModalDate(ds); }}
            />
          )}
          {calView === 'Mes' && (
            <MonthView
              anchor={calAnchor}
              activities={calEvents}
              onEventClick={(ev) => setDayModalDate(ev.date)}
              onSlotClick={(ds) => { if (requestsForDay(ds).length > 0) setDayModalDate(ds); }}
            />
          )}
        </div>
      </motion.div>

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