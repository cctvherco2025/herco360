import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, Calendar, User as UserIcon, ClipboardList, Download, Loader2, Info, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { generateCustomFormPdf } from '@/lib/customFormPdf';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function AuthedImg({ url, className, onClick }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let active = true; let objUrl;
    api.get(url, { responseType: 'blob' }).then((res) => {
      if (!active) return;
      objUrl = URL.createObjectURL(res.data);
      setSrc(objUrl);
    }).catch(() => {});
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [url]);
  if (!src) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={src} alt="Evidencia" className={className} onClick={onClick} />;
}

async function fetchRespPhotosAsDataUrls(formId, respId, respDoc) {
  const map = {};
  const ids = (respDoc.entries || []).flatMap((e) => (e.photos || []).map((p) => p.id));
  await Promise.all(ids.map(async (photoId) => {
    try {
      const res = await api.get(`/formularios-custom/${formId}/respuestas/${respId}/foto/${photoId}`, { responseType: 'blob' });
      map[photoId] = await blobToDataUrl(res.data);
    } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
  }));
  return map;
}

async function exportResponsePdf(formId, formTitulo, hasScoring, respId, cached) {
  const respDoc = cached || (await api.get(`/formularios-custom/${formId}/respuestas/${respId}`)).data;
  const photoMap = await fetchRespPhotosAsDataUrls(formId, respId, respDoc);
  const rows = (respDoc.entries || []).map((e) => ({
    ...e, scored: e.max > 0, photos: (e.photos || []).map((p) => ({ dataUrl: photoMap[p.id] })).filter((p) => p.dataUrl),
  }));
  await generateCustomFormPdf({
    formTitulo, meta: { respondent: respDoc.respondent_name, fecha: (respDoc.created_at || '').slice(0, 10) },
    rows, hasScoring, totalScore: respDoc.total_score, totalMax: respDoc.total_max,
  });
}

