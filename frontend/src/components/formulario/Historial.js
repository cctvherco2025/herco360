import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Search, Eye, Store, Calendar, User as UserIcon, ClipboardList, Download, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { ymd, fullDateEs, capitalize } from '@/lib/time';
import { FLOS_SUCURSALES, FLOS_FLAT, flosTone, FLOS_TONE_COLOR, computeFlosSummary } from '@/lib/flosSchema';
import { generateFlosPdf } from '@/lib/flosPdf';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const shiftDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

// Descarga (autenticado) cada foto de la auditoría y la convierte a data-URL,
// que es lo que jsPDF necesita para incrustarla en el reporte.
async function fetchAuditPhotosAsDataUrls(auditId, audit) {
  const map = {};
  const ids = [
    ...(audit.entries || []).flatMap((e) => (e.photos || []).map((p) => p.id)),
    ...((audit.general_photos || []).map((p) => p.id)),
  ];
  await Promise.all(ids.map(async (photoId) => {
    try {
      const res = await api.get(`/formulario/auditorias/${auditId}/foto/${photoId}`, { responseType: 'blob' });
      map[photoId] = await blobToDataUrl(res.data);
    } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
  }));
  return map;
}

// Reconstruye las filas del recorrido (con el esquema completo, aunque el
// servidor solo guardó los criterios calificados) para reutilizar el mismo
// generador de PDF que usa el asistente en vivo.
function buildRowsFromAudit(audit, photoMap) {
  const scores = {}, comments = {}, touched = new Set();
  const byId = {};
  (audit.entries || []).forEach((e) => {
    scores[e.id] = e.score;
    comments[e.id] = e.comment || '';
    touched.add(e.id);
    byId[e.id] = e;
  });
  const rows = FLOS_FLAT.map((v) => {
    const e = byId[v.id];
    return {
      ...v,
      score: e ? e.score : 0,
      touched: !!e,
      comment: e ? (e.comment || '') : '',
      photos: e ? (e.photos || []).map((p) => ({ dataUrl: photoMap[p.id] })).filter((p) => p.dataUrl) : [],
    };
  });
  const generalPhotos = (audit.general_photos || []).map((p) => ({ dataUrl: photoMap[p.id] })).filter((p) => p.dataUrl);
  const summary = computeFlosSummary({ scores, comments, touched });
  return { rows, generalPhotos, summary };
}

async function exportAuditPdf(auditId, cachedAudit) {
  const audit = cachedAudit || (await api.get(`/formulario/auditorias/${auditId}`)).data;
  const photoMap = await fetchAuditPhotosAsDataUrls(audit.id, audit);
  const { rows, generalPhotos, summary } = buildRowsFromAudit(audit, photoMap);
  await generateFlosPdf({
    meta: { sucursal: audit.sucursal, linea: audit.linea, auditor: audit.auditor_name, fecha: audit.fecha },
    rows, generalComment: audit.general_comment || '', generalPhotos, summary,
  });
}

