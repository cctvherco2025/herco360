import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Palmtree, Plus, Check, X, Clock, CalendarRange, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { fullDateEs, capitalize, ymd } from '@/lib/time';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const TYPES = ['Vacaciones', 'Permiso', 'Incapacidad'];
const TYPE_COLOR = { Vacaciones: '#ec9032', Permiso: '#3cbef6', Incapacidad: '#dc2626' };
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
    setSaving(true);
    try {
      await api.post('/vacations', form);
      toast.success('Solicitud enviada. Tu jefe fue notificado.');
      setOpen(false);
      setForm({ start_date: today, end_date: today, type: 'Vacaciones', reason: '' });
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || 'No se pudo enviar la solicitud'); }
    finally { setSaving(false); }
  };

  const approve = async (id) => {
    try { await api.post(`/vacations/${id}/approve`, { comment: '' }); toast.success('Solicitud aprobada'); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error'); }
  };
  const doReject = async () => {
    if (!rejectTarget) return;
    try { await api.post(`/vacations/${rejectTarget.id}/reject`, { comment: rejectComment }); toast.success('Solicitud rechazada'); setRejectTarget(null); setRejectComment(''); load(); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Error'); }
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
        <Button onClick={() => setOpen(true)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="request-vacation-button">
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
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Request dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-[22px]">
          <DialogHeader><DialogTitle className="font-heading text-xl">Solicitar vacaciones / permiso</DialogTitle></DialogHeader>
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
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">Cancelar</Button>
            <Button onClick={submit} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="vacation-submit">{saving ? 'Enviando…' : 'Enviar solicitud'}</Button>
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
