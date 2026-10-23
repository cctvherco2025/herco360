import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import {
  ArrowLeft, Pencil, Archive, RotateCcw, Trash2, Camera, Download, Plus, Loader2, History, Info, ChevronRight,
  CirclePlus, PencilLine, MapPin, Image as ImageIcon, ArchiveX, Wrench, AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import { parseApiDate, fmtHora } from '@/lib/time';
import { compressImage } from '@/lib/flosPhoto';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar } from '@/components/ConfirmDialog';
import ActivoForm from '@/components/activos/ActivoForm';
import LoteHijos from '@/components/activos/LoteHijos';
import { EstadoTarea, EstadoPlan, frecuenciaTexto, fechaHora } from '@/components/mantenimiento/comunes';
import {
  useActivosMeta, CategoriaIcono, EstadoActivo, CodigoChip, ActivoFoto, valorCampo, capacidad, pluralEs,
} from '@/components/activos/comunes';

function fmtAt(iso) {
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} · ${fmtHora(hh)}`;
}

const HIST_META = {
  alta: { icon: CirclePlus, color: 'text-[#16a34a] bg-[rgba(22,163,74,0.12)]' },
  edicion: { icon: PencilLine, color: 'text-[#00a5df] bg-[rgba(0,165,223,0.12)]' },
  cambio_ubicacion: { icon: MapPin, color: 'text-[#ec9032] bg-[rgba(236,144,50,0.14)]' },
  foto: { icon: ImageIcon, color: 'text-[#7c3aed] bg-[rgba(124,58,237,0.12)]' },
  baja: { icon: ArchiveX, color: 'text-muted-foreground bg-muted' },
  reactivacion: { icon: RotateCcw, color: 'text-[#16a34a] bg-[rgba(22,163,74,0.12)]' },
  mantenimiento: { icon: Wrench, color: 'text-[#1e395e] dark:text-[#3cbef6] bg-[rgba(0,165,223,0.12)]' },
  falla: { icon: AlertTriangle, color: 'text-[#dc2626] bg-[rgba(220,38,38,0.1)]' },
};

const Card = ({ title, action, children, className = '' }) => (
  <section className={`rounded-[18px] border bg-card shadow-card p-4 sm:p-5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-2 mb-3">
        {title && <h2 className="font-heading text-base font-semibold">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </section>
);

