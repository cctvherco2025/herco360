import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Search, Eye, Store, Calendar, User as UserIcon, ClipboardList, Download, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { RUTINA_SUCURSALES, RUTINA_FLAT, rutinaTone, RUTINA_TONE_COLOR, computeRutinaSummary } from '@/lib/rutinaSchema';
import { generateRutinaPdf } from '@/lib/rutinaPdf';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const monthLabel = (ym) => {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return m >= 1 && m <= 12 ? `${MESES[m - 1]} ${y}` : ym;
};

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

async function fetchEvalPhotosAsDataUrls(evalId, evalDoc) {
  const map = {};
  const ids = (evalDoc.entries || []).flatMap((e) => (e.photos || []).map((p) => p.id));
  await Promise.all(ids.map(async (photoId) => {
    try {
      const res = await api.get(`/rutina/evaluaciones/${evalId}/foto/${photoId}`, { responseType: 'blob' });
      map[photoId] = await blobToDataUrl(res.data);
    } catch (e) { /* si una foto falla, el PDF sigue sin ella */ }
  }));
  return map;
}

function buildRowsFromEval(evalDoc, photoMap) {
  const answers = {}, notes = {}, touched = new Set();
  const byId = {};
  (evalDoc.entries || []).forEach((e) => {
    touched.add(e.id);
    notes[e.id] = e.note || '';
    byId[e.id] = e;
  });
  const rows = RUTINA_FLAT.map((it) => {
    const e = byId[it.id];
    return {
      ...it, touched: !!e, score: e ? e.score : 0, opcion: e ? e.opcion : '', note: e ? (e.note || '') : '',
      photos: e ? (e.photos || []).map((p) => ({ dataUrl: photoMap[p.id] })).filter((p) => p.dataUrl) : [],
    };
  });
  const summary = computeRutinaSummary({
    answers: Object.fromEntries(RUTINA_FLAT.map((it) => {
      const e = byId[it.id];
      if (!e) return [it.id, undefined];
      const idx = it.opciones.findIndex((o) => o.label === e.opcion && o.pts === e.score);
      return [it.id, idx >= 0 ? idx : 0];
    })),
    touched,
  });
  return { rows, summary };
}

async function exportEvalPdf(evalId, cached) {
  const evalDoc = cached || (await api.get(`/rutina/evaluaciones/${evalId}`)).data;
  const photoMap = await fetchEvalPhotosAsDataUrls(evalDoc.id, evalDoc);
  const { rows, summary } = buildRowsFromEval(evalDoc, photoMap);
  await generateRutinaPdf({
    meta: { sucursal: evalDoc.sucursal, gerente: evalDoc.gerente_name, mesLabel: monthLabel(evalDoc.mes), fecha: evalDoc.fecha },
    rows, summary,
  });
}

function PercentChip({ pct }) {
  const t = rutinaTone(pct);
  return <span className="text-sm font-bold rounded-full px-2.5 py-1" style={{ color: RUTINA_TONE_COLOR[t], background: `${RUTINA_TONE_COLOR[t]}1f` }}>{pct}%</span>;
}