// Carga una foto protegida (requiere Bearer token) y la muestra como <img>.
function AuthedImg({ url, className, onClick }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let active = true;
    let objUrl;
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

function PercentChip({ pct }) {
  const t = flosTone(pct);
  return <span className="text-sm font-bold rounded-full px-2.5 py-1" style={{ color: FLOS_TONE_COLOR[t], background: `${FLOS_TONE_COLOR[t]}1f` }}>{pct}%</span>;
}

function DetailDialog({ id, onClose }) {
  const [audit, setAudit] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) { setAudit(null); return; }
    api.get(`/formulario/auditorias/${id}`).then(({ data }) => setAudit(data)).catch(() => toast.error('No se pudo cargar la auditoría'));
  }, [id]);

  const download = async () => {
    if (!audit) return;
    setExporting(true);
    try { await exportAuditPdf(audit.id, audit); }
    catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExporting(false); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] rounded-[22px] max-h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between gap-3 pr-10">
          <DialogTitle className="font-heading">Auditoría FLOS · {audit?.sucursal || '…'}</DialogTitle>
          {audit && (
            <button onClick={download} disabled={exporting} data-testid="flos-history-download"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 shrink-0">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
        </DialogHeader>
        {!audit ? (
          <div className="px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <PercentChip pct={audit.percent} />
              <span className="text-sm text-muted-foreground">{audit.total_score}/{audit.total_max} pts</span>
              <span className="text-sm text-muted-foreground">· {audit.linea}</span>
              <span className="text-sm text-muted-foreground">· {audit.fecha}</span>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7"><AvatarImage src={audit.auditor_avatar} /><AvatarFallback>{audit.auditor_name?.[0]}</AvatarFallback></Avatar>
              <span className="text-sm">{audit.auditor_name}</span>
            </div>

            <div className="space-y-2">
              {audit.entries.map((e) => {
                const t = e.max ? flosTone((e.score / e.max) * 100) : 'g';
                return (
                  <div key={e.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{e.name}</p>
                        <p className="text-xs text-muted-foreground">{e.dim}</p>
                      </div>
                      <span className="text-sm font-bold shrink-0" style={{ color: FLOS_TONE_COLOR[t] }}>{e.score}/{e.max}</span>
                    </div>
                    {e.comment && <p className="text-xs text-muted-foreground italic mt-1.5">"{e.comment}"</p>}
                    {e.photos?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {e.photos.map((p) => (
                          <AuthedImg key={p.id} url={`/formulario/auditorias/${audit.id}/foto/${p.id}`}
                            className="h-16 w-16 rounded-lg object-cover border cursor-pointer"
                            onClick={() => setZoom(`/formulario/auditorias/${audit.id}/foto/${p.id}`)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {(audit.general_comment || audit.general_photos?.length > 0) && (
              <div className="rounded-xl border p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Comentario general</p>
                {audit.general_comment && <p className="text-sm">{audit.general_comment}</p>}
                {audit.general_photos?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {audit.general_photos.map((p) => (
                      <AuthedImg key={p.id} url={`/formulario/auditorias/${audit.id}/foto/${p.id}`}
                        className="h-16 w-16 rounded-lg object-cover border cursor-pointer"
                        onClick={() => setZoom(`/formulario/auditorias/${audit.id}/foto/${p.id}`)} />
                    ))}
                  </div>
                )}
              </div>
            )}
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

export default function Historial({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sucursal, setSucursal] = useState('');
  const [start, setStart] = useState(ymd(shiftDays(new Date(), -30)));
  const [end, setEnd] = useState(ymd(new Date()));
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [exportingId, setExportingId] = useState(null);

  const quickDownload = async (e, id) => {
    e.stopPropagation();
    setExportingId(id);
    try { await exportAuditPdf(id, null); }
    catch (err) { toast.error('No se pudo generar el PDF'); }
    finally { setExportingId(null); }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ start, end });
      if (sucursal) params.set('sucursal', sucursal);
      const { data } = await api.get(`/formulario/auditorias?${params.toString()}`);
      setRows(data);
    } catch (e) { toast.error('No se pudieron cargar las auditorías'); }
    finally { setLoading(false); }
  }, [start, end, sucursal]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.sucursal, r.linea, r.auditor_name].filter(Boolean).some((v) => v.toLowerCase().includes(s));
  });

  return (
    <div>
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className="h-10 w-[150px]" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className="h-10 w-[150px]" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Sucursal</label>
          <Select value={sucursal || 'todas'} onValueChange={(v) => setSucursal(v === 'todas' ? '' : v)}>
            <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {FLOS_SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por línea o auditor…" className="pl-9 h-10" />
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>}
      {!loading && filtered.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Sin auditorías en este rango</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            role="button" tabIndex={0} onClick={() => setOpenId(r.id)} data-testid="flos-history-row"
            className="w-full flex items-center gap-3 rounded-[16px] bg-card border shadow-card p-4 text-left hover:shadow-cardmd transition-shadow cursor-pointer">
            <PercentChip pct={r.percent} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5"><Store className="h-3.5 w-3.5 text-muted-foreground" />{r.sucursal} <span className="text-muted-foreground">· {r.linea}</span></p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{capitalize(fullDateEs(r.fecha))}</span>
                <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{r.auditor_name}</span>
              </p>
            </div>
            <span className="text-sm text-muted-foreground shrink-0 hidden sm:inline">{r.total_score}/{r.total_max} pts</span>
            <button onClick={(e) => quickDownload(e, r.id)} disabled={exportingId === r.id} title="Descargar PDF"
              data-testid="flos-history-quick-download"
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground shrink-0 disabled:opacity-50">
              {exportingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </button>
            <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
          </motion.div>
        ))}
      </div>

      <DetailDialog id={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
