import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Camera, X, Loader2, CheckCircle2, AlertTriangle, MinusCircle, ChevronLeft, ChevronRight, Info, UserRoundCog, Ban, CalendarClock,
  Square, CheckSquare, FileDown,
} from 'lucide-react';
import api from '@/lib/api';
import useEsMovil from '@/lib/useEsMovil';
import { compressImage } from '@/lib/flosPhoto';
import { idbGet, idbSet, idbDel } from '@/lib/idbDraft';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar } from '@/components/ConfirmDialog';
import { EstadoTarea, fechaHora, MantFoto, Buscador, modoFotos, esFalla, ANTES, DESPUES } from '@/components/mantenimiento/comunes';
import CambiarFecha from '@/components/mantenimiento/CambiarFecha';
import { ConNovedad } from '@/components/Novedad';
import { fechaCorta } from '@/components/CalendarioFecha';
import { generateMantTareaPdf } from '@/lib/mantenimientoPdf';

const ESTADOS = [
  { v: 'bien', label: 'Bien', icon: CheckCircle2, on: 'bg-[#16a34a] text-white border-transparent' },
  { v: 'falla', label: 'Falla', icon: AlertTriangle, on: 'bg-[#dc2626] text-white border-transparent' },
  { v: 'na', label: 'No aplica', icon: MinusCircle, on: 'bg-[#64748b] text-white border-transparent' },
];
const ETQ_ESTADO = { bien: 'Bien', falla: 'Falla', na: 'No aplica' };

const VACIO_MSG = {
  estado: 'Elige Bien, Falla o No aplica', unica: 'Elige una opción', multiple: 'Elige al menos una opción',
  check: 'Márcala para continuar', numero: 'Escribe el número', texto: 'Escribe la respuesta',
};
const EXTREMOS = {
  [ANTES]: { titulo: 'Cómo encontraste el equipo', ayuda: 'Toma foto del equipo antes de empezar y anota cómo estaba.' },
  [DESPUES]: { titulo: 'Cómo quedó el equipo', ayuda: 'Toma foto del equipo al terminar el mantenimiento.' },
};

// Qué le falta a una respuesta (mismo criterio que el servidor), o null.
function falta(it, r, fotos) {
  const n = (fotos || []).length;
  if (EXTREMOS[it.id]) return n ? null : 'Agrega al menos una foto';
  const v = r?.valor;
  if (it.tipo === 'foto') return n ? null : 'Agrega la foto';
  const vacio = v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || (it.tipo === 'check' && !v);
  if (vacio && it.obligatorio) return VACIO_MSG[it.tipo] || 'Falta la respuesta';
  if (it.tipo === 'numero' && !vacio && Number.isNaN(Number(v))) return 'Escribe un número válido';
  if (esFalla(it, v)) {
    if (!(r.comentario || '').trim()) return 'Describe la falla';
    if (!n) return 'Agrega una foto de la falla';
  } else if (modoFotos(it) === 'obligatoria' && !n) return 'Agrega al menos una foto';
  return null;
}

