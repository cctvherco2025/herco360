import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Eye, Calendar, User as UserIcon, ClipboardList, Download, Loader2, Info } from 'lucide-react';
import api from '@/lib/api';
import { generateCustomFormPdf } from '@/lib/customFormPdf';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

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

export default function CustomFormHistorial({ schema, canSeeAll }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [exportingId, setExportingId] = useState(null);

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

  return (
    <div>
      {!canSeeAll && (
        <div className="flex items-center gap-2 rounded-xl bg-muted/50 text-muted-foreground text-xs px-3 py-2 mb-4">
          <Info className="h-3.5 w-3.5 shrink-0" /> Solo ves las respuestas que tú mismo enviaste.
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
            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
          </motion.div>
        ))}
      </div>

      <DetailDialog formId={schema.id} formTitulo={schema.titulo} hasScoring={schema.has_scoring} id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
