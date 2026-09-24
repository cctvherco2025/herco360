import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2, Save, ListChecks } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const newLocalId = () => `local-${Date.now()}-${Math.random()}`;

const emptyVariable = () => ({ localId: newLocalId(), id: null, name: '', desc: '', action: '', max: 5 });
const emptyDimension = () => ({ localId: newLocalId(), dimension: '', variables: [emptyVariable()] });

// Backend -> forma local editable (con localId para keys de React).
function fromApi(dimensiones) {
  return (dimensiones || []).map((d) => ({
    localId: newLocalId(),
    dimension: d.dimension,
    variables: d.variables.map((v) => ({
      localId: newLocalId(), id: v.id, name: v.name, desc: v.desc || '', action: v.action || '', max: v.max,
    })),
  }));
}

// Forma local -> payload para PUT /formulario/schema.
function toApi(dimensiones) {
  return dimensiones.map((d) => ({
    dimension: d.dimension.trim(),
    variables: d.variables.map((v) => ({
      id: v.id || undefined,
      name: v.name.trim(),
      desc: v.desc.trim(),
      action: v.action.trim(),
      max: Number(v.max) || 0,
    })),
  }));
}

function totalMax(dimensiones) {
  return dimensiones.reduce((sum, d) => sum + d.variables.reduce((n, v) => n + (Number(v.max) || 0), 0), 0);
}

export default function FlosSchemaEditor({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dimensiones, setDimensiones] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/formulario/schema');
      setDimensiones(fromApi(data.dimensiones));
    } catch (e) { toast.error('No se pudo cargar el esquema de la auditoría FLOS'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  // ---- mutadores inmutables ----
  const updateDim = (dIdx, patch) => setDimensiones((ds) => ds.map((d, i) => (i === dIdx ? { ...d, ...patch } : d)));
  const removeDim = (dIdx) => setDimensiones((ds) => ds.filter((_, i) => i !== dIdx));
  const addDim = () => setDimensiones((ds) => [...ds, emptyDimension()]);

  const updateVar = (dIdx, vIdx, patch) => setDimensiones((ds) => ds.map((d, i) => (i !== dIdx ? d : {
    ...d, variables: d.variables.map((v, j) => (j === vIdx ? { ...v, ...patch } : v)),
  })));
  const removeVar = (dIdx, vIdx) => setDimensiones((ds) => ds.map((d, i) => (i !== dIdx ? d : {
    ...d, variables: d.variables.filter((_, j) => j !== vIdx),
  })));
  const addVar = (dIdx) => setDimensiones((ds) => ds.map((d, i) => (i !== dIdx ? d : { ...d, variables: [...d.variables, emptyVariable()] })));

  const save = async () => {
    if (dimensiones.length === 0) { toast.error('Agrega al menos una dimensión'); return; }
    for (const d of dimensiones) {
      if (!d.dimension.trim()) { toast.error('Cada dimensión necesita un nombre'); return; }
      if (d.variables.length === 0) { toast.error(`"${d.dimension}" necesita al menos un criterio`); return; }
      for (const v of d.variables) {
        if (!v.name.trim()) { toast.error('Cada criterio necesita un nombre'); return; }
      }
    }
    setSaving(true);
    try {
      await api.put('/formulario/schema', { dimensiones: toApi(dimensiones) });
      toast.success('Esquema de la auditoría FLOS actualizado');
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
            <ListChecks className="h-5 w-5 text-[#00a5df]" /> Editar criterios y puntajes — Auditoría FLOS
          </DialogTitle>
          {!loading && (
            <p className="text-xs text-muted-foreground">
              Total actual: <span className="font-semibold text-foreground">{totalMax(dimensiones)} pts</span> — no tiene que sumar 100, pero es buena práctica mantenerlo así.
            </p>
          )}
        </DialogHeader>

        {loading ? (
          <div className="px-6 py-16 text-center text-sm text-muted-foreground">Cargando…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
            {dimensiones.map((d, dIdx) => (
              <div key={d.localId} className="rounded-[16px] border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Input value={d.dimension} onChange={(e) => updateDim(dIdx, { dimension: e.target.value.toUpperCase() })}
                    placeholder="Nombre de la dimensión (ej. FRENTEO)" className="h-10 font-heading font-semibold flex-1" />
                  <button onClick={() => removeDim(dIdx)} title="Eliminar dimensión"
                    className="p-2 rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  {d.variables.map((v, vIdx) => (
                    <div key={v.localId} className="rounded-[14px] border bg-card p-3.5 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Input value={v.name} onChange={(e) => updateVar(dIdx, vIdx, { name: e.target.value })}
                            placeholder="Nombre del criterio" className="h-9" />
                          <Textarea value={v.desc} onChange={(e) => updateVar(dIdx, vIdx, { desc: e.target.value })} rows={2}
                            placeholder="Descripción del criterio (qué se revisa)" className="text-xs" />
                          <Textarea value={v.action} onChange={(e) => updateVar(dIdx, vIdx, { action: e.target.value })} rows={2}
                            placeholder="Acción correctiva (aparece en el Plan de acción si no se alcanza el máximo)" className="text-xs" />
                          <div className="flex items-center gap-2">
                            <Label className="text-xs shrink-0">Puntaje máximo</Label>
                            <Input type="number" min="0" value={v.max} onChange={(e) => updateVar(dIdx, vIdx, { max: e.target.value })}
                              className="h-8 w-24 text-sm" />
                          </div>
                        </div>
                        <button onClick={() => removeVar(dIdx, vIdx)} title="Eliminar criterio"
                          className="p-2 rounded-lg text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] shrink-0">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => addVar(dIdx)} className="rounded-xl">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Agregar criterio
                </Button>
              </div>
            ))}

            <Button type="button" variant="outline" onClick={addDim} className="w-full rounded-xl">
              <Plus className="h-4 w-4 mr-1.5" /> Agregar dimensión
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
