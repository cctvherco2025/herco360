import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, Upload, X, Info, Check, Plus, RotateCcw, Clock, FileDown, Loader2,
  CheckCircle2, CircleDollarSign, Tag, TagsIcon, ScanLine, Flag,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  ETQ_SUCURSALES, ETQ_DEPARTAMENTOS, ETQ_RESULTADOS, RESULTADO, DEFAULT_ETQ_CONFIG, etqTone, ETQ_TONE_COLOR,
  ETQ_TONE_LABEL, isoWeek, semanaLabel, fmtL, fmtFechaAud,
} from '@/lib/etiquetasSchema';
import { generateAuditoriaEtiquetasPdf } from '@/lib/etiquetasPdf';
import { idbGet, idbSet, idbDel } from '@/lib/idbDraft';
import { compressImage } from '@/lib/flosPhoto';
import { canFillEtiquetas } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar, avisar } from '@/components/ConfirmDialog';
import { ChipPicker } from '@/components/recorridos/RecorridoWizard';

const DRAFT_KEY = 'herco360_etiquetas_draft_v1';
const PHOTOS_KEY = 'etiquetas_photos_v1';
const MAX_PHOTOS = 4; // por espacio
// Dos espacios de fotos por etiqueta, como el Excel que se llenaba a mano:
// photos[key] = la etiqueta en el anaquel; photos[SIS(key)] = captura del
// precio en el sistema (portal.herco.hn) o evidencia adicional.
export const SIS = (key) => `${key}|sistema`;
const RES_ICON = { correcta: CheckCircle2, precio_incorrecto: CircleDollarSign, sin_etiqueta: Tag, deteriorada: ScanLine };

