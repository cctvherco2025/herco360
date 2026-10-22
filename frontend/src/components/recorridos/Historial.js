import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Eye, Pencil, Trash2, Loader2, Download, History, Store, User as UserIcon, Calendar, Camera, Upload, X,
  CheckCircle2, MessageSquarePlus, Search,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ymd, parseApiDate, fmtHora } from '@/lib/time';
import {
  RECORRIDO_SUCURSALES, RECORRIDO_CATEGORIAS, tipoLabel, fmtFechaRecorrido,
} from '@/lib/recorridosSchema';
import { generateRecorridoPdf } from '@/lib/recorridosPdf';
import { compressImage } from '@/lib/flosPhoto';
import { canAdminRecorridos } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar } from '@/components/ConfirmDialog';
import { ChipPicker, NativeSelect, RecorridoPdfButton, TipoInput, useTiposRecorrido } from '@/components/recorridos/RecorridoWizard';

const MAX_SEG_PHOTOS = 6;

function fmtAt(iso) {
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} · ${fmtHora(hh)}`;
}

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

function Thumbs({ recId, list, onZoom }) {
  if (!list?.length) return null;
  const url = (pid) => `/recorridos/registros/${recId}/foto/${pid}`;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {list.map((p) => (
        <AuthedImg key={p.id} url={url(p.id)} className="h-16 w-16 rounded-lg object-cover border cursor-pointer" onClick={() => onZoom(url(p.id))} />
      ))}
    </div>
  );
}

/* ───────────────── Seguimiento (administrador) ─────────── */
function SeguimientoForm({ recId, hallazgoId, onDone, onCancel }) {
  const [accion, setAccion] = useState('');
  const [pics, setPics] = useState([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const cam = useRef(null); const lib = useRef(null);

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []).slice(0, MAX_SEG_PHOTOS - pics.length);
    if (!files.length) return;
    setBusy(true);
    try {
      for (const f of files) {
        const { blob, dataUrl } = await compressImage(f);
        setPics((p) => [...p, { localId: `${Date.now()}-${Math.random()}`, blob, dataUrl, name: f.name }]);
      }
    } catch (e) { toast.error('No se pudo procesar una de las fotos'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!accion.trim()) { toast.error('Escribe la acción correctiva'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({ accion: accion.trim() }));
      pics.forEach((p) => fd.append('photos', p.blob, p.name || 'solucion.jpg'));
      const { data } = await api.post(`/recorridos/registros/${recId}/hallazgos/${hallazgoId}/seguimiento`, fd,
        { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Seguimiento registrado');
      onDone(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo registrar el seguimiento');
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-3 rounded-xl border border-[#16a34a]/30 bg-[rgba(22,163,74,0.05)] p-3 space-y-2" data-testid="recorridos-seguimiento-form">
      <Label className="text-xs">Acción correctiva</Label>
      <Textarea rows={2} value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="Qué se hizo para solucionarlo…" />
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <input ref={lib} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_SEG_PHOTOS} onClick={() => cam.current?.click()}>
          <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Foto de la solución'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_SEG_PHOTOS} onClick={() => lib.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" /> Galería
        </Button>
      </div>
      {pics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pics.map((p) => (
            <div key={p.localId} className="relative h-16 w-16 rounded-lg overflow-hidden border">
              <img src={p.dataUrl} alt="" className="h-full w-full object-cover" />
              <button onClick={() => setPics((ps) => ps.filter((x) => x.localId !== p.localId))} aria-label="Quitar foto"
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/65 text-white grid place-items-center"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="rounded-xl" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button size="sm" className="rounded-xl bg-[#16a34a] hover:bg-[#13863d] text-white" onClick={save} disabled={saving} data-testid="recorridos-seguimiento-save">
          {saving ? 'Guardando…' : 'Guardar seguimiento'}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Detalle ─────────────────────── */
function DetailDialog({ id, isAdmin, onClose, onChanged }) {
  const [rec, setRec] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [segFor, setSegFor] = useState(null); // hallazgo con el formulario de seguimiento abierto

  useEffect(() => {
    setSegFor(null);
    if (!id) { setRec(null); return; }
    api.get(`/recorridos/registros/${id}`).then(({ data }) => setRec(data)).catch(() => toast.error('No se pudo cargar el recorrido'));
  }, [id]);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[720px] rounded-[22px] max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pr-10 text-left">
          <DialogTitle className="font-heading leading-snug">Recorrido · {rec?.sucursal || '…'}</DialogTitle>
          {rec && <RecorridoPdfButton rec={rec} className="h-8 text-xs shrink-0" testid="recorridos-detail-pdf" />}
        </DialogHeader>
        {!rec ? (
          <div className="px-4 sm:px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-6 space-y-4">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" />{fmtFechaRecorrido(rec)}</span>
              <span className="flex items-center gap-1.5"><UserIcon className="h-4 w-4" />{rec.coordinador_name}</span>
              <span className="flex items-center gap-1.5"><Store className="h-4 w-4" />{rec.sucursal}</span>
            </div>

            {rec.sin_novedades && (
              <div className="flex items-center gap-2 rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] text-sm font-medium px-3 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> Recorrido sin novedades.
              </div>
            )}

            {(rec.hallazgos || []).map((h, i) => (
              <div key={h.id} className="rounded-xl border p-3 sm:p-4" data-testid="recorridos-detail-hallazgo">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold break-words min-w-0">{i + 1}. {tipoLabel(h.tipo)}</p>
                  <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 bg-[#1e395e] text-white shrink-0">{h.categoria}</span>
                </div>
                {(h.producto || h.cantidad != null) && (
                  <p className="text-xs text-muted-foreground mt-1">Producto: {h.producto || '—'}{h.cantidad != null ? ` · Cantidad: ${h.cantidad}` : ''}</p>
                )}
                <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{h.descripcion}</p>
                {h.responsable && <p className="text-xs text-muted-foreground mt-1.5">Responsable notificado: <b className="text-foreground">{h.responsable}</b></p>}
                {h.accion && <p className="text-xs text-muted-foreground mt-1">Acción: <span className="text-foreground">{h.accion}</span></p>}
                <Thumbs recId={rec.id} list={h.photos} onZoom={setZoom} />

                {(h.seguimiento || []).map((s) => (
                  <div key={s.id} className="mt-3 border-l-2 border-[#16a34a] pl-3">
                    <p className="text-xs text-muted-foreground"><b className="text-[#16a34a]">Seguimiento</b> · {s.user_name} · {fmtAt(s.at)}</p>
                    <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{s.accion}</p>
                    <Thumbs recId={rec.id} list={s.photos} onZoom={setZoom} />
                  </div>
                ))}

                {isAdmin && (segFor === h.id ? (
                  <SeguimientoForm recId={rec.id} hallazgoId={h.id} onCancel={() => setSegFor(null)}
                    onDone={(data) => { setRec(data); setSegFor(null); onChanged?.(data); }} />
                ) : (
                  <Button variant="ghost" size="sm" className="mt-2 -ml-2 text-[#16a34a] hover:text-[#16a34a]" onClick={() => setSegFor(h.id)} data-testid="recorridos-add-seguimiento">
                    <MessageSquarePlus className="h-4 w-4 mr-1.5" /> Agregar seguimiento
                  </Button>
                ))}
              </div>
            ))}

            {isAdmin && (rec.cambios || []).length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Historial de cambios</p>
                <div className="space-y-1.5">
                  {[...rec.cambios].reverse().map((c, i) => (
                    <p key={i} className="text-xs">
                      <b>{c.user_name}</b> <span className="text-muted-foreground">· {fmtAt(c.at)}</span>
                      <span className="block text-muted-foreground">Cambió: {(c.campos || []).join('; ')}</span>
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
function EditDialog({ id, onClose, onSaved, tipos }) {
  const [rec, setRec] = useState(null);
  const [sucursal, setSucursal] = useState('');
  const [hs, setHs] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setRec(null); return; }
    api.get(`/recorridos/registros/${id}`).then(({ data }) => {
      setRec(data);
      setSucursal(data.sucursal);
      setHs((data.hallazgos || []).map((h) => ({ ...h, tipo: tipoLabel(h.tipo), cantidad: h.cantidad == null ? '' : String(h.cantidad) })));
    }).catch(() => toast.error('No se pudo cargar el recorrido'));
  }, [id]);

  const set = (hid, k, v) => setHs((list) => list.map((h) => (h.id === hid ? { ...h, [k]: v } : h)));

  const save = async () => {
    const bad = hs.findIndex((h) => !h.descripcion.trim() || !h.tipo.trim());
    if (bad >= 0) { toast.error(`Hallazgo ${bad + 1}: falta el tipo o la descripción`); return; }
    setSaving(true);
    try {
      const { data } = await api.put(`/recorridos/registros/${id}`, {
        sucursal,
        hallazgos: hs.map((h) => ({
          id: h.id, categoria: h.categoria, tipo: h.tipo, producto: h.producto || '',
          cantidad: h.cantidad === '' ? null : Number(h.cantidad), descripcion: h.descripcion,
          responsable: h.responsable || '', accion: h.accion || '',
        })),
      });
      toast.success('Recorrido actualizado');
      onSaved(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar el cambio');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[720px] rounded-[22px] max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 pr-10 text-left">
          <DialogTitle className="font-heading leading-snug">Editar recorrido</DialogTitle>
        </DialogHeader>
        {!rec ? (
          <div className="px-4 sm:px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Registrado por <b className="text-foreground">{rec.coordinador_name}</b> · {fmtFechaRecorrido(rec)}. El coordinador, la fecha, las fotos y el seguimiento no se modifican.
              </p>
              <div className="space-y-1.5"><Label>Sucursal</Label><ChipPicker options={RECORRIDO_SUCURSALES} value={sucursal} onChange={setSucursal} /></div>
              {hs.length === 0 && <p className="text-sm text-muted-foreground">Este recorrido no tiene hallazgos (sin novedades).</p>}
              {hs.map((h, i) => (
                <div key={h.id} className="rounded-xl border p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Hallazgo {i + 1} <span className="text-xs text-muted-foreground font-normal">· {(h.photos || []).length} foto(s)</span></p>
                    <button onClick={() => setHs((list) => list.filter((x) => x.id !== h.id))} title="Quitar hallazgo" aria-label="Quitar hallazgo"
                      className="p-1.5 rounded-lg hover:bg-[rgba(220,38,38,0.08)] text-muted-foreground hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <ChipPicker options={RECORRIDO_CATEGORIAS} value={h.categoria} onChange={(v) => set(h.id, 'categoria', v)} cols="grid-cols-2 sm:grid-cols-3" />
                  <TipoInput value={h.tipo} onChange={(v) => set(h.id, 'tipo', v)} tipos={tipos} className="h-10" />
                  <div className="grid grid-cols-[1fr_96px] gap-3">
                    <Input value={h.producto || ''} onChange={(e) => set(h.id, 'producto', e.target.value)} placeholder="Producto" className="h-10" />
                    <Input type="number" inputMode="numeric" min="0" value={h.cantidad} onChange={(e) => set(h.id, 'cantidad', e.target.value.replace(/[^\d]/g, ''))} placeholder="Cant." className="h-10" />
                  </div>
                  <Textarea rows={2} value={h.descripcion} onChange={(e) => set(h.id, 'descripcion', e.target.value)} placeholder="Descripción" />
                  <Input value={h.responsable || ''} onChange={(e) => set(h.id, 'responsable', e.target.value)} placeholder="Responsable notificado" className="h-10" />
                  <Textarea rows={2} value={h.accion || ''} onChange={(e) => set(h.id, 'accion', e.target.value)} placeholder="Acción realizada o recomendada" />
                </div>
              ))}
            </div>
            <div className="border-t px-4 sm:px-6 py-3 flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={save} disabled={saving} data-testid="recorridos-edit-save">
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
const ACCION_TXT = { editado: 'editó', eliminado: 'eliminó', seguimiento: 'agregó seguimiento a' };

function AuditoriaDialog({ open, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    api.get('/recorridos/auditoria').then(({ data }) => setRows(data)).catch(() => { setRows([]); toast.error('No se pudo cargar el registro'); });
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[560px] rounded-[22px] max-h-[80dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 pr-10 text-left">
          <DialogTitle className="font-heading">Registro de auditoría</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6 space-y-2">
          {!rows && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay ediciones, seguimientos ni eliminaciones.</p>}
          {rows && rows.map((r) => (
            <div key={r.id} className="rounded-xl border p-3 text-sm">
              <p>
                <b>{r.user_name}</b>{' '}
                <span className={r.accion === 'eliminado' ? 'text-[#dc2626] font-medium' : ''}>{ACCION_TXT[r.accion] || r.accion}</span>{' '}
                el recorrido de <b>{r.sucursal}</b> del {(r.fecha_local || '').split('-').reverse().join('/')} ({r.coordinador_name})
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{fmtAt(r.at)}{r.campos?.length ? ` · ${r.campos.join('; ')}` : ''}</p>
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
  const isAdmin = canAdminRecorridos(user);
  const tipos = useTiposRecorrido();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState([]);
  const [f, setF] = useState({ sucursal: '', categoria: '', tipo: '', coordinador: '', desde: '', hasta: '' });
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const setFiltro = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
      const { data } = await api.get(`/recorridos/registros?${params.toString()}`);
      setRows(data);
    } catch (e) { toast.error('No se pudieron cargar los recorridos'); }
    finally { setLoading(false); }
  }, [f]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { api.get('/recorridos/coordinadores').then(({ data }) => setCoords(data)).catch(() => {}); }, [refreshKey]);

  const removeOne = async (r) => {
    setDeletingId(r.id);
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar recorrido?',
      mensaje: <>Se eliminará el recorrido de <b>{r.sucursal}</b> del {fmtFechaRecorrido(r)}, registrado por <b>{r.coordinador_name}</b>, con sus {r.total_hallazgos} hallazgo(s). Quedará constancia en el registro de auditoría.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Recorrido eliminado',
      accion: () => api.delete(`/recorridos/registros/${r.id}`),
    });
    setDeletingId(null);
    if (!ok) return;
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    if (openId === r.id) setOpenId(null);
  };

  const quickPdf = async (r) => {
    setExportingId(r.id);
    try {
      const { data } = await api.get(`/recorridos/registros/${r.id}`);
      await generateRecorridoPdf(data);
    } catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExportingId(null); }
  };

  const onChanged = (data) => setRows((rs) => rs.map((x) => (x.id === data.id ? { ...x, ...data } : x)));

  const actions = (r) => (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={() => setOpenId(r.id)} title="Ver detalle" aria-label="Ver detalle" data-testid="recorridos-history-view"
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Eye className="h-4 w-4" /></button>
      <button onClick={() => quickPdf(r)} disabled={exportingId === r.id} title="Descargar PDF" aria-label="Descargar PDF"
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50">
        {exportingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      {isAdmin && (
        <>
          <button onClick={() => setEditId(r.id)} title="Editar" aria-label="Editar" data-testid="recorridos-history-edit"
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => removeOne(r)} disabled={deletingId === r.id} title="Eliminar" aria-label="Eliminar" data-testid="recorridos-history-delete"
            className="p-2 rounded-lg hover:bg-[rgba(220,38,38,0.08)] text-muted-foreground hover:text-[#dc2626] disabled:opacity-50 transition-colors">
            {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  );

  const resultado = (r) => (r.sin_novedades
    ? <span className="text-xs font-semibold text-[#16a34a]">Sin novedades</span>
    : <span className="text-sm font-bold">{r.total_hallazgos}</span>);

  const hayFiltros = Object.values(f).some(Boolean);

  return (
    <div>
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-4 grid grid-cols-2 lg:grid-cols-6 gap-3 items-end">
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Sucursal</label>
          <NativeSelect value={f.sucursal} onChange={setFiltro('sucursal')} className="h-10">
            <option value="">Todas</option>
            {RECORRIDO_SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Departamento</label>
          <NativeSelect value={f.categoria} onChange={setFiltro('categoria')} className="h-10">
            <option value="">Todos</option>
            {RECORRIDO_CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0 col-span-2 lg:col-span-1">
          <label className="text-xs text-muted-foreground">Tipo de irregularidad</label>
          <NativeSelect value={f.tipo} onChange={setFiltro('tipo')} className="h-10">
            <option value="">Todos</option>
            {tipos.map((t) => <option key={t} value={t}>{tipoLabel(t)}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0 col-span-2 lg:col-span-1">
          <label className="text-xs text-muted-foreground">Coordinador</label>
          <NativeSelect value={f.coordinador} onChange={setFiltro('coordinador')} className="h-10">
            <option value="">Todos</option>
            {coords.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={f.desde} max={f.hasta || ymd(new Date())} onChange={(e) => setFiltro('desde')(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={f.hasta} min={f.desde || undefined} max={ymd(new Date())} onChange={(e) => setFiltro('hasta')(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
      </div>

      <div className="flex items-center justify-between -mt-1 mb-3 gap-2">
        <p className="text-xs text-muted-foreground">{loading ? '' : `${rows.length} recorrido${rows.length === 1 ? '' : 's'}`}</p>
        <div className="flex gap-1">
          {hayFiltros && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setF({ sucursal: '', categoria: '', tipo: '', coordinador: '', desde: '', hasta: '' })}>Limpiar filtros</Button>}
          {isAdmin && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAuditOpen(true)} data-testid="recorridos-auditoria-button">
              <History className="h-3.5 w-3.5 mr-1.5" /> Registro de auditoría
            </Button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Sin recorridos con estos filtros</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="hidden md:block rounded-[18px] bg-card border shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Fecha y hora</th>
                  <th className="text-left font-medium px-3 py-3">Sucursal</th>
                  <th className="text-left font-medium px-3 py-3">Coordinador</th>
                  <th className="text-left font-medium px-3 py-3">Departamentos inspeccionados</th>
                  <th className="text-right font-medium px-3 py-3">Hallazgos</th>
                  <th className="text-right font-medium px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors" data-testid="recorridos-history-row">
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtFechaRecorrido(r)}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.sucursal}</td>
                    <td className="px-3 py-2.5 max-w-[180px] truncate">{r.coordinador_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{(r.categorias || []).join(', ') || '—'}</td>
                    <td className="px-3 py-2.5 text-right">{resultado(r)}</td>
                    <td className="px-4 py-1">{actions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-[16px] bg-card border shadow-card p-3" data-testid="recorridos-history-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium"><b>{r.sucursal}</b> · {fmtFechaRecorrido(r)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.coordinador_name}</p>
                    {(r.categorias || []).length > 0 && <p className="text-xs text-muted-foreground mt-0.5">{r.categorias.join(', ')}</p>}
                  </div>
                  <div className="text-right shrink-0">{resultado(r)}{!r.sin_novedades && <p className="text-[11px] text-muted-foreground">hallazgos</p>}</div>
                </div>
                <div className="flex justify-end mt-1">{actions(r)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <DetailDialog id={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} onChanged={onChanged} />
      {isAdmin && <EditDialog id={editId} tipos={tipos} onClose={() => setEditId(null)} onSaved={(d) => { onChanged(d); setEditId(null); }} />}
      {isAdmin && <AuditoriaDialog open={auditOpen} onClose={() => setAuditOpen(false)} />}
    </div>
  );
}
