import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { ListChecks, Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, X, Info, Camera, Eye, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { confirmar } from '@/components/ConfirmDialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { DIALOG_CLS } from '@/components/activos/ActivoForm';
import { TIPOS_ITEM, MODOS_FOTOS, modoFotos } from '@/components/mantenimiento/comunes';
import { CategoriaIcono } from '@/components/activos/comunes';
import { PLANTILLAS_CHECKLIST } from '@/lib/plantillasChecklist';

let uid = 0;
const nuevoItem = () => ({ _k: `n${++uid}`, texto: '', tipo: 'estado', obligatorio: true, unidad: '', fotos: 'opcional' });
const conOpciones = (tipo) => tipo === 'unica' || tipo === 'multiple';

// Opciones de una pregunta de selección; cada una puede marcarse como falla.
function Opciones({ opciones, onChange }) {
  const set = (k, campo, v) => onChange(opciones.map((o, j) => (j === k ? { ...o, [campo]: v } : o)));
  return (
    <div className="space-y-1.5 pl-8">
      {opciones.map((o, k) => (
        <div key={k} className="flex items-center gap-2">
          <Input value={o.texto} onChange={(e) => set(k, 'texto', e.target.value)} placeholder={`Opción ${k + 1}`} className="h-9 flex-1" aria-label={`Opción ${k + 1}`} />
          <label className={`flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap ${o.falla ? 'text-[#dc2626] font-semibold' : 'text-muted-foreground'}`}>
            <Checkbox checked={!!o.falla} onCheckedChange={(v) => set(k, 'falla', !!v)} /> Es falla
          </label>
          <button type="button" onClick={() => onChange(opciones.filter((_, j) => j !== k))} aria-label="Quitar opción"
            className="h-9 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...opciones, { texto: '', falla: false }])} className="text-xs font-medium text-[#00a5df] hover:underline">
        + Agregar opción
      </button>
    </div>
  );
}

function ChecklistForm({ open, onOpenChange, checklist, plantilla, onSaved }) {
  const editando = !!checklist;
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [items, setItems] = useState([]);
  const [antesDespues, setAntesDespues] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const base = checklist || plantilla; // una plantilla llena el editor de un checklist nuevo
    setNombre(base?.nombre || '');
    setDescripcion(base?.descripcion || '');
    setItems(base ? base.items.map((it) => ({ ...it, opciones: it.opciones?.map((o) => ({ ...o })), fotos: modoFotos(it), _k: it.id || `n${++uid}` })) : [nuevoItem()]);
    setAntesDespues(!!base?.antes_despues);
  }, [open, checklist, plantilla]);

  const setItem = (i, k, v) => setItems((xs) => xs.map((x, j) => {
    if (j !== i) return x;
    const n = { ...x, [k]: v };
    // al pasar a selección, dos opciones vacías para empezar
    if (k === 'tipo' && conOpciones(v) && !(x.opciones || []).length) n.opciones = [{ texto: '', falla: false }, { texto: '', falla: false }];
    return n;
  }));
  const mover = (i, d) => setItems((xs) => {
    const j = i + d;
    if (j < 0 || j >= xs.length) return xs;
    const c = [...xs]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  const guardar = async () => {
    if (!nombre.trim()) { toast.error('Escribe el nombre del checklist'); return; }
    if (!items.length) { toast.error('Agrega al menos una pregunta'); return; }
    const vacia = items.findIndex((x) => !x.texto.trim());
    if (vacia >= 0) { toast.error(`La pregunta ${vacia + 1} está vacía`); return; }
    const pocas = items.findIndex((x) => conOpciones(x.tipo) && (x.opciones || []).filter((o) => o.texto.trim()).length < 2);
    if (pocas >= 0) { toast.error(`La pregunta ${pocas + 1} necesita al menos 2 opciones`); return; }
    setSaving(true);
    try {
      const body = {
        nombre, descripcion, antes_despues: antesDespues,
        items: items.map(({ _k, ...x }) => ({ ...x, opciones: conOpciones(x.tipo) ? (x.opciones || []).filter((o) => o.texto.trim()) : undefined })),
      };
      if (editando) await api.put(`/mantenimiento/checklists/${checklist.id}`, body);
      else await api.post('/mantenimiento/checklists', body);
      toast.success(editando ? 'Checklist actualizado' : 'Checklist creado');
      onOpenChange(false); onSaved();
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DIALOG_CLS} sm:w-[min(720px,100%)]`}>
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="font-heading text-xl">{editando ? 'Editar checklist' : plantilla ? 'Nuevo checklist desde plantilla' : 'Nuevo checklist'}</DialogTitle>
          <DialogDescription>
            {editando ? 'Los cambios aplican a las tareas que se generen de ahora en adelante; las ya creadas conservan su versión.'
              : plantilla ? 'Ajusta el nombre, agrega, quita o cambia preguntas a tu medida y guarda. La plantilla queda igual para volver a usarla.'
                : 'Las preguntas que el responsable contesta en cada mantenimiento.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="chk-nombre">Nombre<span className="text-[#dc2626]"> *</span></Label>
              <Input id="chk-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Revisión semanal de grabación" className="h-11" data-testid="chk-nombre" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chk-desc">Descripción</Label>
              <Input id="chk-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Opcional" className="h-11" />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preguntas · {items.length}</p>
            {items.map((it, i) => (
              <div key={it._k} className="rounded-xl border p-3 space-y-2" data-testid="chk-item">
                <div className="flex items-start gap-2">
                  <span className="mt-2.5 w-6 text-center text-sm font-semibold text-muted-foreground shrink-0">{i + 1}</span>
                  <Input value={it.texto} onChange={(e) => setItem(i, 'texto', e.target.value)} placeholder="Ej. Todos los canales en línea" className="h-10 flex-1" aria-label={`Pregunta ${i + 1}`} />
                  <div className="flex shrink-0">
                    <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="h-10 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => mover(i, 1)} disabled={i === items.length - 1} aria-label="Bajar" className="h-10 w-8 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Quitar" className="h-10 w-8 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]"><X className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 pl-8">
                  <NativeSelect value={it.tipo} onChange={(v) => setItem(i, 'tipo', v)} className="h-9 w-[210px]" aria-label={`Tipo de la pregunta ${i + 1}`}>
                    {Object.entries(TIPOS_ITEM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </NativeSelect>
                  {it.tipo === 'numero' && (
                    <Input value={it.unidad || ''} onChange={(e) => setItem(i, 'unidad', e.target.value)} placeholder="Unidad (ej. días)" className="h-9 w-[150px]" />
                  )}
                  {it.tipo !== 'foto' && (
                    <NativeSelect value={it.fotos || 'opcional'} onChange={(v) => setItem(i, 'fotos', v)} className="h-9 w-[170px]" aria-label={`Fotos de la pregunta ${i + 1}`}>
                      {Object.entries(MODOS_FOTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </NativeSelect>
                  )}
                  {it.tipo !== 'foto' && (
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <Checkbox checked={!!it.obligatorio} onCheckedChange={(v) => setItem(i, 'obligatorio', !!v)} />
                      {it.tipo === 'check' ? 'Obligatoria (debe marcarse)' : 'Obligatoria'}
                    </label>
                  )}
                </div>
                {conOpciones(it.tipo) && <Opciones opciones={it.opciones || []} onChange={(v) => setItem(i, 'opciones', v)} />}
              </div>
            ))}
            <Button type="button" variant="outline" className="rounded-xl" onClick={() => setItems((xs) => [...xs, nuevoItem()])} data-testid="chk-agregar">
              <Plus className="h-4 w-4 mr-1" /> Agregar pregunta
            </Button>
            <p className="text-xs text-muted-foreground">Si marcan Falla, o una opción marcada como "Es falla", se pide descripción y foto, queda en el historial del activo y se avisa al supervisor.</p>
          </div>
          <label className="flex items-start gap-3 rounded-xl border p-3 cursor-pointer hover:bg-muted/30">
            <Checkbox checked={antesDespues} onCheckedChange={(v) => setAntesDespues(!!v)} className="mt-0.5" data-testid="chk-antes-despues" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium"><Camera className="h-4 w-4 text-[#00a5df]" /> Pedir foto del antes y del después</span>
              <span className="block text-xs text-muted-foreground mt-0.5">El mantenimiento empieza con "Cómo encontraste el equipo" y termina con "Cómo quedó" (fotos obligatorias y comentario). En la tarea hecha se ven lado a lado.</span>
            </span>
          </label>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[120px]" data-testid="chk-guardar">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Ver un checklist sin editarlo: cada pregunta como la va a llenar el responsable.
function ChecklistVer({ checklist, onOpenChange, onEditar }) {
  const c = checklist;
  return (
    <Dialog open={!!c} onOpenChange={onOpenChange}>
      <DialogContent className={`${DIALOG_CLS} sm:w-[min(640px,100%)]`}>
        {c && (
          <>
            <DialogHeader className="px-6 pt-6 pb-2 text-left">
              <DialogTitle className="font-heading text-xl">{c.nombre}</DialogTitle>
              <DialogDescription>
                {c.items.length} pregunta{c.items.length === 1 ? '' : 's'} · versión {c.version}
                {c.descripcion ? ` · ${c.descripcion}` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 space-y-2.5" data-testid="chk-ver">
              {c.antes_despues && (
                <p className="flex items-center gap-2 rounded-xl bg-[rgba(0,165,223,0.08)] px-3 py-2 text-xs text-[#0284c7] dark:text-[#3cbef6]">
                  <Camera className="h-4 w-4 shrink-0" /> Pide fotos de cómo se encontró el equipo (antes) y de cómo quedó (después).
                </p>
              )}
              {c.items.map((it, i) => {
                const fotos = modoFotos(it);
                return (
                  <div key={it.id} className="rounded-xl border p-3" data-testid="chk-ver-item">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 h-6 w-6 shrink-0 grid place-items-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{it.texto}</p>
                        {it.ayuda && <p className="mt-0.5 text-xs text-muted-foreground">{it.ayuda}</p>}
                        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{TIPOS_ITEM[it.tipo] || it.tipo}{it.tipo === 'numero' && it.unidad ? ` (${it.unidad})` : ''}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{it.obligatorio ? 'Obligatoria' : 'Opcional'}</span>
                          {fotos !== 'no' && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground inline-flex items-center gap-1"><Camera className="h-3 w-3" /> {MODOS_FOTOS[fotos]}</span>}
                        </div>
                        {it.tipo === 'estado' && (
                          <p className="mt-1.5 text-xs text-muted-foreground">Respuestas: Bien · <span className="text-[#dc2626] font-medium">Falla</span> · No aplica</p>
                        )}
                        {(it.opciones || []).length > 0 && (
                          <ul className="mt-1.5 flex flex-wrap gap-1.5">
                            {it.opciones.map((o) => (
                              <li key={o.texto} className={`rounded-lg border px-2 py-0.5 text-xs ${o.falla ? 'border-[rgba(220,38,38,0.35)] text-[#dc2626]' : 'text-foreground'}`}>
                                {o.falla && <AlertTriangle className="inline h-3 w-3 mr-1 -mt-0.5" />}{o.texto}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2 flex-row justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cerrar</Button>
              <Button onClick={onEditar} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="chk-ver-editar">
                <Pencil className="h-4 w-4 mr-1.5" /> Editar
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function MantChecklists() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState(null);
  const [ver, setVer] = useState(null); // checklist abierto en solo lectura
  const load = useCallback(async () => {
    try { const { data } = await api.get('/mantenimiento/checklists'); setRows(data); }
    catch (e) { setError(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const eliminar = async (c) => {
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Eliminar ${c.nombre}?`, mensaje: 'Las tareas ya hechas con este checklist se conservan.',
      textoConfirmar: 'Eliminar', textoCargando: 'Eliminando…', textoExito: 'Checklist eliminado',
      accion: () => api.delete(`/mantenimiento/checklists/${c.id}`),
    });
    if (ok) load();
  };

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2"><ListChecks className="h-7 w-7 text-[#00a5df]" /> Checklists</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Las preguntas de cada mantenimiento; se usan en las planificaciones.</p>
        </div>
        {!error && (
          <Button onClick={() => setForm({})} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white w-full sm:w-auto" data-testid="chk-nuevo" data-tour="chk-nuevo">
            <Plus className="h-4 w-4 mr-1" /> Nuevo checklist
          </Button>
        )}
      </div>
      {!error && (
        <section className="mb-6" data-testid="chk-plantillas" data-tour="chk-plantillas">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Plantillas para empezar</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLANTILLAS_CHECKLIST.map((pl) => (
              <div key={pl.clave} className="rounded-[18px] border border-dashed bg-card p-4 flex flex-col gap-2" data-testid={`chk-plantilla-${pl.clave}`}>
                <div className="flex items-start gap-3">
                  <span className="h-10 w-10 rounded-xl bg-[rgba(0,165,223,0.12)] text-[#00a5df] grid place-items-center shrink-0">
                    <CategoriaIcono icono={pl.icono} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-heading font-semibold leading-snug">{pl.nombre}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{pl.items.length} preguntas · antes y después</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground flex-1">{pl.descripcion}</p>
                <Button variant="outline" size="sm" className="rounded-xl self-start" onClick={() => setForm({ plantilla: pl })} data-testid={`chk-usar-${pl.clave}`}>
                  Usar plantilla
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
      {!error && rows?.length > 0 && <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Tus checklists</h2>}
      {error ? (
        <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
          <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Solo quien administra activos o es responsable de una categoría maneja los checklists.</p>
        </div>
      ) : rows === null ? <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p> : !rows.length ? (
        <div className="rounded-[18px] border border-dashed bg-card p-10 text-center">
          <ListChecks className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aún no hay checklists. Empieza con una plantilla de arriba o crea uno en blanco.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((c) => (
            <div key={c.id} className="rounded-[18px] border bg-card shadow-card p-4" data-testid="chk-tarjeta">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <h2 className="font-heading font-semibold truncate">{c.nombre}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.items.length} pregunta{c.items.length === 1 ? '' : 's'}{c.antes_despues ? ' · antes y después' : ''} · versión {c.version}{c.en_uso ? ` · en ${c.en_uso} tarea${c.en_uso === 1 ? '' : 's'} planificada${c.en_uso === 1 ? '' : 's'}` : ' · sin usar'}
                  </p>
                </div>
                <button type="button" onClick={() => setVer(c)} aria-label={`Ver ${c.nombre}`} title="Ver" data-testid="chk-ver-boton"
                  className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Eye className="h-4 w-4" /></button>
                <button type="button" onClick={() => setForm({ checklist: c })} aria-label={`Editar ${c.nombre}`} className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => eliminar(c)} disabled={c.en_uso > 0} title={c.en_uso ? 'Lo usa una planificación' : 'Eliminar'} aria-label={`Eliminar ${c.nombre}`}
                  className="h-9 w-9 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] disabled:opacity-30 disabled:hover:bg-transparent"><Trash2 className="h-4 w-4" /></button>
              </div>
              <ol className="mt-3 space-y-1 text-sm text-muted-foreground list-decimal pl-5">
                {c.items.slice(0, 5).map((it) => <li key={it.id} className="truncate">{it.texto}</li>)}
                {c.items.length > 5 && (
                  <li className="list-none -ml-5 text-xs">
                    <button type="button" onClick={() => setVer(c)} className="text-[#00a5df] hover:underline">y {c.items.length - 5} más… ver todas</button>
                  </li>
                )}
              </ol>
            </div>
          ))}
        </div>
      )}
      <ChecklistVer checklist={ver} onOpenChange={(v) => { if (!v) setVer(null); }} onEditar={() => { setForm({ checklist: ver }); setVer(null); }} />
      <ChecklistForm open={!!form} onOpenChange={(v) => { if (!v) setForm(null); }} checklist={form?.checklist} plantilla={form?.plantilla} onSaved={load} />
    </div>
  );
}
