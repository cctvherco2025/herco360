import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, Upload, X, ImageIcon, Info, Check,
  Sparkles, LayoutGrid, PackageSearch, AlignStartVertical, FileDown, Send,
  TrendingUp, TrendingDown, AlertTriangle, ClipboardList, RotateCcw,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ymd } from '@/lib/time';
import {
  FLOS_SCHEMA, FLOS_FLAT, FLOS_SUCURSALES, FLOS_REF_CAPTION, FLOS_REF_PHOTO,
  flosTone, FLOS_TONE_COLOR, computeFlosSummary,
} from '@/lib/flosSchema';
import { compressImage } from '@/lib/flosPhoto';
import { generateFlosPdf } from '@/lib/flosPdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DIM_ICON = { FRENTEO: AlignStartVertical, LIMPIEZA: Sparkles, ORDEN: LayoutGrid, SURTIDO: PackageSearch };
const CLOSER = FLOS_FLAT.length;
const STEPS = FLOS_FLAT.length + 1;
const DRAFT_KEY = 'herco360_flos_draft_v1';
const MAX_PHOTOS_PER_ITEM = 8;

const emptyMeta = (user) => ({ sucursal: '', linea: '', fecha: ymd(new Date()), auditor_name: user?.name || '' });

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

export default function AuditWizard({ onSubmitted }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('intro'); // intro | walk | verdict | plan
  const [meta, setMeta] = useState(() => emptyMeta(user));
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState({});
  const [touched, setTouched] = useState(new Set());
  const [photos, setPhotos] = useState({}); // id -> [{ localId, dataUrl, blob, name }]
  const [generalComment, setGeneralComment] = useState('');
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null); // variable id currently compressing a photo
  const [refId, setRefId] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const camInputs = useRef({});

  // ── Draft: solo campos livianos (los archivos de foto no se guardan). ──
  useEffect(() => {
    const d = loadDraft();
    if (d && (d.touched || []).length) {
      setMeta({ ...emptyMeta(user), ...(d.meta || {}) });
      setScores(d.scores || {});
      setComments(d.comments || {});
      setTouched(new Set(d.touched || []));
      setGeneralComment(d.generalComment || '');
      setCursor(d.cursor || 0);
      setHasDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase === 'intro') return; // nada que guardar todavía
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          meta, scores, comments, touched: [...touched], generalComment, cursor,
        }));
      } catch (e) { /* localStorage lleno: se pierde el borrador, no rompe la app */ }
    }, 400);
    return () => clearTimeout(t);
  }, [phase, meta, scores, comments, touched, generalComment, cursor]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };

  // ── Resumen calculado ────────────────────────────────────────
  const summary = useMemo(() => computeFlosSummary({ scores, comments, touched }), [scores, comments, touched]);

  const setScore = (id, n) => {
    setScores((s) => ({ ...s, [id]: n }));
    setTouched((t) => new Set(t).add(id));
  };
  const setComment = (id, text) => setComments((c) => ({ ...c, [id]: text }));

  const handleFiles = async (id, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const already = (photos[id] || []).length;
    const room = MAX_PHOTOS_PER_ITEM - already;
    if (room <= 0) {
      toast.error(`Ya adjuntaste el máximo de ${MAX_PHOTOS_PER_ITEM} fotos para este criterio`);
      return;
    }
    const toProcess = files.slice(0, room);
    if (files.length > toProcess.length) {
      toast.warning(`Solo se agregaron ${toProcess.length}: el máximo es ${MAX_PHOTOS_PER_ITEM} fotos por criterio`);
    }
    setUploading(id);
    try {
      for (const file of toProcess) {
        const { blob, dataUrl } = await compressImage(file);
        setPhotos((p) => ({
          ...p,
          [id]: [...(p[id] || []), { localId: `${Date.now()}-${Math.random()}`, blob, dataUrl, name: file.name }],
        }));
      }
    } catch (e) {
      toast.error('No se pudo procesar una de las fotos');
    } finally {
      setUploading(null);
    }
  };
  const removePhoto = (id, localId) => {
    setPhotos((p) => ({ ...p, [id]: (p[id] || []).filter((ph) => ph.localId !== localId) }));
  };

  const goto = (i) => setCursor(Math.max(0, Math.min(STEPS - 1, i)));
  const next = () => (cursor < STEPS - 1 ? goto(cursor + 1) : setPhase('verdict'));
  const prev = () => goto(cursor - 1);

  const beginWalk = () => {
    if (!meta.sucursal) { toast.error('Selecciona la sucursal'); return; }
    if (!meta.linea.trim()) { toast.error('Indica la categoría o línea'); return; }
    setPhase('walk');
  };

  const resetAll = () => {
    if (!window.confirm('¿Reiniciar la auditoría? Se perderán los puntajes, notas y fotos capturados.')) return;
    clearDraft();
    setMeta(emptyMeta(user)); setScores({}); setComments({}); setTouched(new Set());
    setPhotos({}); setGeneralComment(''); setCursor(0); setPhase('intro'); setHasDraft(false);
    toast.success('Auditoría reiniciada');
  };

  // ── Filas con todo lo capturado, para el PDF y el envío ─────
  const buildRows = () => FLOS_FLAT.map((v) => ({
    ...v,
    score: scores[v.id] ?? 0,
    touched: touched.has(v.id),
    comment: (comments[v.id] || '').trim(),
    photos: photos[v.id] || [],
  }));

  const exportPdf = async () => {
    try {
      await generateFlosPdf({
        meta: { sucursal: meta.sucursal, linea: meta.linea, auditor: user?.name, fecha: meta.fecha },
        rows: buildRows(),
        generalComment: generalComment.trim(),
        generalPhotos: photos.__general__ || [],
        summary,
      });
    } catch (e) {
      toast.error('No se pudo generar el PDF');
    }
  };

  const submit = async () => {
    if (summary.touchedCount === 0) { toast.error('Califica al menos un criterio antes de enviar'); return; }
    setSubmitting(true);
    try {
      const entries = FLOS_FLAT.filter((v) => touched.has(v.id)).map((v) => ({
        id: v.id, name: v.name, dim: v.dim, max: v.max,
        score: scores[v.id] ?? 0, comment: (comments[v.id] || '').trim(),
      }));
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        sucursal: meta.sucursal, linea: meta.linea.trim(), fecha: meta.fecha,
        entries, general_comment: generalComment.trim(),
      }));
      Object.entries(photos).forEach(([id, list]) => {
        list.forEach((p) => { fd.append('photos', p.blob, p.name || `${id}.jpg`); fd.append('photo_owner', id); });
      });
      await api.post('/formulario/auditorias', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Auditoría enviada correctamente');
      clearDraft();
      setMeta(emptyMeta(user)); setScores({}); setComments({}); setTouched(new Set());
      setPhotos({}); setGeneralComment(''); setCursor(0); setPhase('intro'); setHasDraft(false);
      onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo enviar la auditoría');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'intro') {
    return (
      <IntroForm meta={meta} setMeta={setMeta} onBegin={beginWalk} hasDraft={hasDraft}
        onViewSummary={() => setPhase('verdict')} user={user} />
    );
  }

  return (
    <div className="max-w-[880px] mx-auto">
      <PhaseNav phase={phase} setPhase={setPhase} onReset={resetAll} />

      {phase === 'walk' && (
        <WalkCard
          cursor={cursor} steps={STEPS} closer={CLOSER}
          scores={scores} comments={comments} photos={photos} uploading={uploading} touched={touched}
          onScore={setScore} onComment={setComment} onFiles={handleFiles} onRemovePhoto={removePhoto}
          generalComment={generalComment} setGeneralComment={setGeneralComment}
          onPrev={prev} onNext={next} onGoto={goto}
          onOpenRef={setRefId} onZoom={setZoomSrc} camInputs={camInputs}
        />
      )}
      {phase === 'verdict' && <Verdict summary={summary} onExport={exportPdf} onSubmit={submit} submitting={submitting} />}
      {phase === 'plan' && <PlanView summary={summary} onExport={exportPdf} onSubmit={submit} submitting={submitting} />}

      <RefDialog id={refId} onClose={() => setRefId(null)} />
      <ZoomDialog src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

/* ───────────────────────── Intro ───────────────────────── */
function IntroForm({ meta, setMeta, onBegin, hasDraft, onViewSummary, user }) {
  const set = (k) => (e) => setMeta((m) => ({ ...m, [k]: e.target.value }));
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      className="max-w-[520px] mx-auto rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-1">
        <Avatar className="h-10 w-10 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
        <div>
          <p className="text-sm font-medium text-foreground">{user?.name}</p>
          <p className="text-xs text-muted-foreground">Auditor</p>
        </div>
      </div>
      <h2 className="font-heading text-xl font-semibold mt-4">Nueva auditoría FLOS</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-5">Frenteo · Limpieza · Orden · Surtido — 16 criterios, ~15 min de recorrido.</p>

      {hasDraft && (
        <div className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2 mb-4">
          <Info className="h-3.5 w-3.5 shrink-0" /> Tienes una auditoría en curso guardada en este dispositivo.
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Sucursal</Label>
          <Select value={meta.sucursal} onValueChange={(v) => setMeta((m) => ({ ...m, sucursal: v }))}>
            <SelectTrigger className="h-11" data-testid="flos-sucursal-select"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
            <SelectContent>{FLOS_SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Categoría / Línea</Label>
          <Input value={meta.linea} onChange={set('linea')} placeholder="Pinturas, Herrajes…" className="h-11" data-testid="flos-linea-input" />
        </div>
        <div className="space-y-1.5">
          <Label>Fecha</Label>
          <Input type="date" value={meta.fecha} onChange={set('fecha')} className="h-11" />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <Button onClick={onBegin} className="h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="flos-begin-button">
          {hasDraft ? 'Continuar recorrido' : 'Comenzar recorrido'} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        {hasDraft && <Button variant="ghost" onClick={onViewSummary} className="rounded-xl">Ver resumen</Button>}
      </div>
    </motion.div>
  );
}

/* ───────────────────── Nav entre fases ─────────────────── */
function PhaseNav({ phase, setPhase, onReset }) {
  const tabs = [
    { k: 'walk', label: 'Recorrido' },
    { k: 'verdict', label: 'Resumen' },
    { k: 'plan', label: 'Plan' },
  ];
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setPhase(t.k)} data-testid={`flos-tab-${t.k}`}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${phase === t.k ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground" data-testid="flos-reset-button">
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reiniciar
      </Button>
    </div>
  );
}

/* ───────────────────── Recorrido (paso a paso) ─────────── */
function WalkCard({
  cursor, steps, closer, scores, comments, photos, uploading, touched,
  onScore, onComment, onFiles, onRemovePhoto,
  generalComment, setGeneralComment, onPrev, onNext, onGoto, onOpenRef, onZoom, camInputs,
}) {
  const isCloser = cursor === closer;
  const v = isCloser ? null : FLOS_FLAT[cursor];
  const id = isCloser ? '__general__' : v.id;
  const Icon = isCloser ? ClipboardList : (DIM_ICON[v.dim] || AlignStartVertical);
  const val = isCloser ? null : (scores[v.id] ?? 0);
  const pics = photos[id] || [];
  const busy = uploading === id;

  return (
    <div>
      {/* progreso */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Paso {cursor + 1} de {steps}</span>
          <span>{isCloser ? 'Comentario general' : v.dim}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-[#00a5df] transition-all" style={{ width: `${((cursor + 1) / steps) * 100}%` }} />
        </div>
        {/* puntitos por dimensión */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {FLOS_FLAT.map((f, i) => (
            <button key={f.id} onClick={() => onGoto(i)} title={f.name}
              className="h-2 w-2 rounded-full transition-all"
              style={{ background: i === cursor ? '#00a5df' : touched.has(f.id) ? '#1e395e' : 'var(--border)', transform: i === cursor ? 'scale(1.6)' : 'scale(1)' }} />
          ))}
          <button onClick={() => onGoto(closer)} title="Comentario general"
            className="h-2 w-2 rounded-full transition-all"
            style={{ background: cursor === closer ? '#00a5df' : 'var(--border)', transform: cursor === closer ? 'scale(1.6)' : 'scale(1)' }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={cursor} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
          className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6" data-testid="flos-walk-card">
          <div className="flex items-start gap-3 mb-1">
            <span className="h-10 w-10 rounded-xl grid place-items-center bg-[rgba(0,165,223,0.12)] text-[#00a5df] shrink-0"><Icon className="h-5 w-5" /></span>
            <div className="flex-1 min-w-0">
              <h3 className="font-heading text-lg font-semibold leading-snug">{isCloser ? 'Comentario general de la visita' : v.name}</h3>
              {!isCloser && <p className="text-sm text-muted-foreground mt-0.5">{v.desc}</p>}
            </div>
          </div>

          {!isCloser && (
            <>
              {FLOS_REF_PHOTO[v.id] && (
                <button onClick={() => onOpenRef(v.id)} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#00a5df] hover:underline" data-testid="flos-ref-button">
                  <ImageIcon className="h-3.5 w-3.5" /> Ver foto de referencia
                </button>
              )}

              {/* puntaje */}
              <div className="mt-5">
                <Label className="mb-2 block">Puntaje ({val}/{v.max})</Label>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: v.max + 1 }, (_, n) => n).map((n) => (
                    <button key={n} onClick={() => onScore(v.id, n)} data-testid={`flos-score-${n}`}
                      className={`h-10 min-w-10 px-3 rounded-xl border text-sm font-semibold transition-colors ${
                        val === n ? 'bg-[#1e395e] text-white border-transparent' : n === 0 ? 'text-[#dc2626] border-[rgba(220,38,38,0.3)] hover:bg-[rgba(220,38,38,0.06)]' : 'hover:bg-muted'
                      }`}>{n}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="mt-5 space-y-1.5">
            <Label>{isCloser ? 'Observaciones de la visita' : '¿Qué observaste?'}</Label>
            <Textarea rows={3} placeholder="Sé específico…"
              value={isCloser ? generalComment : (comments[v.id] || '')}
              onChange={(e) => isCloser ? setGeneralComment(e.target.value) : onComment(v.id, e.target.value)} />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <Label>Evidencia fotográfica</Label>
              <span className="text-xs text-muted-foreground">{pics.length}/{MAX_PHOTOS_PER_ITEM} fotos</span>
            </div>
            <p className="text-xs text-muted-foreground -mt-1 mb-2">Puedes agregar varias fotos por criterio: repite "Tomar foto" o selecciona varias al "Subir foto".</p>
            <div className="flex flex-wrap gap-2 mb-2">
              <input ref={(el) => (camInputs.current[`${id}-cam`] = el)} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { onFiles(id, e.target.files); e.target.value = ''; }} />
              <input ref={(el) => (camInputs.current[`${id}-lib`] = el)} type="file" accept="image/*" multiple className="hidden"
                onChange={(e) => { onFiles(id, e.target.files); e.target.value = ''; }} />
              <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
                onClick={() => camInputs.current[`${id}-cam`]?.click()} data-testid="flos-photo-camera">
                <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Tomar foto'}
              </Button>
              <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
                onClick={() => camInputs.current[`${id}-lib`]?.click()} data-testid="flos-photo-upload">
                <Upload className="h-4 w-4 mr-1.5" /> Subir foto{pics.length < MAX_PHOTOS_PER_ITEM ? 's' : ''}
              </Button>
            </div>
            {pics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pics.map((p) => (
                  <div key={p.localId} className="relative h-20 w-20 rounded-lg overflow-hidden border">
                    <img src={p.dataUrl} alt="Evidencia" className="h-full w-full object-cover cursor-pointer" onClick={() => onZoom(p.dataUrl)} />
                    <button onClick={() => onRemovePhoto(id, p.localId)} aria-label="Quitar foto"
                      className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/65 text-white grid place-items-center text-xs">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-4 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={onPrev} disabled={cursor === 0} data-testid="flos-prev-button">
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <Button onClick={onNext} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="flos-next-button">
          {cursor === steps - 1 ? 'Ver resumen' : 'Siguiente'} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── Resumen ─────────────────────── */
function Tile({ icon: IconEl, label, value, sub, color, tint }) {
  return (
    <div className="rounded-[16px] bg-card border shadow-card p-4">
      <span className="h-9 w-9 rounded-full grid place-items-center" style={{ background: tint }}><IconEl className="h-4 w-4" style={{ color }} /></span>
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="font-heading text-xl font-semibold mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ActionBar({ onExport, onSubmit, submitting }) {
  return (
    <div className="flex flex-wrap gap-2 mt-5">
      <Button variant="outline" className="rounded-xl" onClick={onExport} data-testid="flos-export-pdf">
        <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
      </Button>
      <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white ml-auto" onClick={onSubmit} disabled={submitting} data-testid="flos-submit-button">
        <Send className="h-4 w-4 mr-1.5" /> {submitting ? 'Enviando…' : 'Enviar auditoría'}
      </Button>
    </div>
  );
}

function Verdict({ summary, onExport, onSubmit, submitting }) {
  const tone = flosTone(summary.pct);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="rounded-[18px] bg-card border shadow-card p-6 text-center mb-4">
        <p className="font-heading text-5xl font-bold" style={{ color: FLOS_TONE_COLOR[tone] }}>{summary.pct}%</p>
        <p className="text-sm font-medium mt-1" style={{ color: FLOS_TONE_COLOR[tone] }}>{summary.statusLabel}</p>
        <p className="text-xs text-muted-foreground mt-1">{summary.totalAct} / {summary.totalMax} pts · {summary.touchedCount} de {FLOS_FLAT.length} criterios evaluados</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <Tile icon={TrendingUp} label="Mejor dimensión" value={summary.best ? summary.best.dim : '—'} sub={summary.best ? `${summary.best.pct}% cumplido` : 'Sin datos'} color="#16a34a" tint="rgba(22,163,74,0.14)" />
        <Tile icon={TrendingDown} label="A reforzar" value={summary.worst ? summary.worst.dim : '—'} sub={summary.worst ? `${summary.worst.pct}% cumplido` : 'Sin datos'} color="#dc2626" tint="rgba(220,38,38,0.12)" />
        <Tile icon={AlertTriangle} label="Criterios en riesgo" value={summary.atRisk} sub="< 75% cumplido" color="#ec9032" tint="rgba(236,144,50,0.14)" />
        <Tile icon={Check} label="Puntos perdidos" value={summary.lost} sub={`de ${summary.totalMax} totales`} color="#1e395e" tint="rgba(30,57,94,0.1)" />
      </div>

      <div className="rounded-[18px] bg-card border shadow-card p-5">
        <h3 className="font-heading font-semibold mb-4">Cumplimiento por dimensión</h3>
        <div className="space-y-3">
          {summary.dims.map((d) => {
            const Icon = DIM_ICON[d.dim] || AlignStartVertical;
            const t = flosTone(d.pct);
            return (
              <div key={d.dim} className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 w-28 shrink-0 text-sm font-medium"><Icon className="h-4 w-4 text-muted-foreground" />{d.dim}</span>
                <span className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${d.pct}%`, background: FLOS_TONE_COLOR[t] }} /></span>
                <span className="w-14 text-right text-sm font-semibold" style={{ color: FLOS_TONE_COLOR[t] }}>{d.pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <ActionBar onExport={onExport} onSubmit={onSubmit} submitting={submitting} />
    </motion.div>
  );
}

/* ────────────────────── Plan de acción ─────────────────── */
function PlanView({ summary, onExport, onSubmit, submitting }) {
  const chipCls = { hi: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]', md: 'bg-[rgba(236,144,50,0.12)] text-[#ec9032]', lo: 'bg-[rgba(22,163,74,0.1)] text-[#16a34a]' };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <h3 className="font-heading text-lg font-semibold mb-1">Plan de acción</h3>
      <p className="text-sm text-muted-foreground mb-4">Ordenado por urgencia — de la mayor pérdida de puntos a la menor.</p>

      {summary.plan.length === 0 ? (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <Check className="h-8 w-8 mx-auto text-[#16a34a] mb-2" />
          <p className="font-medium">{summary.touchedCount > 0 ? 'Sin acciones pendientes' : 'El plan se escribe solo'}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {summary.touchedCount > 0 ? 'Todo lo evaluado alcanzó el puntaje máximo.' : 'Completa el recorrido y cada punto perdido aparecerá aquí como acción priorizada.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {summary.plan.map((g) => (
            <div key={g.v.id} className="rounded-[16px] bg-card border shadow-card p-4" data-testid="flos-plan-item">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{g.v.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{g.dim}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold">{g.s}<small className="text-muted-foreground">/{g.v.max}</small></span>
                  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${chipCls[g.priorityKey]}`}>{g.priority}</span>
                </div>
              </div>
              <p className="text-sm text-foreground mt-2">{g.v.action}</p>
              {g.note && <p className="text-xs text-muted-foreground italic mt-1.5">"{g.note}"</p>}
            </div>
          ))}
        </div>
      )}

      <ActionBar onExport={onExport} onSubmit={onSubmit} submitting={submitting} />
    </motion.div>
  );
}

/* ─────────────────── Diálogos: referencia / zoom ───────── */
function RefDialog({ id, onClose }) {
  const v = id ? FLOS_FLAT.find((f) => f.id === id) : null;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[480px] rounded-[22px]">
        <DialogHeader><DialogTitle>{v?.name || 'Referencia'}</DialogTitle></DialogHeader>
        {v && (
          <div>
            <p className="text-sm text-muted-foreground mb-3">{FLOS_REF_CAPTION[id] || v.desc}</p>
            {FLOS_REF_PHOTO[id] && <img src={FLOS_REF_PHOTO[id]} alt={v.name} className="w-full rounded-xl border" />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ZoomDialog({ src, onClose }) {
  return (
    <Dialog open={!!src} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[640px] rounded-[22px] p-2">
        {src && <img src={src} alt="Evidencia ampliada" className="w-full rounded-xl" />}
      </DialogContent>
    </Dialog>
  );
}
