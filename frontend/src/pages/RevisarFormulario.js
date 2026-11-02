import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Paperclip, Ticket } from 'lucide-react';
import api from '@/lib/api';
import { ENTREGAS, cuando, urlMapa } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { AuthedImg, descargarArchivo } from '@/components/customform/CustomFormHistorial';

/* Una entrega ya enviada: el supervisor la aprueba o la devuelve con un
   comentario; quien la envió y quien ve resultados la consultan. Con
   `onResuelto` va dentro de Supervisión, sin su propia navegación. */

const LINEA = {
  enviado: (h) => `${h.por?.name} lo envió.`,
  corregido: (h) => `${h.por?.name} lo corrigió y lo volvió a enviar.`,
  aprobado: (h) => `Aprobado por ${h.por?.name}${h.comentario ? `: «${h.comentario}»` : '.'}`,
  devuelto: (h) => `Devuelto por ${h.por?.name}: «${h.comentario}»`,
};

export default function RevisarFormulario({ aid, onCambio, onResuelto }) {
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(null);
  const [aviso, setAviso] = useState('');
  const [zoom, setZoom] = useState(null);
  const cargar = useCallback(() => {
    api.get(`/formularios-v2/asignaciones/${aid}/revision`).then(({ data }) => setD(data)).catch((e) => setError(e?.response?.data?.detail || 'No se pudo abrir'));
  }, [aid]);
  useEffect(() => { cargar(); }, [cargar]);

  const resolver = async (accion) => {
    if (accion === 'devolver' && !comentario.trim()) { setAviso('Escribe qué hay que corregir para devolverlo.'); return; }
    setEnviando(accion); setAviso('');
    try {
      await api.post(`/formularios-v2/asignaciones/${aid}/${accion}`, { comentario });
      toast.success(accion === 'aprobar' ? 'Aprobado: se le avisó a quien lo envió' : 'Devuelto: le vuelve a aparecer para corregir');
      if (onResuelto) onResuelto(); else navigate('/formularios/supervision');
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); cargar(); onCambio?.(); }
    finally { setEnviando(null); }
  };

  if (error) return <p className="text-sm text-muted-foreground text-center py-16">{error}</p>;
  if (!d) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;
  const { asignacion: a, respuesta: r, titulo } = d;
  const [estado, chip] = ENTREGAS[a.estado] || ENTREGAS.completado;
  const foto = (p) => `/formularios-custom/${a.form_id}/respuestas/${r.id}/foto/${p.id}`;
  return (
    <div className={`flex flex-col gap-3 ${onResuelto ? '' : 'max-w-[860px] mx-auto pt-2'}`}>
      {!onResuelto && (
        <Link to={d.puede_revisar ? '/formularios/supervision' : '/mis-formularios'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground min-h-[44px]">
          <ArrowLeft className="h-4 w-4" /> {d.puede_revisar ? 'Supervisión' : 'Mis formularios'}
        </Link>
      )}
      <div className="rounded-2xl border bg-card px-4 py-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <div className="flex-[1_1_280px] min-w-0">
          <h1 className="font-heading text-xl font-semibold">{titulo}{a.sucursal ? ` · Tienda ${a.sucursal}` : ''}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {r.respondent_name} · enviado {cuando(a.enviada_at)}{r.total_max > 0 ? ` · ${r.total_score} de ${r.total_max} (${r.percent} %)` : ''}{r.version ? ` · versión ${r.version}` : ''}{a.tardia ? ' · entregado tarde' : ''}
          </p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${chip}`}>{estado}</span>
      </div>

      {r.seguimiento_id && (
        <Link to={`/formularios/tickets/${r.seguimiento_id}`} className="rounded-xl bg-[#fff3e6] text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b] px-3 py-2 text-sm flex items-center gap-2 hover:underline">
          <Ticket className="h-4 w-4 shrink-0" /> Esta entrega abrió un seguimiento
        </Link>
      )}

      <div className="rounded-2xl border bg-card overflow-hidden">
        {r.entries.map((e) => {
          const respuesta = Array.isArray(e.respuesta) ? e.respuesta.join(e.tipo === 'matriz' ? '\n' : ', ') : e.respuesta;
          const mal = e.respuesta === 'No cumple';
          return (
            <div key={e.id} className="flex flex-wrap gap-3 items-start px-3.5 py-3 border-b last:border-0">
              <div className="flex-[1_1_220px] min-w-0">
                <p className="text-[13px] font-semibold">{e.titulo}</p>
                {respuesta && <p className={`text-[13px] font-medium whitespace-pre-line ${mal ? 'text-[#b42318] dark:text-[#f87171]' : e.respuesta === 'Cumple' ? 'text-[#16794a] dark:text-[#4ade80]' : ''}`}>{respuesta}</p>}
                {e.tipo === 'ubicacion' && e.valor && <a href={urlMapa(e.valor)} target="_blank" rel="noreferrer" className="text-xs underline text-[#1e395e] dark:text-[#3cbef6]">Ver en el mapa</a>}
                {e.note && <p className="text-xs text-muted-foreground mt-0.5">«{e.note}»</p>}
                {e.archivos?.map((x) => (
                  <button key={x.id} type="button" onClick={() => descargarArchivo(a.form_id, r.id, x)} className="mt-1 mr-1 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs hover:bg-muted">
                    <Paperclip className="h-3.5 w-3.5" /> {x.nombre || 'Archivo'}
                  </button>
                ))}
              </div>
              {e.max > 0 && <span className="text-xs font-bold shrink-0">{e.score}/{e.max}</span>}
              {e.photos?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {e.photos.map((p) => <AuthedImg key={p.id} url={foto(p)} className="h-14 w-14 rounded-[10px] object-cover border cursor-pointer" onClick={() => setZoom(foto(p))} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {d.puede_revisar && (
        <div className="rounded-2xl border bg-card p-3.5 flex flex-col gap-2.5">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">Observaciones
            <Textarea rows={2} value={comentario} onChange={(e) => { setComentario(e.target.value); setAviso(''); }} maxLength={2000}
              placeholder="Obligatorio si lo devuelves: qué hay que corregir" className="font-normal" />
          </label>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="outline" className="min-h-[44px] rounded-[10px] border-[#c2410c] text-[#8a4b0f] dark:text-[#f5b56b] font-semibold" onClick={() => resolver('devolver')} disabled={!!enviando}>
              {enviando === 'devolver' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Devolver para corregir
            </Button>
            <Button className="min-h-[44px] rounded-[10px] bg-[#16794a] hover:bg-[#12633c] text-white font-semibold" onClick={() => resolver('aprobar')} disabled={!!enviando}>
              {enviando === 'aprobar' && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Aprobar
            </Button>
          </div>
          <p className={`text-xs ${aviso ? 'text-[#b42318] dark:text-[#f87171]' : 'text-muted-foreground'}`}>{aviso || 'Quien llenó recibe un aviso; si lo devuelves, le vuelve a aparecer para corregir y reenviar.'}</p>
        </div>
      )}

      {a.historial?.length > 0 && (
        <div className="rounded-2xl border bg-card p-3.5 flex flex-col gap-2">
          <h2 className="font-heading text-sm font-semibold">Historial de revisión</h2>
          {a.historial.map((h, i) => <p key={i} className="text-[13px]"><span className="text-muted-foreground">{cuando(h.at)} ·</span> {(LINEA[h.accion] || LINEA.enviado)(h)}</p>)}
          {r.modificaciones?.map((m, i) => <p key={`m${i}`} className="text-[13px]"><span className="text-muted-foreground">{cuando(m.at)} ·</span> {m.por?.name} modificó la respuesta.</p>)}
        </div>
      )}
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>{zoom && <AuthedImg url={zoom} className={ZOOM_IMG_CLASS} />}</PhotoZoomDialog>
    </div>
  );
}
