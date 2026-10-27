import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { Eye, Pencil, Trash2, Loader2, Download, History, Search, Calendar, User as UserIcon } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { ymd, parseApiDate, fmtHora } from '@/lib/time';
import {
  ETQ_SUCURSALES, ETQ_DEPARTAMENTOS, RESULTADO, etqTone, ETQ_TONE_COLOR, isoWeek, lunesDeSemana, semanaLabel,
  fmtL, fmtFechaAud,
} from '@/lib/etiquetasSchema';
import { generateAuditoriaEtiquetasPdf } from '@/lib/etiquetasPdf';
import { canAdminEtiquetas, etiquetasSoloSuTienda } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PhotoZoomDialog, { ZOOM_IMG_CLASS } from '@/components/PhotoZoomDialog';
import { confirmar } from '@/components/ConfirmDialog';
import { ChipPicker, NativeSelect } from '@/components/recorridos/RecorridoWizard';
import {
  ResultadoPicker, EtiquetaPdfButton, CumplimientoHero, ConteoTiles, diferencia, contarResultados,
} from '@/components/etiquetas/EtiquetasWizard';

function fmtAt(iso) {
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} · ${fmtHora(hh)}`;
}

// Últimas 16 semanas para el filtro (más reciente primero).
function ultimasSemanas(n = 16) {
  const out = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const w = isoWeek(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i * 7));
    const lunes = lunesDeSemana(w.id);
    const dom = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    const f = (x) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`;
    out.push({ id: w.id, label: `Semana ${w.num} (${f(lunes)} – ${f(dom)})` });
  }
  return out;
}

