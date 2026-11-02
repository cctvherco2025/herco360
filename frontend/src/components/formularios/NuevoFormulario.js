import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FileText, MessageSquareText, ClipboardCheck, FileSignature, Trophy, Copy, Loader2, ChevronLeft } from 'lucide-react';
import api from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const ICONOS = { blanco: FileText, encuesta: MessageSquareText, inspeccion: ClipboardCheck, solicitud: FileSignature, evaluacion: Trophy };

// «¿Cómo quieres empezar?»: plantilla del servidor o copia de otro formulario.
export default function NuevoFormulario({ open, onOpenChange, propios = [] }) {
  const navigate = useNavigate();
  const [plantillas, setPlantillas] = useState([]);
  const [creando, setCreando] = useState(null);
  const [copiar, setCopiar] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopiar(false);
    if (!plantillas.length) api.get('/formularios-v2/plantillas').then(({ data }) => setPlantillas(data)).catch(() => toast.error('No se pudieron cargar las plantillas'));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const crear = async (plantilla) => {
    setCreando(plantilla);
    try {
      const { data } = await api.post('/formularios-v2', { plantilla });
      navigate(`/formularios/v2/${data.id}/editar`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo crear el formulario'); setCreando(null); }
  };
  const duplicar = async (f) => {
    setCreando(f.id);
    try {
      const { data } = await api.post(`/formularios-v2/${f.id}/duplicar`);
      navigate(`/formularios/v2/${data.id}/editar`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo copiar'); setCreando(null); }
  };

  const tarjeta = 'w-full min-h-[96px] rounded-2xl border bg-card p-3.5 text-left flex gap-3 items-start hover:border-[#00a5df] hover:bg-[rgba(0,165,223,0.04)] disabled:opacity-60 transition-colors';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading">{copiar ? 'Copiar uno de tus formularios' : '¿Cómo quieres empezar?'}</DialogTitle>
          <DialogDescription>{copiar ? 'Se crea una copia en borrador; el original no cambia.' : 'Una plantilla trae preguntas de ejemplo que cambias como quieras.'}</DialogDescription>
        </DialogHeader>
        {copiar ? (
          <div className="space-y-2">
            <button type="button" onClick={() => setCopiar(false)} className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Plantillas</button>
            {propios.map((f) => (
              <button key={f.id} type="button" disabled={!!creando} onClick={() => duplicar(f)} className={`${tarjeta} min-h-0 items-center`}>
                {creando === f.id ? <Loader2 className="h-5 w-5 animate-spin shrink-0" /> : <Copy className="h-5 w-5 text-[#1e395e] dark:text-[#3cbef6] shrink-0" />}
                <span className="min-w-0"><span className="block font-semibold text-sm">{f.titulo}</span>
                  <span className="block text-xs text-muted-foreground">{f.preguntas} preguntas{f.version ? ` · versión ${f.version}` : ' · borrador'}</span></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {plantillas.map((p) => {
              const Ic = ICONOS[p.id] || FileText;
              return (
                <button key={p.id} type="button" disabled={!!creando} onClick={() => crear(p.id)} className={tarjeta}>
                  <span className="h-10 w-10 rounded-xl grid place-items-center bg-[#e8eef7] text-[#1e395e] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6] shrink-0">
                    {creando === p.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Ic className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-sm">{p.nombre}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{p.descripcion}</span>
                    <span className="block text-[11px] text-muted-foreground/80 mt-1">{p.detalle}</span>
                  </span>
                </button>
              );
            })}
            {plantillas.length > 0 && (
              <button type="button" disabled={!!creando || !propios.length} onClick={() => setCopiar(true)} className={tarjeta}>
                <span className="h-10 w-10 rounded-xl grid place-items-center bg-muted shrink-0"><Copy className="h-5 w-5" /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-sm">A partir de otro formulario</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">Copia uno de tus formularios del constructor nuevo y ajústalo.</span>
                  <span className="block text-[11px] text-muted-foreground/80 mt-1">{propios.length ? `${propios.length} disponibles` : 'Todavía no tienes'}</span>
                </span>
              </button>
            )}
            {!plantillas.length && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando plantillas…</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
