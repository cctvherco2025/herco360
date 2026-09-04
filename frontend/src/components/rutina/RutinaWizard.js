import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, Upload, X, Info,
  TrendingUp, TrendingDown, Send, FileDown, RotateCcw,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ymd } from '@/lib/time';
import {
  RUTINA_SCHEMA, RUTINA_FLAT, RUTINA_SUCURSALES, rutinaTone, RUTINA_TONE_COLOR, computeRutinaSummary,
} from '@/lib/rutinaSchema';
import { compressImage } from '@/lib/flosPhoto';
import { generateRutinaPdf } from '@/lib/rutinaPdf';
import { canFillRutina } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const STEPS = RUTINA_FLAT.length;
const DRAFT_KEY = 'herco360_rutina_draft_v1';
const MAX_PHOTOS_PER_ITEM = 8;

const currentMonth = () => ymd(new Date()).slice(0, 7);
const monthLabel = (ym) => {
  if (!ym) return '—';
  const [y, m] = ym.split('-').map(Number);
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return m >= 1 && m <= 12 ? `${MESES[m - 1]} ${y}` : ym;
};
const emptyMeta = () => ({ sucursal: '', mes: currentMonth(), fecha: ymd(new Date()) });

function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

export default function RutinaWizard({ onSubmitted }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('intro'); // intro | walk | resumen
  const [meta, setMeta] = useState(emptyMeta());
  const [answers, setAnswers] = useState({}); // id -> option index
  const [notes, setNotes] = useState({});
  const [touched, setTouched] = useState(new Set());
  const [photos, setPhotos] = useState({});
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const camInputs = useRef({});

  const canFill = canFillRutina(user);

  useEffect(() => {
    const d = loadDraft();
    if (d && (d.touched || []).length) {
      setMeta({ ...emptyMeta(), ...(d.meta || {}) });
      setAnswers(d.answers || {});
      setNotes(d.notes || {});
      setTouched(new Set(d.touched || []));
      setCursor(d.cursor || 0);
      setHasDraft(true);
    }
  }, []);

  useEffect(() => {
    if (phase === 'intro') return;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, answers, notes, touched: [...touched], cursor })); }
      catch (e) { /* localStorage lleno: se pierde el borrador, no rompe la app */ }
    }, 400);
    return () => clearTimeout(t);
  }, [phase, meta, answers, notes, touched, cursor]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };

  const summary = useMemo(() => computeRutinaSummary({ answers, touched }), [answers, touched]);

  const selectOption = (id, idx) => {
    setAnswers((a) => ({ ...a, [id]: idx }));
    setTouched((t) => new Set(t).add(id));
  };
  const setNote = (id, text) => setNotes((n) => ({ ...n, [id]: text }));

  const handleFiles = async (id, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const already = (photos[id] || []).length;
    const room = MAX_PHOTOS_PER_ITEM - already;
    if (room <= 0) { toast.error(`Ya adjuntaste el máximo de ${MAX_PHOTOS_PER_ITEM} fotos`); return; }
    const toProcess = files.slice(0, room);
    if (files.length > toProcess.length) toast.warning(`Solo se agregaron ${toProcess.length}: el máximo es ${MAX_PHOTOS_PER_ITEM} fotos`);
    setUploading(id);
    try {
      for (const file of toProcess) {
        const { blob, dataUrl } = await compressImage(file);
        setPhotos((p) => ({ ...p, [id]: [...(p[id] || []), { localId: `${Date.now()}-${Math.random()}`, blob, dataUrl, name: file.name }] }));
      }
    } catch (e) { toast.error('No se pudo procesar una de las fotos'); }
    finally { setUploading(null); }
  };
  const removePhoto = (id, localId) => setPhotos((p) => ({ ...p, [id]: (p[id] || []).filter((ph) => ph.localId !== localId) }));

  const goto = (i) => setCursor(Math.max(0, Math.min(STEPS - 1, i)));
  const next = () => (cursor < STEPS - 1 ? goto(cursor + 1) : setPhase('resumen'));
  const prev = () => goto(cursor - 1);

  const beginWalk = () => {
    if (!meta.sucursal) { toast.error('Selecciona la sucursal'); return; }
    if (!meta.mes) { toast.error('Selecciona el mes a evaluar'); return; }
    setPhase('walk');
  };

  const resetAll = () => {
    if (!window.confirm('¿Reiniciar la evaluación? Se perderán las respuestas, notas y fotos.')) return;
    clearDraft();
    setMeta(emptyMeta()); setAnswers({}); setNotes({}); setTouched(new Set());
    setPhotos({}); setCursor(0); setPhase('intro'); setHasDraft(false);
    toast.success('Evaluación reiniciada');
  };

  const buildRows = useCallback(() => RUTINA_FLAT.map((it) => {
    const idx = answers[it.id];
    const opt = touched.has(it.id) && typeof idx === 'number' ? it.opciones[idx] : null;
    return {
      ...it, touched: touched.has(it.id), score: opt ? opt.pts : 0,
      opcion: opt ? opt.label : '', note: (notes[it.id] || '').trim(), photos: photos[it.id] || [],
    };
  }), [answers, touched, notes, photos]);

  const exportPdf = async () => {
    try {
      await generateRutinaPdf({
        meta: { sucursal: meta.sucursal, gerente: user?.name, mesLabel: monthLabel(meta.mes), fecha: meta.fecha },
        rows: buildRows(), summary,
      });
    } catch (e) { toast.error('No se pudo generar el PDF'); }
  };

  const submit = async () => {
    if (summary.touchedCount === 0) { toast.error('Responde al menos una pregunta antes de enviar'); return; }
    setSubmitting(true);
    try {
      const entries = RUTINA_FLAT.filter((it) => touched.has(it.id)).map((it) => {
        const idx = answers[it.id];
        const opt = it.opciones[idx];
        return {
          id: it.id, titulo: it.titulo, seccion: it.seccion, pregunta: it.pregunta,
          opcion: opt ? opt.label : '', score: opt ? opt.pts : 0, max: it.max, note: (notes[it.id] || '').trim(),
        };
      });
      const fd = new FormData();
      fd.append('data', JSON.stringify({ sucursal: meta.sucursal, mes: meta.mes, fecha: meta.fecha, entries }));
      Object.entries(photos).forEach(([id, list]) => {
        list.forEach((p) => { fd.append('photos', p.blob, p.name || `${id}.jpg`); fd.append('photo_owner', id); });
      });
      await api.post('/rutina/evaluaciones', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Rutina Operativa enviada correctamente');
      clearDraft();
      setMeta(emptyMeta()); setAnswers({}); setNotes({}); setTouched(new Set());
      setPhotos({}); setCursor(0); setPhase('intro'); setHasDraft(false);
      onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo enviar la evaluación');
    } finally { setSubmitting(false); }
  };

  if (!canFill) {
    return (
      <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Solo el Gerente de tienda puede registrar la Rutina Operativa. Tú puedes consultar el historial.</p>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="max-w-[520px] mx-auto rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <Avatar className="h-10 w-10 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
          <div><p className="text-sm font-medium text-foreground">{user?.name}</p><p className="text-xs text-muted-foreground">Gerente</p></div>
        </div>
        <h2 className="font-heading text-xl font-semibold mt-4">Rutina Operativa del mes</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-5">{RUTINA_SCHEMA.reduce((n, s) => n + s.items.length, 0)} preguntas en 3 secciones — ventas, inventario y operación.</p>

        {hasDraft && (
          <div className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2 mb-4">
            <Info className="h-3.5 w-3.5 shrink-0" /> Tienes una evaluación en curso guardada en este dispositivo.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sucursal</Label>
            <Select value={meta.sucursal} onValueChange={(v) => setMeta((m) => ({ ...m, sucursal: v }))}>
              <SelectTrigger className="h-11" data-testid="rutina-sucursal-select"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
              <SelectContent>{RUTINA_SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Mes a evaluar</Label>
            <Input type="month" value={meta.mes} onChange={(e) => setMeta((m) => ({ ...m, mes: e.target.value }))} className="h-11" data-testid="rutina-mes-input" />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha de evaluación</Label>
            <Input type="date" value={meta.fecha} onChange={(e) => setMeta((m) => ({ ...m, fecha: e.target.value }))} className="h-11" />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <Button onClick={beginWalk} className="h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="rutina-begin-button">
            {hasDraft ? 'Continuar evaluación' : 'Comenzar evaluación'} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          {hasDraft && <Button variant="ghost" onClick={() => setPhase('resumen')} className="rounded-xl">Ver resumen</Button>}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-[880px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
          <button onClick={() => setPhase('walk')} data-testid="rutina-tab-walk"
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${phase === 'walk' ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>Evaluación</button>
          <button onClick={() => setPhase('resumen')} data-testid="rutina-tab-resumen"
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${phase === 'resumen' ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>Resumen</button>
        </div>
        <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground" data-testid="rutina-reset-button">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reiniciar
        </Button>
      </div>

      {phase === 'walk' && (
        <WalkCard
          cursor={cursor} steps={STEPS} answers={answers} notes={notes} photos={photos} uploading={uploading}
          onSelect={selectOption} onNote={setNote} onFiles={handleFiles} onRemovePhoto={removePhoto}
          onPrev={prev} onNext={next} onGoto={goto} onZoom={setZoomSrc} camInputs={camInputs}
        />
      )}
      {phase === 'resumen' && <Resumen summary={summary} onExport={exportPdf} onSubmit={submit} submitting={submitting} />}

      <ZoomDialog src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
}

/* ───────────────────── Recorrido (paso a paso) ─────────── */
function WalkCard({ cursor, steps, answers, notes, photos, uploading, onSelect, onNote, onFiles, onRemovePhoto, onPrev, onNext, onGoto, onZoom, camInputs }) {
  const it = RUTINA_FLAT[cursor];
  const idx = answers[it.id];
  const pics = photos[it.id] || [];
  const busy = uploading === it.id;

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>Pregunta {cursor + 1} de {steps}</span>
          <span>{it.seccion}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-[#00a5df] transition-all" style={{ width: `${((cursor + 1) / steps) * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {RUTINA_FLAT.map((f, i) => (
            <button key={f.id} onClick={() => onGoto(i)} title={f.titulo}
              className="h-2 w-2 rounded-full transition-all"
              style={{ background: i === cursor ? '#00a5df' : (typeof answers[f.id] === 'number') ? '#1e395e' : 'var(--border)', transform: i === cursor ? 'scale(1.6)' : 'scale(1)' }} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={cursor} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
          className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6" data-testid="rutina-walk-card">
          <h3 className="font-heading text-lg font-semibold leading-snug">{it.titulo}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{it.pregunta}</p>

          <div className="mt-5 space-y-2">
            {it.opciones.map((o, n) => {
              const active = idx === n;
              return (
                <button key={n} type="button" onClick={() => onSelect(it.id, n)} data-testid={`rutina-option-${n}`}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                    active ? 'border-[#1e395e] bg-[rgba(30,57,94,0.08)] dark:bg-[rgba(60,190,246,0.12)]' : 'hover:bg-muted/50'
                  }`}>
                  <span className="flex items-center gap-2.5">
                    <span className={`h-4 w-4 rounded-full border-2 shrink-0 grid place-items-center ${active ? 'border-[#00a5df]' : 'border-muted-foreground/40'}`}>
                      {active && <span className="h-2 w-2 rounded-full bg-[#00a5df]" />}
                    </span>
                    {o.label}
                  </span>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">{o.pts} pts</span>
                </button>
              );
            })}
          </div>

          {it.evidencia && (
            <div className="mt-5 pt-4 border-t space-y-3">
              <p className="text-xs font-semibold text-muted-foreground">{it.evidencia.prompt}</p>
              <Textarea rows={2} placeholder={it.evidencia.tipo === 'texto' ? 'Escribe aquí…' : 'Notas (opcional)…'}
                value={notes[it.id] || ''} onChange={(e) => onNote(it.id, e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <input ref={(el) => (camInputs.current[`${it.id}-cam`] = el)} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { onFiles(it.id, e.target.files); e.target.value = ''; }} />
                <input ref={(el) => (camInputs.current[`${it.id}-lib`] = el)} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { onFiles(it.id, e.target.files); e.target.value = ''; }} />
                <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
                  onClick={() => camInputs.current[`${it.id}-cam`]?.click()} data-testid="rutina-photo-camera">
                  <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Tomar foto'}
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
                  onClick={() => camInputs.current[`${it.id}-lib`]?.click()} data-testid="rutina-photo-upload">
                  <Upload className="h-4 w-4 mr-1.5" /> Subir foto
                </Button>
                <span className="text-xs text-muted-foreground self-center">{pics.length}/{MAX_PHOTOS_PER_ITEM} fotos</span>
              </div>
              {pics.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pics.map((p) => (
                    <div key={p.localId} className="relative h-20 w-20 rounded-lg overflow-hidden border">
                      <img src={p.dataUrl} alt="Evidencia" className="h-full w-full object-cover cursor-pointer" onClick={() => onZoom(p.dataUrl)} />
                      <button onClick={() => onRemovePhoto(it.id, p.localId)} aria-label="Quitar foto"
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/65 text-white grid place-items-center text-xs">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-4 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={onPrev} disabled={cursor === 0} data-testid="rutina-prev-button">
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <Button onClick={onNext} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="rutina-next-button">
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

function Resumen({ summary, onExport, onSubmit, submitting }) {
  const tone = rutinaTone(summary.pct);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="rounded-[18px] bg-card border shadow-card p-6 text-center mb-4">
        <p className="font-heading text-5xl font-bold" style={{ color: RUTINA_TONE_COLOR[tone] }}>{summary.pct}%</p>
        <p className="text-sm font-medium mt-1" style={{ color: RUTINA_TONE_COLOR[tone] }}>{summary.statusLabel}</p>
        <p className="text-xs text-muted-foreground mt-1">{summary.totalAct} / {summary.totalMax} pts · {summary.touchedCount} de {RUTINA_FLAT.length} preguntas respondidas</p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Tile icon={TrendingUp} label="Mejor sección" value={summary.best ? summary.best.seccion : '—'} sub={summary.best ? `${summary.best.pct}% cumplido` : 'Sin datos'} color="#16a34a" tint="rgba(22,163,74,0.14)" />
        <Tile icon={TrendingDown} label="A reforzar" value={summary.worst ? summary.worst.seccion : '—'} sub={summary.worst ? `${summary.worst.pct}% cumplido` : 'Sin datos'} color="#dc2626" tint="rgba(220,38,38,0.12)" />
      </div>

      <div className="rounded-[18px] bg-card border shadow-card p-5">
        <h3 className="font-heading font-semibold mb-4">Cumplimiento por sección</h3>
        <div className="space-y-3">
          {summary.sections.map((s) => {
            const t = rutinaTone(s.pct);
            return (
              <div key={s.seccion} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm font-medium truncate">{s.seccion}</span>
                <span className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${s.pct}%`, background: RUTINA_TONE_COLOR[t] }} /></span>
                <span className="w-14 text-right text-sm font-semibold" style={{ color: RUTINA_TONE_COLOR[t] }}>{s.pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mt-5">
        <Button variant="outline" className="rounded-xl" onClick={onExport} data-testid="rutina-export-pdf">
          <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
        </Button>
        <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white ml-auto" onClick={onSubmit} disabled={submitting} data-testid="rutina-submit-button">
          <Send className="h-4 w-4 mr-1.5" /> {submitting ? 'Enviando…' : 'Enviar evaluación'}
        </Button>
      </div>
    </motion.div>
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
