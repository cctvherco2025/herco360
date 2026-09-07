import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical, ListChecks, CheckSquare, Type, Save } from 'lucide-react';
import api from '@/lib/api';
import { CARGOS, AREAS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TIPOS = [
  { value: 'opcion_unica', label: 'Opción única', icon: ListChecks },
  { value: 'checklist', label: 'Casillas (varias)', icon: CheckSquare },
  { value: 'texto', label: 'Texto libre', icon: Type },
];

const newOption = () => ({ localId: `${Date.now()}-${Math.random()}`, label: '', pts: 0 });
const newItem = () => ({
  localId: `${Date.now()}-${Math.random()}`, seccion: '', titulo: '', pregunta: '',
  tipo: 'opcion_unica', scored: false, permite_foto: true,
  opciones: [newOption(), newOption()],
});

// Reconstruye el estado del builder a partir de un formulario ya guardado.
const audienceToState = (aud) => {
  const a = aud || {};
  if (a.todos) return { audTipo: 'todos', audValor: '' };
  if ((a.areas || []).length) return { audTipo: 'area', audValor: a.areas[0] };
  if ((a.cargos || []).length) return { audTipo: 'cargo', audValor: a.cargos[0] };
  return { audTipo: 'todos', audValor: '' };
};
const schemaToItems = (items) => (items || []).map((it) => ({
  localId: `${it.id || Date.now()}-${Math.random()}`,
  serverId: it.id,
  seccion: it.seccion === 'General' ? '' : (it.seccion || ''),
  titulo: it.titulo || '',
  pregunta: it.pregunta || '',
  tipo: it.tipo || 'opcion_unica',
  scored: !!it.scored,
  permite_foto: it.permite_foto !== false,
  opciones: it.tipo === 'texto' || !(it.opciones || []).length
    ? [newOption(), newOption()]
    : it.opciones.map((o) => ({ localId: `${Date.now()}-${Math.random()}`, label: o.label || '', pts: o.pts ?? 0 })),
}));

export default function FormBuilder({ editId }) {
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [audTipo, setAudTipo] = useState('todos');
  const [audValor, setAudValor] = useState('');
  const [items, setItems] = useState([newItem()]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [loadError, setLoadError] = useState(null);
  const [hasResponses, setHasResponses] = useState(false);

  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      try {
        const { data } = await api.get(`/formularios-custom/${editId}`);
        if (!alive) return;
        setTitulo(data.titulo || '');
        setDescripcion(data.descripcion || '');
        const { audTipo: at, audValor: av } = audienceToState(data.audiencia);
        setAudTipo(at);
        setAudValor(av);
        setItems(schemaToItems(data.items).length ? schemaToItems(data.items) : [newItem()]);
        try {
          const { data: resp } = await api.get(`/formularios-custom/${editId}/respuestas`);
          if (alive) setHasResponses(Array.isArray(resp) && resp.length > 0);
        } catch { /* sin permiso para verlas o no hay: se ignora */ }
      } catch (e) {
        if (alive) setLoadError(e?.response?.data?.detail || 'No se pudo cargar el formulario');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [editId]);

  const updateItem = (localId, patch) => setItems((its) => its.map((it) => (it.localId === localId ? { ...it, ...patch } : it)));
  const removeItem = (localId) => setItems((its) => its.filter((it) => it.localId !== localId));
  const addItem = () => setItems((its) => [...its, newItem()]);

  const updateOption = (itemId, optId, patch) => setItems((its) => its.map((it) => it.localId !== itemId ? it : {
    ...it, opciones: it.opciones.map((o) => (o.localId === optId ? { ...o, ...patch } : o)),
  }));
  const addOption = (itemId) => setItems((its) => its.map((it) => it.localId !== itemId ? it : { ...it, opciones: [...it.opciones, newOption()] }));
  const removeOption = (itemId, optId) => setItems((its) => its.map((it) => it.localId !== itemId ? it : { ...it, opciones: it.opciones.filter((o) => o.localId !== optId) }));

  const save = async () => {
    if (!titulo.trim()) { toast.error('Ponle un título al formulario'); return; }
    if ((audTipo === 'area' || audTipo === 'cargo') && !audValor) { toast.error('Selecciona el área o cargo destinatario'); return; }
    if (items.length === 0) { toast.error('Agrega al menos una pregunta'); return; }
    for (const it of items) {
      if (!it.titulo.trim()) { toast.error('Cada pregunta necesita un título'); return; }
      if (it.tipo !== 'texto') {
        const labeled = it.opciones.filter((o) => o.label.trim());
        if (labeled.length === 0) { toast.error(`"${it.titulo}" necesita al menos una opción`); return; }
        if (it.scored && labeled.some((o) => o.pts === '' || o.pts === null || o.pts === undefined)) {
          toast.error(`"${it.titulo}": asigna puntos a todas sus opciones`); return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        titulo: titulo.trim(), descripcion: descripcion.trim(),
        audiencia: {
          todos: audTipo === 'todos',
          areas: audTipo === 'area' ? [audValor] : [],
          cargos: audTipo === 'cargo' ? [audValor] : [],
          user_ids: [],
        },
        items: items.map((it) => ({
          id: it.serverId || undefined,
          seccion: it.seccion.trim() || 'General', titulo: it.titulo.trim(), pregunta: it.pregunta.trim(),
          tipo: it.tipo, scored: it.tipo !== 'texto' && it.scored, permite_foto: it.permite_foto,
          opciones: it.tipo === 'texto' ? [] : it.opciones.filter((o) => o.label.trim()).map((o) => ({
            label: o.label.trim(), pts: it.scored ? Number(o.pts) || 0 : null,
          })),
        })),
      };
      if (editId) {
        const { data } = await api.put(`/formularios-custom/${editId}`, payload);
        toast.success('Formulario actualizado');
        navigate(`/formularios/custom/${data.id}`);
      } else {
        const { data } = await api.post('/formularios-custom', payload);
        toast.success('Formulario creado');
        navigate(`/formularios/custom/${data.id}`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || (editId ? 'No se pudo actualizar el formulario' : 'No se pudo crear el formulario'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;
  if (loadError) return <p className="text-sm text-muted-foreground text-center py-16">{loadError}</p>;

  return (
    <div className="max-w-[720px] mx-auto space-y-4">
      {editId && hasResponses && (
        <div className="rounded-xl border border-[#f0c36d] bg-[rgba(240,195,109,0.12)] px-4 py-3 text-sm text-[#8a6d1d]">
          Este formulario ya tiene respuestas. Editarlo cambia cómo se responde de ahora en adelante; las respuestas ya enviadas conservan sus preguntas originales.
        </div>
      )}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-[18px] bg-card border shadow-card p-5 sm:p-6 space-y-4">
        <div className="space-y-1.5">
          <Label>Título del formulario</Label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Encuesta de clima laboral" className="h-11" data-testid="builder-titulo-input" />
        </div>
        <div className="space-y-1.5">
          <Label>Descripción (opcional)</Label>
          <Textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} placeholder="¿Para qué es este formulario?" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>¿Quién puede llenarlo?</Label>
            <Select value={audTipo} onValueChange={(v) => { setAudTipo(v); setAudValor(''); }}>
              <SelectTrigger className="h-11" data-testid="builder-audiencia-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos en la empresa</SelectItem>
                <SelectItem value="area">Un área específica</SelectItem>
                <SelectItem value="cargo">Un cargo específico</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {audTipo !== 'todos' && (
            <div className="space-y-1.5">
              <Label>{audTipo === 'area' ? 'Área' : 'Cargo'}</Label>
              <Select value={audValor} onValueChange={setAudValor}>
                <SelectTrigger className="h-11" data-testid="builder-audiencia-valor"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  {(audTipo === 'area' ? AREAS : CARGOS).map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </motion.div>

      <div className="space-y-3">
        {items.map((it, idx) => (
          <motion.div key={it.localId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-[16px] bg-card border shadow-card p-4 sm:p-5" data-testid="builder-item">
            <div className="flex items-center gap-2 mb-3">
              <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
              <span className="text-xs font-semibold text-muted-foreground">Pregunta {idx + 1}</span>
              <button onClick={() => removeItem(it.localId)} className="ml-auto text-muted-foreground hover:text-[#dc2626]" data-testid="builder-remove-item">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Sección (opcional)</Label>
                <Input value={it.seccion} onChange={(e) => updateItem(it.localId, { seccion: e.target.value })} placeholder="General" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de pregunta</Label>
                <Select value={it.tipo} onValueChange={(v) => updateItem(it.localId, { tipo: v, scored: v === 'texto' ? false : it.scored })}>
                  <SelectTrigger className="h-10" data-testid="builder-item-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5 mb-3">
              <Label className="text-xs">Título de la pregunta</Label>
              <Input value={it.titulo} onChange={(e) => updateItem(it.localId, { titulo: e.target.value })} placeholder="Ej. ¿Cómo calificas el mes?" className="h-10" data-testid="builder-item-titulo" />
            </div>
            <div className="space-y-1.5 mb-3">
              <Label className="text-xs">Texto de ayuda (opcional)</Label>
              <Input value={it.pregunta} onChange={(e) => updateItem(it.localId, { pregunta: e.target.value })} placeholder="Instrucción adicional…" className="h-10" />
            </div>

            {it.tipo !== 'texto' && (
              <>
                <div className="flex items-center justify-between rounded-xl border px-3 py-2.5 mb-3">
                  <span className="text-sm">¿Lleva puntaje?</span>
                  <Switch checked={it.scored} onCheckedChange={(v) => updateItem(it.localId, { scored: v })} data-testid="builder-item-scored" />
                </div>
                <div className="space-y-2">
                  {it.opciones.map((o) => (
                    <div key={o.localId} className="flex items-center gap-2">
                      <Input value={o.label} onChange={(e) => updateOption(it.localId, o.localId, { label: e.target.value })}
                        placeholder="Opción…" className="h-9 flex-1" data-testid="builder-option-label" />
                      {it.scored && (
                        <Input type="number" value={o.pts} onChange={(e) => updateOption(it.localId, o.localId, { pts: e.target.value })}
                          placeholder="pts" className="h-9 w-20" data-testid="builder-option-pts" />
                      )}
                      <button onClick={() => removeOption(it.localId, o.localId)} className="text-muted-foreground hover:text-[#dc2626] shrink-0">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={() => addOption(it.localId)} className="text-xs">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Agregar opción
                  </Button>
                </div>
              </>
            )}

            <div className="flex items-center justify-between rounded-xl border px-3 py-2.5 mt-3">
              <span className="text-sm">Permitir adjuntar foto</span>
              <Switch checked={it.permite_foto} onCheckedChange={(v) => updateItem(it.localId, { permite_foto: v })} />
            </div>
          </motion.div>
        ))}

        <Button type="button" variant="outline" onClick={addItem} className="w-full rounded-xl" data-testid="builder-add-item">
          <Plus className="h-4 w-4 mr-1.5" /> Agregar pregunta
        </Button>
      </div>

      <Button onClick={save} disabled={saving} className="w-full h-11 rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="builder-save-button">
        <Save className="h-4 w-4 mr-1.5" /> {saving ? 'Guardando…' : (editId ? 'Guardar cambios' : 'Guardar formulario')}
      </Button>
    </div>
  );
}