function DetailDialog({ formId, formTitulo, hasScoring, id, onClose }) {
  const [resp, setResp] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) { setResp(null); return; }
    api.get(`/formularios-custom/${formId}/respuestas/${id}`).then(({ data }) => setResp(data)).catch(() => toast.error('No se pudo cargar la respuesta'));
  }, [formId, id]);

  const download = async () => {
    if (!resp) return;
    setExporting(true);
    try { await exportResponsePdf(formId, formTitulo, hasScoring, resp.id, resp); }
    catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExporting(false); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] rounded-[22px] max-h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between gap-3 pr-10">
          <DialogTitle className="font-heading">Respuesta</DialogTitle>
          {resp && (
            <button onClick={download} disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 shrink-0">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
        </DialogHeader>
        {!resp ? (
          <div className="px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-3">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7"><AvatarImage src={resp.respondent_avatar} /><AvatarFallback>{resp.respondent_name?.[0]}</AvatarFallback></Avatar>
              <span className="text-sm">{resp.respondent_name}</span>
              <span className="text-xs text-muted-foreground ml-auto">{(resp.created_at || '').slice(0, 10)}</span>
            </div>
            {hasScoring && resp.total_max > 0 && (
              <p className="text-sm font-semibold">{resp.total_score}/{resp.total_max} pts ({resp.percent}%)</p>
            )}
            <div className="space-y-2">
              {resp.entries.map((e) => (
                <div key={e.id} className="rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{e.titulo}</p>
                    {e.max > 0 && <span className="text-xs font-bold shrink-0">{e.score}/{e.max}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{e.seccion}</p>
                  {Array.isArray(e.respuesta) ? (
                    e.respuesta.length > 0 && <p className="text-sm mt-1">{e.respuesta.join(', ')}</p>
                  ) : (e.respuesta && <p className="text-sm mt-1">{e.respuesta}</p>)}
                  {e.note && <p className="text-xs text-muted-foreground italic mt-1">"{e.note}"</p>}
                  {e.photos?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {e.photos.map((p) => (
                        <AuthedImg key={p.id} url={`/formularios-custom/${formId}/respuestas/${resp.id}/foto/${p.id}`}
                          className="h-16 w-16 rounded-lg object-cover border cursor-pointer"
                          onClick={() => setZoom(`/formularios-custom/${formId}/respuestas/${resp.id}/foto/${p.id}`)} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="sm:max-w-[640px] rounded-[22px] p-2">
          {zoom && <AuthedImg url={zoom} className="w-full rounded-xl" />}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

export default function CustomFormHistorial({ schema, canSeeAll, canManage }) {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [clearing, setClearing] = useState(false);
  // { mode: 'one', id, name, fecha } | { mode: 'all' } | null
  const [confirmDel, setConfirmDel] = useState(null);
  const busy = clearing || deletingId != null;

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get(`/formularios-custom/${schema.id}/respuestas`); setRows(data); }
    catch (e) { toast.error('No se pudieron cargar las respuestas'); }
    finally { setLoading(false); }
  }, [schema.id]);

  useEffect(() => { load(); }, [load]);

  const quickDownload = async (e, id) => {
    e.stopPropagation();
    setExportingId(id);
    try { await exportResponsePdf(schema.id, schema.titulo, schema.has_scoring, id, null); }
    catch (err) { toast.error('No se pudo generar el PDF'); }
    finally { setExportingId(null); }
  };

  const removeOne = async (id) => {
    setDeletingId(id);
    try {
      await api.delete(`/formularios-custom/${schema.id}/respuestas/${id}`);
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success('Respuesta eliminada');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo eliminar la respuesta');
    } finally { setDeletingId(null); setConfirmDel(null); }
  };

  const clearAll = async () => {
    setClearing(true);
    try {
      const { data } = await api.delete(`/formularios-custom/${schema.id}/respuestas`);
      setRows([]);
      toast.success(`Historial vaciado (${data.deleted} respuestas)`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo vaciar el historial');
    } finally { setClearing(false); setConfirmDel(null); }
  };

  const runConfirm = () => {
    if (!confirmDel) return;
    if (confirmDel.mode === 'all') clearAll();
    else removeOne(confirmDel.id);
  };

  return (
    <div>
      {!canSeeAll && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 text-muted-foreground text-xs px-3 py-2 mb-4">
          <Info className="h-3.5 w-3.5 shrink-0" /> Solo ves las respuestas que tú mismo enviaste.
        </div>
      )}

      {canManage && rows.length > 0 && (
        <div className="flex justify-end mb-3">
          <button onClick={() => setConfirmDel({ mode: 'all' })} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#dc2626]/30 px-3 py-1.5 text-xs font-medium text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] disabled:opacity-50 transition-colors"
            data-testid="customform-historial-clear">
            <Trash2 className="h-3.5 w-3.5" /> Vaciar historial
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Sin respuestas todavía</p>
        </div>
      )}

      <div className="space-y-2">
        {rows.map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            role="button" tabIndex={0} onClick={() => setOpenId(r.id)}
            className="w-full flex items-center gap-3 rounded-[16px] bg-card border shadow-card p-4 text-left hover:shadow-cardmd transition-shadow cursor-pointer">
            <Avatar className="h-8 w-8"><AvatarImage src={r.respondent_avatar} /><AvatarFallback>{r.respondent_name?.[0]}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5 text-muted-foreground" />{r.respondent_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" />{(r.created_at || '').slice(0, 10)}</p>
            </div>
            {schema.has_scoring && r.total_max > 0 && (
              <span className="text-sm font-semibold shrink-0">{r.percent}%</span>
            )}
            <button onClick={(e) => quickDownload(e, r.id)} disabled={exportingId === r.id} title="Descargar PDF"
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-50">
              {exportingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
            {(canManage || r.respondent_id === user?.id) && (
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDel({ mode: 'one', id: r.id, name: r.respondent_name, fecha: (r.created_at || '').slice(0, 10) }); }}
                disabled={deletingId === r.id} title="Eliminar respuesta"
                className="p-2 rounded-lg hover:bg-[rgba(220,38,38,0.08)] text-muted-foreground hover:text-[#dc2626] shrink-0 disabled:opacity-50 transition-colors"
                data-testid="customform-historial-delete-row">
                {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
          </motion.div>
        ))}
      </div>

      <DetailDialog formId={schema.id} formTitulo={schema.titulo} hasScoring={schema.has_scoring} id={openId} onClose={() => setOpenId(null)} />

      <AlertDialog open={!!confirmDel} onOpenChange={(o) => { if (!o) setConfirmDel(null); }}>
        <AlertDialogContent className="rounded-[22px]">
          <AlertDialogHeader>
            <div className="h-11 w-11 rounded-full grid place-items-center bg-[rgba(220,38,38,0.1)] mb-1">
              <Trash2 className="h-5 w-5 text-[#dc2626]" />
            </div>
            <AlertDialogTitle>
              {confirmDel?.mode === 'all' ? 'Vaciar historial' : 'Eliminar respuesta'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDel?.mode === 'all' ? (
                <>Se eliminan las <span className="font-medium text-foreground">{rows.length} {rows.length === 1 ? 'respuesta' : 'respuestas'}</span> de <span className="font-medium text-foreground">{schema.titulo}</span>. El formulario queda activo para recibir nuevas. Esta acción no se puede deshacer.</>
              ) : (
                <>Se eliminará la respuesta de <span className="font-medium text-foreground">{confirmDel?.name}</span>{confirmDel?.fecha ? <> del <span className="font-medium text-foreground">{confirmDel.fecha}</span></> : null}, junto con sus fotos. Esta acción no se puede deshacer.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={runConfirm}
              className="rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white"
              data-testid="customform-historial-confirm-delete">
              {confirmDel?.mode === 'all' ? 'Vaciar historial' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
