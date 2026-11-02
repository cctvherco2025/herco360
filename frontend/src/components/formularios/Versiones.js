import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, PencilLine, Minus, AlertTriangle, Loader2, History, RotateCcw, EyeOff, ChevronDown } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { confirmar } from '@/components/ConfirmDialog';

const ICONO_CAMBIO = {
  nueva: [Plus, 'text-[#16a34a]', 'Nueva'],
  cambio: [PencilLine, 'text-[#0284c7] dark:text-[#3cbef6]', 'Cambió'],
  quitada: [Minus, 'text-[#dc2626]', 'Quitada'],
};

export function ListaCambios({ cambios }) {
  if (!cambios?.length) return <p className="text-sm text-muted-foreground">Sin cambios en las preguntas.</p>;
  return (
    <ul className="space-y-1.5">
      {cambios.map((c, i) => {
        const [Ic, color, nombre] = ICONO_CAMBIO[c.tipo] || ICONO_CAMBIO.cambio;
        return (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Ic className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} aria-hidden="true" />
            <span className="min-w-0"><span className="sr-only">{nombre}: </span>{c.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}

const fecha = (iso) => (iso ? new Date(iso).toLocaleString('es-HN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// Publicar: primero guarda lo pendiente (antesDe), luego muestra qué cambió.
export function PublicarDialog({ open, onOpenChange, formId, antesDe, onPublicado }) {
  const [info, setInfo] = useState(null);
  const [nota, setNota] = useState('');
  const [publicando, setPublicando] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setInfo(null); setNota(''); setError(null);
    (async () => {
      try {
        if (antesDe && !(await antesDe())) { if (vivo) setError('No se pudo guardar lo último. Revisa tu conexión.'); return; }
        const { data } = await api.get(`/formularios-v2/${formId}/cambios`);
        if (vivo) setInfo(data);
      } catch (e) { if (vivo) setError(e?.response?.data?.detail || 'No se pudo revisar el formulario'); }
    })();
    return () => { vivo = false; };
  }, [open, formId, antesDe]);

  const publicar = async () => {
    setPublicando(true);
    try {
      const { data } = await api.post(`/formularios-v2/${formId}/publicar`, { nota });
      toast.success(data.nueva ? `Versión ${data.version} publicada` : 'Formulario publicado otra vez');
      onPublicado?.(data);
      onOpenChange(false);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo publicar'); }
    finally { setPublicando(false); }
  };

  const sinCambios = info && !info.cambios.length && info.version > 0;
  const reactivar = sinCambios && info.estado !== 'publicado';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{info && info.version ? `Publicar la versión ${info.siguiente}` : 'Publicar el formulario'}</DialogTitle>
          <DialogDescription>Lo que se publica es lo que la gente contesta. Lo ya respondido no cambia.</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-[#dc2626]">{error}</p>}
        {!info && !error && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Revisando cambios…</p>}
        {info && (
          <div className="space-y-4">
            {info.errores.length > 0 && (
              <div className="rounded-xl border border-[#dc2626]/40 bg-[rgba(220,38,38,0.06)] p-3">
                <p className="text-sm font-semibold flex items-center gap-1.5 text-[#b91c1c] dark:text-[#f87171]"><AlertTriangle className="h-4 w-4" /> Falta arreglar antes de publicar</p>
                <ul className="mt-1.5 text-sm list-disc pl-5 space-y-0.5">{info.errores.map((e) => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            {info.avisos?.map((a) => (
              <p key={a} className="text-sm rounded-xl bg-[#fff3e6] text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b] p-2.5 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /><span>{a}</span>
              </p>
            ))}
            {sinCambios ? (
              <p className="text-sm">{reactivar ? `No hay cambios desde la versión ${info.version}: se vuelve a publicar tal cual.` : `No hay cambios desde la versión ${info.version}.`}</p>
            ) : (
              <div>
                <p className="text-sm font-semibold mb-2">{info.version ? `Cambios desde la versión ${info.version}` : 'Lo que se publica'}</p>
                <ListaCambios cambios={info.cambios} />
              </div>
            )}
            {info.version > 0 && info.respuestas_version_actual > 0 && !sinCambios && (
              <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-2.5">
                {info.respuestas_version_actual === 1
                  ? `La respuesta de la versión ${info.version} se queda como se contestó.`
                  : `Las ${info.respuestas_version_actual} respuestas de la versión ${info.version} se quedan como se contestaron.`}
              </p>
            )}
            {!sinCambios && (
              <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Nota de la versión (opcional)
                <Input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej.: se agregó la foto del pasillo" className="h-10 text-sm text-foreground" />
              </label>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={publicar}
                disabled={publicando || info.errores.length > 0 || (sinCambios && !reactivar)}>
                {publicando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                {reactivar ? 'Volver a publicar' : `Publicar${info.version ? ` versión ${info.siguiente}` : ''}`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function VersionesDialog({ open, onOpenChange, formId, onRestaurado, onDespublicado, puedeRestaurar = true, puedeDespublicar = true }) {
  const [data, setData] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const cargar = () => api.get(`/formularios-v2/${formId}/versiones`).then(({ data: d }) => setData(d)).catch(() => toast.error('No se pudieron cargar las versiones'));
  useEffect(() => { if (open) { setData(null); setAbierta(null); cargar(); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const restaurar = async (v) => {
    let doc = null;
    const ok = await confirmar({
      titulo: `¿Usar la versión ${v.numero} como borrador?`,
      mensaje: <>El borrador actual se reemplaza por la versión {v.numero}. Lo publicado no cambia hasta que vuelvas a publicar.{data?.cambios_sin_publicar && <><br /><b>Hay cambios sin publicar que se pierden</b> (puedes deshacer en el constructor).</>}</>,
      textoConfirmar: 'Usar como borrador',
      textoCargando: 'Cargando…',
      accion: async () => { doc = (await api.post(`/formularios-v2/${formId}/versiones/${v.numero}/restaurar`)).data; },
    });
    if (ok && doc) { onRestaurado?.(doc); onOpenChange(false); toast.success(`El borrador ahora es la versión ${v.numero}`); }
  };

  const despublicar = async () => {
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Despublicar el formulario?',
      mensaje: 'Deja de recibir respuestas. Lo respondido se conserva y puedes volver a publicarlo cuando quieras.',
      textoConfirmar: 'Despublicar',
      textoCargando: 'Despublicando…',
      textoExito: 'Formulario despublicado',
      accion: () => api.post(`/formularios-v2/${formId}/despublicar`),
    });
    if (ok) { onDespublicado?.(); cargar(); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2"><History className="h-5 w-5" /> Versiones</DialogTitle>
          <DialogDescription>Cada publicación guarda una versión. Cada respuesta queda con la versión que se contestó.</DialogDescription>
        </DialogHeader>
        {!data ? <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p> : (
          <div className="space-y-3">
            {data.estado === 'publicado' && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
                <p className="text-sm">Publicada: <b>versión {data.actual}</b>{data.cambios_sin_publicar && <span className="text-muted-foreground"> · hay cambios sin publicar</span>}</p>
                {puedeDespublicar && <Button variant="outline" size="sm" className="rounded-lg text-[#dc2626] hover:text-[#dc2626]" onClick={despublicar}><EyeOff className="h-4 w-4 mr-1.5" /> Despublicar</Button>}
              </div>
            )}
            {data.estado === 'despublicado' && <p className="text-sm rounded-xl bg-muted/60 p-3">Despublicado: no recibe respuestas. Publica para reactivarlo.</p>}
            {!data.versiones.length && <p className="text-sm text-muted-foreground">Todavía no se ha publicado ninguna versión.</p>}
            <ol className="space-y-2">
              {data.versiones.map((v) => (
                <li key={v.id} className="rounded-xl border p-3">
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm font-semibold">
                        Versión {v.numero}
                        {v.numero === data.actual && data.estado === 'publicado' && <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#e7f6ee] text-[#16794a] dark:bg-[rgba(22,163,74,0.18)] dark:text-[#4ade80]">En uso</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{fecha(v.publicada_at)} · {v.publicada_por?.name} · {v.respuestas} {v.respuestas === 1 ? 'respuesta' : 'respuestas'}</p>
                      {v.nota && <p className="text-sm mt-1">{v.nota}</p>}
                    </div>
                    {puedeRestaurar && <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => restaurar(v)}><RotateCcw className="h-4 w-4 mr-1.5" /> Usar como borrador</Button>}
                  </div>
                  {v.cambios?.length > 0 && (
                    <>
                      <button type="button" onClick={() => setAbierta(abierta === v.id ? null : v.id)} aria-expanded={abierta === v.id}
                        className="mt-1.5 text-xs text-[#0284c7] dark:text-[#3cbef6] inline-flex items-center gap-1">
                        {v.cambios.length} {v.cambios.length === 1 ? 'cambio' : 'cambios'} <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierta === v.id ? 'rotate-180' : ''}`} />
                      </button>
                      {abierta === v.id && <div className="mt-2"><ListaCambios cambios={v.cambios} /></div>}
                    </>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