function BajaDialog({ open, onOpenChange, activo, onDone }) {
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setMotivo(''); }, [open]);
  const guardar = async () => {
    if (!motivo.trim()) { toast.error('Escribe el motivo de la baja'); return; }
    setSaving(true);
    try {
      await api.post(`/activos/${activo.id}/baja`, { motivo: motivo.trim() });
      toast.success(`${activo.codigo} dado de baja`);
      onOpenChange(false); onDone();
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo dar de baja'); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,100%)] max-w-none rounded-[22px]">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-xl">Dar de baja {activo?.codigo}</DialogTitle>
          <DialogDescription>Deja de aparecer entre los activos en uso pero conserva su ficha e historial. Se puede reactivar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="baja-motivo">Motivo</Label>
          <Textarea id="baja-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Dañado sin reparación, vendido, reemplazado" data-testid="baja-motivo" />
        </div>
        <DialogFooter className="gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="baja-confirmar">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dar de baja'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilaHijo({ h, etiqueta, onClick }) {
  return (
    <button type="button" onClick={onClick} data-testid="activo-hijo"
      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[rgba(60,190,246,0.06)]">
      {etiqueta !== undefined && <span className="w-8 text-center text-sm font-semibold text-muted-foreground">{etiqueta}</span>}
      <CodigoChip codigo={h.codigo} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{h.nombre}</span>
        {h.ubicacion && <span className="block text-xs text-muted-foreground truncate">{h.ubicacion}</span>}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

// Planificaciones que cubren el activo, próximo mantenimiento y los últimos hechos.
function Mantenimiento({ activoId }) {
  const navigate = useNavigate();
  const [m, setM] = useState(null);
  useEffect(() => {
    api.get(`/mantenimiento/activo/${activoId}`).then(({ data }) => setM(data)).catch(() => setM(null));
  }, [activoId]);
  if (!m || (!m.planes.length && !m.ultimas.length && !m.proxima)) return null;
  const Fila = ({ t }) => (
    <button type="button" onClick={() => navigate(`/mantenimiento/tareas/${t.id}`)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[rgba(60,190,246,0.06)]">
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">{t.checklist_nombre}</span>
        <span className="block text-xs text-muted-foreground truncate">{t.numero} · {t.estado === 'completada' ? `hecho ${fechaHora(t.completada_en)}` : `vence ${fechaHora(t.vence_en)}`}</span>
      </span>
      {t.tiene_falla && <span className="text-[11px] font-semibold text-[#dc2626]">falla</span>}
      <EstadoTarea tarea={t} ahora={m.ahora} />
    </button>
  );
  return (
    <Card title={<span className="flex items-center gap-2"><Wrench className="h-4 w-4 text-[#00a5df]" /> Mantenimiento</span>}>
      {m.planes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {m.planes.map((p) => (
            <Link key={p.id} to={`/mantenimiento/planificaciones/${p.id}`} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:border-[#00a5df]/50">
              <span className="font-mono font-semibold">{p.numero}</span> {p.nombre} · {frecuenciaTexto(p)} <EstadoPlan estado={p.estado} />
            </Link>
          ))}
        </div>
      )}
      {m.proxima && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Próximo</p>
          <div className="rounded-xl border mb-3"><Fila t={m.proxima} /></div>
        </>
      )}
      {m.ultimas.length > 0 && (
        <>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Últimos</p>
          <div className="rounded-xl border divide-y">{m.ultimas.map((t) => <Fila key={t.id} t={t} />)}</div>
        </>
      )}
    </Card>
  );
}

// Lo que pertenece al activo, de una categoría hija: por posiciones (canales
// del NVR) o como lista simple.
function Contenido({ activo, hija, hijos, onAgregar, onLote }) {
  const navigate = useNavigate();
  const propios = hijos.filter((h) => h.categoria_id === hija.id);
  const enUso = propios.filter((h) => h.estado === 'activo');
  const bajas = propios.filter((h) => h.estado === 'baja');
  const cap = hija.posicion_label ? capacidad(activo, hija) : 0;
  const puede = hija.puede_editar && activo.estado === 'activo';
  const plural = hija.plural || hija.nombre;
  const label = hija.posicion_label;

  let lista;
  if (cap) {
    const porPos = Object.fromEntries(enUso.map((h) => [h.posicion, h]));
    lista = Array.from({ length: cap }, (_, i) => i + 1).map((p) => (porPos[p] ? (
      <FilaHijo key={p} h={porPos[p]} etiqueta={p} onClick={() => navigate(`/activos/${porPos[p].id}`)} />
    ) : (
      <div key={p} className="flex items-center gap-3 px-3 py-2.5">
        <span className="w-8 text-center text-sm font-semibold text-muted-foreground/60">{p}</span>
        <span className="flex-1 text-sm text-muted-foreground">Libre</span>
        {puede && <button type="button" onClick={() => onAgregar(hija, p)} className="text-xs font-medium text-[#00a5df] hover:underline">Agregar</button>}
      </div>
    )));
  } else {
    lista = enUso.map((h) => <FilaHijo key={h.id} h={h} etiqueta={label ? h.posicion : undefined} onClick={() => navigate(`/activos/${h.id}`)} />);
  }

  return (
    <Card
      title={cap ? `${plural} · ${enUso.length} de ${cap} ${cap === 1 ? label.toLowerCase() : pluralEs(label.toLowerCase())}` : `${plural} · ${enUso.length}`}
      action={puede && (!cap || enUso.length < cap) && (
        <Button size="sm" onClick={() => (cap ? onLote(hija) : onAgregar(hija, null))} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid={`agregar-hijos-${hija.id}`}>
          <Plus className="h-4 w-4 mr-1" /> Agregar
        </Button>
      )}>
      {lista.length ? <div className="rounded-xl border divide-y">{lista}</div> : <p className="text-sm text-muted-foreground">Ninguno registrado.</p>}
      {bajas.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground mb-1.5">De baja</p>
          <div className="flex flex-wrap gap-1.5">
            {bajas.map((b) => (
              <Link key={b.id} to={`/activos/${b.id}`} className="text-xs rounded-full border px-2.5 py-1 text-muted-foreground hover:text-foreground">
                {b.codigo} · {b.nombre}
              </Link>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function ActivoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { meta, error: metaError, categoria } = useActivosMeta();
  const [data, setData] = useState(null);
  const [falla, setFalla] = useState(null); // 'no_existe' | 'sin_acceso'
  const [editar, setEditar] = useState(false);
  const [baja, setBaja] = useState(false);
  const [nuevoHijo, setNuevoHijo] = useState(null); // inicial para ActivoForm
  const [lote, setLote] = useState(null); // categoría hija
  const [zoom, setZoom] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const load = useCallback(async () => {
    try { const { data: d } = await api.get(`/activos/${id}`); setData(d); setFalla(null); }
    catch (e) {
      const st = e?.response?.status;
      if (st === 404) setFalla('no_existe'); else if (st === 403) setFalla('sin_acceso'); else toast.error('No se pudo cargar el activo');
    }
  }, [id]);
  useEffect(() => { setData(null); load(); }, [load]);

  if (falla || metaError) {
    return (
      <div className="max-w-[600px] mx-auto pt-16 text-center">
        <Info className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">
          {falla === 'no_existe' ? 'Este activo no existe o fue eliminado.' : 'No tienes acceso a este activo.'}
        </p>
        <Button variant="outline" onClick={() => navigate('/activos')} className="rounded-xl mt-4">Ir a Activos</Button>
      </div>
    );
  }
  if (!data || !meta) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const { activo: a, padre, hijos, historial } = data;
  const cat = categoria(a.categoria_id);
  const puedeEditar = !!cat?.puede_editar;
  const url = `${window.location.origin}/activos/${a.id}`;

  const cambiarFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSubiendo(true);
    try {
      const { blob } = await compressImage(file);
      const fd = new FormData();
      fd.append('foto', blob, 'foto.jpg');
      await api.put(`/activos/${a.id}/foto`, fd);
      toast.success('Foto actualizada');
      load();
    } catch (err) { toast.error(err?.response?.data?.detail || err.message || 'No se pudo subir la foto'); }
    finally { setSubiendo(false); }
  };

  const reactivar = async () => {
    const ok = await confirmar({
      titulo: `¿Reactivar ${a.codigo}?`, mensaje: 'Vuelve a la lista de activos en uso.', textoConfirmar: 'Reactivar',
      textoCargando: 'Reactivando…', textoExito: `${a.codigo} reactivado`, accion: () => api.post(`/activos/${a.id}/reactivar`),
    });
    if (ok) load();
  };

  const eliminar = async () => {
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Eliminar ${a.codigo}?`,
      mensaje: <>Úsalo solo si se registró por error. Para un activo retirado usa <b>Dar de baja</b>, que conserva su historial. El código {a.codigo} no se vuelve a usar.</>,
      textoConfirmar: 'Eliminar', textoCargando: 'Eliminando…', textoExito: `${a.codigo} eliminado`,
      accion: () => api.delete(`/activos/${a.id}`),
    });
    if (ok) navigate('/activos');
  };

  const descargarQr = () => {
    const canvas = document.getElementById('activo-qr');
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `${a.codigo}-qr.png`;
    link.click();
  };

  const posicionLabel = cat?.posicion_label;
  return (
    <div className="max-w-[1180px] mx-auto pt-2">
      <button type="button" onClick={() => navigate('/activos')} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Activos
      </button>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span className="h-12 w-12 rounded-2xl bg-[rgba(0,165,223,0.12)] text-[#00a5df] grid place-items-center shrink-0">
            <CategoriaIcono icono={cat?.icono} className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap"><CodigoChip codigo={a.codigo} /><EstadoActivo estado={a.estado} /></div>
            <h1 className="font-heading text-2xl sm:text-3xl font-semibold mt-1 break-words" data-testid="activo-nombre-titulo">{a.nombre}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {cat?.nombre} · Sucursal {a.sucursal}{a.ubicacion ? ` · ${a.ubicacion}` : ''}
              {padre && <> · <Link to={`/activos/${padre.id}`} className="text-[#00a5df] hover:underline">{padre.codigo}</Link>{a.posicion && posicionLabel ? ` ${posicionLabel.toLowerCase()} ${a.posicion}` : ''}</>}
            </p>
          </div>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {a.estado === 'activo' && (
              <Button variant="outline" onClick={() => setEditar(true)} className="rounded-xl flex-1 sm:flex-none" data-testid="activo-editar">
                <Pencil className="h-4 w-4 mr-1.5" /> Editar
              </Button>
            )}
            {a.estado === 'activo' ? (
              <Button variant="outline" onClick={() => setBaja(true)} className="rounded-xl flex-1 sm:flex-none" data-testid="activo-baja">
                <Archive className="h-4 w-4 mr-1.5" /> Dar de baja
              </Button>
            ) : (
              <Button variant="outline" onClick={reactivar} className="rounded-xl flex-1 sm:flex-none" data-testid="activo-reactivar">
                <RotateCcw className="h-4 w-4 mr-1.5" /> Reactivar
              </Button>
            )}
            <Button variant="outline" onClick={eliminar} className="rounded-xl text-[#dc2626] hover:text-[#dc2626]" aria-label="Eliminar" title="Eliminar (registro por error)" data-testid="activo-eliminar">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {a.estado === 'baja' && (
        <div className="mb-4 rounded-[18px] border bg-muted/50 px-4 py-3 text-sm">
          <b>Dado de baja</b>{a.baja_by ? ` por ${a.baja_by}` : ''}{a.baja_at ? ` el ${fmtAt(a.baja_at)}` : ''}. Motivo: {a.baja_motivo}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Card title="Datos">
            {cat?.campos.length ? (
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                {cat.campos.map((c) => (
                  <div key={c.clave} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c.etiqueta}</dt>
                    <dd className={`text-sm mt-0.5 break-words ${c.tipo === 'ip' ? 'font-mono' : ''}`}>{valorCampo(c, a.datos?.[c.clave])}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-sm text-muted-foreground">Esta categoría no tiene campos propios.</p>}
            {a.notas && (
              <div className="mt-4 pt-3 border-t">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Notas</p>
                <p className="text-sm mt-0.5 whitespace-pre-line">{a.notas}</p>
              </div>
            )}
            <p className="mt-4 pt-3 border-t text-xs text-muted-foreground">
              Registrado por {a.created_by_name} el {fmtAt(a.created_at)}{a.updated_by ? ` · última edición: ${a.updated_by}, ${fmtAt(a.updated_at)}` : ''}
            </p>
          </Card>

          {(cat?.hijas || []).map((h) => (
            <Contenido key={h.id} activo={a} hija={h} hijos={hijos}
              onAgregar={(hija, posicion) => setNuevoHijo({ categoria_id: hija.id, padre_id: a.id, posicion: posicion ?? '' })}
              onLote={(hija) => setLote(hija)} />
          ))}

          <Mantenimiento activoId={a.id} />

          <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4 text-[#00a5df]" /> Historial</span>}>
            {!historial.length ? (
              <p className="text-sm text-muted-foreground">Sin movimientos.</p>
            ) : (
              <ol className="relative space-y-4 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                {historial.map((h) => {
                  const m = HIST_META[h.tipo] || HIST_META.edicion;
                  const Icon = m.icon;
                  return (
                    <li key={h.id} className="relative flex gap-3" data-testid="activo-historial-item">
                      <span className={`relative z-10 h-8 w-8 rounded-full grid place-items-center shrink-0 ${m.color}`}><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0 pt-1">
                        <p className="text-sm break-words">{h.resumen}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{h.user_name} · {fmtAt(h.at)}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Foto"
            action={puedeEditar && a.estado === 'activo' && (
              <label className={`inline-flex items-center gap-1.5 text-xs font-medium text-[#00a5df] cursor-pointer hover:underline ${subiendo ? 'pointer-events-none opacity-60' : ''}`}>
                {subiendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                {a.foto ? 'Cambiar' : 'Agregar'}
                <input type="file" accept="image/*" className="sr-only" onChange={cambiarFoto} data-testid="activo-foto-input" />
              </label>
            )}>
            <ActivoFoto activoId={a.id} foto={a.foto} className="w-full aspect-[4/3] rounded-xl object-cover cursor-zoom-in" onClick={() => setZoom(true)} />
          </Card>

          <Card title="Código QR">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-xl bg-white p-2 border">
                <QRCodeCanvas id="activo-qr" value={url} size={180} level="M" marginSize={2} fgColor="#1e395e" bgColor="#ffffff" />
              </div>
              <p className="text-xs text-muted-foreground text-center">Pégalo en el activo: al escanearlo se abre esta ficha.</p>
              <Button variant="outline" onClick={descargarQr} className="rounded-xl w-full" data-testid="activo-qr-descargar">
                <Download className="h-4 w-4 mr-1.5" /> Descargar QR
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ActivoForm open={editar} onOpenChange={setEditar} meta={meta} activo={a} onSaved={load} />
      <ActivoForm open={!!nuevoHijo} onOpenChange={(v) => { if (!v) setNuevoHijo(null); }} meta={meta} inicial={nuevoHijo || undefined} onSaved={load} />
      <LoteHijos open={!!lote} onOpenChange={(v) => { if (!v) setLote(null); }} cat={lote && categoria(lote.id)} padreId={a.id} onSaved={load} />
      <BajaDialog open={baja} onOpenChange={setBaja} activo={a} onDone={load} />
      <PhotoZoomDialog open={zoom && !!a.foto} onClose={() => setZoom(false)}>
        {a.foto && <ActivoFoto activoId={a.id} foto={a.foto} className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </div>
  );
}