function DetailDialog({ id, onClose }) {
  const [evalDoc, setEvalDoc] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) { setEvalDoc(null); return; }
    api.get(`/rutina/evaluaciones/${id}`).then(({ data }) => setEvalDoc(data)).catch(() => toast.error('No se pudo cargar la evaluación'));
  }, [id]);

  const download = async () => {
    if (!evalDoc) return;
    setExporting(true);
    try { await exportEvalPdf(evalDoc.id, evalDoc); }
    catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExporting(false); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] rounded-[22px] max-h-[88vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2 flex-row items-center justify-between gap-3 pr-10">
          <DialogTitle className="font-heading">Rutina Operativa · {evalDoc?.sucursal || '…'}</DialogTitle>
          {evalDoc && (
            <button onClick={download} disabled={exporting} data-testid="rutina-history-download"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 shrink-0">
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? 'Generando…' : 'Descargar PDF'}
            </button>
          )}
        </DialogHeader>
        {!evalDoc ? (
          <div className="px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <PercentChip pct={evalDoc.percent} />
              <span className="text-sm text-muted-foreground">{evalDoc.total_score}/{evalDoc.total_max} pts</span>
              <span className="text-sm text-muted-foreground">· {monthLabel(evalDoc.mes)}</span>
              <span className="text-sm text-muted-foreground">· {evalDoc.fecha}</span>
            </div>
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7"><AvatarImage src={evalDoc.gerente_avatar} /><AvatarFallback>{evalDoc.gerente_name?.[0]}</AvatarFallback></Avatar>
              <span className="text-sm">{evalDoc.gerente_name}</span>
            </div>

            <div className="space-y-2">
              {evalDoc.entries.map((e) => {
                const t = e.max ? rutinaTone((e.score / e.max) * 100) : 'g';
                return (
                  <div key={e.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{e.titulo}</p>
                        <p className="text-xs text-muted-foreground">{e.seccion}</p>
                      </div>
                      <span className="text-sm font-bold shrink-0" style={{ color: RUTINA_TONE_COLOR[t] }}>{e.score}/{e.max}</span>
                    </div>
                    {e.opcion && <p className="text-sm text-foreground mt-1.5">{e.opcion}</p>}
                    {e.note && <p className="text-xs text-muted-foreground italic mt-1">"{e.note}"</p>}
                    {e.photos?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {e.photos.map((p) => (
                          <AuthedImg key={p.id} url={`/rutina/evaluaciones/${evalDoc.id}/foto/${p.id}`}
                            className="h-16 w-16 rounded-lg object-cover border cursor-pointer"
                            onClick={() => setZoom(`/rutina/evaluaciones/${evalDoc.id}/foto/${p.id}`)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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

export default function Historial({ refreshKey }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sucursal, setSucursal] = useState('');
  const [mes, setMes] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [exportingId, setExportingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (sucursal) params.set('sucursal', sucursal);
      if (mes) params.set('mes', mes);
      const { data } = await api.get(`/rutina/evaluaciones?${params.toString()}`);
      setRows(data);
    } catch (e) { toast.error('No se pudieron cargar las evaluaciones'); }
    finally { setLoading(false); }
  }, [sucursal, mes]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const quickDownload = async (e, id) => {
    e.stopPropagation();
    setExportingId(id);
    try { await exportEvalPdf(id, null); }
    catch (err) { toast.error('No se pudo generar el PDF'); }
    finally { setExportingId(null); }
  };

  const filtered = rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [r.sucursal, r.gerente_name].filter(Boolean).some((v) => v.toLowerCase().includes(s));
  });

  return (
    <div>
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Mes</label>
          <Input type="month" value={mes} max={currentMonth()} onChange={(e) => setMes(e.target.value)} className="h-10 w-[160px]" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Sucursal</label>
          <Select value={sucursal || 'todas'} onValueChange={(v) => setSucursal(v === 'todas' ? '' : v)}>
            <SelectTrigger className="h-10 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {RUTINA_SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por tienda o gerente…" className="pl-9 h-10" />
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>}
      {!loading && filtered.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <ClipboardList className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Sin evaluaciones en este rango</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((r) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            role="button" tabIndex={0} onClick={() => setOpenId(r.id)} data-testid="rutina-history-row"
            className="w-full flex items-center gap-3 rounded-[16px] bg-card border shadow-card p-4 text-left hover:shadow-cardmd transition-shadow cursor-pointer">
            <PercentChip pct={r.percent} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium flex items-center gap-1.5"><Store className="h-3.5 w-3.5 text-muted-foreground" />{r.sucursal} <span className="text-muted-foreground">· {monthLabel(r.mes)}</span></p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{r.fecha}</span>
                <span className="flex items-center gap-1"><UserIcon className="h-3 w-3" />{r.gerente_name}</span>
              </p>
            </div>
            <span className="text-sm text-muted-foreground shrink-0 hidden sm:inline">{r.total_score}/{r.total_max} pts</span>
            <button onClick={(e) => quickDownload(e, r.id)} disabled={exportingId === r.id} title="Descargar PDF"
              data-testid="rutina-history-quick-download"
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
