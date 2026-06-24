import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  FileText, Upload, Download, Loader2, Lock, Send, Inbox, Store, CalendarDays,
  Tag, PackageX, Footprints, CheckCircle2, Clock, Trash2, MessageSquare,
  FileSpreadsheet, X, UploadCloud, Filter, BadgeCheck,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessReports, SUCURSALES, REPORT_TYPES, reportTypeMeta } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';

const TYPE_ICONS = { Tag, PackageX, Footprints, FileText };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function monthLabel(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  if (idx < 0 || idx > 11) return ym;
  return `${MONTHS[idx]} ${y}`;
}

function fileSize(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TypeBadge({ typeId }) {
  const meta = reportTypeMeta(typeId);
  const Icon = TYPE_ICONS[meta.icon] || FileText;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: `${meta.color}1f`, color: meta.color }}>
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  if (status === 'revisado') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.12)] text-[#16a34a] px-2.5 py-1 text-xs font-semibold"><CheckCircle2 className="h-3.5 w-3.5" /> Revisado</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(236,144,50,0.14)] text-[#ec9032] px-2.5 py-1 text-xs font-semibold"><Clock className="h-3.5 w-3.5" /> Entregado</span>;
}

async function downloadReport(id, fallbackName) {
  try {
    const res = await api.get(`/reports/${id}/download`, { responseType: 'blob' });
    const disp = res.headers['content-disposition'] || '';
    const match = disp.match(/filename="?([^"]+)"?/);
    const name = match ? match[1] : fallbackName;
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); window.URL.revokeObjectURL(url);
  } catch (e) { toast.error('No se pudo descargar el archivo'); }
}

