import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Camera, Check, Loader2, Send, Undo2, Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { timeAgoEs } from '@/lib/time';
import { compressImage } from '@/lib/flosPhoto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AuthedImg } from '@/components/customform/CustomFormHistorial';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar } from '@/components/ConfirmDialog';
import CalendarioFecha from '@/components/CalendarioFecha';
import { PRIORIDADES_TAREA } from '@/lib/constants';
import { EstadoTarea, PrioridadTarea, FechaLimite, PRIORIDAD_META } from '@/pages/Tareas';

async function fotosAFormData(fd, files) {
  for (const file of Array.from(files || [])) {
    const { blob } = await compressImage(file);
    fd.append('fotos', blob, file.name || 'foto.jpg');
  }
  return fd;
}

const EST_ASIG = {
  pendiente: { label: 'Pendiente', cls: 'text-muted-foreground' },
  hecha: { label: 'Hecha · por validar', cls: 'text-[#ec9032]' },
  devuelta: { label: 'Devuelta', cls: 'text-[#dc2626]' },
  validada: { label: 'Validada', cls: 'text-[#16a34a]' },
};

function EditarTarea({ open, onOpenChange, tarea, onGuardada }) {
  const [form, setForm] = useState({ titulo: '', descripcion: '', prioridad: 'media', fecha_limite: '' });
  const [conFecha, setConFecha] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open || !tarea) return;
    setForm({ titulo: tarea.titulo, descripcion: tarea.descripcion || '', prioridad: tarea.prioridad, fecha_limite: tarea.fecha_limite || '' });
    setConFecha(!!tarea.fecha_limite);
  }, [open, tarea]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const guardar = async () => {
    if (!form.titulo.trim()) { toast.error('El título no puede quedar vacío'); return; }
    setSaving(true);
    try {
      const { data } = await api.patch(`/tareas/${tarea.id}`, {
        titulo: form.titulo.trim(), descripcion: form.descripcion.trim(), prioridad: form.prioridad,
        fecha_limite: conFecha && form.fecha_limite ? form.fecha_limite : null,
      });
      toast.success('Tarea actualizada'); onOpenChange(false); onGuardada?.(data);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(485px,100%)] max-w-none rounded-[22px] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2"><DialogTitle className="font-heading text-xl">Editar tarea</DialogTitle></DialogHeader>
        <div className="px-6 pb-2 space-y-4">
          <div className="space-y-1.5"><Label>Título</Label><Input value={form.titulo} onChange={(e) => set('titulo', e.target.value)} className="h-11" /></div>
          <div className="space-y-1.5"><Label>Descripción</Label><Textarea value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} rows={3} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={form.prioridad} onValueChange={(v) => set('prioridad', v)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORIDADES_TAREA.map((p) => <SelectItem key={p} value={p}>{PRIORIDAD_META[p].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="flex h-5 items-center justify-between">Fecha límite
                <button type="button" onClick={() => setConFecha((v) => !v)} className="text-[11px] font-medium text-[#00a5df] hover:underline">{conFecha ? 'Quitar' : 'Agregar'}</button>
              </Label>
              {conFecha ? (
                <CalendarioFecha modo="dia" start={form.fecha_limite} end={form.fecha_limite} onChange={({ start }) => set('fecha_limite', start)} />
              ) : <div className="h-11 flex items-center rounded-md border border-dashed border-input px-3 text-sm text-muted-foreground">Sin fecha</div>}
            </div>
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Una tarea de tienda: el detalle, la evidencia de cada responsable y la
   conversación. El responsable sube su foto y marca hecho; el gerente/jefe
   valida o devuelve cada parte. */
export default function TareaDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const [t, setT] = useState(null);
  const [error, setError] = useState(null);
  const [texto, setTexto] = useState('');
  const [adjuntos, setAdjuntos] = useState([]);
  const [ocupado, setOcupado] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [editar, setEditar] = useState(false);
  const [devolviendo, setDevolviendo] = useState(null); // asignado_id
  const [motivo, setMotivo] = useState('');
  const fotoMsg = useRef(null);
  const fotoHecho = useRef(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/tareas/${id}`); setT(data); }
    catch (e) { setError(e?.response?.data?.detail || 'No se pudo abrir la tarea'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const accion = async (key, fn, ok) => {
    setOcupado(key);
    try { const { data } = await fn(); setT(data); if (ok) toast.success(ok); return true; }
    catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo completar'); return false; }
    finally { setOcupado(null); }
  };

  const marcarHecho = (files) => accion('hecho', async () => {
    const fd = new FormData();
    fd.append('texto', texto.trim());
    await fotosAFormData(fd, files);
    const r = await api.post(`/tareas/${id}/hecho`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setTexto('');
    return r;
  }, 'Marcada como hecha');

  const validar = (aid) => accion(`val-${aid}`, () => {
    const fd = new FormData(); fd.append('asignado_id', aid);
    return api.post(`/tareas/${id}/validar`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  }, 'Parte validada');

  const enviarDevolucion = async (aid) => {
    const ok = await accion(`dev-${aid}`, () => {
      const fd = new FormData(); fd.append('asignado_id', aid); fd.append('texto', motivo.trim());
      return api.post(`/tareas/${id}/devolver`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    }, 'Devuelta al responsable');
    if (ok) { setDevolviendo(null); setMotivo(''); }
  };

  const enviarMensaje = async () => {
    const ok = await accion('mensaje', async () => {
      const fd = new FormData(); fd.append('texto', texto.trim());
      await fotosAFormData(fd, adjuntos);
      return api.post(`/tareas/${id}/mensajes`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    });
    if (ok) { setTexto(''); setAdjuntos([]); }
  };

  const cancelar = async () => {
    const ok = await confirmar({
      tipo: 'danger', titulo: '¿Cancelar la tarea?',
      mensaje: <>Se cancelará <b>{t.titulo}</b> para todos los responsables. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Cancelar tarea', textoCargando: 'Cancelando…', textoExito: 'Tarea cancelada',
      accion: () => api.post(`/tareas/${id}/cancelar`, new FormData(), { headers: { 'Content-Type': 'multipart/form-data' } }),
    });
    if (ok) load();
  };

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto pt-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/tareas"><ArrowLeft className="h-4 w-4 mr-1.5" /> Tareas</Link></Button>
      </div>
    );
  }
  if (!t) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const fotoUrl = (f) => `/tareas/${t.id}/foto/${f.id}`;
  const abierta = t.estado === 'abierta';

  return (
    <div className="max-w-[1000px] mx-auto pt-2 space-y-4" data-testid="tarea-detalle">
      <Link to="/tareas" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Tareas
      </Link>

      <div className="rounded-[18px] bg-card border shadow-card p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{t.numero}</span>
          <EstadoTarea estado={t.estado} />
          <PrioridadTarea prioridad={t.prioridad} />
          <FechaLimite fecha={t.fecha_limite} vencida={t.vencida} />
          {t.soy_validador && abierta && (
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditar(true)} data-testid="tarea-editar"><Pencil className="h-4 w-4 mr-1.5" /> Editar</Button>
              <Button size="sm" variant="ghost" className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" onClick={cancelar} data-testid="tarea-cancelar"><Trash2 className="h-4 w-4 mr-1.5" /> Cancelar</Button>
            </span>
          )}
        </div>
        <h1 className="font-heading text-2xl font-semibold">{t.titulo}</h1>
        {t.descripcion && <p className="text-sm whitespace-pre-wrap">{t.descripcion}</p>}
        <p className="text-sm text-muted-foreground">{t.tienda} · asignó {t.creado_por?.name}</p>
        {t.estado === 'cerrada' && <p className="text-xs rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] px-3 py-2">Cerrada: todas las partes quedaron validadas.</p>}
        {t.estado === 'cancelada' && <p className="text-xs rounded-xl bg-muted px-3 py-2">Cancelada por {t.cancelada_por?.name} {timeAgoEs(t.cancelada_at)}.</p>}
      </div>

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-4 items-start">
        {/* Responsables */}
        <div className="space-y-3">
          {t.asignados.map((a) => {
            const soyYo = a.id === user?.id;
            const puedoHacer = soyYo && abierta && (a.estado === 'pendiente' || a.estado === 'devuelta');
            const e = EST_ASIG[a.estado] || EST_ASIG.pendiente;
            return (
              <div key={a.id} className="rounded-[16px] bg-card border p-4 space-y-2" data-testid="tarea-asignado">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{a.name}{soyYo ? ' (tú)' : ''}</p>
                  <span className={`text-xs font-semibold ${e.cls}`}>{e.label}</span>
                </div>
                {a.estado === 'devuelta' && a.motivo && (
                  <p className="text-xs rounded-lg bg-[rgba(220,38,38,0.08)] text-[#dc2626] px-2.5 py-1.5">Devuelta por {a.devuelta_por_name}: {a.motivo}</p>
                )}
                {a.estado === 'validada' && <p className="text-[11px] text-muted-foreground">Validada por {a.validada_por_name} {timeAgoEs(a.validada_at)}</p>}
                {(a.intentos || []).length > 0 ? (
                  <div className="space-y-2">
                    {a.intentos.map((it, i) => (
                      <div key={it.id} className="rounded-lg border bg-muted/30 p-2" data-testid="tarea-intento">
                        <p className="text-[11px] text-muted-foreground mb-1">
                          {a.intentos.length > 1 ? `Intento ${i + 1}` : 'Evidencia'}{it.at ? ` · ${timeAgoEs(it.at)}` : ''}
                          {it.motivo_previo && <span className="text-[#dc2626]"> · corrige: {it.motivo_previo}</span>}
                        </p>
                        {(it.fotos || []).length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {it.fotos.map((f) => <AuthedImg key={f.id} url={fotoUrl(f)} className="h-20 w-20 rounded-lg object-cover border cursor-zoom-in" onClick={() => setZoom(fotoUrl(f))} />)}
                          </div>
                        )}
                        {it.comentario && <p className="text-xs text-muted-foreground mt-1">“{it.comentario}”</p>}
                      </div>
                    ))}
                  </div>
                ) : (a.evidencia || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {a.evidencia.map((f) => <AuthedImg key={f.id} url={fotoUrl(f)} className="h-20 w-20 rounded-lg object-cover border cursor-zoom-in" onClick={() => setZoom(fotoUrl(f))} />)}
                  </div>
                )}

                {puedoHacer && (
                  <div className="pt-1">
                    <input ref={fotoHecho} type="file" accept="image/*" multiple className="hidden"
                      onChange={(e2) => { if (e2.target.files?.length) marcarHecho(e2.target.files); e2.target.value = ''; }} />
                    <Button size="sm" className="rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" disabled={!!ocupado}
                      onClick={() => fotoHecho.current?.click()} data-testid="tarea-hecho">
                      {ocupado === 'hecho' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Camera className="h-4 w-4 mr-1.5" /> {a.estado === 'devuelta' ? 'Volver a enviar con foto' : 'Marcar hecho con foto'}</>}
                    </Button>
                    <p className="text-[11px] text-muted-foreground mt-1">Sube al menos una foto de cómo quedó. Puedes escribir un comentario abajo antes de elegir la foto.</p>
                  </div>
                )}

                {t.soy_validador && a.estado === 'hecha' && (
                  devolviendo === a.id ? (
                    <div className="space-y-2 pt-1">
                      <Textarea value={motivo} onChange={(e2) => setMotivo(e2.target.value)} rows={2} placeholder="¿Qué sigue mal?" data-testid="tarea-motivo" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setDevolviendo(null); setMotivo(''); }}>Cancelar</Button>
                        <Button size="sm" className="rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white" disabled={!!ocupado || !motivo.trim()} onClick={() => enviarDevolucion(a.id)} data-testid="tarea-devolver-enviar">
                          {ocupado === `dev-${a.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Devolver'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" className="rounded-xl text-[#dc2626]" disabled={!!ocupado} onClick={() => { setDevolviendo(a.id); setMotivo(''); }} data-testid="tarea-devolver">
                        <Undo2 className="h-4 w-4 mr-1.5" /> Devolver
                      </Button>
                      <Button size="sm" className="rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" disabled={!!ocupado} onClick={() => validar(a.id)} data-testid="tarea-validar">
                        {ocupado === `val-${a.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1.5" /> Validar</>}
                      </Button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* Conversación */}
        <div className="rounded-[18px] bg-card border shadow-card p-4 space-y-3">
          <h2 className="font-heading font-semibold">Conversación</h2>
          <div className="space-y-2.5">
            {t.mensajes.map((m) => (m.rol === 'sistema' ? (
              <p key={m.id} className="text-xs text-muted-foreground text-center">{m.texto} · {timeAgoEs(m.at)}</p>
            ) : (
              <div key={m.id} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.rol === 'responsable' ? 'ml-auto bg-[rgba(22,163,74,0.1)] rounded-br-md' : 'bg-[rgba(236,144,50,0.12)] rounded-bl-md'}`}>
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

          {abierta && (
            <div className="space-y-2 pt-2 border-t">
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Escribe un mensaje…" data-testid="tarea-texto" />
              <input ref={fotoMsg} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { setAdjuntos(Array.from(e.target.files || [])); e.target.value = ''; }} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => fotoMsg.current?.click()} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <Camera className="h-3.5 w-3.5" /> {adjuntos.length ? `${adjuntos.length} foto${adjuntos.length === 1 ? '' : 's'}` : 'Adjuntar foto'}
                </button>
                <Button size="sm" variant="outline" className="rounded-xl" disabled={!!ocupado || (!texto.trim() && !adjuntos.length)} onClick={enviarMensaje}>
                  {ocupado === 'mensaje' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" /> Enviar mensaje</>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <EditarTarea open={editar} onOpenChange={setEditar} tarea={t} onGuardada={setT} />
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>
        {zoom && <AuthedImg url={zoom} className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}
