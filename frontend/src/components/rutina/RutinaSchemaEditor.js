import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Save, X, ListChecks } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const newLocalId = () => `local-${Date.now()}-${Math.random()}`;

const emptyOption = () => ({ localId: newLocalId(), label: '', pts: 0 });
const emptyItem = () => ({
  localId: newLocalId(), id: null, titulo: '', pregunta: '',
  opciones: [emptyOption(), emptyOption()],
  evidencia: { tipo: 'foto', prompt: '' },
});
const emptySection = () => ({ localId: newLocalId(), seccion: '', items: [emptyItem()] });

// Backend -> forma local editable (con localId para keys de React/reordenar).
function fromApi(secciones) {
  return (secciones || []).map((s) => ({
    localId: newLocalId(),
    seccion: s.seccion,
    items: s.items.map((it) => ({
      localId: newLocalId(),
      id: it.id,
      titulo: it.titulo,
      pregunta: it.pregunta || '',
      opciones: it.opciones.map((o) => ({ localId: newLocalId(), label: o.label, pts: o.pts })),
      evidencia: it.evidencia ? { ...it.evidencia } : null,
    })),
  }));
}

// Forma local -> payload para PUT /rutina/schema.
function toApi(secciones) {
  return secciones.map((s) => ({
    seccion: s.seccion.trim(),
    items: s.items.map((it) => ({
      id: it.id || undefined,
      titulo: it.titulo.trim(),
      pregunta: it.pregunta.trim(),
      opciones: it.opciones.map((o) => ({ label: o.label.trim(), pts: Number(o.pts) || 0 })),
      evidencia: it.evidencia ? { tipo: it.evidencia.tipo, prompt: it.evidencia.prompt.trim() } : null,
    })),
  }));
}

function itemMax(it) {
  const pts = it.opciones.map((o) => Number(o.pts) || 0);
  return pts.length ? Math.max(...pts) : 0;
}
function totalMax(secciones) {
  return secciones.reduce((sum, s) => sum + s.items.reduce((n, it) => n + itemMax(it), 0), 0);
}

