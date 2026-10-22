import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Search, Eye, Pencil, Trash2, Loader2, Download, ShieldCheck, ShieldX, History, Store, User as UserIcon, Calendar,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ymd } from '@/lib/time';
import {
  GUARDIAS_SUCURSALES, guardiaTone, GUARDIA_TONE_COLOR, ESTADO_LABEL, computeGuardiaSummary, fmtFechaHora,
} from '@/lib/guardiasSchema';
import { canAdminGuardias } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar } from '@/components/ConfirmDialog';
import { SucursalPicker, CumpleToggle, ResultadoStats, PdfButton } from '@/components/guardias/GuardiaWizard';
import { generateGuardiaPdf } from '@/lib/guardiasPdf';

// 'YYYY-MM-DD' local -> instante UTC del inicio de ese día (lo que compara el backend)
const inicioDia = (s, sumarDias = 0) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d + sumarDias).toISOString();
};

function AuthedImg({ url, className, onClick }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objUrl;
    setSrc(null); setFailed(false);
    api.get(url, { responseType: 'blob' }).then((res) => {
      if (!active) return;
      objUrl = URL.createObjectURL(res.data);
      setSrc(objUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [url]);
  if (failed) {
    return (
      <div className={`${className} bg-muted grid place-items-center text-center text-[10px] leading-tight text-muted-foreground px-1`}>
        No se pudo<br />cargar la imagen
      </div>
    );
  }
  if (!src) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={src} alt="Evidencia" className={className} onClick={onClick} />;
}

export function EstadoChip({ pct, estado }) {
  const color = GUARDIA_TONE_COLOR[guardiaTone(pct)];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color, background: `${color}1f` }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {ESTADO_LABEL[estado] || '—'}
    </span>
  );
}

function PctText({ pct }) {
  return <span className="text-sm font-bold" style={{ color: GUARDIA_TONE_COLOR[guardiaTone(pct)] }}>{pct}%</span>;
}

/* ───────────────────────── Detalle ─────────────────────── */
function Thumbs({ evalId, list, onZoom }) {
  if (!list?.length) return null;
  const url = (pid) => `/guardias/evaluaciones/${evalId}/foto/${pid}`;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {list.map((p) => (
        <AuthedImg key={p.id} url={url(p.id)} className="h-16 w-16 rounded-lg object-cover border cursor-pointer" onClick={() => onZoom(url(p.id))} />
      ))}
    </div>
  );
}

