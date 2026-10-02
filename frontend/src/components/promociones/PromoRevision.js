import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, AlertTriangle, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAdminPromos, tiendaPromos, PROMO_TIENDAS } from '@/lib/constants';
import { ESTRATEGIA_COLOR } from '@/lib/promoEstrategia';
import { timeAgoEs } from '@/lib/time';
import { PlazoChip } from '@/lib/promoPlazos';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AuthedImg } from '@/components/customform/CustomFormHistorial';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';

export const ESTADO_TAREA = {
  pendiente: { label: 'Sin contestar', cls: 'bg-muted text-muted-foreground' },
  enviada: { label: 'Por revisar', cls: 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]' },
  con_observaciones: { label: 'Con observaciones', cls: 'bg-[rgba(236,144,50,0.16)] text-[#b45309] dark:text-[#fbbf24]' },
  validada: { label: 'Validada', cls: 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' },
  vencida: { label: 'Vencida', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' },
};

// Sin contestar y fuera de plazo: "Vencida" (todavía se puede contestar).
export const estadoVisible = (t) => (t.estado === 'pendiente' && t.vencida ? 'vencida' : t.estado);

export function EstadoTarea({ estado }) {
  const e = ESTADO_TAREA[estado] || ESTADO_TAREA.pendiente;
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}

/* Pestaña "Revisión" de una publicación de Promociones con tareas: el jefe o
   el gerente de tienda ve cada categoría de su tienda (los admins, todas),
   abre la respuesta y revisa línea por línea: Correcto o Inconsistencia.
   Nadie revisa su propia respuesta. */
export default function PromoRevision({ schema }) {
  const { user } = useAuth();
  const verTodas = user?.role === 'admin' || canAdminPromos(user);
  const miTienda = tiendaPromos(user);
  const [tareas, setTareas] = useState(null);
  const [abierta, setAbierta] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/promo-tareas/form/${schema.id}`);
      setTareas(verTodas ? data : data.filter((t) => t.tienda === miTienda));
    } catch (e) { toast.error('No se pudieron cargar las categorías'); setTareas([]); }
  }, [schema.id, verTodas, miTienda]);
  useEffect(() => { load(); }, [load]);

  if (abierta) return <RevisionTarea id={abierta} onBack={() => { setAbierta(null); load(); }} />;
  if (!tareas) return <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>;

  const tiendas = verTodas ? Object.values(PROMO_TIENDAS) : [miTienda];
  return (
    <div className="space-y-4" data-testid="promo-revision">
      {tiendas.map((tienda) => {
        const ts = tareas.filter((t) => t.tienda === tienda);
        const porRevisar = ts.filter((t) => t.estado === 'enviada' && t.coordinador_id !== user?.id).length;
        return (
          <div key={tienda} className="rounded-[18px] bg-card border shadow-card p-5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className="font-heading font-semibold">{tienda}</h3>
              <span className="text-xs text-muted-foreground">{porRevisar ? `${porRevisar} por revisar` : 'Nada por revisar'}</span>
            </div>
            {ts.length === 0 && <p className="text-sm text-muted-foreground py-4">Sin categorías en esta publicación.</p>}
            {ts.map((t) => {
              const propia = t.coordinador_id === user?.id;
              const revisable = !propia && t.estado === 'enviada';
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 border-t first:border-t-0">
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-medium">{t.categoria}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.coordinador_name ? `Contestó ${t.coordinador_name}` : 'Nadie la ha contestado'}
                      {t.estado === 'enviada' && t.revision?.revisor_name ? ` · en revisión por ${t.revision.revisor_name}` : ''}
                      {t.estado === 'validada' && t.validada_por_name ? ` · validó ${t.validada_por_name}` : ''}
                      {t.tarde ? ' · contestada fuera de plazo' : ''}
                    </p>
                    {t.estado === 'pendiente' && !t.vencida && <PlazoChip vence={t.vence_respuesta} prefijo="Contestar: " />}
                    {t.estado === 'enviada' && !propia && <PlazoChip vence={t.vence_revision} prefijo="Revisar: " />}
                  </div>
                  <EstadoTarea estado={estadoVisible(t)} />
                  {t.estado === 'con_observaciones' && t.ticket_id && (
                    <Button asChild size="sm" variant="outline" className="rounded-xl" data-testid="promo-revision-ticket">
                      <Link to={`/formularios/tickets/${t.ticket_id}`}>Ver ticket</Link>
                    </Button>
                  )}
                  {t.estado !== 'pendiente' && (
                    <Button size="sm" variant={revisable ? 'default' : 'outline'} onClick={() => setAbierta(t.id)}
                      className={`rounded-xl ${revisable ? 'bg-[#1e395e] hover:bg-[#162c49] text-white' : ''}`} data-testid="promo-revision-abrir">
                      {propia ? 'Ver (tuya)' : revisable ? 'Revisar' : 'Ver'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Respuesta({ entry, item }) {
  const r = entry.respuesta;
  if (Array.isArray(r)) {
    const total = (entry.opciones_total || item?.opciones?.map((o) => o.label) || []).length;
    return (
      <div className="text-sm">
        <span className="font-semibold">{r.length} de {total} líneas rotuladas</span>
        {r.length > 0 && <span className="text-muted-foreground"> · {r.join(', ')}</span>}
      </div>
    );
  }
  const color = r === 'Sí' ? 'text-[#16a34a]' : r === 'No' ? 'text-[#dc2626]' : 'text-muted-foreground';
  return <span className={`text-sm font-semibold ${color}`}>{r || '—'}</span>;
}

function RevisionTarea({ id, onBack }) {
  const [d, setD] = useState(null);
  const [lineas, setLineas] = useState({});
  const [saving, setSaving] = useState(null);
  const [zoom, setZoom] = useState(null);
  // la carga depende solo de la tarea: si el padre se vuelve a dibujar, no se
  // pierden las marcas que se están haciendo
  const backRef = useRef(onBack);
  backRef.current = onBack;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/promo-tareas/${id}`);
      setD(data);
      setLineas(data.tarea?.revision?.lineas || {});
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo abrir la categoría'); backRef.current(); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <p className="text-sm text-muted-foreground text-center py-10">Cargando…</p>;
  const { tarea, respuesta, items, tipos } = d;
  const editable = d.puede_revisar;
  const entries = respuesta?.entries || [];
  const fotoUrl = (p) => `/formularios-custom/${respuesta.form_id}/respuestas/${respuesta.id}/foto/${p.id}`;

  const setV = (iid, v) => setLineas((l) => ({ ...l, [iid]: { ...(l[iid] || {}), v, ...(v === 'mal' && !l[iid]?.tipo ? { tipo: tipos[0] } : {}) } }));
  const setCampo = (iid, k, val) => setLineas((l) => ({ ...l, [iid]: { ...(l[iid] || {}), [k]: val } }));
  const revisadas = entries.filter((e) => lineas[e.id]?.v).length;
  const malas = entries.filter((e) => lineas[e.id]?.v === 'mal');
  const sinComentario = malas.filter((e) => !(lineas[e.id]?.comentario || '').trim()).length;
  const completas = revisadas === entries.length && entries.length > 0;

  const enviar = async (accion) => {
    setSaving(accion);
    try {
      await api.post(`/promo-tareas/${id}/revision`, { lineas, accion });
      if (accion === 'guardar') { toast.success('Avance guardado'); load(); }
      else {
        toast.success(accion === 'validar' ? `${tarea.categoria} validada` : 'Observaciones enviadas a quien contestó');
        onBack();
      }
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar la revisión'); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-4" data-testid="promo-revision-detalle">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Todas las categorías
      </button>
      <div className="rounded-[18px] bg-card border shadow-card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-xl font-semibold">{tarea.categoria} · {tarea.tienda}</h2>
          <EstadoTarea estado={tarea.estado} />
        </div>
        <p className="text-sm text-muted-foreground">
          Contestó {tarea.coordinador_name || '—'}{tarea.enviada_at ? ` · ${timeAgoEs(tarea.enviada_at)}` : ''}
          {respuesta ? ` · socializado: ${respuesta.socializo ? 'Sí' : 'No'}` : ''}
        </p>
        {d.es_propia && <p className="text-xs rounded-xl bg-muted px-3 py-2">Es tu respuesta: la revisa el otro jefe o el gerente de la tienda.</p>}
        {tarea.estado === 'validada' && <p className="text-xs rounded-xl bg-[rgba(22,163,74,0.12)] text-[#16a34a] px-3 py-2">Validada por {tarea.validada_por_name}.</p>}
        {d.ticket && (
          <p className="text-xs rounded-xl bg-[rgba(236,144,50,0.14)] text-[#b45309] dark:text-[#fbbf24] px-3 py-2 flex flex-wrap items-center gap-2">
            Las observaciones se atienden en el ticket {d.ticket.numero}.
            <Link to={`/formularios/tickets/${d.ticket.id}`} className="font-semibold underline">Abrir ticket</Link>
          </p>
        )}
        {(respuesta?.general_photos || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {respuesta.general_photos.map((p) => (
              <AuthedImg key={p.id} url={fotoUrl(p)} className="h-20 w-20 rounded-lg object-cover border cursor-zoom-in" onClick={() => setZoom(fotoUrl(p))} />
            ))}
          </div>
        )}
      </div>

      {!respuesta && <p className="text-sm text-muted-foreground text-center py-6">La respuesta de esta categoría ya no existe.</p>}
      {entries.map((e) => {
        const it = items[e.id] || {};
        const ln = lineas[e.id] || {};
        return (
          <div key={e.id} className={`rounded-[16px] bg-card border p-4 space-y-2.5 ${ln.v === 'mal' ? 'border-[#ec9032]' : ln.v === 'ok' ? 'border-[#16a34a]/60' : ''}`}
            data-testid="promo-revision-linea">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-sm font-semibold">{it.titulo || e.titulo}</p>
              {(e.etiqueta || it.etiqueta) && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ background: ESTRATEGIA_COLOR[e.estrategia || it.estrategia] || ESTRATEGIA_COLOR.mixta }}>{e.etiqueta || it.etiqueta}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Coordinador:</span> <Respuesta entry={e} item={it} />
            </div>
            {e.note && <p className="text-xs text-muted-foreground">Nota: {e.note}</p>}
            {(e.photos || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {e.photos.map((p) => (
                  <AuthedImg key={p.id} url={fotoUrl(p)} className="h-20 w-20 rounded-lg object-cover border cursor-zoom-in" onClick={() => setZoom(fotoUrl(p))} />
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="inline-flex rounded-xl border overflow-hidden">
                <button type="button" disabled={!editable} onClick={() => setV(e.id, 'ok')}
                  className={`px-3 py-1.5 text-sm font-medium inline-flex items-center gap-1.5 border-r disabled:cursor-default ${ln.v === 'ok' ? 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' : 'bg-card text-muted-foreground'}`}
                  data-testid="promo-revision-ok"><Check className="h-3.5 w-3.5" /> Correcto</button>
                <button type="button" disabled={!editable} onClick={() => setV(e.id, 'mal')}
                  className={`px-3 py-1.5 text-sm font-medium inline-flex items-center gap-1.5 disabled:cursor-default ${ln.v === 'mal' ? 'bg-[rgba(236,144,50,0.16)] text-[#b45309] dark:text-[#fbbf24]' : 'bg-card text-muted-foreground'}`}
                  data-testid="promo-revision-mal"><AlertTriangle className="h-3.5 w-3.5" /> Inconsistencia</button>
              </div>
            </div>
            {ln.v === 'mal' && (editable ? (
              <div className="grid sm:grid-cols-[220px_1fr] gap-2">
                <Select value={ln.tipo || tipos[0]} onValueChange={(v) => setCampo(e.id, 'tipo', v)}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{tipos.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
                <Input value={ln.comentario || ''} onChange={(ev) => setCampo(e.id, 'comentario', ev.target.value)}
                  placeholder="Qué encontraste" className="h-10" data-testid="promo-revision-comentario" />
              </div>
            ) : (
              <p className="text-sm"><span className="font-semibold text-[#b45309] dark:text-[#fbbf24]">{ln.tipo}</span>{ln.comentario ? ` · ${ln.comentario}` : ''}</p>
            ))}
          </div>
        );
      })}

      {editable && entries.length > 0 && (
        <div className="sticky bottom-3 rounded-[16px] bg-card border shadow-card p-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            Revisadas {revisadas} de {entries.length}
            {sinComentario ? ` · falta describir ${sinComentario} inconsistencia${sinComentario === 1 ? '' : 's'}` : ''}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" disabled={!!saving} onClick={() => enviar('guardar')}>
              {saving === 'guardar' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar avance'}
            </Button>
            {malas.length > 0 ? (
              <Button size="sm" className="rounded-xl bg-[#ec9032] hover:bg-[#d97f24] text-white" disabled={!!saving || !completas || sinComentario > 0}
                onClick={() => enviar('observaciones')} data-testid="promo-revision-observaciones">
                {saving === 'observaciones' ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enviar observaciones (${malas.length})`}
              </Button>
            ) : (
              <Button size="sm" className="rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white" disabled={!!saving || !completas}
                onClick={() => enviar('validar')} data-testid="promo-revision-validar">
                {saving === 'validar' ? <Loader2 className="h-4 w-4 animate-spin" /> : `Validar ${tarea.categoria}`}
              </Button>
            )}
          </div>
        </div>
      )}

      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>
        {zoom && <AuthedImg url={zoom} className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}