export default function RutinaSchemaEditor({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [secciones, setSecciones] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/rutina/schema');
      setSecciones(fromApi(data.secciones));
    } catch (e) { toast.error('No se pudo cargar el esquema de Rutina Operativa'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  // ---- mutadores inmutables ----
  const updateSeccion = (sIdx, patch) => setSecciones((ss) => ss.map((s, i) => (i === sIdx ? { ...s, ...patch } : s)));
  const removeSeccion = (sIdx) => setSecciones((ss) => ss.filter((_, i) => i !== sIdx));
  const addSeccion = () => setSecciones((ss) => [...ss, emptySection()]);

  const updateItem = (sIdx, iIdx, patch) => setSecciones((ss) => ss.map((s, i) => (i !== sIdx ? s : {
    ...s, items: s.items.map((it, j) => (j === iIdx ? { ...it, ...patch } : it)),
  })));
  const removeItem = (sIdx, iIdx) => setSecciones((ss) => ss.map((s, i) => (i !== sIdx ? s : {
    ...s, items: s.items.filter((_, j) => j !== iIdx),
  })));
  const addItem = (sIdx) => setSecciones((ss) => ss.map((s, i) => (i !== sIdx ? s : { ...s, items: [...s.items, emptyItem()] })));

  const updateOption = (sIdx, iIdx, oIdx, patch) => setSecciones((ss) => ss.map((s, i) => (i !== sIdx ? s : {
    ...s,
    items: s.items.map((it, j) => (j !== iIdx ? it : {
      ...it, opciones: it.opciones.map((o, k) => (k === oIdx ? { ...o, ...patch } : o)),
    })),
  })));
  const removeOption = (sIdx, iIdx, oIdx) => setSecciones((ss) => ss.map((s, i) => (i !== sIdx ? s : {
    ...s,
    items: s.items.map((it, j) => (j !== iIdx ? it : { ...it, opciones: it.opciones.filter((_, k) => k !== oIdx) })),
  })));
  const addOption = (sIdx, iIdx) => setSecciones((ss) => ss.map((s, i) => (i !== sIdx ? s : {
    ...s,
    items: s.items.map((it, j) => (j !== iIdx ? it : { ...it, opciones: [...it.opciones, emptyOption()] })),
  })));

  const toggleEvidencia = (sIdx, iIdx, on) => updateItem(sIdx, iIdx, { evidencia: on ? { tipo: 'foto', prompt: '' } : null });

  const save = async () => {
    // Validaciones en el cliente (el backend igual valida, pero avisar antes de mandar ahorra un viaje).
    if (secciones.length === 0) { toast.error('Agrega al menos una sección'); return; }
    for (const s of secciones) {
      if (!s.seccion.trim()) { toast.error('Cada sección necesita un nombre'); return; }
      if (s.items.length === 0) { toast.error(`"${s.seccion}" necesita al menos una pregunta`); return; }
      for (const it of s.items) {
        if (!it.titulo.trim()) { toast.error('Cada pregunta necesita un título'); return; }
        const opciones = it.opciones.filter((o) => o.label.trim());
        if (opciones.length === 0) { toast.error(`"${it.titulo}" necesita al menos una opción`); return; }
      }
    }
    setSaving(true);
    try {
      await api.put('/rutina/schema', { secciones: toApi(secciones) });
      toast.success('Esquema de Rutina Operativa actualizado');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar el esquema');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[720px] rounded-[22px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="font-heading flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-[#00a5df]" /> Editar preguntas y puntajes — Rutina Operativa
          </DialogTitle>
          {!loading && (
            <p className="text-xs text-muted-foreground">
              Total actual: <span className="font-semibold text-foreground">{totalMax(secciones)} pts</span> — no tiene que sumar 100, pero es buena práctica mantenerlo así.
            </p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
            {secciones.map((s, sIdx) => (
              <div key={s.localId} className="rounded-[16px] border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Input value={s.seccion} onChange={(e) => updateSeccion(sIdx, { seccion: e.target.value })}
                    placeholder="Nombre de la sección" className="h-10 font-heading font-semibold flex-1" />
                  <button onClick={() => removeSeccion(sIdx)} title="Eliminar sección"
                    className="p-2 rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {s.items.map((it, iIdx) => (
                    <div key={it.localId} className="rounded-[14px] border bg-card p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Input value={it.titulo} onChange={(e) => updateItem(sIdx, iIdx, { titulo: e.target.value })}
                            placeholder="Título de la pregunta" className="h-9" />
                          <Input value={it.pregunta} onChange={(e) => updateItem(sIdx, iIdx, { pregunta: e.target.value })}
                            placeholder="Enunciado (opcional)" className="h-8 text-xs text-muted-foreground" />
                        </div>
                        <button onClick={() => removeItem(sIdx, iIdx)} title="Eliminar pregunta"
                          className="p-2 rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="space-y-1.5 pl-1">
                        {it.opciones.map((o, oIdx) => (
                          <div key={o.localId} className="flex items-center gap-2">
                            <Input value={o.label} onChange={(e) => updateOption(sIdx, iIdx, oIdx, { label: e.target.value })}
                              placeholder="Opción" className="h-8 flex-1 text-sm" />
                            <Input type="number" min="0" value={o.pts} onChange={(e) => updateOption(sIdx, iIdx, oIdx, { pts: e.target.value })}
                              placeholder="pts" className="h-8 w-20 text-sm" />
                            <button onClick={() => removeOption(sIdx, iIdx, oIdx)} title="Quitar opción"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-[#dc2626] shrink-0">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <Button type="button" variant="ghost" size="sm" onClick={() => addOption(sIdx, iIdx)}
                          className="h-7 text-xs text-muted-foreground">
                          <Plus className="h-3 w-3 mr-1" /> Agregar opción
                        </Button>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border px-3 py-2">
                        <span className="text-xs">Pedir evidencia</span>
                        <Switch checked={!!it.evidencia} onCheckedChange={(v) => toggleEvidencia(sIdx, iIdx, v)} />
                      </div>
                      {it.evidencia && (
                        <div className="grid grid-cols-[110px_1fr] gap-2">
                          <Select value={it.evidencia.tipo} onValueChange={(v) => updateItem(sIdx, iIdx, { evidencia: { ...it.evidencia, tipo: v } })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="foto">Foto</SelectItem>
                              <SelectItem value="texto">Texto</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input value={it.evidencia.prompt} onChange={(e) => updateItem(sIdx, iIdx, { evidencia: { ...it.evidencia, prompt: e.target.value } })}
                            placeholder="Indicación para la evidencia (ej. 'Adjunte captura…')" className="h-8 text-xs" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => addItem(sIdx)} className="rounded-xl">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar pregunta
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addSeccion} className="w-full rounded-xl">
              <Plus className="h-4 w-4 mr-1.5" /> Agregar sección
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2 px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={onClose} className="rounded-xl" disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={loading || saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
