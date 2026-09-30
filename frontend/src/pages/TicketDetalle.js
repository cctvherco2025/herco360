import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Check, Loader2, Send } from 'lucide-react';
import api from '@/lib/api';
import { timeAgoEs } from '@/lib/time';
import { compressImage } from '@/lib/flosPhoto';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AuthedImg } from '@/components/customform/CustomFormHistorial';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { EstadoTicket } from '@/pages/Tickets';

// Una o varias fotos elegidas -> FormData con 'fotos' (comprimidas como el resto de la app).
async function fotosAFormData(fd, files) {
  for (const file of Array.from(files || [])) {
    const { blob } = await compressImage(file);
    fd.append('fotos', blob, file.name || 'foto.jpg');
  }
  return fd;
}

/* Un ticket de Promociones del mes: las líneas con inconsistencias, la foto de
   la corrección de cada una y la conversación. El coordinador corrige y envía;
   el jefe o el gerente de la tienda valida y cierra, o reabre. */
export default function TicketDetalle() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState([]);
  const [ocupado, setOcupado] = useState(null);
  const [zoom, setZoom] = useState(null);
  const fotoMsg = useRef(null);
  const fotoLinea = useRef({});

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/tickets/${id}`); setT(data); }
    catch (e) { setError(e?.response?.data?.detail || 'No se pudo abrir el ticket'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const accion = async (key, fn, ok) => {
    setOcupado(key);
    try { const { data } = await fn(); setT(data); if (ok) toast.success(ok); return true; }
    catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo completar'); return false; }
    finally { setOcupado(null); }
  };
  const formTexto = () => { const fd = new FormData(); fd.append('texto', texto.trim()); return fd; };

  const marcarLinea = (ln, corregida, files) => accion(`linea-${ln.item_id}`, async () => {
    const fd = new FormData();
    fd.append('corregida', corregida ? 'true' : 'false');
    await fotosAFormData(fd, files);
    return api.post(`/tickets/${id}/lineas/${ln.item_id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  });

  const enviarMensaje = async () => {
    const ok = await accion('mensaje', async () => {
      const fd = await fotosAFormData(formTexto(), adjuntos);
      return api.post(`/tickets/${id}/mensajes`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    });
    if (ok) { setTexto(''); setAdjuntos([]); }
  };
  const conTexto = (key, ruta, ok) => async () => {
    const hecho = await accion(key, () => api.post(`/tickets/${id}/${ruta}`, formTexto(), { headers: { 'Content-Type': 'multipart/form-data' } }), ok);
    if (hecho) setTexto('');
  };

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto pt-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/formularios/tickets"><ArrowLeft className="h-4 w-4 mr-1.5" /> Tickets</Link></Button>
      </div>
    );
  }
  if (!t) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const fotoUrl = (f) => `/tickets/${t.id}/foto/${f.id}`;
  const abierto = t.estado === 'abierto';
  const activo = abierto || t.estado === 'corregido';
  const listas = t.lineas.every((l) => l.corregida && (l.fotos || []).length);

  return (
    <div className="max-w-[1000px] mx-auto pt-2 space-y-4" data-testid="ticket-detalle">
      <Link to="/formularios/tickets" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tickets
      </Link>

      <div className="rounded-[18px] bg-card border shadow-card p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{t.numero}</span>
          <EstadoTicket estado={t.estado} />
          {t.reaperturas > 0 && <span className="text-xs text-muted-foreground">reabierto {t.reaperturas} vez{t.reaperturas === 1 ? '' : 'es'}</span>}
        </div>
        <h1 className="font-heading text-2xl font-semibold">{t.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {t.origen?.periodo_label ? `Promociones de ${t.origen.periodo_label} · ` : ''}
          Abierto por {t.abierto_por?.name} · asignado a {t.soy_asignado ? 'ti' : t.asignado_a?.name}
          {t.origen?.form_id && <> · <Link to={`/formularios/custom/${t.origen.form_id}`} className="text-[#00a5df] hover:underline">ver la publicación</Link></>}
        </p>
        {t.estado === 'cerrado' && <p className="text-xs rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] px-3 py-2">Cerrado por {t.cerrado_por?.name} {timeAgoEs(t.cerrado_at)}: la categoría quedó validada.</p>}
        {t.estado === 'cancelado' && <p className="text-xs rounded-xl bg-muted px-3 py-2">Cancelado: la respuesta de esta categoría se eliminó.</p>}
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
        {/* Líneas con inconsistencias */}
        <div className="space-y-3">
          {t.lineas.map((ln) => (
            <div key={ln.item_id} className={`rounded-[16px] bg-card border p-4 space-y-2 ${ln.corregida ? 'border-[#16a34a]/60' : 'border-[#ec9032]'}`} data-testid="ticket-linea">
              <p className="text-sm font-semibold">{ln.titulo}</p>
              <p className="text-sm"><span className="font-semibold text-[#b45309] dark:text-[#fbbf24]">{ln.tipo}</span>{ln.comentario ? ` · ${ln.comentario}` : ''}</p>
              {(ln.fotos || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ln.fotos.map((f) => <AuthedImg key={f.id} url={fotoUrl(f)} className="h-20 w-20 rounded-lg object-cover border cursor-zoom-in" onClick={() => setZoom(fotoUrl(f))} />)}
                </div>
              )}
              {t.soy_asignado && abierto ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <input ref={(el) => { fotoLinea.current[ln.item_id] = el; }} type="file" accept="image/*" multiple className="hidden"
                    onChange={(e) => { marcarLinea(ln, ln.corregida, e.target.files); e.target.value = ''; }} />
                  <Button size="sm" variant="outline" className="rounded-xl" disabled={!!ocupado}
                    onClick={() => fotoLinea.current[ln.item_id]?.click()} data-testid="ticket-linea-foto">
                    {ocupado === `linea-${ln.item_id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Camera className="h-4 w-4 mr-1.5" /> Foto de la corrección</>}
                  </Button>
                  <Button size="sm" variant={ln.corregida ? 'default' : 'outline'} disabled={!!ocupado}
                    className={`rounded-xl ${ln.corregida ? 'bg-[#16a34a] hover:bg-[#15803d] text-white' : ''}`}
                    onClick={() => marcarLinea(ln, !ln.corregida)} data-testid="ticket-linea-corregida">
                    <Check className="h-4 w-4 mr-1.5" /> {ln.corregida ? 'Corregida' : 'Marcar corregida'}
                  </Button>
                </div>
              ) : (
                <p className={`text-xs font-medium ${ln.corregida ? 'text-[#16a34a]' : 'text-muted-foreground'}`}>{ln.corregida ? 'Corregida por el coordinador' : 'Sin corregir'}</p>
              )}
            </div>
          ))}
        </div>

        {/* Conversación */}
        <div className="rounded-[18px] bg-card border shadow-card p-4 space-y-3">
          <h2 className="font-heading font-semibold">Conversación</h2>
          <div className="space-y-2.5">
            {t.mensajes.map((m) => (m.rol === 'sistema' ? (
              <p key={m.id} className="text-xs text-muted-foreground text-center">{m.texto} · {timeAgoEs(m.at)}</p>
            ) : (
              <div key={m.id} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.rol === 'coordinador' ? 'ml-auto bg-[rgba(22,163,74,0.1)] rounded-br-md' : 'bg-[rgba(236,144,50,0.12)] rounded-bl-md'}`}>
                <p className="text-xs font-semibold mb-0.5">{m.de_name}</p>
                {m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
                {(m.fotos || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {m.fotos.map((f) => <AuthedImg key={f.id} url={fotoUrl(f)} className="h-16 w-16 rounded-lg object-cover border cursor-zoom-in" onClick={() => setZoom(fotoUrl(f))} />)}
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgoEs(m.at)}</p>
              </div>
            )))}
          </div>

          {activo && (
            <div className="space-y-2 pt-2 border-t">
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escribe un mensaje…" data-testid="ticket-texto" />
              <input ref={fotoMsg} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setAdjuntos(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => fotoMsg.current?.click()} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" /> {adjuntos.length ? `${adjuntos.length} foto${adjuntos.length === 1 ? '' : 's'}` : 'Adjuntar foto'}
                </button>
                <Button size="sm" variant="outline" className="rounded-xl" disabled={!!ocupado || (!texto.trim() && !adjuntos.length)} onClick={enviarMensaje}>
                  {ocupado === 'mensaje' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" /> Enviar mensaje</>}
                </Button>
              </div>

              {t.soy_asignado && abierto && (
                <div className="rounded-xl bg-muted/50 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">{listas ? 'Todo marcado. Envía la corrección para que la validen.' : 'Marca cada línea como corregida y sube su foto.'}</p>
                  <Button className="w-full rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" disabled={!!ocupado || !listas}
                    onClick={conTexto('corregido', 'corregido', 'Corrección enviada')} data-testid="ticket-enviar-correccion">
                    {ocupado === 'corregido' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar corrección'}
                  </Button>
                </div>
              )}
              {t.soy_revisor && (
                <div className="rounded-xl bg-muted/50 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {t.estado === 'corregido' ? 'Verifica en piso. Para reabrir, escribe arriba qué sigue mal.' : 'Esperando la corrección del coordinador. Si ya lo verificaste en piso, puedes cerrarlo.'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {t.estado === 'corregido' && (
                      <Button variant="outline" className="flex-1 rounded-xl text-[#b45309]" disabled={!!ocupado || !texto.trim()}
                        onClick={conTexto('reabrir', 'reabrir', 'Ticket reabierto')} data-testid="ticket-reabrir">
                        {ocupado === 'reabrir' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reabrir'}
                      </Button>
                    )}
                    <Button className="flex-1 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" disabled={!!ocupado}
                      onClick={conTexto('cerrar', 'cerrar', 'Ticket cerrado: categoría validada')} data-testid="ticket-cerrar">
                      {ocupado === 'cerrar' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar y cerrar'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>
        {zoom && <AuthedImg url={zoom} className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}