/* ----------------- Upload form (Enviar) ----------------- */
function EnviarTab({ meta, onChanged, refreshKey }) {
  const fileRef = useRef(null);
  const [type, setType] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [sucursal, setSucursal] = useState(meta?.my_sucursal || '');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [mine, setMine] = useState([]);

  useEffect(() => { if (meta?.my_sucursal && !sucursal) setSucursal(meta.my_sucursal); }, [meta]); // eslint-disable-line

  const loadMine = useCallback(async () => {
    try { const { data } = await api.get('/reports?box=sent'); setMine(data); } catch (e) {}
  }, []);
  useEffect(() => { loadMine(); }, [loadMine, refreshKey]);

  const pickFile = (f) => {
    if (!f) return;
    const ok = ['xlsx', 'xls', 'docx', 'doc'];
    const ext = f.name.split('.').pop().toLowerCase();
    if (!ok.includes(ext)) { toast.error('Solo Excel (.xlsx/.xls) o Word (.docx/.doc)'); return; }
    if (f.size > 100 * 1024 * 1024) { toast.error('El archivo supera los 100 MB'); return; }
    setFile(f);
  };

  const submit = async () => {
    if (!type) { toast.error('Selecciona el tipo de informe'); return; }
    if (!period) { toast.error('Indica el mes'); return; }
    if (!sucursal) { toast.error('Selecciona la tienda destino'); return; }
    if (!file) { toast.error('Adjunta el archivo del informe'); return; }
    setUploading(true); setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('period_month', period);
      fd.append('sucursal', sucursal);
      fd.append('notes', notes);
      await api.post('/reports', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => { if (e.total) setProgress(Math.round((e.loaded * 100) / e.total)); },
      });
      toast.success('Informe enviado correctamente');
      setType(''); setNotes(''); setFile(null); setProgress(0);
      if (fileRef.current) fileRef.current.value = '';
      loadMine(); onChanged?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al enviar el informe'); }
    finally { setUploading(false); }
  };

  const remove = async (id) => {
    try { await api.delete(`/reports/${id}`); toast.success('Informe eliminado'); loadMine(); onChanged?.(); }
    catch (e) { toast.error('No se pudo eliminar'); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Upload card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="lg:col-span-3 rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex items-center gap-2 mb-1">
          <Send className="h-5 w-5 text-[#00a5df]" />
          <h3 className="font-heading font-semibold">Enviar informe</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-5">Adjunta tu informe (Excel o Word, hasta 100 MB) y envíalo al gerente de la tienda.</p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de informe</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="h-11" data-testid="report-type-select"><SelectValue placeholder="Selecciona el informe" /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => {
                  const Icon = TYPE_ICONS[t.icon] || FileText;
                  return (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2"><Icon className="h-4 w-4" style={{ color: t.color }} /> {t.label}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mes / Período</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="h-11" data-testid="report-period-input" />
            </div>
            <div className="space-y-1.5">
              <Label>Tienda destino</Label>
              <Select value={sucursal} onValueChange={setSucursal}>
                <SelectTrigger className="h-11" data-testid="report-sucursal-select">
                  <div className="flex items-center gap-2"><Store className="h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Tienda" /></div>
                </SelectTrigger>
                <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* File dropzone */}
          <div className="space-y-1.5">
            <Label>Archivo del informe</Label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
              className="cursor-pointer rounded-xl border-2 border-dashed border-border hover:border-[#00a5df] transition-colors p-6 text-center bg-muted/30"
              data-testid="report-dropzone">
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <span className="h-10 w-10 rounded-lg grid place-items-center bg-[rgba(0,165,223,0.12)] text-[#00a5df] shrink-0"><FileSpreadsheet className="h-5 w-5" /></span>
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium truncate max-w-[280px]">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{fileSize(file.size)}</p>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                    className="text-muted-foreground hover:text-[#dc2626] transition-colors" data-testid="report-file-clear"><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <UploadCloud className="h-7 w-7 text-[#00a5df]" />
                  <p className="text-sm font-medium text-foreground">Haz clic o arrastra tu archivo aquí</p>
                  <p className="text-xs">Excel (.xlsx, .xls) o Word (.docx, .doc) · máx. 100 MB</p>
                </div>
              )}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.docx,.doc" className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])} data-testid="report-file-input" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Comentario para el gerente…" data-testid="report-notes-input" />
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-[#00a5df] transition-[width] duration-200" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted-foreground text-right">{progress}%</p>
            </div>
          )}

          <Button onClick={submit} disabled={uploading} className="w-full h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="report-submit-button">
            {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            {uploading ? 'Enviando…' : 'Enviar informe'}
          </Button>
        </div>
      </motion.div>

      {/* My sent reports */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.06 }}
        className="lg:col-span-2 rounded-[18px] bg-card border shadow-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-[#712146]" />
          <h3 className="font-heading font-semibold">Mis envíos</h3>
        </div>
        <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
          {mine.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">Aún no has enviado informes</p>}
          {mine.map((r) => (
            <div key={r.id} className="rounded-xl border p-3.5" data-testid="my-report-row">
              <div className="flex items-start justify-between gap-2">
                <TypeBadge typeId={r.type} />
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm font-medium mt-2 truncate" title={r.original_filename}>{r.original_filename}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {monthLabel(r.period_month)}</span>
                <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" /> {r.sucursal}</span>
                <span>{fileSize(r.size)}</span>
              </div>
              {r.status === 'revisado' && r.review_comment && (
                <p className="text-xs mt-2 rounded-lg bg-[rgba(22,163,74,0.06)] text-[#16a34a] px-2.5 py-1.5"><MessageSquare className="h-3 w-3 inline mr-1" />{r.review_comment}</p>
              )}
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => downloadReport(r.id, r.original_filename)} data-testid="my-report-download">
                  <Download className="h-3.5 w-3.5 mr-1" /> Descargar
                </Button>
                {r.status !== 'revisado' && (
                  <Button size="sm" variant="ghost" className="rounded-lg h-8 text-muted-foreground hover:text-[#dc2626]" onClick={() => remove(r.id)} data-testid="my-report-delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ----------------- Review dialog ----------------- */
function ReviewDialog({ report, onReviewed }) {
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.post(`/reports/${report.id}/review`, { comment });
      toast.success('Informe marcado como revisado');
      setOpen(false); setComment(''); onReviewed?.();
    } catch (err) { toast.error(err?.response?.data?.detail || 'Error al revisar'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-lg h-8 bg-[#16a34a] hover:bg-[#15803d] text-white" data-testid="report-review-open">
          <BadgeCheck className="h-3.5 w-3.5 mr-1" /> Marcar revisado
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-heading">Revisar informe</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl border p-3 bg-muted/30">
            <TypeBadge typeId={report.type} />
            <p className="text-sm font-medium mt-2">{report.original_filename}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{monthLabel(report.period_month)} · Tienda {report.sucursal} · {report.uploaded_by_name}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Comentario <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Observaciones para el coordinador…" data-testid="report-review-comment" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving} className="rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" data-testid="report-review-submit">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />} Confirmar revisión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------- Received reports ----------------- */
function RecibidosTab({ meta, onChanged, refreshKey }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fType, setFType] = useState('all');
  const [fSuc, setFSuc] = useState('all');
  const [fPeriod, setFPeriod] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ box: 'received' });
      if (fType !== 'all') params.append('type', fType);
      if (fSuc !== 'all') params.append('sucursal', fSuc);
      if (fPeriod) params.append('period_month', fPeriod);
      const { data } = await api.get(`/reports?${params.toString()}`);
      setReports(data);
    } catch (e) { setReports([]); }
    finally { setLoading(false); }
  }, [fType, fSuc, fPeriod]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-[18px] bg-card border shadow-card p-4 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mr-1"><Filter className="h-4 w-4" /> Filtros</div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo</Label>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger className="h-10 w-[220px]" data-testid="filter-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {REPORT_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {meta?.sees_all && (
          <div className="space-y-1">
            <Label className="text-xs">Tienda</Label>
            <Select value={fSuc} onValueChange={setFSuc}>
              <SelectTrigger className="h-10 w-[140px]" data-testid="filter-sucursal"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Mes</Label>
          <Input type="month" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)} className="h-10 w-[170px]" data-testid="filter-period" />
        </div>
        {(fType !== 'all' || fSuc !== 'all' || fPeriod) && (
          <Button variant="ghost" className="h-10 rounded-xl text-muted-foreground" onClick={() => { setFType('all'); setFSuc('all'); setFPeriod(''); }}>
            <X className="h-4 w-4 mr-1" /> Limpiar
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => <div key={i} className="h-44 rounded-[18px] bg-card border shadow-card animate-pulse" />)}
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-[18px] bg-card border shadow-card p-12 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-heading font-semibold">No hay informes recibidos</p>
          <p className="text-sm text-muted-foreground mt-1">
            {meta?.my_sucursal || meta?.sees_all ? 'Aún no hay informes para mostrar con estos filtros.' : 'Asigna tu tienda en Configuración para recibir informes.'}
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((r) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
              className="rounded-[18px] bg-card border shadow-card p-5 flex flex-col" data-testid="received-report-card">
              <div className="flex items-start justify-between gap-2 mb-3">
                <TypeBadge typeId={r.type} />
                <StatusBadge status={r.status} />
              </div>
              <p className="text-sm font-semibold truncate" title={r.original_filename}>{r.original_filename}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1.5">
                <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {monthLabel(r.period_month)}</span>
                <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" /> {r.sucursal}</span>
                <span>{fileSize(r.size)}</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Avatar className="h-7 w-7 border"><AvatarImage src={r.uploaded_by_avatar} /><AvatarFallback>{r.uploaded_by_name?.[0]}</AvatarFallback></Avatar>
                <span className="text-xs text-muted-foreground truncate">{r.uploaded_by_name}</span>
              </div>
              {r.notes && <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">"{r.notes}"</p>}
              {r.status === 'revisado' && (
                <p className="text-xs mt-2 rounded-lg bg-[rgba(22,163,74,0.06)] text-[#16a34a] px-2.5 py-1.5">
                  <CheckCircle2 className="h-3 w-3 inline mr-1" /> Revisado por {r.reviewed_by_name}
                  {r.review_comment ? ` · "${r.review_comment}"` : ''}
                </p>
              )}
              <div className="flex items-center gap-2 mt-auto pt-3">
                <Button size="sm" variant="outline" className="rounded-lg h-8" onClick={() => downloadReport(r.id, r.original_filename)} data-testid="received-report-download">
                  <Download className="h-3.5 w-3.5 mr-1" /> Descargar
                </Button>
                {meta?.can_review && r.status !== 'revisado' && <ReviewDialog report={r} onReviewed={() => { load(); onChanged?.(); }} />}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------- Page ----------------- */
export default function Reportes() {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [stats, setStats] = useState({ sent: 0, received: 0, pending: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  const loadMeta = useCallback(async () => {
    try { const { data } = await api.get('/reports/meta'); setMeta(data); } catch (e) {}
  }, []);
  const loadStats = useCallback(async () => {
    try { const { data } = await api.get('/reports/stats'); setStats(data); } catch (e) {}
  }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadStats(); }, [loadStats, refreshKey]);

  if (!canAccessReports(user)) return <Navigate to="/" replace />;

  const statCards = [
    { label: 'Enviados por mí', value: stats.sent, icon: Send, color: '#00a5df' },
    { label: 'Recibidos', value: stats.received, icon: Inbox, color: '#1e395e' },
    { label: 'Pendientes por revisar', value: stats.pending, icon: Clock, color: '#ec9032' },
  ];

  return (
    <div className="max-w-[1320px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <FileText className="h-7 w-7 text-[#00a5df]" /> Reportes
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Entrega de informes ECCP a tu tienda</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5">
          <Lock className="h-3.5 w-3.5" /> Módulo restringido
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-[16px] bg-card border shadow-card p-4 flex items-center gap-3" data-testid={`report-stat-${s.label}`}>
            <span className="h-11 w-11 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: `${s.color}1f`, color: s.color }}><s.icon className="h-5 w-5" /></span>
            <div>
              <p className="font-heading text-2xl font-semibold leading-none">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="enviar">
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="enviar" className="rounded-lg" data-testid="report-tab-enviar"><Send className="h-4 w-4 mr-1.5" /> Enviar</TabsTrigger>
          <TabsTrigger value="recibidos" className="rounded-lg" data-testid="report-tab-recibidos"><Inbox className="h-4 w-4 mr-1.5" /> Recibidos</TabsTrigger>
        </TabsList>

        <TabsContent value="enviar"><EnviarTab meta={meta} onChanged={bump} refreshKey={refreshKey} /></TabsContent>
        <TabsContent value="recibidos"><RecibidosTab meta={meta} onChanged={bump} refreshKey={refreshKey} /></TabsContent>
      </Tabs>
    </div>
  );
}