function Fotos({ fotos, onAdd, onRemove, requerida }) {
  const [zoom, setZoom] = useState(null);
  return (
    <div className="flex flex-wrap gap-2">
      {fotos.map((f, i) => (
        <div key={f.key} className="relative">
          <img src={f.dataUrl} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-xl border object-cover cursor-zoom-in" onClick={() => setZoom(f.dataUrl)} />
          <button type="button" onClick={() => onRemove(f.key)} aria-label="Quitar foto"
            className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-[#dc2626] text-white grid place-items-center shadow"><X className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <label className={`h-20 w-20 rounded-xl border border-dashed grid place-items-center text-center cursor-pointer hover:bg-muted/40 ${requerida && !fotos.length ? 'border-[#dc2626] text-[#dc2626]' : 'text-muted-foreground'}`}>
        <span className="flex flex-col items-center gap-1 text-[11px] leading-tight"><Camera className="h-5 w-5" />{fotos.length ? 'Otra' : 'Foto'}</span>
        <input type="file" accept="image/*" multiple className="sr-only" onChange={onAdd} />
      </label>
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>{zoom && <img src={zoom} alt="Foto" className={ZOOM_IMG_CLASS} />}</PhotoZoomDialog>
    </div>
  );
}

function Pregunta({ it, n, total, r, fotos, onChange, onAddFoto, onRemoveFoto, mostrarError, grande }) {
  const err = mostrarError ? falta(it, r, fotos) : null;
  const set = (k, v) => onChange({ ...(r || {}), [k]: v });
  const v = r?.valor;
  return (
    <div className={`rounded-[18px] border bg-card shadow-card p-4 sm:p-5 space-y-3 ${err ? 'border-[#dc2626]/60' : ''}`} data-testid="mant-pregunta">
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">
          Pregunta {n} de {total}{!it.obligatorio && it.tipo !== 'foto' ? ' · opcional' : ''}{it.tipo === 'multiple' ? ' · puedes elegir varias' : ''}
        </p>
        <p className={`font-medium mt-0.5 ${grande ? 'text-lg' : ''}`}>{it.texto}</p>
        {it.ayuda && <p className="text-xs text-muted-foreground mt-0.5">{it.ayuda}</p>}
      </div>
      {it.tipo === 'estado' && (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={it.texto}>
          {ESTADOS.map((e) => (
            <button key={e.v} type="button" role="radio" aria-checked={v === e.v} onClick={() => set('valor', v === e.v ? null : e.v)}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 rounded-xl border font-semibold transition-colors ${grande ? 'py-4 text-base' : 'py-2.5 text-sm'} ${v === e.v ? e.on : 'bg-card text-muted-foreground hover:text-foreground'}`}
              data-testid={`mant-estado-${e.v}`}>
              <e.icon className={grande ? 'h-6 w-6' : 'h-4 w-4'} /> {e.label}
            </button>
          ))}
        </div>
      )}
      {it.tipo === 'unica' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label={it.texto}>
          {(it.opciones || []).map((o) => {
            const sel = v === o.texto;
            return (
              <button key={o.texto} type="button" role="radio" aria-checked={sel} onClick={() => set('valor', sel ? null : o.texto)}
                className={`rounded-xl border px-4 text-left font-medium transition-colors ${grande ? 'py-4 text-base' : 'py-2.5 text-sm'} ${sel
                  ? (o.falla ? 'bg-[#dc2626] text-white border-transparent' : 'bg-[#1e395e] text-white border-transparent') : 'bg-card text-foreground hover:bg-muted/50'}`}
                data-testid="mant-opcion">{o.texto}</button>
            );
          })}
        </div>
      )}
      {it.tipo === 'multiple' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label={it.texto}>
          {(it.opciones || []).map((o) => {
            const sel = (v || []).includes(o.texto);
            const Icon = sel ? CheckSquare : Square;
            return (
              <button key={o.texto} type="button" role="checkbox" aria-checked={sel}
                onClick={() => set('valor', sel ? (v || []).filter((x) => x !== o.texto) : [...(v || []), o.texto])}
                className={`flex items-center gap-2.5 rounded-xl border px-4 text-left font-medium transition-colors ${grande ? 'py-4 text-base' : 'py-2.5 text-sm'} ${sel
                  ? (o.falla ? 'border-[#dc2626] bg-[rgba(220,38,38,0.08)] text-[#dc2626]' : 'border-[#00a5df] bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6]') : 'bg-card text-foreground hover:bg-muted/50'}`}
                data-testid="mant-opcion-multiple">
                <Icon className="h-5 w-5 shrink-0" /> {o.texto}
              </button>
            );
          })}
        </div>
      )}
      {it.tipo === 'check' && (
        <button type="button" role="checkbox" aria-checked={!!v} onClick={() => set('valor', !v)}
          className={`w-full flex items-center justify-center gap-2.5 rounded-xl border font-semibold transition-colors ${grande ? 'py-4 text-base' : 'py-3 text-sm'} ${v
            ? 'bg-[#16a34a] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}
          data-testid="mant-check">
          {v ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />} {v ? 'Hecho' : 'Marcar como hecho'}
        </button>
      )}
      {it.tipo === 'numero' && (
        <div className="flex items-center gap-2">
          <Input type="number" inputMode="decimal" step="any" value={v ?? ''} onChange={(e) => set('valor', e.target.value)} className="h-12 text-lg max-w-[200px]" aria-label={it.texto} />
          {it.unidad && <span className="text-sm text-muted-foreground">{it.unidad}</span>}
        </div>
      )}
      {it.tipo === 'texto' && (
        <Textarea rows={3} value={v || ''} onChange={(e) => set('valor', e.target.value)} placeholder="Escribe aquí…" aria-label={it.texto} />
      )}
      {esFalla(it, v) && (
        <div className="space-y-1.5">
          <Label>Describe la falla<span className="text-[#dc2626]"> *</span></Label>
          <Textarea rows={2} value={r?.comentario || ''} onChange={(e) => set('comentario', e.target.value)} placeholder="Qué se encontró y qué se hizo" data-testid="mant-falla-comentario" />
        </div>
      )}
      {(modoFotos(it) !== 'no' || esFalla(it, v)) && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">
            {esFalla(it, v) ? 'Foto de la falla (obligatoria)' : modoFotos(it) === 'obligatoria' ? 'Foto obligatoria' : 'Foto (opcional)'}
          </p>
          <Fotos fotos={fotos || []} onAdd={onAddFoto} onRemove={onRemoveFoto} requerida={modoFotos(it) === 'obligatoria' || esFalla(it, v)} />
        </div>
      )}
      {err && <p className="text-sm text-[#dc2626]">{err}</p>}
    </div>
  );
}

function Extremo({ clave, r, fotos, onChange, onAddFoto, onRemoveFoto, mostrarError, grande }) {
  const e = EXTREMOS[clave];
  const err = mostrarError && !(fotos || []).length ? 'Agrega al menos una foto' : null;
  return (
    <div className={`rounded-[18px] border bg-card shadow-card p-4 sm:p-5 space-y-3 border-l-4 ${clave === ANTES ? 'border-l-[#ec9032]' : 'border-l-[#16a34a]'} ${err ? 'border-[#dc2626]/60' : ''}`} data-testid={`mant-${clave === ANTES ? 'antes' : 'despues'}`}>
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">{clave === ANTES ? 'Antes de empezar' : 'Al terminar'}</p>
        <p className={`font-medium mt-0.5 ${grande ? 'text-lg' : ''}`}>{e.titulo}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{e.ayuda}</p>
      </div>
      <Fotos fotos={fotos || []} onAdd={onAddFoto} onRemove={onRemoveFoto} requerida />
      <Textarea rows={2} value={r?.comentario || ''} onChange={(ev) => onChange({ ...(r || {}), comentario: ev.target.value })}
        placeholder={clave === ANTES ? 'Cómo estaba (opcional)' : 'Cómo quedó (opcional)'} />
      {err && <p className="text-sm text-[#dc2626]">{err}</p>}
    </div>
  );
}

function AntesDespuesVista({ t }) {
  const [zoom, setZoom] = useState(null);
  if (!t.antes && !t.despues) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
      {[[ANTES, t.antes], [DESPUES, t.despues]].map(([clave, x]) => (
        <div key={clave} className={`rounded-[18px] border bg-card shadow-card p-4 border-l-4 ${clave === ANTES ? 'border-l-[#ec9032]' : 'border-l-[#16a34a]'}`}>
          <p className="text-sm font-semibold">{clave === ANTES ? 'Antes · cómo se encontró' : 'Después · cómo quedó'}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {(x?.fotos || []).map((f) => (
              <MantFoto key={f.id} tareaId={t.id} fotoId={f.id} className="h-28 w-28 rounded-xl border object-cover cursor-zoom-in" onClick={() => setZoom(f.id)} />
            ))}
          </div>
          {x?.comentario && <p className="text-sm mt-2 whitespace-pre-line">{x.comentario}</p>}
        </div>
      ))}
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>{zoom && <MantFoto tareaId={t.id} fotoId={zoom} className={ZOOM_IMG_CLASS} />}</PhotoZoomDialog>
    </div>
  );
}

function Respuestas({ t }) {
  const [zoom, setZoom] = useState(null);
  const por = Object.fromEntries((t.respuestas || []).map((r) => [r.item_id, r]));
  return (
    <div className="space-y-2.5">
      <AntesDespuesVista t={t} />
      {t.checklist.items.map((it, i) => {
        const r = por[it.id] || {};
        const valor = it.tipo === 'estado' ? ETQ_ESTADO[r.valor] : it.tipo === 'foto' ? null
          : it.tipo === 'multiple' ? (r.valor || []).join(', ') : it.tipo === 'check' ? (r.valor ? 'Hecho' : 'No marcada') : r.valor;
        const falla = esFalla(it, r.valor);
        return (
          <div key={it.id} className={`rounded-[18px] border bg-card shadow-card p-4 ${falla ? 'border-[#dc2626]/50' : ''}`}>
            <p className="text-[11px] font-semibold text-muted-foreground">Pregunta {i + 1}</p>
            <p className="font-medium">{it.texto}</p>
            {valor !== null && valor !== undefined && valor !== '' && (
              <p className={`mt-1 text-sm font-semibold ${falla ? 'text-[#dc2626]' : r.valor === 'bien' || (it.tipo === 'check' && r.valor) ? 'text-[#16a34a]' : ''}`}>
                {valor}{it.tipo === 'numero' && it.unidad ? ` ${it.unidad}` : ''}
              </p>
            )}
            {(valor === null || valor === undefined || valor === '') && it.tipo !== 'foto' && <p className="mt-1 text-sm text-muted-foreground">Sin respuesta</p>}
            {r.comentario && <p className="mt-1 text-sm whitespace-pre-line">{r.comentario}</p>}
            {r.fotos?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {r.fotos.map((f) => (
                  <MantFoto key={f.id} tareaId={t.id} fotoId={f.id} className="h-20 w-20 rounded-xl border object-cover cursor-zoom-in" onClick={() => setZoom(f.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {t.observaciones && (
        <div className="rounded-[18px] border bg-card shadow-card p-4">
          <p className="text-[11px] font-semibold text-muted-foreground">Observaciones</p>
          <p className="text-sm whitespace-pre-line mt-0.5">{t.observaciones}</p>
        </div>
      )}
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>{zoom && <MantFoto tareaId={t.id} fotoId={zoom} className={ZOOM_IMG_CLASS} />}</PhotoZoomDialog>
    </div>
  );
}

function BotonPdf({ t, personas }) {
  const [cargando, setCargando] = useState(false);
  const bajar = async () => {
    setCargando(true);
    try { await generateMantTareaPdf(t, personas); } catch (e) { toast.error('No se pudo generar el PDF'); } finally { setCargando(false); }
  };
  return (
    <button type="button" onClick={bajar} disabled={cargando} data-testid="mant-pdf"
      className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted disabled:opacity-60">
      {cargando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />} PDF
    </button>
  );
}

function FotoActivo({ tareaId }) {
  const [src, setSrc] = useState(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let active = true; let url;
    api.get(`/mantenimiento/tareas/${tareaId}/foto-activo`, { responseType: 'blob' })
      .then((res) => { if (active) { url = URL.createObjectURL(res.data); setSrc(url); } }).catch(() => {});
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [tareaId]);
  if (!src) return null;
  return (
    <>
      <button type="button" onClick={() => setZoom(true)} className="shrink-0" aria-label="Ver foto de referencia del activo">
        <img src={src} alt="Referencia" className="h-16 w-16 sm:h-20 sm:w-20 rounded-xl border object-cover" />
      </button>
      <PhotoZoomDialog open={zoom} onClose={() => setZoom(false)}><img src={src} alt="Referencia del activo" className={ZOOM_IMG_CLASS} /></PhotoZoomDialog>
    </>
  );
}

function Gestion({ data, onDone }) {
  const t = data.tarea;
  const [reasignar, setReasignar] = useState(false);
  const [quien, setQuien] = useState('');
  const [cancelar, setCancelar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [fecha, setFecha] = useState(false);
  const rep = t.reprogramaciones || [];
  const enviar = async (url, body, ok) => {
    setSaving(true);
    try { await api.post(url, body); toast.success(ok); setReasignar(false); setCancelar(false); onDone(); }
    catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo completar'); }
    finally { setSaving(false); }
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <ConNovedad clave="cambiar-fecha">
          <Button variant="outline" className="rounded-xl" onClick={() => setFecha(true)} data-testid="mant-cambiar-fecha">
            <CalendarClock className="h-4 w-4 mr-1.5" /> Cambiar fecha
          </Button>
        </ConNovedad>
        <Button variant="outline" className="rounded-xl" onClick={() => { setQuien(''); setReasignar(true); }} data-testid="mant-reasignar">
          <UserRoundCog className="h-4 w-4 mr-1.5" /> Reasignar
        </Button>
        <Button variant="outline" className="rounded-xl text-[#dc2626] hover:text-[#dc2626]" onClick={() => { setMotivo(''); setCancelar(true); }}>
          <Ban className="h-4 w-4 mr-1.5" /> Cancelar tarea
        </Button>
      </div>
      <CambiarFecha open={fecha} onOpenChange={setFecha} titulo={`Cambiar fecha · ${t.numero}`} detalle={`${t.checklist.nombre} en ${t.activo_codigo}.`}
        fecha={t.fecha} hora={t.disponible_desde.slice(11, 16)} original={rep.length ? rep[0].de : null}
        guardar={(body) => api.post(`/mantenimiento/tareas/${t.id}/reprogramar`, body).then(onDone)} />
      <Dialog open={reasignar} onOpenChange={setReasignar}>
        <DialogContent className="w-[min(460px,100%)] max-w-none rounded-[22px]">
          <DialogHeader className="text-left"><DialogTitle className="font-heading text-xl">Reasignar {t.numero}</DialogTitle>
            <DialogDescription>La tarea pasa a otra persona; se le avisa si ya está disponible.</DialogDescription></DialogHeader>
          <Buscador value={quien} onChange={setQuien} placeholder="Elegir persona…"
            opciones={(data.usuarios || []).filter((u) => u.id !== t.responsable_id).map((u) => ({ id: u.id, label: u.name, sub: [u.position, u.area].filter(Boolean).join(' · ') }))} />
          <DialogFooter className="gap-2 sm:gap-2 flex-row justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => setReasignar(false)}>Cancelar</Button>
            <Button disabled={!quien || saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white"
              onClick={() => enviar(`/mantenimiento/tareas/${t.id}/reasignar`, { usuario_id: quien }, 'Tarea reasignada')}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reasignar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={cancelar} onOpenChange={setCancelar}>
        <DialogContent className="w-[min(460px,100%)] max-w-none rounded-[22px]">
          <DialogHeader className="text-left"><DialogTitle className="font-heading text-xl">Cancelar {t.numero}</DialogTitle>
            <DialogDescription>No cuenta en el cumplimiento del ciclo.</DialogDescription></DialogHeader>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ej. equipo en reparación)" />
          <DialogFooter className="gap-2 sm:gap-2 flex-row justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => setCancelar(false)}>Volver</Button>
            <Button disabled={!motivo.trim() || saving} className="rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white"
              onClick={() => enviar(`/mantenimiento/tareas/${t.id}/cancelar`, { motivo: motivo.trim() }, 'Tarea cancelada')}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancelar tarea'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* Una tarea de mantenimiento: llenar el checklist (en celular, una pregunta
   por pantalla con botones grandes) o ver lo respondido. Borrador con fotos
   en IndexedDB por si el teléfono cierra la pestaña al abrir la cámara. */
export default function MantTarea() {
  const { id } = useParams();
  const navigate = useNavigate();
  const esMovil = useEsMovil();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [resp, setResp] = useState({});
  const [fotos, setFotos] = useState({});
  const [obs, setObs] = useState('');
  const [paso, setPaso] = useState(0);
  const [verErrores, setVerErrores] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const cargado = useRef(false);
  const KEY = `mant_tarea_${id}`;

  const load = useCallback(async () => {
    try { const { data: d } = await api.get(`/mantenimiento/tareas/${id}`); setData(d); setError(null); }
    catch (e) { setError(e?.response?.status === 403 ? 'No tienes acceso a esta tarea.' : 'No se pudo cargar la tarea.'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // recuperar borrador
  useEffect(() => {
    if (!data?.puede_hacer || cargado.current) return;
    cargado.current = true;
    idbGet(KEY).then((b) => {
      if (!b) return;
      setResp(b.resp || {}); setObs(b.obs || '');
      setFotos(Object.fromEntries(Object.entries(b.fotos || {}).map(([k, arr]) => [k, arr.map((f) => ({ ...f, dataUrl: URL.createObjectURL(f.blob) }))])));
      toast.message('Recuperamos lo que llevabas');
    });
  }, [data, KEY]);
  // guardar borrador
  useEffect(() => {
    if (!data?.puede_hacer || !cargado.current) return;
    const h = setTimeout(() => {
      idbSet(KEY, { resp, obs, fotos: Object.fromEntries(Object.entries(fotos).map(([k, arr]) => [k, arr.map(({ key, blob }) => ({ key, blob }))])) });
    }, 400);
    return () => clearTimeout(h);
  }, [resp, fotos, obs, data, KEY]);

  if (error) {
    return (
      <div className="max-w-[600px] mx-auto pt-16 text-center">
        <Info className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate('/mantenimiento')} className="rounded-xl mt-4">Mis mantenimientos</Button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const t = data.tarea;
  const items = t.checklist.items;
  const ad = !!t.checklist.antes_despues;
  // pasos: [antes], preguntas, [después]
  const pasosLlenar = [...(ad ? [{ id: ANTES }] : []), ...items, ...(ad ? [{ id: DESPUES }] : [])];
  const responsable = data.personas[t.responsable_id]?.name;

  const addFoto = (itemId) => async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const f of files) {
      try {
        const { blob, dataUrl } = await compressImage(f);
        setFotos((x) => ({ ...x, [itemId]: [...(x[itemId] || []), { key: `${Date.now()}-${Math.random()}`, blob, dataUrl }] }));
      } catch (err) { toast.error(err.message); }
    }
  };
  const removeFoto = (itemId) => (key) => setFotos((x) => ({ ...x, [itemId]: (x[itemId] || []).filter((f) => f.key !== key) }));
  const pendientes = pasosLlenar.map((it, i) => [i, falta(it, resp[it.id], fotos[it.id])]).filter(([, e]) => e);

  const enviar = async () => {
    if (pendientes.length) {
      setVerErrores(true);
      toast.error(`Falta completar ${pendientes.length} pregunta${pendientes.length === 1 ? '' : 's'}`);
      if (esMovil) setPaso(pendientes[0][0]);
      return;
    }
    const fallas = items.filter((it) => esFalla(it, resp[it.id]?.valor)).length;
    const ok = await confirmar({
      titulo: '¿Enviar el mantenimiento?', textoConfirmar: 'Enviar',
      mensaje: fallas ? `Reportas ${fallas} falla${fallas === 1 ? '' : 's'}: se avisará al supervisor.` : 'Ya no se podrá cambiar.',
    });
    if (!ok) return;
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.append('data', JSON.stringify({
        observaciones: obs,
        respuestas: pasosLlenar.map((it) => ({ item_id: it.id, valor: resp[it.id]?.valor ?? null, comentario: resp[it.id]?.comentario || '' })),
      }));
      Object.entries(fotos).forEach(([itemId, arr]) => arr.forEach((f, i) => {
        fd.append('photos', f.blob, `${itemId}-${i}.jpg`);
        fd.append('photo_owner', itemId);
      }));
      await api.post(`/mantenimiento/tareas/${t.id}/completar`, fd);
      await idbDel(KEY);
      toast.success(`${t.numero} completada`);
      setResp({}); setFotos({});
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo enviar');
    } finally { setEnviando(false); }
  };

  const preguntaProps = (it, i) => ({
    it, n: i + 1, total: items.length, r: resp[it.id], fotos: fotos[it.id] || [], mostrarError: verErrores,
    onChange: (r) => setResp((x) => ({ ...x, [it.id]: r })), onAddFoto: addFoto(it.id), onRemoveFoto: removeFoto(it.id),
  });
  // un paso: el antes / el después, o una pregunta (numerada sin contar el antes)
  const renderPaso = (p, grande) => (EXTREMOS[p.id]
    ? <Extremo key={p.id} clave={p.id} r={resp[p.id]} fotos={fotos[p.id] || []} mostrarError={verErrores} grande={grande}
        onChange={(r) => setResp((x) => ({ ...x, [p.id]: r }))} onAddFoto={addFoto(p.id)} onRemoveFoto={removeFoto(p.id)} />
    : <Pregunta key={p.id} {...preguntaProps(p, items.indexOf(p))} grande={grande} />);

  const encabezado = (
    <div className="mb-4 rounded-[18px] border bg-card shadow-card p-4 flex gap-3">
      <FotoActivo tareaId={t.id} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">{t.numero}</span>
          <EstadoTarea tarea={t} ahora={data.ahora} />
          {t.estado === 'completada' && <BotonPdf t={t} personas={data.personas} />}
        </div>
        <h1 className="font-heading text-lg sm:text-2xl font-semibold mt-0.5 break-words">{t.checklist.nombre}</h1>
        <p className="text-sm text-muted-foreground truncate">{t.activo_codigo} · {t.activo_nombre} · {t.sucursal}{t.ubicacion ? ` · ${t.ubicacion}` : ''}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {t.estado === 'completada'
            ? `Hecha por ${t.completada_por_nombre} · ${fechaHora(t.completada_en)}${t.tardia ? ' (tarde)' : ''}`
            : `Vence ${fechaHora(t.vence_en)}${t.acepta_tardias ? ' · se acepta tarde' : ''} · ${responsable || '—'}`}
        </p>
        {t.reprogramaciones?.length > 0 && (
          <p className="text-xs text-[#ec9032] mt-0.5">
            Reprogramada: era el {fechaCorta(t.reprogramaciones[0].de)}{t.reprogramaciones.at(-1).motivo ? ` · ${t.reprogramaciones.at(-1).motivo}` : ''} ({t.reprogramaciones.at(-1).por})
          </p>
        )}
      </div>
    </div>
  );

  // Ver (completada, incompleta, programada, cancelada, o de otra persona)
  if (!data.puede_hacer) {
    return (
      <div className="max-w-[760px] mx-auto pt-2">
        <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver
        </button>
        {encabezado}
        {t.estado === 'programada' && (
          <p className="mb-4 rounded-xl bg-muted/60 px-4 py-3 text-sm">
            {t.disponible_desde <= data.ahora
              ? 'Se está habilitando: en menos de un minuto se puede llenar. Recarga la página.'
              : `Disponible desde ${fechaHora(t.disponible_desde)}. Ese día se le avisa a ${responsable}.`}
          </p>
        )}
        {t.estado === 'pendiente' && <p className="mb-4 rounded-xl bg-muted/60 px-4 py-3 text-sm">La está haciendo {responsable}.</p>}
        {t.estado === 'incompleta' && <p className="mb-4 rounded-xl bg-[rgba(220,38,38,0.08)] px-4 py-3 text-sm text-[#dc2626]">Incompleta: {t.incompleta_motivo || 'no se hizo a tiempo'}.</p>}
        {t.estado === 'cancelada' && <p className="mb-4 rounded-xl bg-muted/60 px-4 py-3 text-sm">Cancelada por {t.cancelada_por}: {t.cancelada_motivo}</p>}
        {data.puede_gestionar && ['programada', 'pendiente'].includes(t.estado) && <div className="mb-4"><Gestion data={data} onDone={load} /></div>}
        {t.estado === 'completada' ? <Respuestas t={t} /> : (
          <div className="rounded-[18px] border bg-card shadow-card p-4">
            <p className="text-sm font-semibold mb-2">Checklist · {items.length} preguntas</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">{items.map((it) => <li key={it.id}>{it.texto}</li>)}</ol>
          </div>
        )}
      </div>
    );
  }

  // Llenar: celular paso a paso; PC todo en una columna
  const enResumen = esMovil && paso >= pasosLlenar.length;
  return (
    <div className="max-w-[760px] mx-auto pt-2 pb-24 sm:pb-6">
      <button type="button" onClick={() => navigate('/mantenimiento')} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Mis mantenimientos
      </button>
      {encabezado}
      {t.estado === 'programada' && (
        <p className="mb-4 rounded-xl bg-[rgba(0,165,223,0.1)] px-4 py-3 text-sm text-[#1e395e] dark:text-[#3cbef6]" data-testid="mant-adelantar">
          Esta tarea se habilita el {fechaHora(t.disponible_desde)}, pero como eres el responsable puedes adelantarla y hacerla ahora.
        </p>
      )}

      {esMovil ? (
        <>
          <div className="mb-3 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-[#00a5df] transition-all" style={{ width: `${Math.min(100, (paso / pasosLlenar.length) * 100)}%` }} />
          </div>
          {enResumen ? (
            <div className="rounded-[18px] border bg-card shadow-card p-4 space-y-3">
              <p className="font-medium">Observaciones generales <span className="text-muted-foreground font-normal">(opcional)</span></p>
              <Textarea rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Algo más que deba saber el supervisor" />
              <p className="text-sm text-muted-foreground">
                {pendientes.length ? `Faltan ${pendientes.length} pregunta${pendientes.length === 1 ? '' : 's'} por completar.` : 'Todo listo para enviar.'}
              </p>
            </div>
          ) : renderPaso(pasosLlenar[paso], true)}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur px-4 py-3 flex gap-2"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
            <Button variant="outline" className="rounded-xl h-12 flex-1" disabled={paso === 0} onClick={() => setPaso((p) => p - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            {enResumen ? (
              <Button className="rounded-xl h-12 flex-[2] bg-[#1e395e] hover:bg-[#162c49] text-white" disabled={enviando} onClick={enviar} data-testid="mant-enviar">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
              </Button>
            ) : (
              <Button className="rounded-xl h-12 flex-[2] bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="mant-siguiente"
                onClick={() => {
                  const e = falta(pasosLlenar[paso], resp[pasosLlenar[paso].id], fotos[pasosLlenar[paso].id]);
                  if (e) { setVerErrores(true); toast.error(e); return; }
                  setPaso((p) => p + 1);
                }}>
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {pasosLlenar.map((p) => renderPaso(p, false))}
          <div className="rounded-[18px] border bg-card shadow-card p-4 space-y-2">
            <Label htmlFor="mant-obs">Observaciones generales <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea id="mant-obs" rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Algo más que deba saber el supervisor" />
          </div>
          <div className="flex justify-end">
            <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[200px] h-11" disabled={enviando} onClick={enviar} data-testid="mant-enviar">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar mantenimiento'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
