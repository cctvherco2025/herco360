import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Loader2, Camera, X, Search } from 'lucide-react';
import api from '@/lib/api';
import { compressImage } from '@/lib/flosPhoto';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { CategoriaIcono } from '@/components/activos/comunes';

export const DIALOG_CLS = 'w-[min(620px,100%)] max-w-none p-0 overflow-hidden flex flex-col rounded-[22px] max-h-[92vh] '
  + 'max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none';

// Activos a los que puede pertenecer uno de esta categoría, con sus
// posiciones ocupadas y su capacidad (GET /activos/padres/:categoria).
export function usePadres(cat, open) {
  const [padres, setPadres] = useState([]);
  const catId = cat?.padre_id ? cat.id : null;
  useEffect(() => {
    if (!open || !catId) { setPadres([]); return; }
    api.get(`/activos/padres/${catId}`).then(({ data }) => setPadres(data)).catch(() => setPadres([]));
  }, [catId, open]);
  return padres;
}

// Posiciones libres de un padre (la propia del activo que se edita cuenta como libre).
export function posicionesLibres(padre, propioId) {
  if (!padre?.capacidad) return null;
  const ocupadas = new Set(padre.ocupadas.filter((o) => o.id !== propioId).map((o) => o.posicion));
  const out = [];
  for (let i = 1; i <= padre.capacidad; i++) if (!ocupadas.has(i)) out.push(i);
  return out;
}