const nuevaEtiqueta = (i) => ({
  key: `e${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  resultado: '', precio_exhibido: '', precio_sistema: '', observaciones: '',
});

function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));
export const diferencia = (e) => {
  const a = num(e.precio_exhibido), b = num(e.precio_sistema);
  return a == null || b == null ? null : Math.round((a - b) * 100) / 100;
};

// Qué le falta a una etiqueta (vacío = completa).
export function faltantesEtiqueta(e, nFotos, nSistema) {
  const f = [];
  if (!e.resultado) f.push('resultado');
  if (e.resultado === 'precio_incorrecto') {
    if (num(e.precio_exhibido) == null) f.push('precio exhibido');
    if (num(e.precio_sistema) == null) f.push('precio del sistema');
  }
  if (nFotos != null && !nFotos) f.push('foto de la etiqueta');
  if (e.resultado === 'precio_incorrecto' && nSistema != null && !nSistema) f.push('captura del sistema');
  return f;
}

export function contarResultados(etiquetas) {
  const c = Object.fromEntries(ETQ_RESULTADOS.map((r) => [r.k, etiquetas.filter((e) => e.resultado === r.k).length]));
  const total = etiquetas.length;
  return {
    total, correctas: c.correcta, precio_incorrecto: c.precio_incorrecto, sin_etiqueta: c.sin_etiqueta,
    deterioradas: c.deteriorada, irregularidades: total - c.correcta,
    cumplimiento: total ? Math.round((c.correcta / total) * 1000) / 10 : 0,
  };
}

// Selector de resultado: 4 botones grandes.
export function ResultadoPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Resultado de la verificación">
      {ETQ_RESULTADOS.map((r) => {
        const active = value === r.k;
        const Icon = RES_ICON[r.k];
        return (
          <button key={r.k} type="button" role="radio" aria-checked={active} onClick={() => onChange(r.k)} data-testid={`etiquetas-res-${r.k}`}
            className="min-h-[56px] rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-2 text-left transition-colors"
            style={active ? { background: r.color, borderColor: r.color, color: '#fff' } : { color: r.color }}>
            <Icon className="h-5 w-5 shrink-0" />
            <span className="leading-tight">{r.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function EtiquetaPdfButton({ aud, cfg, className = '', testid = 'etiquetas-pdf-button' }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await generateAuditoriaEtiquetasPdf(aud, cfg); }
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

export function useEtiquetasConfig() {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState(false);
  const reload = () => api.get('/etiquetas/config').then(({ data }) => setCfg({ ...DEFAULT_ETQ_CONFIG, ...data })).catch(() => setError(true));
  useEffect(() => { reload(); }, []);
  return { cfg, error, reload };
}

export default function EtiquetasWizard({ cfg, onSubmitted }) {
  const { user } = useAuth();
  const [step, setStep] = useState('inicio'); // inicio | etiquetas | resumen | guardado
  const [sucursal, setSucursal] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [etiquetas, setEtiquetas] = useState([]);
  const [photos, setPhotos] = useState({}); // key -> [{ localId, blob, dataUrl, name }]
  const [cursor, setCursor] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [saved, setSaved] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const loaded = useRef(false);
  const camInputs = useRef({});

  const canFill = canFillEtiquetas(user);
  const N = cfg?.cantidad || DEFAULT_ETQ_CONFIG.cantidad;
  const semana = isoWeek(now);

  useEffect(() => {
    if (step !== 'inicio') return undefined;
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, [step]);

  // ── Borrador: textos en localStorage y fotos en IndexedDB ──
  useEffect(() => {
    (async () => {
      const d = loadDraft();
      if (d && (d.sucursal || (d.etiquetas || []).some((e) => e.resultado))) {
        setSucursal(d.sucursal || ''); setDepartamento(d.departamento || '');
        setEtiquetas(d.etiquetas || []); setCursor(d.cursor || 0);
        const ph = await idbGet(PHOTOS_KEY);
        if (ph && typeof ph === 'object') setPhotos(ph);
        setHasDraft(true);
      }
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current || step === 'guardado' || !etiquetas.length) return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ sucursal, departamento, etiquetas, cursor })); }
      catch (e) { /* localStorage lleno */ }
    }, 400);
    return () => clearTimeout(t);
  }, [step, sucursal, departamento, etiquetas, cursor]);

  useEffect(() => {
    if (!loaded.current || step === 'guardado') return undefined;
    const t = setTimeout(() => { idbSet(PHOTOS_KEY, photos); }, 500);
    return () => clearTimeout(t);
  }, [photos, step]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} idbDel(PHOTOS_KEY); };

  const resetForm = () => {
    clearDraft();
    setSucursal(''); setDepartamento(''); setEtiquetas([]); setPhotos({}); setCursor(0); setHasDraft(false);
  };
  const resetAll = async () => {
    if (!(await confirmar({
      tipo: 'danger', titulo: '¿Descartar la auditoría?',
      mensaje: <>Se borrarán <b>todas las etiquetas y fotos</b> capturadas. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Descartar',
    }))) return;
    resetForm(); setStep('inicio');
    avisar('Auditoría descartada');
  };

  const falta = (e) => faltantesEtiqueta(e, (photos[e.key] || []).length, (photos[SIS(e.key)] || []).length);
  const revisadas = etiquetas.filter((e) => !falta(e).length).length;
  const conteo = useMemo(() => contarResultados(etiquetas.filter((e) => e.resultado)), [etiquetas]);

  const setEtq = (i, patch) => setEtiquetas((list) => list.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  const handleFiles = async (key, fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const room = MAX_PHOTOS - (photos[key] || []).length;
    if (room <= 0) { toast.error(`Ya adjuntaste el máximo de ${MAX_PHOTOS} fotos`); return; }
    const toProcess = files.slice(0, room);
    if (files.length > toProcess.length) toast.warning(`Solo se agregaron ${toProcess.length}: el máximo es ${MAX_PHOTOS} fotos`);
    setUploading(key);
    try {
      for (const file of toProcess) {
        const { blob, dataUrl } = await compressImage(file);
        setPhotos((p) => ({ ...p, [key]: [...(p[key] || []), { localId: `${Date.now()}-${Math.random()}`, blob, dataUrl, name: file.name }] }));
      }
    } catch (e) { toast.error('No se pudo procesar una de las fotos'); }
    finally { setUploading(null); }
  };
  const removePhoto = (key, localId) => setPhotos((p) => ({ ...p, [key]: (p[key] || []).filter((ph) => ph.localId !== localId) }));

  const comenzar = () => {
    if (!sucursal) { toast.error('Selecciona la sucursal'); return; }
    if (!departamento) { toast.error('Selecciona el departamento'); return; }
    // ajusta a la cantidad configurada (sin perder lo ya capturado)
    setEtiquetas((list) => (list.length >= N ? list : [...list, ...Array.from({ length: N - list.length }, (_, i) => nuevaEtiqueta(list.length + i))]));
    setStep('etiquetas');
  };

  const validarActual = () => {
    const e = etiquetas[cursor];
    const f = falta(e);
    if (f.length) { toast.error(`Etiqueta ${cursor + 1}: falta ${f.join(', ')}`); return false; }
    return true;
  };
  const siguiente = () => { if (validarActual()) setCursor((c) => Math.min(c + 1, etiquetas.length - 1)); };
  const irResumen = () => {
    if (!validarActual()) return;
    const i = etiquetas.findIndex((e) => falta(e).length);
    if (i >= 0) {
      toast.error(`La etiqueta ${i + 1} está incompleta: falta ${falta(etiquetas[i]).join(', ')}`);
      setCursor(i);
      return;
    }
    setStep('resumen');
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        sucursal, departamento,
        etiquetas: etiquetas.map((e) => ({
          key: e.key, resultado: e.resultado,
          precio_exhibido: e.resultado === 'precio_incorrecto' ? num(e.precio_exhibido) : null,
          precio_sistema: e.resultado === 'precio_incorrecto' ? num(e.precio_sistema) : null,
          observaciones: e.resultado !== 'correcta' ? e.observaciones.trim() : '',
        })),
      }));
      etiquetas.forEach((e) => {
        (photos[e.key] || []).forEach((p) => {
          fd.append('photos', p.blob, p.name || `${e.key}.jpg`); fd.append('photo_owner', `${e.key}|etiqueta`);
        });
        if (e.resultado === 'correcta') return;
        (photos[SIS(e.key)] || []).forEach((p) => {
          fd.append('photos', p.blob, p.name || `${e.key}-sistema.jpg`); fd.append('photo_owner', `${e.key}|sistema`);
        });
      });
      const { data } = await api.post('/etiquetas/auditorias', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Auditoría finalizada y guardada');
      setSaved(data);
      resetForm();
      setStep('guardado');
      onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar la auditoría');
    } finally { setSubmitting(false); }
  };

  if (!canFill) {
    return (
      <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Solo los coordinadores ECCP pueden registrar auditorías de etiquetas. Tú puedes consultar el historial.</p>
      </div>
    );
  }
  if (!cfg) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  if (step === 'guardado' && saved) {
    return <Guardado aud={saved} cfg={cfg} onNew={() => { setSaved(null); setStep('inicio'); }} />;
  }

  if (step === 'inicio') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="max-w-[560px] mx-auto rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <Avatar className="h-10 w-10 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
          <div><p className="text-sm font-medium text-foreground">{user?.name}</p><p className="text-xs text-muted-foreground">Coordinador responsable</p></div>
        </div>
        <h2 className="font-heading text-xl font-semibold mt-4">Nueva auditoría de etiquetas</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-5">{N} etiquetas de precio · {semanaLabel(semana.id)}</p>
        {hasDraft && (
          <div className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2 mb-4">
            <Info className="h-3.5 w-3.5 shrink-0" /> Tienes una auditoría en curso guardada en este dispositivo ({revisadas} de {etiquetas.length} etiquetas).
          </div>
        )}
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Sucursal</Label><ChipPicker options={ETQ_SUCURSALES} value={sucursal} onChange={setSucursal} testid="etiquetas-sucursal" /></div>
          <div className="space-y-1.5"><Label>Departamento</Label><ChipPicker options={ETQ_DEPARTAMENTOS} value={departamento} onChange={setDepartamento} cols="grid-cols-2 sm:grid-cols-3" testid="etiquetas-departamento" /></div>
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Fecha y hora</p><p className="font-medium">{fmtFechaAud({ fecha_local: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`, hora_local: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` })}</p></div>
            <div><p className="text-xs text-muted-foreground">Semana</p><p className="font-medium">{semana.num} de {semana.anio}</p></div>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5 shrink-0" /> La fecha, hora y semana definitivas se registran al finalizar.</p>
        </div>
        <Button onClick={comenzar} className="w-full h-11 mt-6 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="etiquetas-begin-button">
          {hasDraft ? 'Continuar auditoría' : 'Comenzar auditoría'} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </motion.div>
    );
  }

  if (step === 'resumen') {
    return (
      <Resumen
        user={user} sucursal={sucursal} departamento={departamento} semana={semana} etiquetas={etiquetas} photos={photos}
        conteo={conteo} cfg={cfg} submitting={submitting}
        onEdit={(i) => { setCursor(i); setStep('etiquetas'); }} onBack={() => setStep('etiquetas')} onSubmit={submit}
      />
    );
  }

  // ── Registro de etiquetas ──
  const e = etiquetas[cursor];
  const esUltima = cursor === etiquetas.length - 1;
  const dif = diferencia(e);
  const irregular = e.resultado && e.resultado !== 'correcta';

  return (
    <div className="max-w-[760px] mx-auto">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground min-w-0 truncate"><b className="text-foreground">{sucursal}</b> · {departamento}</p>
        <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground shrink-0" data-testid="etiquetas-reset-button">
          <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Descartar</span>
        </Button>
      </div>

      {/* progreso */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
          <span className="font-semibold" data-testid="etiquetas-contador">Etiquetas revisadas: {revisadas} de {etiquetas.length}</span>
          <span className="text-xs text-muted-foreground">{Math.round((revisadas / etiquetas.length) * 100)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-[#00a5df] transition-all" style={{ width: `${(revisadas / etiquetas.length) * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {etiquetas.map((x, i) => {
            const completa = !falta(x).length;
            const bg = completa ? (RESULTADO[x.resultado]?.color || '#1e395e') : 'transparent';
            return (
              <button key={x.key} onClick={() => setCursor(i)} aria-label={`Etiqueta ${i + 1}`} title={`Etiqueta ${i + 1}${x.resultado ? ` · ${RESULTADO[x.resultado].corto}` : ''}`}
                className={`h-7 min-w-7 px-1 rounded-lg text-[11px] font-semibold border transition-colors ${i === cursor ? 'ring-2 ring-[#00a5df] ring-offset-1 ring-offset-background' : ''}`}
                style={{ background: bg, borderColor: completa ? bg : 'hsl(var(--border))', color: completa ? '#fff' : undefined }}>
                {i + 1}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={e.key} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}
          className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6" data-testid="etiquetas-card">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-8 min-w-8 px-2 rounded-lg bg-[#1e395e] text-white text-sm font-bold grid place-items-center">{cursor + 1}</span>
            <h3 className="font-heading text-lg font-semibold">Etiqueta {cursor + 1} de {etiquetas.length}</h3>
          </div>

          <div className="space-y-2">
            <Label>¿La etiqueta de precio está correcta? <span className="text-[#dc2626]">*</span></Label>
            <ResultadoPicker value={e.resultado} onChange={(v) => setEtq(cursor, { resultado: v })} />
          </div>

          {e.resultado === 'precio_incorrecto' && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="etq-exh">Precio exhibido (L) <span className="text-[#dc2626]">*</span></Label>
                <Input id="etq-exh" type="number" inputMode="decimal" min="0" step="0.01" value={e.precio_exhibido}
                  onChange={(ev) => setEtq(cursor, { precio_exhibido: ev.target.value })} className="h-11" placeholder="0.00" data-testid="etiquetas-precio-exhibido" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="etq-sis">Precio en sistema (L) <span className="text-[#dc2626]">*</span></Label>
                <Input id="etq-sis" type="number" inputMode="decimal" min="0" step="0.01" value={e.precio_sistema}
                  onChange={(ev) => setEtq(cursor, { precio_sistema: ev.target.value })} className="h-11" placeholder="0.00" data-testid="etiquetas-precio-sistema" />
              </div>
              <div className="col-span-2 sm:col-span-1 rounded-xl border px-3 py-2 flex flex-col justify-center" data-testid="etiquetas-diferencia">
                <p className="text-xs text-muted-foreground">Diferencia</p>
                <p className={`font-heading text-lg font-semibold ${dif == null ? 'text-muted-foreground' : dif === 0 ? 'text-foreground' : 'text-[#dc2626]'}`}>
                  {dif == null ? '—' : fmtL(dif, { signo: true })}
                </p>
              </div>
            </div>
          )}

          {irregular && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="etq-obs">Observaciones</Label>
              <Textarea id="etq-obs" rows={2} value={e.observaciones} onChange={(ev) => setEtq(cursor, { observaciones: ev.target.value })} placeholder="Qué se encontró…" />
            </div>
          )}

          <PhotoSlot slot={e.key} titulo="Foto de la etiqueta" requerido
            ayuda="La etiqueta de precio en el anaquel."
            pics={photos[e.key] || []} busy={uploading === e.key} camInputs={camInputs}
            onFiles={handleFiles} onRemove={removePhoto} onZoom={setZoomSrc} testid="etiquetas-photo" />
          {irregular && (
            <PhotoSlot slot={SIS(e.key)}
              titulo={e.resultado === 'precio_incorrecto' ? 'Captura del precio en el sistema' : 'Evidencia adicional'}
              requerido={e.resultado === 'precio_incorrecto'}
              ayuda={e.resultado === 'precio_incorrecto'
                ? 'Captura de pantalla de portal.herco.hn con el precio registrado (súbela desde la galería).'
                : 'Opcional: otra foto que muestre la irregularidad.'}
              pics={photos[SIS(e.key)] || []} busy={uploading === SIS(e.key)} camInputs={camInputs}
              onFiles={handleFiles} onRemove={removePhoto} onZoom={setZoomSrc} testid="etiquetas-sistema" />
          )}
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-4 gap-2">
        <Button variant="outline" className="rounded-xl h-11" onClick={() => (cursor === 0 ? setStep('inicio') : setCursor(cursor - 1))} data-testid="etiquetas-prev-button">
          <ChevronLeft className="h-4 w-4 mr-1" /> {cursor === 0 ? 'Datos' : 'Anterior'}
        </Button>
        {esUltima ? (
          <Button onClick={irResumen} className="rounded-xl h-11 bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="etiquetas-to-resumen">
            <Flag className="h-4 w-4 mr-1.5" /> Revisar resumen
          </Button>
        ) : (
          <Button onClick={siguiente} className="rounded-xl h-11 bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="etiquetas-next-button">
            <Plus className="h-4 w-4 mr-1.5" /> Revisar siguiente etiqueta
          </Button>
        )}
      </div>

      <PhotoZoomDialog open={!!zoomSrc} onClose={() => setZoomSrc(null)}>
        {zoomSrc && <img src={zoomSrc} alt="Etiqueta ampliada" className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}

/* ───────────────────── Espacio de fotos ───────────────── */
function PhotoSlot({ slot, titulo, ayuda, requerido, pics, busy, camInputs, onFiles, onRemove, onZoom, testid }) {
  return (
    <div className="mt-5 pt-4 border-t space-y-2">
      <div>
        <p className="text-sm font-semibold">{titulo} {requerido
          ? <span className="text-[#dc2626]">*</span>
          : <span className="text-xs font-normal text-muted-foreground">(opcional)</span>}</p>
        {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={(el) => (camInputs.current[`${slot}-cam`] = el)} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(ev) => { onFiles(slot, ev.target.files); ev.target.value = ''; }} />
        <input ref={(el) => (camInputs.current[`${slot}-lib`] = el)} type="file" accept="image/*" multiple className="hidden"
          onChange={(ev) => { onFiles(slot, ev.target.files); ev.target.value = ''; }} />
        <Button type="button" variant="outline" className="rounded-xl h-11" disabled={busy || pics.length >= MAX_PHOTOS}
          onClick={() => camInputs.current[`${slot}-cam`]?.click()} data-testid={`${testid}-camera`}>
          <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Tomar foto'}
        </Button>
        <Button type="button" variant="outline" className="rounded-xl h-11" disabled={busy || pics.length >= MAX_PHOTOS}
          onClick={() => camInputs.current[`${slot}-lib`]?.click()} data-testid={`${testid}-upload`}>
          <Upload className="h-4 w-4 mr-1.5" /> Galería
        </Button>
        <span className="text-xs text-muted-foreground self-center">{pics.length}/{MAX_PHOTOS}</span>
      </div>
      {pics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pics.map((p) => (
            <div key={p.localId} className="relative h-20 w-20 rounded-lg overflow-hidden border">
              <img src={p.dataUrl} alt={titulo} className="h-full w-full object-cover cursor-pointer" onClick={() => onZoom(p.dataUrl)} />
              <button onClick={() => onRemove(slot, p.localId)} aria-label="Quitar foto"
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/65 text-white grid place-items-center"><X className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Resumen ─────────────────────── */
export function CumplimientoHero({ pct, cfg, sub }) {
  const t = etqTone(pct, cfg);
  const color = ETQ_TONE_COLOR[t];
  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5 text-center">
      <span className="inline-block h-3 w-3 rounded-full mb-1.5" style={{ background: color, boxShadow: `0 0 0 5px ${color}26` }} />
      <p className="font-heading text-5xl font-bold" style={{ color }}>{pct}%</p>
      <p className="text-sm font-semibold mt-1" style={{ color }}>{ETQ_TONE_LABEL[t]}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}

export function ConteoTiles({ c }) {
  const tiles = [
    ['Revisadas', c.total, '#1e395e'], ['Correctas', c.correctas, '#16a34a'],
    ['Precio incorrecto', c.precio_incorrecto, '#dc2626'], ['Sin etiqueta', c.sin_etiqueta, '#ec9032'],
    ['Deterioradas', c.deterioradas, '#a16207'], ['Irregularidades', c.irregularidades, '#dc2626'],
  ];
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
      {tiles.map(([l, v, color]) => (
        <div key={l} className="rounded-[14px] bg-card border shadow-card px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground leading-tight">{l}</p>
          <p className="font-heading text-xl font-semibold" style={{ color }}>{v}</p>
        </div>
      ))}
    </div>
  );
}

function Resumen({ user, sucursal, departamento, semana, etiquetas, photos, conteo, cfg, submitting, onEdit, onBack, onSubmit }) {
  const hoy = new Date();
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="max-w-[860px] mx-auto space-y-4">
      <div className="rounded-[18px] bg-card border shadow-card p-5">
        <h3 className="font-heading text-lg font-semibold mb-3">Resumen de la auditoría</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Sucursal</dt><dd className="font-semibold">{sucursal}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Departamento</dt><dd className="font-semibold">{departamento}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Fecha</dt><dd className="font-semibold">{hoy.toLocaleDateString('es-HN')}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Semana</dt><dd className="font-semibold">{semana.num}</dd></div>
          <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-muted-foreground">Coordinador</dt><dd className="font-semibold truncate">{user?.name}</dd></div>
        </dl>
      </div>

      <CumplimientoHero pct={conteo.cumplimiento} cfg={cfg} sub={`${conteo.correctas} correctas de ${conteo.total} etiquetas revisadas`} />
      <ConteoTiles c={conteo} />

      <div className="rounded-[18px] bg-card border shadow-card p-4">
        <p className="text-xs text-muted-foreground mb-2">Toca una etiqueta para corregirla antes de finalizar.</p>
        <ol className="divide-y">
          {etiquetas.map((e, i) => {
            const r = RESULTADO[e.resultado];
            const p = (photos[e.key] || [])[0];
            return (
              <li key={e.key}>
                <button onClick={() => onEdit(i)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-muted/40 rounded-lg px-1">
                  <span className="w-6 text-xs font-bold text-muted-foreground text-right shrink-0">{i + 1}</span>
                  {p ? <img src={p.dataUrl} alt="" className="h-9 w-9 rounded-md object-cover border shrink-0" /> : <span className="h-9 w-9 rounded-md bg-muted shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate" style={{ color: r?.color }}>{r?.label}</span>
                    {e.resultado === 'precio_incorrecto' && <span className="block text-xs text-[#dc2626]">{fmtL(e.precio_exhibido)} vs {fmtL(e.precio_sistema)} · {fmtL(diferencia(e), { signo: true })}</span>}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" className="rounded-xl h-11" onClick={onBack} disabled={submitting}><ChevronLeft className="h-4 w-4 mr-1" /> Etiquetas</Button>
        <Button onClick={onSubmit} disabled={submitting} className="rounded-xl h-11 bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="etiquetas-submit-button">
          {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
          {submitting ? 'Guardando…' : 'Finalizar auditoría'}
        </Button>
      </div>
    </motion.div>
  );
}

/* ─────────────── Confirmación (después de guardar) ──────── */
function Guardado({ aud, cfg, onNew }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="max-w-[860px] mx-auto space-y-4" data-testid="etiquetas-saved">
      <div className="flex items-center gap-2 rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] text-sm font-medium px-3 py-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" /> Auditoría finalizada y guardada.
      </div>
      <CumplimientoHero pct={aud.cumplimiento} cfg={cfg} sub={`${aud.sucursal} · ${aud.departamento} · ${semanaLabel(aud.semana)} · ${fmtFechaAud(aud)}`} />
      <ConteoTiles c={aud} />
      <div className="flex flex-wrap justify-end gap-2">
        <EtiquetaPdfButton aud={aud} cfg={cfg} />
        <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={onNew} data-testid="etiquetas-new-button">
          <TagsIcon className="h-4 w-4 mr-1.5" /> Nueva auditoría
        </Button>
      </div>
    </motion.div>
  );
}
