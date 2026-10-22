import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, Upload, X, Info, Check, Plus, Save, RotateCcw,
  ShieldCheck, ShieldX, ClipboardList, Clock, FileDown, Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  GUARDIAS_SUCURSALES, guardiaTone, GUARDIA_TONE_COLOR, ESTADO_LABEL, computeGuardiaSummary, fmtFechaHora,
} from '@/lib/guardiasSchema';
import { compressImage } from '@/lib/flosPhoto';
import { generateGuardiaPdf } from '@/lib/guardiasPdf';
import { canFillGuardias } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar, avisar } from '@/components/ConfirmDialog';

const DRAFT_KEY = 'herco360_guardias_draft_v1';
const MAX_PHOTOS_PER_ITEM = 6;
const GENERAL = '__general__';

const emptyMeta = () => ({ sucursal: '', guardia: '' });

function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

// Botones grandes de sucursal: más rápido que un desplegable para 4 opciones.
export function SucursalPicker({ value, onChange, testid = 'guardias-sucursal' }) {
  return (
    <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Sucursal">
      {GUARDIAS_SUCURSALES.map((s) => {
        const active = value === s;
        return (
          <button key={s} type="button" role="radio" aria-checked={active} onClick={() => onChange(s)} data-testid={`${testid}-${s}`}
            className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
              active ? 'bg-[#1e395e] border-[#1e395e] text-white' : 'hover:bg-muted text-foreground'
            }`}>
            {s}
          </button>
        );
      })}
    </div>
  );
}

// Cumple / No cumple, reutilizado también en el editor del administrador.
export function CumpleToggle({ value, onChange, testid }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => onChange('cumple')} data-testid={`${testid}-cumple`}
        className={`h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
          value === 'cumple' ? 'bg-[#16a34a] border-[#16a34a] text-white' : 'hover:bg-[rgba(22,163,74,0.08)] text-[#16a34a]'
        }`}>
        <ShieldCheck className="h-4 w-4" /> Cumple
      </button>
      <button type="button" onClick={() => onChange('no_cumple')} data-testid={`${testid}-no-cumple`}
        className={`h-12 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
          value === 'no_cumple' ? 'bg-[#dc2626] border-[#dc2626] text-white' : 'hover:bg-[rgba(220,38,38,0.08)] text-[#dc2626]'
        }`}>
        <ShieldX className="h-4 w-4" /> No cumple
      </button>
    </div>
  );
}

export default function GuardiaWizard({ onSubmitted }) {
  const { user } = useAuth();
  const [criterios, setCriterios] = useState(null); // de GET /guardias/criterios
  const [loadError, setLoadError] = useState(false);
  const [phase, setPhase] = useState('intro'); // intro | walk | resultado (solo después de guardar)
  const [meta, setMeta] = useState(emptyMeta());
  const [answers, setAnswers] = useState({}); // id -> 'cumple' | 'no_cumple'
  const [descripciones, setDescripciones] = useState({});
  const [observaciones, setObservaciones] = useState('');
  const [acciones, setAcciones] = useState('');
  const [photos, setPhotos] = useState({});
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [saved, setSaved] = useState(null); // la evaluación que devolvió el servidor
  const [now, setNow] = useState(() => new Date().toISOString());
  const camInputs = useRef({});

  const canFill = canFillGuardias(user);
  const CLOSER = criterios ? criterios.length : 0; // último paso: observaciones y acciones
  const STEPS = CLOSER + 1;

  useEffect(() => {
    api.get('/guardias/criterios').then(({ data }) => setCriterios(data.criterios || []))
      .catch(() => setLoadError(true));
  }, []);

  // Reloj de la pantalla de inicio (la hora real la pone el servidor al guardar).
  useEffect(() => {
    if (phase !== 'intro') return undefined;
    const t = setInterval(() => setNow(new Date().toISOString()), 30000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Borrador: solo campos livianos (las fotos no se guardan). ──
  useEffect(() => {
    const d = loadDraft();
    if (d && Object.keys(d.answers || {}).length) {
      setMeta({ ...emptyMeta(), ...(d.meta || {}) });
      setAnswers(d.answers || {});
      setDescripciones(d.descripciones || {});
      setObservaciones(d.observaciones || '');
      setAcciones(d.acciones || '');
      setCursor(d.cursor || 0);
      setHasDraft(true);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'walk') return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, answers, descripciones, observaciones, acciones, cursor })); }
      catch (e) { /* localStorage lleno: se pierde el borrador, no rompe la app */ }
    }, 400);
    return () => clearTimeout(t);
  }, [phase, meta, answers, descripciones, observaciones, acciones, cursor]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };

  const summary = useMemo(() => computeGuardiaSummary(criterios, answers), [criterios, answers]);

  const goto = (i) => setCursor(Math.max(0, Math.min(STEPS - 1, i)));
  const prev = () => goto(cursor - 1);

  const answer = (id, value) => setAnswers((a) => ({ ...a, [id]: value }));
  const setDescripcion = (id, text) => setDescripciones((d) => ({ ...d, [id]: text }));

  const handleFiles = async (id, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = MAX_PHOTOS_PER_ITEM - (photos[id] || []).length;
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

  const beginWalk = () => {
    if (!meta.sucursal) { toast.error('Selecciona la sucursal'); return; }
    if (!meta.guardia.trim()) { toast.error('Escribe el nombre del guardia'); return; }
    setPhase('walk');
  };

  const resetForm = () => {
    clearDraft();
    setMeta(emptyMeta()); setAnswers({}); setDescripciones({}); setObservaciones(''); setAcciones('');
    setPhotos({}); setCursor(0); setHasDraft(false);
  };

  const resetAll = async () => {
    if (!(await confirmar({
      tipo: 'danger', titulo: '¿Reiniciar la evaluación?',
      mensaje: <>Se borrarán <b>las respuestas, notas y fotos</b> capturadas. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Reiniciar',
    }))) return;
    resetForm(); setPhase('intro');
    avisar('Evaluación reiniciada');
  };

  const submit = async () => {
    const faltante = criterios.findIndex((c) => !answers[c.id]);
    if (faltante >= 0) {
      const n = criterios.filter((c) => !answers[c.id]).length;
      toast.error(n === 1 ? 'Falta 1 criterio por responder' : `Faltan ${n} criterios por responder`);
      goto(faltante);
      return;
    }
    setSubmitting(true);
    try {
      const entries = criterios.map((c) => ({
        id: c.id, respuesta: answers[c.id],
        descripcion: answers[c.id] === 'no_cumple' ? (descripciones[c.id] || '').trim() : '',
      }));
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        sucursal: meta.sucursal, guardia: meta.guardia.trim(), entries,
        observaciones: observaciones.trim(), acciones: acciones.trim(),
      }));
      Object.entries(photos).forEach(([id, list]) => {
        list.forEach((p) => { fd.append('photos', p.blob, p.name || `${id}.jpg`); fd.append('photo_owner', id); });
      });
      const { data } = await api.post('/guardias/evaluaciones', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Evaluación guardada correctamente');
      setSaved(data);
      resetForm();
      setPhase('resultado');
      onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar la evaluación');
    } finally { setSubmitting(false); }
  };

  const next = () => (cursor < STEPS - 1 ? goto(cursor + 1) : submit());

  if (!canFill) {
    return (
      <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Solo los coordinadores ECCP pueden registrar evaluaciones. Tú puedes consultar el historial.</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No se pudo cargar el formulario. Intenta de nuevo más tarde.</p>
      </div>
    );
  }
  if (!criterios) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  if (phase === 'resultado' && saved) {
    return (
      <div className="max-w-[880px] mx-auto">
        <Resultado evalDoc={saved} onNew={() => { setSaved(null); setPhase('intro'); }} />
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="max-w-[520px] mx-auto rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <Avatar className="h-10 w-10 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
          <div><p className="text-sm font-medium text-foreground">{user?.name}</p><p className="text-xs text-muted-foreground">Evaluador ECCP</p></div>
        </div>
        <h2 className="font-heading text-xl font-semibold mt-4">Nueva revisión de guardia</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-5">{criterios.length} criterios · Cumple / No cumple</p>

        {hasDraft && (
          <div className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2 mb-4">
            <Info className="h-3.5 w-3.5 shrink-0" /> Tienes una evaluación en curso guardada en este dispositivo.
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Sucursal</Label>
            <SucursalPicker value={meta.sucursal} onChange={(v) => setMeta((m) => ({ ...m, sucursal: v }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guardia-nombre">Nombre del guardia</Label>
            <Input id="guardia-nombre" value={meta.guardia} onChange={(e) => setMeta((m) => ({ ...m, guardia: e.target.value }))}
              placeholder="Nombre completo" className="h-11" autoComplete="off" data-testid="guardias-nombre-input" />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" /> {fmtFechaHora(now)} · la fecha y hora se registran al guardar
          </p>
        </div>

        <div className="mt-6">
          <Button onClick={beginWalk} className="w-full h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="guardias-begin-button">
            {hasDraft ? 'Continuar evaluación' : 'Comenzar evaluación'} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="max-w-[880px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground min-w-0 truncate">
          <b className="text-foreground">{meta.sucursal}</b> · {meta.guardia}
        </p>
        <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground shrink-0" data-testid="guardias-reset-button">
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reiniciar
        </Button>
      </div>

      <WalkCard
        criterios={criterios} cursor={cursor} closer={CLOSER} steps={STEPS} summary={summary}
        answers={answers} descripciones={descripciones} photos={photos} uploading={uploading} submitting={submitting}
        observaciones={observaciones} setObservaciones={setObservaciones} acciones={acciones} setAcciones={setAcciones}
        onAnswer={answer} onDescripcion={setDescripcion} onFiles={handleFiles} onRemovePhoto={removePhoto}
        onPrev={prev} onNext={next} onGoto={goto} onZoom={setZoomSrc} camInputs={camInputs}
      />

      <PhotoZoomDialog open={!!zoomSrc} onClose={() => setZoomSrc(null)}>
        {zoomSrc && <img src={zoomSrc} alt="Evidencia ampliada" className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}

/* ───────────────────── Recorrido (paso a paso) ─────────── */
function WalkCard({
  criterios, cursor, closer, steps, summary, answers, descripciones, photos, uploading, submitting,
  observaciones, setObservaciones, acciones, setAcciones,
  onAnswer, onDescripcion, onFiles, onRemovePhoto, onPrev, onNext, onGoto, onZoom, camInputs,
}) {
  const isCloser = cursor === closer;
  const c = isCloser ? null : criterios[cursor];
  const photoKey = isCloser ? GENERAL : c.id;

  return (
    <div>
      {/* progreso: criterios respondidos */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground mb-1.5">
          <span className="shrink-0">{isCloser ? 'Observaciones y acciones' : `Criterio ${cursor + 1} de ${closer}`}</span>
          <span className="shrink-0">{summary.respondidos}/{summary.total} respondidos</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-[#00a5df] transition-all" style={{ width: `${(summary.respondidos / (summary.total || 1)) * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {criterios.map((f, i) => {
            const a = answers[f.id];
            const bg = i === cursor ? '#00a5df' : a === 'cumple' ? '#16a34a' : a === 'no_cumple' ? '#dc2626' : 'var(--border)';
            return (
              <button key={f.id} onClick={() => onGoto(i)} title={f.titulo} aria-label={`Criterio ${i + 1}`}
                className="h-2 w-2 rounded-full transition-all" style={{ background: bg, transform: i === cursor ? 'scale(1.6)' : 'scale(1)' }} />
            );
          })}
          <button onClick={() => onGoto(closer)} title="Observaciones y acciones" aria-label="Observaciones y acciones"
            className="h-2 w-2 rounded-sm transition-all"
            style={{ background: isCloser ? '#00a5df' : 'var(--border)', transform: isCloser ? 'scale(1.6)' : 'scale(1)' }} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={cursor} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}
          className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6" data-testid="guardias-walk-card">
          {isCloser ? (
            <>
              <h3 className="font-heading text-lg font-semibold leading-snug flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#00a5df]" /> Observaciones y acciones correctivas
              </h3>
              <div className="mt-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Observaciones generales</Label>
                  <Textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Lo que observaste durante la revisión (opcional)…" data-testid="guardias-observaciones" />
                </div>
                <div className="space-y-1.5">
                  <Label>Acciones correctivas</Label>
                  <Textarea rows={3} value={acciones} onChange={(e) => setAcciones(e.target.value)} placeholder="Qué se acordó o se debe corregir (opcional)…" data-testid="guardias-acciones" />
                </div>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-heading text-lg font-semibold leading-snug">{c.titulo}</h3>
              <div className="mt-5">
                <CumpleToggle value={answers[c.id]} onChange={(v) => onAnswer(c.id, v)} testid="guardias-option" />
              </div>
              {answers[c.id] === 'no_cumple' && (
                <div className="mt-4 space-y-1.5">
                  <Label>Describe el incumplimiento</Label>
                  <Textarea rows={2} value={descripciones[c.id] || ''} onChange={(e) => onDescripcion(c.id, e.target.value)}
                    placeholder="Qué se observó…" data-testid="guardias-descripcion" />
                </div>
              )}
            </>
          )}

          <PhotoField id={photoKey} pics={photos[photoKey] || []} busy={uploading === photoKey}
            onFiles={onFiles} onRemove={onRemovePhoto} onZoom={onZoom} camInputs={camInputs} />
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-4 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={onPrev} disabled={cursor === 0} data-testid="guardias-prev-button">
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        {isCloser ? (
          <Button onClick={onNext} disabled={submitting} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="guardias-submit-button">
            <Save className="h-4 w-4 mr-1.5" /> {submitting ? 'Guardando…' : 'Guardar evaluación'}
          </Button>
        ) : (
          <Button onClick={onNext} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="guardias-next-button">
            Siguiente <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}

function PhotoField({ id, pics, busy, onFiles, onRemove, onZoom, camInputs }) {
  return (
    <div className="mt-5 pt-4 border-t space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">Fotografías de evidencia (opcional)</p>
      <div className="flex flex-wrap gap-2">
        <input ref={(el) => (camInputs.current[`${id}-cam`] = el)} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { onFiles(id, e.target.files); e.target.value = ''; }} />
        <input ref={(el) => (camInputs.current[`${id}-lib`] = el)} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { onFiles(id, e.target.files); e.target.value = ''; }} />
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
          onClick={() => camInputs.current[`${id}-cam`]?.click()} data-testid="guardias-photo-camera">
          <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Tomar foto'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={busy || pics.length >= MAX_PHOTOS_PER_ITEM}
          onClick={() => camInputs.current[`${id}-lib`]?.click()} data-testid="guardias-photo-upload">
          <Upload className="h-4 w-4 mr-1.5" /> Subir foto
        </Button>
        <span className="text-xs text-muted-foreground self-center">{pics.length}/{MAX_PHOTOS_PER_ITEM} fotos</span>
      </div>
      {pics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pics.map((p) => (
            <div key={p.localId} className="relative h-20 w-20 rounded-lg overflow-hidden border">
              <img src={p.dataUrl} alt="Evidencia" className="h-full w-full object-cover cursor-pointer" onClick={() => onZoom(p.dataUrl)} />
              <button onClick={() => onRemove(id, p.localId)} aria-label="Quitar foto"
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/65 text-white grid place-items-center text-xs">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Resultado (después de guardar) ─────────── */
export function ResultadoStats({ evalDoc }) {
  const t = guardiaTone(evalDoc.percent);
  const color = GUARDIA_TONE_COLOR[t];
  const tiles = [
    { label: 'Criterios evaluados', value: evalDoc.total_criterios, color: '#1e395e' },
    { label: 'Cumplidos', value: evalDoc.cumplidos, color: '#16a34a' },
    { label: 'Incumplidos', value: evalDoc.incumplidos, color: '#dc2626' },
    { label: 'Cumplimiento', value: `${evalDoc.percent}%`, color },
  ];
  return (
    <>
      <div className="rounded-[18px] bg-card border shadow-card p-6 text-center mb-4">
        <span className="inline-block h-3.5 w-3.5 rounded-full mb-2" style={{ background: color, boxShadow: `0 0 0 6px ${color}26` }} />
        <p className="font-heading text-5xl font-bold" style={{ color }}>{evalDoc.percent}%</p>
        <p className="text-sm font-semibold mt-1" style={{ color }}>{ESTADO_LABEL[evalDoc.estado] || '—'}</p>
        <p className="text-xs text-muted-foreground mt-1">{evalDoc.sucursal} · {evalDoc.guardia} · {fmtFechaHora(evalDoc.created_at)}</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-[16px] bg-card border shadow-card p-4">
            <p className="text-xs text-muted-foreground">{x.label}</p>
            <p className="font-heading text-2xl font-semibold mt-0.5" style={{ color: x.color }}>{x.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}

export function PdfButton({ evalDoc, className = '', testid = 'guardias-pdf-button' }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await generateGuardiaPdf(evalDoc); }
    catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setBusy(false); }
  };
  return (
    <Button variant="outline" className={`rounded-xl ${className}`} onClick={run} disabled={busy} data-testid={testid}>
      {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileDown className="h-4 w-4 mr-1.5" />}
      {busy ? 'Generando…' : 'Descargar PDF'}
    </Button>
  );
}

function Resultado({ evalDoc, onNew }) {
  const incumplidos = (evalDoc.entries || []).filter((e) => e.respuesta === 'no_cumple');
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="flex items-center gap-2 rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] text-sm font-medium px-3 py-2 mb-4" data-testid="guardias-saved-banner">
        <Check className="h-4 w-4 shrink-0" /> Evaluación guardada. Este es el resultado.
      </div>
      <ResultadoStats evalDoc={evalDoc} />

      {incumplidos.length > 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-5">
          <h3 className="font-heading font-semibold mb-3">Criterios incumplidos</h3>
          <div className="space-y-2">
            {incumplidos.map((e) => (
              <div key={e.id} className="rounded-xl border p-3">
                <p className="text-sm font-medium flex items-start gap-2"><ShieldX className="h-4 w-4 text-[#dc2626] shrink-0 mt-0.5" />{e.titulo}</p>
                {e.descripcion && <p className="text-xs text-muted-foreground italic mt-1 ml-6 break-words">"{e.descripcion}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        <PdfButton evalDoc={evalDoc} />
        <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white ml-auto" onClick={onNew} data-testid="guardias-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> Nueva evaluación
        </Button>
      </div>
    </motion.div>
  );
}