function AuthedImg({ url, className, onClick }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objUrl;
    setSrc(null); setFailed(false);
    api.get(url, { responseType: 'blob' }).then((res) => {
      if (!active) return;
      objUrl = URL.createObjectURL(res.data);
      setSrc(objUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [url]);
  if (failed) {
    return (
      <div className={`${className} bg-muted grid place-items-center text-center text-[10px] leading-tight text-muted-foreground px-1`}>
        No se pudo<br />cargar la imagen
      </div>
    );
  }
  if (!src) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={src} alt="Etiqueta" className={className} onClick={onClick} />;
}

export function PctChip({ pct, cfg }) {
  const c = ETQ_TONE_COLOR[etqTone(pct, cfg)] || '#9aa1ad';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap" style={{ color: c, background: `${c}1f` }}>
      <span className="h-2 w-2 rounded-full" style={{ background: c }} />{pct}%
    </span>
  );
}

/* ───────────────────────── Detalle ─────────────────────── */
function DetailDialog({ id, cfg, isAdmin, onClose }) {
  const [aud, setAud] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    if (!id) { setAud(null); return; }
    api.get(`/etiquetas/auditorias/${id}`).then(({ data }) => setAud(data)).catch(() => toast.error('No se pudo cargar la auditoría'));
  }, [id]);

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[760px] rounded-[22px] max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 pr-10 text-left">
          <DialogTitle className="font-heading leading-snug">{aud ? `${aud.sucursal} · ${aud.departamento}` : 'Auditoría…'}</DialogTitle>
          {aud && <EtiquetaPdfButton aud={aud} cfg={cfg} className="h-8 text-xs shrink-0" testid="etiquetas-detail-pdf" />}
        </DialogHeader>
        {!aud ? (
          <div className="px-4 sm:px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-6 space-y-4">
            <CumplimientoHero pct={aud.cumplimiento} cfg={cfg}
              sub={`${semanaLabel(aud.semana)} · ${fmtFechaAud(aud)} · ${aud.coordinador_name}`} />
            <ConteoTiles c={aud} />
            <div className="space-y-2">
              {(aud.etiquetas || []).map((e) => {
                const r = RESULTADO[e.resultado];
                return (
                  <div key={e.id} className="rounded-xl border p-3" style={e.resultado !== 'correcta' ? { background: `${r.color}0d` } : undefined}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold min-w-0" style={{ color: r?.color }}>
                        <span className="text-muted-foreground font-medium mr-1.5">Etiqueta {e.numero}</span>{r?.label}
                      </p>
                    </div>
                    {e.resultado === 'precio_incorrecto' && (
                      <p className="text-xs mt-1.5">
                        Exhibido <b>{fmtL(e.precio_exhibido)}</b> · Sistema <b>{fmtL(e.precio_sistema)}</b> · Diferencia <b className="text-[#dc2626]">{fmtL(e.diferencia, { signo: true })}</b>
                      </p>
                    )}
                    {e.observaciones && <p className="text-xs text-muted-foreground italic mt-1 break-words">"{e.observaciones}"</p>}
                    {e.photos?.length > 0 && (
                      <div className="flex flex-wrap gap-4 mt-2">
                        {[['etiqueta', 'Etiqueta'], ['sistema', e.resultado === 'precio_incorrecto' ? 'Sistema' : 'Evidencia']].map(([tipo, label]) => {
                          const list = e.photos.filter((p) => (p.tipo || 'etiqueta') === tipo);
                          if (!list.length) return null;
                          return (
                            <div key={tipo}>
                              <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
                              <div className="flex flex-wrap gap-2">
                                {list.map((p) => {
                                  const url = `/etiquetas/auditorias/${aud.id}/foto/${p.id}`;
                                  return <AuthedImg key={p.id} url={url} className="h-16 w-16 rounded-lg object-cover border cursor-pointer" onClick={() => setZoom(url)} />;
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdmin && (aud.cambios || []).length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Historial de cambios</p>
                {[...aud.cambios].reverse().map((c, i) => (
                  <p key={i} className="text-xs mt-1">
                    <b>{c.user_name}</b> <span className="text-muted-foreground">· {fmtAt(c.at)}</span>
                    <span className="block text-muted-foreground">Cambió: {(c.campos || []).join('; ')}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
      <PhotoZoomDialog open={!!zoom} onClose={() => setZoom(null)}>
        {zoom && <AuthedImg url={zoom} className={ZOOM_IMG_CLASS} />}
      </PhotoZoomDialog>
    </Dialog>
  );
}

/* ─────────────────── Editar (administrador) ────────────── */
function EditDialog({ id, cfg, onClose, onSaved }) {
  const [aud, setAud] = useState(null);
  const [sucursal, setSucursal] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [ets, setEts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) { setAud(null); return; }
    api.get(`/etiquetas/auditorias/${id}`).then(({ data }) => {
      setAud(data); setSucursal(data.sucursal); setDepartamento(data.departamento);
      setEts((data.etiquetas || []).map((e) => ({
        ...e, observaciones: e.observaciones || '',
        precio_exhibido: e.precio_exhibido ?? '', precio_sistema: e.precio_sistema ?? '',
      })));
    }).catch(() => toast.error('No se pudo cargar la auditoría'));
  }, [id]);

  const set = (eid, patch) => setEts((l) => l.map((e) => (e.id === eid ? { ...e, ...patch } : e)));
  const conteo = useMemo(() => contarResultados(ets), [ets]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/etiquetas/auditorias/${id}`, {
        sucursal, departamento,
        etiquetas: ets.map((e) => ({
          id: e.id, resultado: e.resultado,
          precio_exhibido: e.precio_exhibido === '' ? null : Number(e.precio_exhibido),
          precio_sistema: e.precio_sistema === '' ? null : Number(e.precio_sistema),
          observaciones: e.observaciones,
        })),
      });
      toast.success('Auditoría actualizada');
      onSaved(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar el cambio');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[760px] rounded-[22px] max-h-[88dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 pr-10 text-left">
          <DialogTitle className="font-heading leading-snug">Editar auditoría</DialogTitle>
        </DialogHeader>
        {!aud ? (
          <div className="px-4 sm:px-6 pb-8 text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 pb-4 space-y-4">
              <p className="text-xs text-muted-foreground">
                Registrada por <b className="text-foreground">{aud.coordinador_name}</b> · {fmtFechaAud(aud)} · {semanaLabel(aud.semana)}. El coordinador, la fecha y las fotos no se modifican.
              </p>
              <div className="space-y-1.5"><Label>Sucursal</Label><ChipPicker options={ETQ_SUCURSALES} value={sucursal} onChange={setSucursal} /></div>
              <div className="space-y-1.5"><Label>Departamento</Label><ChipPicker options={ETQ_DEPARTAMENTOS} value={departamento} onChange={setDepartamento} cols="grid-cols-2 sm:grid-cols-3" /></div>
              {ets.map((e) => {
                const dif = diferencia(e);
                return (
                  <div key={e.id} className="rounded-xl border p-3 space-y-2.5">
                    <p className="text-sm font-semibold">Etiqueta {e.numero} <span className="text-xs text-muted-foreground font-normal">· {(e.photos || []).length} foto(s)</span></p>
                    <ResultadoPicker value={e.resultado} onChange={(v) => set(e.id, { resultado: v })} />
                    {e.resultado === 'precio_incorrecto' && (
                      <div className="grid grid-cols-3 gap-2 items-center">
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={e.precio_exhibido} onChange={(ev) => set(e.id, { precio_exhibido: ev.target.value })} placeholder="Exhibido" className="h-10" />
                        <Input type="number" inputMode="decimal" min="0" step="0.01" value={e.precio_sistema} onChange={(ev) => set(e.id, { precio_sistema: ev.target.value })} placeholder="Sistema" className="h-10" />
                        <span className="text-sm font-semibold text-[#dc2626]">{dif == null ? '—' : fmtL(dif, { signo: true })}</span>
                      </div>
                    )}
                    {e.resultado !== 'correcta' && (
                      <Textarea rows={2} value={e.observaciones} onChange={(ev) => set(e.id, { observaciones: ev.target.value })} placeholder="Observaciones" />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t px-4 sm:px-6 py-3 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Resultado: <PctChip pct={conteo.cumplimiento} cfg={cfg} /></span>
              <Button variant="outline" className="rounded-xl ml-auto" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={save} disabled={saving} data-testid="etiquetas-edit-save">
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────── Registro de auditoría (admin) ───────── */
const ACCION_TXT = { editada: 'editó', eliminada: 'eliminó', configuracion: 'cambió la configuración' };

function LogDialog({ open, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!open) return;
    setRows(null);
    api.get('/etiquetas/log').then(({ data }) => setRows(data)).catch(() => { setRows([]); toast.error('No se pudo cargar el registro'); });
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100%-1.5rem)] sm:max-w-[560px] rounded-[22px] max-h-[80dvh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 pr-10 text-left"><DialogTitle className="font-heading">Registro de cambios</DialogTitle></DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 pb-6 space-y-2">
          {!rows && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay ediciones ni eliminaciones.</p>}
          {rows && rows.map((r) => (
            <div key={r.id} className="rounded-xl border p-3 text-sm">
              {r.accion === 'configuracion' ? (
                <p><b>{r.user_name}</b> cambió la configuración</p>
              ) : (
                <p>
                  <b>{r.user_name}</b> <span className={r.accion === 'eliminada' ? 'text-[#dc2626] font-medium' : ''}>{ACCION_TXT[r.accion] || r.accion}</span> la
                  auditoría de <b>{r.sucursal} · {r.departamento}</b> del {(r.fecha_local || '').split('-').reverse().join('/')} ({r.coordinador_name})
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-0.5">{fmtAt(r.at)}{r.campos?.length ? ` · ${r.campos.join('; ')}` : ''}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Historial ───────────────────── */
const SIN_FILTROS = { sucursal: '', departamento: '', coordinador: '', desde: '', hasta: '', semana: '', mes: '' };

export default function Historial({ cfg, refreshKey }) {
  const { user } = useAuth();
  // el gerente de una tienda ve solo las de su tienda (el servidor también lo limita)
  const suTienda = etiquetasSoloSuTienda(user);
  const isAdmin = canAdminEtiquetas(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState([]);
  const [f, setF] = useState(SIN_FILTROS);
  const [openId, setOpenId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [exportingId, setExportingId] = useState(null);
  const [logOpen, setLogOpen] = useState(false);
  const semanas = useMemo(() => ultimasSemanas(), []);
  const hoy = ymd(new Date());

  const setFiltro = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => { if (v) params.set(k, v); });
      const { data } = await api.get(`/etiquetas/auditorias?${params.toString()}`);
      setRows(data);
    } catch (e) { toast.error('No se pudieron cargar las auditorías'); }
    finally { setLoading(false); }
  }, [f]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { api.get('/etiquetas/coordinadores').then(({ data }) => setCoords(data)).catch(() => {}); }, [refreshKey]);

  const removeOne = async (r) => {
    setDeletingId(r.id);
    const ok = await confirmar({
      tipo: 'danger', titulo: '¿Eliminar auditoría?',
      mensaje: <>Se eliminará la auditoría de <b>{r.sucursal} · {r.departamento}</b> del {fmtFechaAud(r)}, registrada por <b>{r.coordinador_name}</b>. Quedará constancia en el registro de cambios.</>,
      textoConfirmar: 'Eliminar', textoCargando: 'Eliminando…', textoExito: 'Auditoría eliminada',
      accion: () => api.delete(`/etiquetas/auditorias/${r.id}`),
    });
    setDeletingId(null);
    if (!ok) return;
    setRows((rs) => rs.filter((x) => x.id !== r.id));
    if (openId === r.id) setOpenId(null);
  };

  const quickPdf = async (r) => {
    setExportingId(r.id);
    try {
      const { data } = await api.get(`/etiquetas/auditorias/${r.id}`);
      await generateAuditoriaEtiquetasPdf(data, cfg);
    } catch (e) { toast.error('No se pudo generar el PDF'); }
    finally { setExportingId(null); }
  };

  const actions = (r) => (
    <div className="flex items-center justify-end gap-0.5">
      <button onClick={() => setOpenId(r.id)} title="Ver detalle" aria-label="Ver detalle" data-testid="etiquetas-history-view"
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Eye className="h-4 w-4" /></button>
      <button onClick={() => quickPdf(r)} disabled={exportingId === r.id} title="Descargar PDF" aria-label="Descargar PDF"
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-50">
        {exportingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      {isAdmin && (
        <>
          <button onClick={() => setEditId(r.id)} title="Editar" aria-label="Editar" data-testid="etiquetas-history-edit"
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => removeOne(r)} disabled={deletingId === r.id} title="Eliminar" aria-label="Eliminar" data-testid="etiquetas-history-delete"
            className="p-2 rounded-lg hover:bg-[rgba(220,38,38,0.08)] text-muted-foreground hover:text-[#dc2626] disabled:opacity-50 transition-colors">
            {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </>
      )}
    </div>
  );

  const hayFiltros = Object.values(f).some(Boolean);

  return (
    <div>
      <div className="rounded-[18px] bg-card border shadow-card p-4 mb-3 grid grid-cols-2 lg:grid-cols-7 gap-3 items-end">
        <div className="space-y-1.5 min-w-0 col-span-2 lg:col-span-1">
          <label className="text-xs text-muted-foreground">Semana</label>
          <NativeSelect value={f.semana} onChange={setFiltro('semana')} className="h-10">
            <option value="">Todas</option>
            {semanas.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Mes</label>
          <Input type="month" value={f.mes} max={hoy.slice(0, 7)} onChange={(e) => setFiltro('mes')(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Sucursal</label>
          {suTienda ? (
            <div className="h-10 flex items-center rounded-md border border-input bg-muted/50 px-3 text-sm text-muted-foreground" data-testid="etq-su-tienda">{suTienda}</div>
          ) : (
            <NativeSelect value={f.sucursal} onChange={setFiltro('sucursal')} className="h-10">
              <option value="">Todas</option>
              {ETQ_SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          )}
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Departamento</label>
          <NativeSelect value={f.departamento} onChange={setFiltro('departamento')} className="h-10">
            <option value="">Todos</option>
            {ETQ_DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Coordinador</label>
          <NativeSelect value={f.coordinador} onChange={setFiltro('coordinador')} className="h-10">
            <option value="">Todos</option>
            {coords.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={f.desde} max={f.hasta || hoy} onChange={(e) => setFiltro('desde')(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
        <div className="space-y-1.5 min-w-0">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={f.hasta} min={f.desde || undefined} max={hoy} onChange={(e) => setFiltro('hasta')(e.target.value)} className="h-10 w-full px-2.5" />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="text-xs text-muted-foreground">{loading ? '' : `${rows.length} auditoría${rows.length === 1 ? '' : 's'}`}</p>
        <div className="flex gap-1">
          {hayFiltros && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setF(SIN_FILTROS)}>Limpiar filtros</Button>}
          {isAdmin && (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setLogOpen(true)} data-testid="etiquetas-log-button">
              <History className="h-3.5 w-3.5 mr-1.5" /> Registro de cambios
            </Button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground text-center py-6">Cargando…</p>}
      {!loading && rows.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Sin auditorías con estos filtros</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="hidden lg:block rounded-[18px] bg-card border shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Fecha</th>
                  <th className="text-left font-medium px-3 py-3">Semana</th>
                  <th className="text-left font-medium px-3 py-3">Sucursal</th>
                  <th className="text-left font-medium px-3 py-3">Departamento</th>
                  <th className="text-left font-medium px-3 py-3">Coordinador</th>
                  <th className="text-right font-medium px-3 py-3">Revisadas</th>
                  <th className="text-right font-medium px-3 py-3">Correctas</th>
                  <th className="text-right font-medium px-3 py-3">Incorrectas</th>
                  <th className="text-right font-medium px-3 py-3">Cumplimiento</th>
                  <th className="text-right font-medium px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 transition-colors" data-testid="etiquetas-history-row">
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtFechaAud(r)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{(r.semana || '').split('-W')[1] ? Number(r.semana.split('-W')[1]) : '—'}</td>
                    <td className="px-3 py-2.5 font-semibold">{r.sucursal}</td>
                    <td className="px-3 py-2.5">{r.departamento}</td>
                    <td className="px-3 py-2.5 max-w-[160px] truncate text-muted-foreground">{r.coordinador_name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#16a34a] font-semibold">{r.correctas}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[#dc2626] font-semibold">{r.irregularidades}</td>
                    <td className="px-3 py-2.5 text-right"><PctChip pct={r.cumplimiento} cfg={cfg} /></td>
                    <td className="px-4 py-1">{actions(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-[16px] bg-card border shadow-card p-3" data-testid="etiquetas-history-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium"><b>{r.sucursal}</b> · {r.departamento}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtFechaAud(r)} · {semanaLabel(r.semana)}</span>
                      <span className="flex items-center gap-1 min-w-0"><UserIcon className="h-3 w-3 shrink-0" /><span className="truncate">{r.coordinador_name}</span></span>
                    </p>
                    <p className="text-xs mt-1">
                      <span className="text-muted-foreground">{r.total} revisadas · </span>
                      <span className="text-[#16a34a] font-semibold">{r.correctas} correctas</span>
                      <span className="text-muted-foreground"> · </span>
                      <span className="text-[#dc2626] font-semibold">{r.irregularidades} incorrectas</span>
                    </p>
                  </div>
                  <PctChip pct={r.cumplimiento} cfg={cfg} />
                </div>
                <div className="flex justify-end mt-1">{actions(r)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <DetailDialog id={openId} cfg={cfg} isAdmin={isAdmin} onClose={() => setOpenId(null)} />
      {isAdmin && <EditDialog id={editId} cfg={cfg} onClose={() => setEditId(null)}
        onSaved={(d) => { setRows((rs) => rs.map((x) => (x.id === d.id ? { ...x, ...d } : x))); setEditId(null); }} />}
      {isAdmin && <LogDialog open={logOpen} onClose={() => setLogOpen(false)} />}
    </div>
  );
}