export function CampoDato({ campo, value, onChange, compacto = false }) {
  const id = `campo-${campo.clave}`;
  const h = compacto ? 'h-10' : 'h-11';
  let input;
  if (campo.tipo === 'opcion' || campo.tipo === 'si_no') {
    const opciones = campo.tipo === 'si_no' ? [['true', 'Sí'], ['false', 'No']] : campo.opciones.map((o) => [o, o]);
    const v = campo.tipo === 'si_no' ? (value === true ? 'true' : value === false ? 'false' : '') : (value ?? '');
    input = (
      <NativeSelect id={id} value={v} className={h}
        onChange={(x) => onChange(campo.tipo === 'si_no' ? (x === '' ? null : x === 'true') : x)}>
        <option value="">Elegir…</option>
        {opciones.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </NativeSelect>
    );
  } else if (campo.tipo === 'fecha') {
    input = <Input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={h} />;
  } else if (campo.tipo === 'numero' || campo.tipo === 'decimal') {
    input = (
      <Input id={id} type="number" min="0" inputMode={campo.tipo === 'decimal' ? 'decimal' : 'numeric'} step={campo.tipo === 'decimal' ? '0.01' : '1'}
        value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={h} />
    );
  } else {
    input = (
      <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={h}
        inputMode={campo.tipo === 'ip' ? 'decimal' : undefined} placeholder={campo.tipo === 'ip' ? 'Ej. 192.168.1.64' : undefined} />
    );
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{campo.etiqueta}{campo.obligatorio && <span className="text-[#dc2626]"> *</span>}</Label>
      {input}
    </div>
  );
}

export const faltaCampo = (cat, datos) => cat.campos.find((c) => c.obligatorio && (datos[c.clave] === null || datos[c.clave] === undefined || String(datos[c.clave]).trim() === ''));

const vacio = (categoria_id, extra = {}) => ({
  categoria_id, nombre: '', sucursal: '', ubicacion: '', padre_id: '', posicion: '', notas: '', datos: {}, ...extra,
});

/* Registrar o editar un activo. `activo` = edición; `inicial` = valores para
   uno nuevo (p. ej. { categoria_id: 'camara', padre_id, posicion } desde la ficha del NVR). */
export default function ActivoForm({ open, onOpenChange, meta, activo, inicial, onSaved }) {
  const editando = !!activo;
  const editables = useMemo(() => (meta?.categorias || []).filter((c) => c.puede_editar), [meta]);
  const [form, setForm] = useState(vacio(''));
  const [foto, setFoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [buscar, setBuscar] = useState('');

  useEffect(() => {
    if (!open) return;
    setFoto(null);
    setBuscar('');
    if (activo) {
      setForm({
        categoria_id: activo.categoria_id, nombre: activo.nombre || '', sucursal: activo.sucursal || '', ubicacion: activo.ubicacion || '',
        padre_id: activo.padre_id || '', posicion: activo.posicion ?? '', notas: activo.notas || '', datos: { ...(activo.datos || {}) },
      });
    } else {
      setForm(vacio(inicial?.categoria_id || (editables.length === 1 ? editables[0].id : ''), inicial));
    }
    // solo al abrir: `inicial` suele ser un objeto nuevo en cada render del padre
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cat = meta?.categorias.find((c) => c.id === form.categoria_id);
  const padres = usePadres(cat, open);
  const padre = padres.find((p) => p.id === form.padre_id);
  const libres = posicionesLibres(padre, activo?.id);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setDato = (k, v) => setForm((f) => ({ ...f, datos: { ...f.datos, [k]: v } }));

  const elegirFoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setFoto(await compressImage(file)); } catch (err) { toast.error(err.message); }
  };

  const guardar = async () => {
    if (!cat) { toast.error('Elige la categoría'); return; }
    if (cat.padre_id && !form.padre_id) { toast.error(`Elige el ${cat.padre?.nombre || 'activo'} al que pertenece`); return; }
    if (cat.posicion_label && !form.posicion) { toast.error(`Indica el ${cat.posicion_label.toLowerCase()}`); return; }
    if (!cat.padre_id && !form.sucursal) { toast.error('Selecciona la sucursal'); return; }
    if (!form.nombre.trim()) { toast.error(`Completa: ${cat.nombre_label}`); return; }
    const falta = faltaCampo(cat, form.datos);
    if (falta) { toast.error(`Completa: ${falta.etiqueta}`); return; }
    const body = {
      ...form, posicion: form.posicion === '' ? null : Number(form.posicion), padre_id: form.padre_id || null,
      sucursal: cat.padre_id ? null : form.sucursal,
    };
    setSaving(true);
    try {
      let data;
      if (editando) {
        ({ data } = await api.put(`/activos/${activo.id}`, body));
        toast.success('Cambios guardados');
      } else {
        const fd = new FormData();
        fd.append('data', JSON.stringify(body));
        if (foto) fd.append('foto', foto.blob, 'foto.jpg');
        ({ data } = await api.post('/activos', fd));
        toast.success(`Registrado: ${data.codigo}`);
      }
      onOpenChange(false);
      onSaved?.(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar');
    } finally { setSaving(false); }
  };

  const elegirCategoria = !editando && !inicial?.categoria_id && editables.length > 1;
  // buscador de categoría: sin acentos ni mayúsculas, por nombre, plural, prefijo o descripción
  const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const t = norm(buscar.trim());
  const encontradas = t ? editables.filter((c) => [c.nombre, c.plural, c.prefijo, c.descripcion].some((v) => norm(v).includes(t))) : editables;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_CLS}>
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="font-heading text-xl">
            {editando ? `Editar ${activo.codigo}` : cat && !elegirCategoria ? `Registrar activo · ${cat.nombre}` : 'Registrar activo'}
          </DialogTitle>
          <DialogDescription>
            {editando ? 'El código no cambia. Cada cambio queda en el historial del activo.' : `El código${cat ? ` (${cat.prefijo}-001…)` : ''} lo asigna la plataforma al guardar.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-5">
          {elegirCategoria && (
            <div className="space-y-1.5">
              <Label htmlFor="activo-buscar-cat">Categoría<span className="text-[#dc2626]"> *</span></Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input id="activo-buscar-cat" value={buscar} onChange={(e) => setBuscar(e.target.value)}
                  placeholder="Buscar categoría…" className="h-10 pl-9" data-testid="activo-buscar-cat" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[200px] overflow-y-auto p-0.5" role="radiogroup" aria-label="Categoría">
                {!encontradas.length && <p className="col-span-full text-sm text-muted-foreground py-2">Ninguna categoría coincide.</p>}
                {encontradas.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={form.categoria_id === c.id}
                    onClick={() => setForm(vacio(c.id))} data-testid={`activo-cat-${c.prefijo}`}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold text-left transition-colors ${form.categoria_id === c.id
                      ? 'border-[#00a5df] bg-[rgba(0,165,223,0.1)] text-[#1e395e] dark:text-[#3cbef6]' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                    <CategoriaIcono icono={c.icono} className="h-4 w-4 shrink-0" /> <span className="truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {cat && (
            <>
              {cat.padre_id ? (
                <div className={`grid grid-cols-1 gap-3 ${cat.posicion_label ? 'sm:grid-cols-[1fr_150px]' : ''}`}>
                  <div className="space-y-1.5">
                    <Label htmlFor="activo-padre">{cat.padre?.nombre || 'Activo'} al que pertenece<span className="text-[#dc2626]"> *</span></Label>
                    <NativeSelect id="activo-padre" value={form.padre_id} onChange={(v) => setForm((f) => ({ ...f, padre_id: v, posicion: '' }))} data-testid="activo-padre">
                      <option value="">{padres.length ? 'Elegir…' : `No hay ${cat.padre?.nombre || 'activos'} registrados`}</option>
                      {padres.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.nombre} ({p.sucursal})</option>)}
                    </NativeSelect>
                  </div>
                  {cat.posicion_label && (
                    <div className="space-y-1.5">
                      <Label htmlFor="activo-posicion">{cat.posicion_label}<span className="text-[#dc2626]"> *</span></Label>
                      {libres ? (
                        <NativeSelect id="activo-posicion" value={String(form.posicion)} onChange={(v) => set('posicion', v)} disabled={!padre} data-testid="activo-posicion">
                          <option value="">{padre && !libres.length ? 'Sin espacios libres' : 'Elegir…'}</option>
                          {libres.map((c) => <option key={c} value={c}>{cat.posicion_label} {c}</option>)}
                        </NativeSelect>
                      ) : (
                        <Input id="activo-posicion" type="number" min="1" inputMode="numeric" value={form.posicion} onChange={(e) => set('posicion', e.target.value)} className="h-11" disabled={!padre} />
                      )}
                    </div>
                  )}
                  {padre && <p className={`${cat.posicion_label ? 'sm:col-span-2' : ''} -mt-1 text-xs text-muted-foreground`}>Sucursal {padre.sucursal} (la de {padre.codigo})</p>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Sucursal<span className="text-[#dc2626]"> *</span></Label>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sucursal">
                    {(meta.ubicaciones?.[cat.departamento] || meta.sucursales).map((s) => (
                      <button key={s} type="button" role="radio" aria-checked={form.sucursal === s} onClick={() => set('sucursal', s)}
                        className={`min-w-[64px] rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${form.sucursal === s
                          ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}
                        data-testid={`activo-sucursal-${s}`}>{s}</button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="activo-nombre">{cat.nombre_label}<span className="text-[#dc2626]"> *</span></Label>
                  <Input id="activo-nombre" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder={cat.nombre_ejemplo || undefined} className="h-11" data-testid="activo-nombre" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="activo-ubicacion">{cat.ubicacion_label}</Label>
                  <Input id="activo-ubicacion" value={form.ubicacion} onChange={(e) => set('ubicacion', e.target.value)} placeholder={cat.ubicacion_ejemplo || undefined} className="h-11" />
                </div>
              </div>

              {cat.campos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Datos de {cat.nombre.toLowerCase()}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {cat.campos.map((c) => <CampoDato key={c.clave} campo={c} value={form.datos[c.clave]} onChange={(v) => setDato(c.clave, v)} />)}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="activo-notas">Notas</Label>
                <Textarea id="activo-notas" rows={2} value={form.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Detalles útiles (opcional)" />
              </div>

              {!editando && (
                <div className="space-y-1.5">
                  <Label>Foto <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  {foto ? (
                    <div className="relative w-fit">
                      <img src={foto.dataUrl} alt="Vista previa" className="h-36 rounded-xl border object-cover" />
                      <button type="button" onClick={() => setFoto(null)} aria-label="Quitar foto"
                        className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-[#dc2626] text-white grid place-items-center shadow"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                      <Camera className="h-5 w-5" /> Tomar o subir foto
                      <input type="file" accept="image/*" className="sr-only" onChange={elegirFoto} />
                    </label>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={saving || !cat} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[120px]" data-testid="activo-guardar">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
