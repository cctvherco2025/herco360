import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, Upload, X, Info, Send, FileDown, RotateCcw,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { compressImage } from '@/lib/flosPhoto';
import { generateCustomFormPdf } from '@/lib/customFormPdf';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent } from '@/components/ui/dialog';

const MAX_PHOTOS_PER_ITEM = 8;

function tone(pct) { return pct >= 90 ? 'g' : pct >= 75 ? 'a' : 'r'; }
const TONE_COLOR = { g: '#16a34a', a: '#ec9032', r: '#dc2626' };
const draftKey = (formId) => `herco360_customform_draft_${formId}`;

function loadDraft(formId) {
  try { const raw = localStorage.getItem(draftKey(formId)); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

export default function CustomFormWizard({ schema, onSubmitted }) {
  const { user } = useAuth();
  const items = schema.items;
  const STEPS = items.length;

  const [phase, setPhase] = useState('intro'); // intro | walk | resumen
  const [choice, setChoice] = useState({}); // id -> idx (opcion_unica) | idx[] (checklist)
  const [notes, setNotes] = useState({}); // id -> string (texto answer, or supporting note)
  const [touched, setTouched] = useState(new Set());
  const [photos, setPhotos] = useState({});
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const camInputs = useRef({});

  useEffect(() => {
    const d = loadDraft(schema.id);
    if (d && (d.touched || []).length) {
      setChoice(d.choice || {}); setNotes(d.notes || {}); setTouched(new Set(d.touched || [])); setCursor(d.cursor || 0);
      setHasDraft(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.id]);

  useEffect(() => {
    if (phase === 'intro') return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey(schema.id), JSON.stringify({ choice, notes, touched: [...touched], cursor })); }
      catch (e) { /* localStorage lleno: se pierde el borrador, no rompe la app */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, choice, notes, touched, cursor]);

  const clearDraft = () => { try { localStorage.removeItem(draftKey(schema.id)); } catch (e) {} };

  const itemScore = useCallback((it) => {
    if (!it.scored) return 0;
    const c = choice[it.id];
    if (it.tipo === 'opcion_unica') return typeof c === 'number' && it.opciones[c] ? (it.opciones[c].pts || 0) : 0;
    if (it.tipo === 'checklist') return (Array.isArray(c) ? c : []).reduce((s, i) => s + (it.opciones[i]?.pts || 0), 0);
    return 0;
  }, [choice]);

  const summary = useMemo(() => {
    let totalAct = 0, totalMax = 0;
    items.forEach((it) => { if (it.scored) { totalMax += it.max; if (touched.has(it.id)) totalAct += itemScore(it); } });
    const pct = totalMax ? Math.round((totalAct / totalMax) * 100) : 0;
    return { totalAct, totalMax, pct, touchedCount: touched.size };
  }, [items, touched, itemScore]);

  const selectSingle = (id, idx) => { setChoice((c) => ({ ...c, [id]: idx })); setTouched((t) => new Set(t).add(id)); };
  const toggleMulti = (id, idx) => {
    setChoice((c) => {
      const cur = Array.isArray(c[id]) ? c[id] : [];
      const next = cur.includes(idx) ? cur.filter((i) => i !== idx) : [...cur, idx];
      return { ...c, [id]: next };
    });
    setTouched((t) => new Set(t).add(id));
  };
  const setText = (id, text) => { setNotes((n) => ({ ...n, [id]: text })); setTouched((t) => new Set(t).add(id)); };
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

  const resetAll = () => {
    if (!window.confirm('¿Reiniciar? Se perderán las respuestas y fotos.')) return;
    clearDraft();
    setChoice({}); setNotes({}); setTouched(new Set()); setPhotos({}); setCursor(0); setPhase('intro'); setHasDraft(false);
    toast.success('Reiniciado');
  };

  const answerLabel = (it) => {
    const c = choice[it.id];
    if (it.tipo === 'opcion_unica') return typeof c === 'number' && it.opciones[c] ? it.opciones[c].label : '';
    if (it.tipo === 'checklist') return (Array.isArray(c) ? c : []).map((i) => it.opciones[i]?.label).filter(Boolean);
    return '';
  };

  const buildRows = () => items.map((it) => ({
    id: it.id, titulo: it.titulo, seccion: it.seccion, scored: it.scored,
    score: touched.has(it.id) ? itemScore(it) : 0, max: it.max,
    respuesta: answerLabel(it), note: (notes[it.id] || '').trim(), photos: photos[it.id] || [],
  }));

  const exportPdf = async () => {
    try {
      await generateCustomFormPdf({
        formTitulo: schema.titulo, meta: { respondent: user?.name, fecha: new Date().toLocaleDateString('es-HN') },
        rows: buildRows(), hasScoring: schema.has_scoring, totalScore: summary.totalAct, totalMax: summary.totalMax,
      });
    } catch (e) { toast.error('No se pudo generar el PDF'); }
  };

  const submit = async () => {
    if (touched.size === 0) { toast.error('Responde al menos una pregunta antes de enviar'); return; }
    setSubmitting(true);
    try {
      const entries = items.filter((it) => touched.has(it.id)).map((it) => ({
        id: it.id,
        respuesta: it.tipo === 'checklist' ? answerLabel(it) : (it.tipo === 'opcion_unica' ? answerLabel(it) : ''),
        score: itemScore(it), note: (notes[it.id] || '').trim(),
      }));
      const fd = new FormData();
      fd.append('data', JSON.stringify({ entries }));
      Object.entries(photos).forEach(([id, list]) => {
        list.forEach((p) => { fd.append('photos', p.blob, p.name || `${id}.jpg`); fd.append('photo_owner', id); });
      });
      await api.post(`/formularios-custom/${schema.id}/respuestas`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Respuesta enviada correctamente');
      clearDraft();
      setChoice({}); setNotes({}); setTouched(new Set()); setPhotos({}); setCursor(0); setPhase('intro'); setHasDraft(false);
      onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo enviar la respuesta');
    } finally { setSubmitting(false); }
  };

  if (STEPS === 0) return <p className="text-sm text-muted-foreground text-center py-10">Este formulario no tiene preguntas.</p>;

  if (phase === 'intro') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="max-w-[520px] mx-auto rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <Avatar className="h-10 w-10 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
          <div><p className="text-sm font-medium text-foreground">{user?.name}</p></div>
        </div>
        <h2 className="font-heading text-xl font-semibold mt-4">{schema.titulo}</h2>
        {schema.descripcion && <p className="text-sm text-muted-foreground mt-1 mb-2">{schema.descripcion}</p>}
        <p className="text-xs text-muted-foreground mb-5">{STEPS} pregunta{STEPS === 1 ? '' : 's'}{schema.has_scoring ? ' · con puntaje' : ''}</p>

        {hasDraft && (
          <div className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2 mb-4">
            <Info className="h-3.5 w-3.5 shrink-0" /> Tienes respuestas guardadas en este dispositivo.
          </div>
        )}

        <Button onClick={() => setPhase('walk')} className="w-full h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="customform-begin-button">
          {hasDraft ? 'Continuar' : 'Comenzar'} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="max-w-[880px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
          <button onClick={() => setPhase('walk')} className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${phase === 'walk' ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>Preguntas</button>
          <button onClick={() => setPhase('resumen')} className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${phase === 'resumen' ? 'bg-[#1e395e] text-white' : 'text-muted-foreground hover:bg-muted'}`}>Resumen</button>
        </div>
        <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reiniciar
        </Button>
      </div>

      {phase === 'walk' && (
        <WalkCard
          it={items[cursor]} cursor={cursor} steps={STEPS} items={items} choice={choice} notes={notes} photos={photos} uploading={uploading}
          onSelectSingle={selectSingle} onToggleMulti={toggleMulti} onSetText={setText} onSetNote={setNote}
          onFiles={handleFiles} onRemovePhoto={removePhoto} onPrev={prev} onNext={next} onGoto={goto}
          onZoom={setZoomSrc} camInputs={camInputs} touched={touched}
        />
      )}
      {phase === 'resumen' && (
        <Resumen schema={schema} summary={summary} onExport={exportPdf} onSubmit={submit} submitting={submitting} />
      )}

      <Dialog open={!!zoomSrc} onOpenChange={(o) => !o && setZoomSrc(null)}>
        <DialogContent className="sm:max-w-[640px] rounded-[22px] p-2">
          {zoomSrc && <img src={zoomSrc} alt="Evidencia ampliada" className="w-full rounded-xl" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WalkCard({ it, cursor, steps, items, choice, notes, photos, uploading, onSelectSingle, onToggleMulti, onSetText, onSetNote, onFiles, onRemovePhoto, onPrev, onNext, onGoto, onZoom, camInputs, touched }) {
  const pics = photos[it.id] || [];
  const busy = uploading === it.id;
  const single = choice[it.id];
  const multi = Array.isArray(choice[it.id]) ? choice[it.id] : [];

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
          {items.map((f, i) => (
            <button key={f.id} onClick={() => onGoto(i)} title={f.titulo} className="h-2 w-2 rounded-full transition-all"
              style={{ background: i === cursor ? '#00a5df' : touched.has(f.id) ? '#1e395e' : 'var(--border)', transform: i === cursor ? 'scale(1.6)' : 'scale(1)' }} />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={cursor} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
          className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6" data-testid="customform-walk-card">
          <h3 className="font-heading text-lg font-semibold leading-snug">{it.titulo}</h3>
          {it.pregunta && <p className="text-sm text-muted-foreground mt-0.5">{it.pregunta}</p>}

          {it.tipo === 'opcion_unica' && (
            <div className="mt-5 space-y-2">
              {it.opciones.map((o, n) => {
                const active = single === n;
                return (
                  <button key={n} type="button" onClick={() => onSelectSingle(it.id, n)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${active ? 'border-[#1e395e] bg-[rgba(30,57,94,0.08)] dark:bg-[rgba(60,190,246,0.12)]' : 'hover:bg-muted/50'}`}>
                    <span className="flex items-center gap-2.5">
                      <span className={`h-4 w-4 rounded-full border-2 shrink-0 grid place-items-center ${active ? 'border-[#00a5df]' : 'border-muted-foreground/40'}`}>
                        {active && <span className="h-2 w-2 rounded-full bg-[#00a5df]" />}
                      </span>
                      {o.label}
                    </span>
                    {it.scored && <span className="text-xs font-bold text-muted-foreground shrink-0">{o.pts} pts</span>}
                  </button>
                );
              })}
            </div>
          )}

          {it.tipo === 'checklist' && (
            <div className="mt-5 space-y-2">
              {it.opciones.map((o, n) => {
                const active = multi.includes(n);
                return (
                  <button key={n} type="button" onClick={() => onToggleMulti(it.id, n)}
                    className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${active ? 'border-[#1e395e] bg-[rgba(30,57,94,0.08)] dark:bg-[rgba(60,190,246,0.12)]' : 'hover:bg-muted/50'}`}>
                    <span className="flex items-center gap-2.5">
                      <span className={`h-4 w-4 rounded-md border-2 shrink-0 grid place-items-center ${active ? 'border-[#00a5df] bg-[#00a5df]' : 'border-muted-foreground/40'}`}>
                        {active && <span className="text-white text-[10px] leading-none">✓</span>}
                      </span>
                      {o.label}
                    </span>
                    {it.scored && <span className="text-xs font-bold text-muted-foreground shrink-0">{o.pts} pts</span>}
                  </button>
                );
              })}
            </div>
          )}

          {it.tipo === 'texto' && (
            <div className="mt-5 space-y-1.5">
              <Textarea rows={4} placeholder="Escribe tu respuesta…" value={notes[it.id] || ''} onChange={(e) => onSetText(it.id, e.target.value)} data-testid="customform-text-answer" />
            </div>
          )}

          {it.tipo !== 'texto' && (
            <div className="mt-4 space-y-1.5">
              <Textarea rows={2} placeholder="Notas (opcional)…" value={notes[it.id] || ''} onChange={(e) => onSetNote(it.id, e.target.value)} />
            </div>
          )}

          {it.permite_foto && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Evidencia fotográfica (opcional)</span>
                <span className="text-xs text-muted-foreground">{pics.length}/{MAX_PHOTOS_PER_ITEM} fotos</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                <input ref={(el) => (camInputs.current[`${it.id}-cam`] = el)} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => { onFiles(it.id, e.target.files); e.target.value = ''; }} />
                <input ref={(el) => (camInputs.current[`${it.id}-lib`] = el)} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { onFiles(it.id, e.target.files); e.target.value = ''; }} />
                <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
                  onClick={() => camInputs.current[`${it.id}-cam`]?.click()}>
                  <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Tomar foto'}
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
                  onClick={() => camInputs.current[`${it.id}-lib`]?.click()}>
                  <Upload className="h-4 w-4 mr-1.5" /> Subir foto
                </Button>
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
        <Button variant="outline" className="rounded-xl" onClick={onPrev} disabled={cursor === 0} data-testid="customform-prev-button">
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <Button onClick={onNext} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="customform-next-button">
          {cursor === steps - 1 ? 'Ver resumen' : 'Siguiente'} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

function Resumen({ schema, summary, onExport, onSubmit, submitting }) {
  const t = tone(summary.pct);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      {schema.has_scoring ? (
        <div className="rounded-[18px] bg-card border shadow-card p-6 text-center mb-4">
          <p className="font-heading text-5xl font-bold" style={{ color: TONE_COLOR[t] }}>{summary.pct}%</p>
          <p className="text-xs text-muted-foreground mt-1">{summary.totalAct} / {summary.totalMax} pts</p>
        </div>
      ) : (
        <div className="rounded-[18px] bg-card border shadow-card p-6 text-center mb-4">
          <p className="text-sm text-muted-foreground">Este formulario no lleva puntaje — solo recopila respuestas.</p>
        </div>
      )}
      <p className="text-sm text-muted-foreground text-center mb-4">{summary.touchedCount} de {schema.items.length} preguntas respondidas</p>

      <div className="flex flex-wrap gap-2 mt-5">
        <Button variant="outline" className="rounded-xl" onClick={onExport} data-testid="customform-export-pdf">
          <FileDown className="h-4 w-4 mr-1.5" /> Exportar PDF
        </Button>
        <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white ml-auto" onClick={onSubmit} disabled={submitting} data-testid="customform-submit-button">
          <Send className="h-4 w-4 mr-1.5" /> {submitting ? 'Enviando…' : 'Enviar respuesta'}
        </Button>
      </div>
    </motion.div>
  );
}
