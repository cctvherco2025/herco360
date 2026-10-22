import React, { useState, useEffect, useRef, useId } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ChevronLeft, ChevronRight, Camera, Upload, X, Info, Check, Plus, Save, RotateCcw, Pencil, Trash2,
  Clock, FileDown, Loader2, ImageIcon, AlertTriangle, CheckCircle2, Search, Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { RECORRIDO_SUCURSALES, RECORRIDO_CATEGORIAS, RECORRIDO_TIPOS, tipoLabel, fmtFechaRecorrido } from '@/lib/recorridosSchema';
import { generateRecorridoPdf } from '@/lib/recorridosPdf';
import { compressImage } from '@/lib/flosPhoto';
import { canFillRecorridos } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar, avisar } from '@/components/ConfirmDialog';

const DRAFT_KEY = 'herco360_recorridos_draft_v1';
const MAX_PHOTOS = 8;
const STEPS = [
  { k: 'datos', label: 'Datos' },
  { k: 'hallazgos', label: 'Hallazgos' },
  { k: 'resumen', label: 'Resumen' },
];

const emptyHallazgo = () => ({
  key: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  categoria: '', tipo: '', producto: '', cantidad: '', descripcion: '', responsable: '', accion: '',
});

function loadDraft() {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

// Qué le falta a un hallazgo para poder guardarse (vacío = completo).
function faltantes(h, nFotos) {
  const f = [];
  if (!h.categoria) f.push('departamento');
  if (!h.tipo.trim()) f.push('tipo de irregularidad');
  if (!h.descripcion.trim()) f.push('descripción');
  if (!nFotos) f.push('al menos una foto');
  return f;
}

// Selector rápido de botones (sucursal y departamento).
export function ChipPicker({ options, value, onChange, cols = 'grid-cols-4', testid }) {
  return (
    <div className={`grid ${cols} gap-2`} role="radiogroup">
      {options.map((o) => {
        const active = value === o;
        return (
          <button key={o} type="button" role="radio" aria-checked={active} onClick={() => onChange(o)} data-testid={testid ? `${testid}-${o}` : undefined}
            className={`min-h-11 px-2 rounded-xl border text-sm font-semibold transition-colors ${
              active ? 'bg-[#1e395e] border-[#1e395e] text-white' : 'hover:bg-muted text-foreground'
            }`}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

// <select> nativo con el mismo aspecto que los Input de la app.
export function NativeSelect({ value, onChange, children, className = '', ...rest }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`flex h-11 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`} {...rest}>
      {children}
    </select>
  );
}

// Oficiales + los escritos a mano en recorridos anteriores (GET /recorridos/tipos).
export function useTiposRecorrido() {
  const [tipos, setTipos] = useState(RECORRIDO_TIPOS);
  useEffect(() => {
    api.get('/recorridos/tipos').then(({ data }) => setTipos([...(data.oficiales || []), ...(data.otros || [])])).catch(() => {});
  }, []);
  return tipos;
}

const claveTipo = (t) => (t || '').toLowerCase().replace(/\.$/, '').replace(/\s+/g, ' ').trim();

// Tipo de irregularidad: buscador con lista desplegable propia (el <datalist>
// nativo no se puede estilizar y en Windows con tema oscuro salía negro).
// Al escribir filtra la lista; si no existe, lo escrito queda como tipo nuevo
// (el servidor lo normaliza contra los ya existentes).
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const LIST_MAX_H = 288;

export function TipoInput({ value, onChange, tipos, id, className = '', ...rest }) {
  const listId = useId();
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const closeTimer = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // opción resaltada con el teclado
  const [place, setPlace] = useState({ up: false, maxH: LIST_MAX_H });

  const texto = value || '';
  const q = sinAcentos(texto.trim());
  const opciones = tipos.map(tipoLabel).filter((t) => !q || sinAcentos(t).includes(q));
  const elegida = tipos.find((t) => claveTipo(t) === claveTipo(texto));
  const nuevo = texto.trim() && !elegida;

  // abre hacia abajo; solo hacia arriba si abajo no cabe y arriba hay más espacio
  const medir = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.visualViewport?.height || window.innerHeight;
    const abajo = vh - r.bottom - 12, arriba = r.top - 12;
    const up = abajo < 180 && arriba > abajo;
    setPlace({ up, maxH: Math.max(120, Math.min(LIST_MAX_H, up ? arriba : abajo)) });
  };
  const abrir = () => { clearTimeout(closeTimer.current); medir(); setOpen(true); };
  const cerrar = () => { setOpen(false); setActive(-1); };

  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useEffect(() => {
    if (!open) return undefined;
    const onResize = () => medir();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); window.visualViewport?.removeEventListener('resize', onResize); };
  }, [open]);
  useEffect(() => {
    if (active < 0) return;
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const elegir = (t) => { onChange(t); cerrar(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) abrir(); setActive((a) => Math.min(opciones.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && active >= 0 && opciones[active]) { e.preventDefault(); elegir(opciones[active]); }
    else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); cerrar(); }
  };

  return (
    <div>
      <div className="relative" ref={wrapRef}>
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input id={id} value={texto} autoComplete="off" enterKeyHint="done"
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => { onChange(e.target.value); setActive(-1); if (!open) abrir(); }}
          onFocus={abrir} onClick={() => { if (!open) abrir(); }}
          // en celular el toque en una opción llega después del blur: se cierra con un respiro
          onBlur={() => { closeTimer.current = setTimeout(cerrar, 150); }}
          onKeyDown={onKeyDown}
          placeholder="Busca o escribe el tipo…" className={`h-11 pl-9 pr-9 ${className}`} {...rest} />
        {texto && (
          <button type="button" onClick={() => onChange('')} aria-label="Borrar tipo" tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 grid place-items-center rounded-full text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}

        {open && (
          <div ref={listRef} id={listId} role="listbox"
            onMouseDown={(e) => e.preventDefault()} // en PC no quita el foco del campo
            style={{ maxHeight: place.maxH }}
            className={`absolute left-0 right-0 z-50 overflow-y-auto overscroll-contain rounded-xl border bg-popover text-popover-foreground shadow-lg p-1 ${
              place.up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}>
            {opciones.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-muted-foreground">Sin coincidencias</p>
            ) : opciones.map((t, i) => {
              const sel = elegida && claveTipo(t) === claveTipo(elegida);
              return (
                <button key={t} type="button" role="option" aria-selected={!!sel} id={`${listId}-${i}`} data-idx={i}
                  onClick={() => elegir(t)} onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    sel
                      ? 'bg-[rgba(30,57,94,0.08)] text-[#1e395e] font-semibold dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6]'
                      : i === active
                        ? 'bg-[rgba(0,165,223,0.08)] dark:bg-[rgba(0,165,223,0.16)]'
                        : 'hover:bg-[rgba(0,165,223,0.08)] dark:hover:bg-[rgba(0,165,223,0.16)]'
                  }`}>
                  <span className="min-w-0 break-words">{t}</span>
                  {sel && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {nuevo && (
        <p className="flex items-center gap-1.5 text-xs text-[#ec9032] mt-1.5">
          <Sparkles className="h-3.5 w-3.5 shrink-0" /> No está en la lista: se registrará como tipo nuevo.
        </p>
      )}
    </div>
  );
}

export function RecorridoPdfButton({ rec, className = '', testid = 'recorridos-pdf-button' }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await generateRecorridoPdf(rec); }
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

export default function RecorridoWizard({ onSubmitted }) {
  const { user } = useAuth();
  const [step, setStep] = useState('datos'); // datos | hallazgos | resumen | guardado
  const [sucursal, setSucursal] = useState('');
  const [hallazgos, setHallazgos] = useState([]);
  const [photos, setPhotos] = useState({}); // key -> [{ localId, blob, dataUrl, name }]
  const [sinNovedades, setSinNovedades] = useState(false);
  const [editing, setEditing] = useState(null); // copia del hallazgo en edición
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [saved, setSaved] = useState(null);
  const camInputs = useRef({});

  const canFill = canFillRecorridos(user);
  const tipos = useTiposRecorrido();

  // ── Borrador: solo texto (las fotos no se guardan en el dispositivo). ──
  useEffect(() => {
    const d = loadDraft();
    if (d && (d.sucursal || (d.hallazgos || []).length)) {
      setSucursal(d.sucursal || '');
      setHallazgos(d.hallazgos || []);
      setSinNovedades(!!d.sinNovedades);
      setHasDraft(true);
    }
  }, []);

  useEffect(() => {
    if (step === 'datos' || step === 'guardado') return undefined;
    const t = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ sucursal, hallazgos, sinNovedades })); }
      catch (e) { /* localStorage lleno: se pierde el borrador, no rompe la app */ }
    }, 400);
    return () => clearTimeout(t);
  }, [step, sucursal, hallazgos, sinNovedades]);

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };

  const resetForm = () => {
    clearDraft();
    setSucursal(''); setHallazgos([]); setPhotos({}); setSinNovedades(false); setEditing(null); setHasDraft(false);
  };

  const resetAll = async () => {
    if (!(await confirmar({
      tipo: 'danger', titulo: '¿Descartar el recorrido?',
      mensaje: <>Se borrarán <b>todos los hallazgos y fotos</b> capturados. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Descartar',
    }))) return;
    resetForm(); setStep('datos');
    avisar('Recorrido descartado');
  };

  // ── Fotos ──
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

  // ── Hallazgos ──
  const isNew = editing && !hallazgos.some((h) => h.key === editing.key);
  const startNew = () => { setSinNovedades(false); setEditing(emptyHallazgo()); };
  const startEdit = (h) => setEditing({ ...h });
  const cancelEdit = () => {
    if (isNew) setPhotos((p) => { const n = { ...p }; delete n[editing.key]; return n; });
    setEditing(null);
  };
  const saveHallazgo = () => {
    const f = faltantes(editing, (photos[editing.key] || []).length);
    if (f.length) { toast.error(`Falta: ${f.join(', ')}`); return; }
    setHallazgos((hs) => (isNew ? [...hs, editing] : hs.map((h) => (h.key === editing.key ? editing : h))));
    setEditing(null);
  };
  const removeHallazgo = async (h, n) => {
    if (!(await confirmar({
      tipo: 'danger', titulo: `¿Quitar el hallazgo ${n}?`,
      mensaje: <>Se quitará <b>{tipoLabel(h.tipo) || 'este hallazgo'}</b> con sus fotos.</>,
      textoConfirmar: 'Quitar',
    }))) return;
    setHallazgos((hs) => hs.filter((x) => x.key !== h.key));
    setPhotos((p) => { const n2 = { ...p }; delete n2[h.key]; return n2; });
    if (editing?.key === h.key) setEditing(null);
  };

  const goDatos = () => {
    if (!sucursal) { toast.error('Selecciona la sucursal'); return; }
    setStep('hallazgos');
  };
  const goResumen = () => {
    const incompleto = hallazgos.findIndex((h) => faltantes(h, (photos[h.key] || []).length).length);
    if (incompleto >= 0) {
      toast.error(`El hallazgo ${incompleto + 1} está incompleto: ${faltantes(hallazgos[incompleto], (photos[hallazgos[incompleto].key] || []).length).join(', ')}`);
      return;
    }
    if (!hallazgos.length && !sinNovedades) { toast.error('Agrega un hallazgo o marca el recorrido como "Sin novedades"'); return; }
    setStep('resumen');
  };
  const marcarSinNovedades = () => { setSinNovedades(true); setStep('resumen'); };

  const submit = async () => {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        sucursal,
        hallazgos: hallazgos.map((h) => ({
          key: h.key, categoria: h.categoria, tipo: h.tipo.trim(), producto: h.producto.trim(),
          cantidad: h.cantidad === '' ? null : Number(h.cantidad), descripcion: h.descripcion.trim(),
          responsable: h.responsable.trim(), accion: h.accion.trim(),
        })),
      }));
      hallazgos.forEach((h) => (photos[h.key] || []).forEach((p) => {
        fd.append('photos', p.blob, p.name || `${h.key}.jpg`); fd.append('photo_owner', h.key);
      }));
      const { data } = await api.post('/recorridos/registros', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Recorrido guardado correctamente');
      setSaved(data);
      resetForm();
      setStep('guardado');
      onSubmitted?.();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar el recorrido');
    } finally { setSubmitting(false); }
  };

  if (!canFill) {
    return (
      <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
        <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">Solo los coordinadores ECCP pueden registrar recorridos. Tú puedes consultar el historial.</p>
      </div>
    );
  }

  if (step === 'guardado' && saved) {
    return <Guardado rec={saved} onNew={() => { setSaved(null); setStep('datos'); }} />;
  }

  const stepIdx = STEPS.findIndex((s) => s.k === step);

  return (
    <div className="max-w-[760px] mx-auto">
      {/* pasos */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <ol className="flex items-center gap-1.5 text-xs font-medium min-w-0">
          {STEPS.map((s, i) => (
            <li key={s.k} className="flex items-center gap-1.5">
              <span className={`h-6 min-w-6 px-1.5 rounded-full grid place-items-center ${i <= stepIdx ? 'bg-[#1e395e] text-white' : 'bg-muted text-muted-foreground'}`}>
                {i < stepIdx ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={`hidden sm:inline ${i === stepIdx ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="w-4 sm:w-6 h-px bg-border" />}
            </li>
          ))}
        </ol>
        {(sucursal || hallazgos.length > 0) && (
          <Button variant="ghost" size="sm" onClick={resetAll} className="text-muted-foreground shrink-0" data-testid="recorridos-reset-button">
            <RotateCcw className="h-3.5 w-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Descartar</span>
          </Button>
        )}
      </div>

      {step === 'datos' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-[18px] bg-card border shadow-card p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-1">
            <Avatar className="h-10 w-10 border"><AvatarImage src={user?.avatar_url} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
            <div><p className="text-sm font-medium text-foreground">{user?.name}</p><p className="text-xs text-muted-foreground">Coordinador responsable</p></div>
          </div>
          <h2 className="font-heading text-xl font-semibold mt-4">Nuevo recorrido preventivo</h2>
          <p className="text-sm text-muted-foreground mt-1 mb-5">Registra las irregularidades que encuentres en el piso de venta.</p>
          {hasDraft && (
            <div className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6] text-xs px-3 py-2 mb-4">
              <Info className="h-3.5 w-3.5 shrink-0" /> Tienes un recorrido en curso guardado en este dispositivo (sin las fotos).
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Sucursal</Label>
            <ChipPicker options={RECORRIDO_SUCURSALES} value={sucursal} onChange={setSucursal} testid="recorridos-sucursal" />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4">
            <Clock className="h-3.5 w-3.5 shrink-0" /> La fecha y la hora se registran automáticamente al guardar.
          </p>
          <Button onClick={goDatos} className="w-full h-11 mt-6 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="recorridos-begin-button">
            {hasDraft ? 'Continuar recorrido' : 'Comenzar recorrido'} <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </motion.div>
      )}

      {step === 'hallazgos' && (editing ? (
        <HallazgoForm
          h={editing} n={isNew ? hallazgos.length + 1 : hallazgos.findIndex((x) => x.key === editing.key) + 1}
          onChange={setEditing} pics={photos[editing.key] || []} busy={uploading === editing.key}
          onFiles={handleFiles} onRemovePhoto={removePhoto} onZoom={setZoomSrc} camInputs={camInputs}
          onSave={saveHallazgo} onCancel={cancelEdit} isNew={isNew} tipos={tipos}
        />
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="font-heading text-lg font-semibold">Hallazgos <span className="text-muted-foreground font-normal">({hallazgos.length})</span></h3>
            <span className="text-sm text-muted-foreground"><b className="text-foreground">{sucursal}</b></span>
          </div>

          {hallazgos.length === 0 ? (
            <div className="rounded-[18px] bg-card border shadow-card p-6 text-center">
              <p className="text-sm text-muted-foreground mb-4">¿Encontraste alguna irregularidad en el recorrido?</p>
              <div className="grid sm:grid-cols-2 gap-2">
                <Button onClick={startNew} className="h-12 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="recorridos-add-first">
                  <Plus className="h-4 w-4 mr-1.5" /> Registrar hallazgo
                </Button>
                <Button variant="outline" onClick={marcarSinNovedades} className="h-12 rounded-xl text-[#16a34a] border-[#16a34a]/40 hover:bg-[rgba(22,163,74,0.08)]" data-testid="recorridos-sin-novedades">
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Sin novedades
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {hallazgos.map((h, i) => (
                <HallazgoCard key={h.key} h={h} n={i + 1} pics={photos[h.key] || []}
                  onEdit={() => startEdit(h)} onRemove={() => removeHallazgo(h, i + 1)} />
              ))}
              <Button variant="outline" onClick={startNew} className="w-full h-12 rounded-xl border-dashed" data-testid="recorridos-add-another">
                <Plus className="h-4 w-4 mr-1.5" /> Agregar otro hallazgo
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between mt-5 gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setStep('datos')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            {hallazgos.length > 0 && (
              <Button onClick={goResumen} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="recorridos-to-resumen">
                Continuar <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </motion.div>
      ))}

      {step === 'resumen' && (
        <Resumen
          user={user} sucursal={sucursal} hallazgos={hallazgos} photos={photos} sinNovedades={sinNovedades && !hallazgos.length}
          submitting={submitting} onBack={() => { setSinNovedades(false); setStep('hallazgos'); }} onSubmit={submit}
        />
      )}

      <PhotoZoomDialog open={!!zoomSrc} onClose={() => setZoomSrc(null)}>
        {zoomSrc && <img src={zoomSrc} alt="Evidencia ampliada" className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}

/* ───────────────────── Tarjeta de hallazgo ─────────────── */
function HallazgoCard({ h, n, pics, onEdit, onRemove }) {
  const f = faltantes(h, pics.length);
  return (
    <div className="rounded-[16px] bg-card border shadow-card p-3 sm:p-4 flex items-start gap-3" data-testid="recorridos-hallazgo-card">
      {pics[0]
        ? <img src={pics[0].dataUrl} alt="" className="h-14 w-14 rounded-lg object-cover border shrink-0" />
        : <span className="h-14 w-14 rounded-lg bg-muted grid place-items-center shrink-0"><ImageIcon className="h-5 w-5 text-muted-foreground/60" /></span>}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold break-words">#{n} · {tipoLabel(h.tipo)}</p>
        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
          <span className="font-medium text-[#1e395e] dark:text-[#3cbef6]">{h.categoria}</span>
          {h.producto && <span className="truncate">· {h.producto}{h.cantidad !== '' && h.cantidad != null ? ` (${h.cantidad})` : ''}</span>}
          <span>· {pics.length} foto{pics.length === 1 ? '' : 's'}</span>
        </p>
        {f.length > 0 && (
          <p className="text-xs text-[#dc2626] mt-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Falta: {f.join(', ')}</p>
        )}
      </div>
      <div className="flex shrink-0">
        <button onClick={onEdit} title="Editar" aria-label="Editar hallazgo" className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="h-4 w-4" /></button>
        <button onClick={onRemove} title="Quitar" aria-label="Quitar hallazgo" className="p-2 rounded-lg hover:bg-[rgba(220,38,38,0.08)] text-muted-foreground hover:text-[#dc2626]"><Trash2 className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/* ───────────────────── Formulario de hallazgo ──────────── */
function HallazgoForm({ h, n, onChange, pics, busy, onFiles, onRemovePhoto, onZoom, camInputs, onSave, onCancel, isNew, tipos }) {
  const set = (k) => (v) => onChange({ ...h, [k]: v });
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6" data-testid="recorridos-hallazgo-form">
      <h3 className="font-heading text-lg font-semibold mb-4">{isNew ? `Hallazgo ${n}` : `Editar hallazgo ${n}`}</h3>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Departamento <span className="text-[#dc2626]">*</span></Label>
          <ChipPicker options={RECORRIDO_CATEGORIAS} value={h.categoria} onChange={set('categoria')} cols="grid-cols-2 sm:grid-cols-3" testid="recorridos-categoria" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-tipo">Tipo de irregularidad <span className="text-[#dc2626]">*</span></Label>
          <TipoInput id="rec-tipo" value={h.tipo} onChange={set('tipo')} tipos={tipos} data-testid="recorridos-tipo" />
        </div>
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <div className="space-y-1.5 min-w-0">
            <Label htmlFor="rec-producto">Producto involucrado</Label>
            <Input id="rec-producto" value={h.producto} onChange={(e) => set('producto')(e.target.value)} className="h-11" placeholder="Nombre del producto" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-cantidad">Cantidad</Label>
            <Input id="rec-cantidad" type="number" inputMode="numeric" min="0" step="1" value={h.cantidad}
              onChange={(e) => set('cantidad')(e.target.value.replace(/[^\d]/g, ''))} className="h-11" placeholder="0" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-desc">Descripción de la irregularidad <span className="text-[#dc2626]">*</span></Label>
          <Textarea id="rec-desc" rows={3} value={h.descripcion} onChange={(e) => set('descripcion')(e.target.value)} placeholder="Qué se encontró y dónde…" data-testid="recorridos-descripcion" />
        </div>

        <div className="space-y-2">
          <Label>Evidencia fotográfica <span className="text-[#dc2626]">*</span></Label>
          <div className="flex flex-wrap gap-2">
            <input ref={(el) => (camInputs.current[`${h.key}-cam`] = el)} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { onFiles(h.key, e.target.files); e.target.value = ''; }} />
            <input ref={(el) => (camInputs.current[`${h.key}-lib`] = el)} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { onFiles(h.key, e.target.files); e.target.value = ''; }} />
            <Button type="button" variant="outline" size="sm" className="rounded-xl h-10" disabled={busy || pics.length >= MAX_PHOTOS}
              onClick={() => camInputs.current[`${h.key}-cam`]?.click()} data-testid="recorridos-photo-camera">
              <Camera className="h-4 w-4 mr-1.5" /> {busy ? 'Procesando…' : 'Tomar foto'}
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-xl h-10" disabled={busy || pics.length >= MAX_PHOTOS}
              onClick={() => camInputs.current[`${h.key}-lib`]?.click()} data-testid="recorridos-photo-upload">
              <Upload className="h-4 w-4 mr-1.5" /> Galería
            </Button>
            <span className="text-xs text-muted-foreground self-center">{pics.length}/{MAX_PHOTOS}</span>
          </div>
          {pics.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pics.map((p) => (
                <div key={p.localId} className="relative h-20 w-20 rounded-lg overflow-hidden border">
                  <img src={p.dataUrl} alt="Evidencia" className="h-full w-full object-cover cursor-pointer" onClick={() => onZoom(p.dataUrl)} />
                  <button onClick={() => onRemovePhoto(h.key, p.localId)} aria-label="Quitar foto"
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/65 text-white grid place-items-center text-xs">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rec-resp">Responsable notificado</Label>
          <Input id="rec-resp" value={h.responsable} onChange={(e) => set('responsable')(e.target.value)} className="h-11" placeholder="A quién se le notificó" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-accion">Acción correctiva realizada o recomendada</Label>
          <Textarea id="rec-accion" rows={2} value={h.accion} onChange={(e) => set('accion')(e.target.value)} placeholder="Qué se hizo o qué se recomienda…" />
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={onCancel}>Cancelar</Button>
        <Button onClick={onSave} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="recorridos-hallazgo-save">
          <Check className="h-4 w-4 mr-1.5" /> {isNew ? 'Agregar hallazgo' : 'Guardar cambios'}
        </Button>
      </div>
    </motion.div>
  );
}

/* ───────────────────────── Resumen ─────────────────────── */
function Resumen({ user, sucursal, hallazgos, photos, sinNovedades, submitting, onBack, onSubmit }) {
  const porCat = RECORRIDO_CATEGORIAS.map((c) => [c, hallazgos.filter((h) => h.categoria === c).length]).filter(([, n]) => n);
  const nFotos = hallazgos.reduce((a, h) => a + (photos[h.key] || []).length, 0);
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <div className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6">
        <h3 className="font-heading text-lg font-semibold mb-4">Resumen del recorrido</h3>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Sucursal</dt><dd className="font-semibold">{sucursal}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Coordinador</dt><dd className="font-semibold truncate">{user?.name}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Hallazgos</dt><dd className="font-semibold">{hallazgos.length}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Fotos</dt><dd className="font-semibold">{nFotos}</dd></div>
        </dl>

        {sinNovedades ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] text-sm font-medium px-3 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0" /> Recorrido sin novedades: no se encontraron irregularidades.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 mt-5">
              {porCat.map(([c, n]) => (
                <span key={c} className="text-xs font-medium rounded-full px-2.5 py-1 bg-[rgba(30,57,94,0.08)] text-[#1e395e] dark:bg-[rgba(60,190,246,0.12)] dark:text-[#3cbef6]">{c} · {n}</span>
              ))}
            </div>
            <ol className="mt-4 space-y-2">
              {hallazgos.map((h, i) => (
                <li key={h.key} className="flex items-start gap-3 rounded-xl border p-3">
                  {(photos[h.key] || [])[0] && <img src={photos[h.key][0].dataUrl} alt="" className="h-11 w-11 rounded-lg object-cover border shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{i + 1}. {tipoLabel(h.tipo)} <span className="text-muted-foreground font-normal">· {h.categoria}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words line-clamp-2">{h.descripcion}</p>
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-4">
          <Clock className="h-3.5 w-3.5 shrink-0" /> La fecha y la hora se registran al guardar.
        </p>
      </div>

      <div className="flex items-center justify-between mt-5 gap-2">
        <Button variant="outline" className="rounded-xl" onClick={onBack} disabled={submitting}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
        </Button>
        <Button onClick={onSubmit} disabled={submitting} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="recorridos-submit-button">
          {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          {submitting ? 'Guardando…' : 'Guardar recorrido'}
        </Button>
      </div>
    </motion.div>
  );
}

/* ─────────────── Confirmación (después de guardar) ──────── */
function Guardado({ rec, onNew }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="max-w-[560px] mx-auto rounded-[18px] bg-card border shadow-card p-6 sm:p-8 text-center" data-testid="recorridos-saved">
      <CheckCircle2 className="h-12 w-12 mx-auto text-[#16a34a]" />
      <h3 className="font-heading text-xl font-semibold mt-3">Recorrido guardado</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {rec.sucursal} · {fmtFechaRecorrido(rec)} · {rec.sin_novedades ? 'Sin novedades' : `${rec.total_hallazgos} hallazgo${rec.total_hallazgos === 1 ? '' : 's'}`}
      </p>
      {(rec.categorias || []).length > 0 && <p className="text-xs text-muted-foreground mt-1">{rec.categorias.join(' · ')}</p>}
      <div className="flex flex-wrap justify-center gap-2 mt-6">
        <RecorridoPdfButton rec={rec} />
        <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={onNew} data-testid="recorridos-new-button">
          <Plus className="h-4 w-4 mr-1.5" /> Nuevo recorrido
        </Button>
      </div>
    </motion.div>
  );
}