function DetailDialog({ id, isAdmin, onClose }) {
  const [doc, setDoc] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    if (!id) { setDoc(null); return; }
    api.get(`/guardias/evaluaciones/${id}`).then(({ data }) => setDoc(data)).catch(() => toast.error('No se pudo cargar la evaluación'));
  }, [id]);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[680px] rounded-[22px] max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* celular: título arriba y "Descargar PDF" debajo; desde sm en una fila */}
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pr-10 text-left">
          <DialogTitle className="font-heading leading-snug">Revisión de guardia · {doc?.sucursal || '…'}</DialogTitle>
          {doc && <PdfButton evalDoc={doc} className="h-8 text-xs shrink-0" testid="guardias-detail-pdf" />}
        </DialogHeader>
        {!doc ? (
          <div className="px-4 sm:px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-6 space-y-4">
            <ResultadoStats evalDoc={doc} />
            <p className="text-sm text-muted-foreground -mt-2">Evaluador: <b className="text-foreground">{doc.evaluador_name}</b></p>

            <div className="space-y-2">
              {(doc.entries || []).map((e) => (
                <div key={e.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium break-words min-w-0">{e.titulo}</p>
                    {e.respuesta === 'cumple'
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16a34a] shrink-0"><ShieldCheck className="h-3.5 w-3.5" /> Cumple</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#dc2626] shrink-0"><ShieldX className="h-3.5 w-3.5" /> No cumple</span>}
                  </div>
                  {e.descripcion && <p className="text-xs text-muted-foreground italic mt-1 break-words">"{e.descripcion}"</p>}
                  <Thumbs evalId={doc.id} list={e.photos} onZoom={setZoom} />
                </div>
              ))}
            </div>

            {(doc.observaciones || doc.acciones || doc.photos?.length > 0) && (
              <div className="rounded-xl border p-3 space-y-3">
                {doc.observaciones && <div><p className="text-xs font-semibold text-muted-foreground">Observaciones generales</p><p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{doc.observaciones}</p></div>}
                {doc.acciones && <div><p className="text-xs font-semibold text-muted-foreground">Acciones correctivas</p><p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{doc.acciones}</p></div>}
                {doc.photos?.length > 0 && <div><p className="text-xs font-semibold text-muted-foreground">Fotografías de evidencia</p><Thumbs evalId={doc.id} list={doc.photos} onZoom={setZoom} /></div>}
              </div>
            )}

            {isAdmin && (doc.cambios || []).length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Historial de cambios</p>
                <div className="space-y-1.5">
                  {[...doc.cambios].reverse().map((c, i) => (
                    <p key={i} className="text-xs">
                      <b>{c.user_name}</b> <span className="text-muted-foreground">· {fmtFechaHora(c.at)}</span>
                      <span className="block text-muted-foreground">Cambió: {(c.campos || []).join(', ')}</span>
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>
        {zoom && <AuthedImg url={zoom} className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </Dialog>
  );
}

/* ─────────────────── Editar (administrador) ────────────── */
function EditDialog({ id, onClose, onSaved }) {
  const [doc, setDoc] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setDoc(null); setForm(null); return; }
    api.get(`/guardias/evaluaciones/${id}`).then(({ data }) => {
      setDoc(data);
      setForm({
        sucursal: data.sucursal, guardia: data.guardia,
        observaciones: data.observaciones || '', acciones: data.acciones || '',
        answers: Object.fromEntries((data.entries || []).map((e) => [e.id, e.respuesta])),
        descripciones: Object.fromEntries((data.entries || []).map((e) => [e.id, e.descripcion || ''])),
      });
    }).catch(() => toast.error('No se pudo cargar la evaluación'));
  }, [id]);

  const criterios = useMemo(() => doc?.entries || [], [doc]);
  const summary = useMemo(() => computeGuardiaSummary(criterios, form?.answers || {}), [criterios, form]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.guardia.trim()) { toast.error('Escribe el nombre del guardia'); return; }
    setSaving(true);
    try {
      const { data } = await api.put(`/guardias/evaluaciones/${id}`, {
        sucursal: form.sucursal, guardia: form.guardia.trim(),
        observaciones: form.observaciones, acciones: form.acciones,
        entries: criterios.map((c) => ({ id: c.id, respuesta: form.answers[c.id], descripcion: form.descripciones[c.id] || '' })),
      });
      toast.success('Evaluación actualizada');
      onSaved(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar el cambio');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[680px] rounded-[22px] max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 pr-10 text-left">
          <DialogTitle className="font-heading leading-snug">Editar revisión de guardia</DialogTitle>
        </DialogHeader>
        {!form ? (
          <div className="px-4 sm:px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Registrada por <b className="text-foreground">{doc.evaluador_name}</b> · {fmtFechaHora(doc.created_at)}. El evaluador, la fecha y las fotos no se modifican.
              </p>
              <div className="space-y-1.5"><Label>Sucursal</Label><SucursalPicker value={form.sucursal} onChange={(v) => set('sucursal', v)} testid="guardias-edit-sucursal" /></div>
              <div className="space-y-1.5"><Label>Nombre del guardia</Label><Input value={form.guardia} onChange={(e) => set('guardia', e.target.value)} className="h-11" /></div>

              <div className="space-y-3">
                {criterios.map((c, i) => (
                  <div key={c.id} className="rounded-xl border p-3 space-y-2">
                    <p className="text-sm font-medium">{i + 1}. {c.titulo}</p>
                    <CumpleToggle value={form.answers[c.id]} onChange={(v) => set('answers', { ...form.answers, [c.id]: v })} testid={`guardias-edit-${c.id}`} />
                    {form.answers[c.id] === 'no_cumple' && (
                      <Textarea rows={2} placeholder="Describe el incumplimiento…" value={form.descripciones[c.id] || ''}
                        onChange={(e) => set('descripciones', { ...form.descripciones, [c.id]: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5"><Label>Observaciones generales</Label><Textarea rows={3} value={form.observaciones} onChange={(e) => set('observaciones', e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Acciones correctivas</Label><Textarea rows={3} value={form.acciones} onChange={(e) => set('acciones', e.target.value)} /></div>
            </div>
            <div className="border-t px-4 sm:px-6 py-3 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Resultado: <PctText pct={summary.pct} /></span>
              <Button variant="outline" className="rounded-xl ml-auto" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={save} disabled={saving} data-testid="guardias-edit-save">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────── Registro de auditoría (admin) ───────── */
function AuditoriaDialog({ open, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    api.get('/guardias/auditoria').then(({ data }) => setRows(data)).catch(() => { setRows([]); toast.error('No se pudo cargar el registro'); });
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[560px] rounded-[22px] max-h-[80dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 pr-10 text-left">
          <DialogTitle className="font-heading">Registro de auditoría</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6 space-y-2">
          {!rows && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay ediciones ni eliminaciones.</p>}
          {rows && rows.map((r) => (
            <div key={r.id} className="rounded-xl border p-3 text-sm">
              <p>
                <b>{r.user_name}</b> {r.accion === 'eliminada' ? <span className="text-[#dc2626] font-medium">eliminó</span> : 'editó'} la revisión
                de <b>{r.guardia}</b> ({r.sucursal})
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtFechaHora(r.at)}{r.campos?.length ? ` · ${r.campos.join(', ')}` : ''}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Historial ───────────────────── */
export default function Historial({ refreshKey }) {
  const { user } = useAuth();
  const isAdmin = canAdminGuardias(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sucursal, setSucursal] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [guardia, setGuardia] = useState('');
  const [coordinador, setCoordinador] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [exportingId, setExportingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sucursal) params.set('sucursal', sucursal);
      if (desde) params.set('desde', inicioDia(desde));
      if (hasta) params.set('hasta', inicioDia(hasta, 1));
      const { data } = await api.get(`/guardias/evaluaciones?${params.toString()}`);
      setRows(data);
    } catch (e) { toast.error('No se pudieron cargar las evaluaciones'); }
    finally { setLoading(false); }
  }, [sucursal, desde, hasta]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const coordinadores = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(r.evaluador_id, r.evaluador_name));
    return [...m.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || ''));
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (coordinador && r.evaluador_id !== coordinador) return false;
    const s = guardia.trim().toLowerCase();
    return !s || (r.guardia || '').toLowerCase().includes(s);
  });

  const removeOne = async (r) => {
    setDeletingId(r.id);
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar evaluación?',
      mensaje: <>Se eliminará la revisión de <b>{r.guardia}</b> en <b>{r.sucursal}</b> del {fmtFechaHora(r.created_at)}, registrada por <b>{r.evaluador_name}</b>. Quedará constancia en el registro de auditoría.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Evaluación eliminada',
      accion: () => api.delete(`/guardias/evaluaciones/${r.id}`),
    });
    setDeletingId(null);
    if (!ok) return;
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    if (openId === r.id) setOpenId(null);
  };

  const quickPdf = async (r) => {
    setExportingId(r.id);
    try {
      const { data } = await api.get(`/guardias/evaluaciones/${r.id}`);
      await generateGuardiaPdf(data);
    } catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExportingId(null); }
  };

  const onEdited = (data) => {
    setRows((rs) => rs.map((x) => (x.id === data.id ? { ...x, ...data } : x)));
    setEditId(null);
  };

  const Actions = ({ r }) => (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={() => setOpenId(r.id)} title="Ver detalle" aria-label="Ver detalle" data-testid="guardias-history-view"
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Eye className="h-4 w-4" /></button>
      <button onClick={() => quickPdf(r)} disabled={exportingId === r.id} title="Descargar PDF" aria-label="Descargar PDF" data-testid="guardias-history-pdf"
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50">
        {exportingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      {isAdmin && (
        <>
          <button onClick={() => setEditId(r.id)} title="Editar" aria-label="Editar" data-testid="guardias-history-edit"
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => removeOne(r)} disabled={deletingId === r.id} title="Eliminar" aria-label="Eliminar" data-testid="guardias-history-delete"
            className="p-2 rounded-lg hover:bg-[rgba(220,38,38,0.08)] text-muted-foreground hover:text-[#dc2626] disabled:opacity-50 transition-colors">
            {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div>
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Sucursal</label>
          <Select value={sucursal || 'todas'} onValueChange={(v) => setSucursal(v === 'todas' ? '' : v)}>
            <SelectTrigger className="h-10 w-full" data-testid="guardias-filter-sucursal"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {GUARDIAS_SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Coordinador</label>
          <Select value={coordinador || 'todos'} onValueChange={(v) => setCoordinador(v === 'todos' ? '' : v)}>
            <SelectTrigger className="h-10 w-full" data-testid="guardias-filter-coordinador"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {coordinadores.map(([cid, name]) => <SelectItem key={cid} value={cid}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={desde} max={hasta || ymd(new Date())} onChange={(e) => setDesde(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={hasta} min={desde || undefined} max={ymd(new Date())} onChange={(e) => setHasta(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
        <div className="relative col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={guardia} onChange={(e) => setGuardia(e.target.value)} placeholder="Buscar guardia…" className="pl-9 h-10" data-testid="guardias-filter-guardia" />
        </div>
      </div>

      {isAdmin && (
        <div className="flex justify-end -mt-1 mb-3">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAuditOpen(true)} data-testid="guardias-auditoria-button">
            <History className="h-3.5 w-3.5 mr-1.5" /> Registro de auditoría
          </Button>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>}
      {!loading && filtered.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <ShieldCheck className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Sin evaluaciones con estos filtros</p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <>
          {/* PC y tablet: tabla */}
          <div className="hidden md:block rounded-[18px] bg-card border shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Fecha y hora</th>
                  <th className="text-left font-medium px-3 py-3">Sucursal</th>
                  <th className="text-left font-medium px-3 py-3">Guardia</th>
                  <th className="text-left font-medium px-3 py-3">Coordinador</th>
                  <th className="text-right font-medium px-3 py-3">Cumplimiento</th>
                  <th className="text-left font-medium px-3 py-3">Estado</th>
                  <th className="text-right font-medium px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors" data-testid="guardias-history-row">
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtFechaHora(r.created_at)}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.sucursal}</td>
                    <td className="px-3 py-2.5 max-w-[200px] truncate">{r.guardia}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate text-muted-foreground">{r.evaluador_name}</td>
                    <td className="px-3 py-2.5 text-right"><PctText pct={r.percent} /></td>
                    <td className="px-3 py-2.5"><EstadoChip pct={r.percent} estado={r.estado} /></td>
                    <td className="px-4 py-1"><Actions r={r} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Celular: tarjetas */}
          <div className="md:hidden space-y-2">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-[16px] bg-card border shadow-card p-3" data-testid="guardias-history-card">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                      <Store className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate"><b>{r.sucursal}</b> · {r.guardia}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="flex items-center gap-1 whitespace-nowrap"><Calendar className="h-3 w-3" />{fmtFechaHora(r.created_at)}</span>
                      <span className="flex items-center gap-1 min-w-0"><UserIcon className="h-3 w-3 shrink-0" /><span className="truncate">{r.evaluador_name}</span></span>
                    </p>
                  </div>
                  <PctText pct={r.percent} />
                </div>
                <div className="flex items-center justify-between mt-2">
                  <EstadoChip pct={r.percent} estado={r.estado} />
                  <Actions r={r} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <DetailDialog id={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} />
      {isAdmin && <EditDialog id={editId} onClose={() => setEditId(null)} onSaved={onEdited} />}
      {isAdmin && <AuditoriaDialog open={auditOpen} onClose={() => setAuditOpen(false)} />}
    </div>
  );
}
