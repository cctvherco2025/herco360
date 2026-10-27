import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Shapes, Plus, Pencil, Trash2, Loader2, ArrowUp, ArrowDown, X, Search, Users, Link2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAdminActivos, RETAIL, departamentoDe, esSuperAdmin } from '@/lib/constants';
import { nombreDepto, tonoDepto } from '@/lib/organizacion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { confirmar } from '@/components/ConfirmDialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { DIALOG_CLS } from '@/components/activos/ActivoForm';
import { ICONOS, CategoriaIcono } from '@/components/activos/comunes';

const TIPOS_CAMPO = {
  texto: 'Texto', numero: 'Número entero', decimal: 'Número con decimales', fecha: 'Fecha',
  opcion: 'Lista de opciones', si_no: 'Sí / No', ip: 'Dirección IP',
};

const vacia = () => ({
  nombre: '', plural: '', prefijo: '', icono: 'package', descripcion: '',
  nombre_label: '', nombre_ejemplo: '', ubicacion_label: '', ubicacion_ejemplo: '',
  padre_id: '', posicion_label: '', capacidad_campo: '', campos: [], responsables: [],
});

let uid = 0;
const nuevoCampo = () => ({ _k: `n${++uid}`, etiqueta: '', tipo: 'texto', obligatorio: false, opcionesTxt: '' });

const Seccion = ({ titulo, ayuda, children }) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      {ayuda && <p className="text-xs text-muted-foreground mt-0.5">{ayuda}</p>}
    </div>
    {children}
  </section>
);

function Responsables({ usuarios, value, onChange }) {
  const [q, setQ] = useState('');
  const sel = new Set(value);
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = usuarios.filter((u) => !t || [u.name, u.position, u.area].some((x) => (x || '').toLowerCase().includes(t)));
    return [...f.filter((u) => sel.has(u.id)), ...f.filter((u) => !sel.has(u.id))];
  }, [usuarios, q, value]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id) => onChange(sel.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona, cargo o área…" className="h-10 pl-9" />
      </div>
      <div className="rounded-xl border max-h-[220px] overflow-y-auto divide-y">
        {lista.map((u) => (
          <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer">
            <Checkbox checked={sel.has(u.id)} onCheckedChange={() => toggle(u.id)} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{u.name}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{[u.position, u.area].filter(Boolean).join(' · ')}</span>
            </span>
          </label>
        ))}
        {!lista.length && <p className="px-3 py-3 text-sm text-muted-foreground">Nadie coincide.</p>}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} responsable{value.length === 1 ? '' : 's'} · Los administradores de Activos siempre tienen acceso.</p>
    </div>
  );
}

function CategoriaForm({ open, onOpenChange, categoria, categorias, deptos, onSaved }) {
  const { user } = useAuth();
  const esAdmin = esSuperAdmin(user); // solo el super admin elige el departamento
  const editando = !!categoria;
  const [form, setForm] = useState(vacia());
  const [saving, setSaving] = useState(false);
  // responsables posibles: gente del departamento de la categoría
  const depto = form.departamento || departamentoDe(user);
  const [usuarios, setUsuarios] = useState([]);
  useEffect(() => {
    if (!open) return;
    api.get('/activos/usuarios', { params: { departamento: depto } }).then(({ data }) => setUsuarios(data)).catch(() => setUsuarios([]));
  }, [open, depto]);

  useEffect(() => {
    if (!open) return;
    if (categoria) {
      setForm({
        ...vacia(), ...categoria, padre_id: categoria.padre_id || '',
        campos: categoria.campos.map((c) => ({ ...c, _k: c.clave, opcionesTxt: (c.opciones || []).join(', ') })),
        responsables: categoria.responsables || [],
      });
    } else setForm({ ...vacia(), departamento: departamentoDe(user) });
  }, [open, categoria, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setCampo = (i, k, v) => setForm((f) => ({ ...f, campos: f.campos.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
  const mover = (i, d) => setForm((f) => {
    const cs = [...f.campos]; const j = i + d;
    if (j < 0 || j >= cs.length) return f;
    [cs[i], cs[j]] = [cs[j], cs[i]];
    return { ...f, campos: cs };
  });
  const quitar = async (i) => {
    const c = form.campos[i];
    if (c.clave && categoria?.conteo?.total) {
      const ok = await confirmar({
        titulo: `¿Quitar el campo ${c.etiqueta}?`, textoConfirmar: 'Quitar',
        mensaje: 'Deja de mostrarse y de pedirse. Lo que ya se guardó en los activos no se borra.',
      });
      if (!ok) return;
    }
    setForm((f) => ({ ...f, campos: f.campos.filter((_, j) => j !== i) }));
  };

  const tieneActivos = !!categoria?.conteo?.total;
  const tieneHijas = editando && categorias.some((c) => c.padre_id === categoria.id);
  const madres = categorias.filter((c) => !c.padre_id && c.id !== categoria?.id && (c.departamento || RETAIL) === depto);
  const madre = categorias.find((c) => c.id === form.padre_id);
  const numericosMadre = (madre?.campos || []).filter((c) => c.tipo === 'numero');

  const guardar = async () => {
    if (!form.nombre.trim()) { toast.error('Escribe el nombre de la categoría'); return; }
    if (!/^[A-Za-z]{2,5}$/.test(form.prefijo.trim())) { toast.error('El prefijo debe tener de 2 a 5 letras'); return; }
    const sinNombre = form.campos.findIndex((c) => !c.etiqueta.trim());
    if (sinNombre >= 0) { toast.error(`El campo ${sinNombre + 1} no tiene nombre`); return; }
    const body = {
      ...form,
      prefijo: form.prefijo.trim().toUpperCase(),
      padre_id: form.padre_id || null,
      campos: form.campos.map(({ _k, opcionesTxt, ...c }) => ({
        ...c, opciones: c.tipo === 'opcion' ? opcionesTxt.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
      })),
    };
    delete body.conteo; delete body.responsables_info;
    setSaving(true);
    try {
      if (editando) await api.put(`/activos/categorias/${categoria.id}`, body);
      else await api.post('/activos/categorias', body);
      toast.success(editando ? 'Categoría actualizada' : `Categoría ${form.nombre.trim()} creada`);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudo guardar la categoría');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DIALOG_CLS} sm:w-[min(760px,100%)]`}>
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="font-heading text-xl">{editando ? `Editar ${categoria.nombre}` : 'Nueva categoría'}</DialogTitle>
          <DialogDescription>Define qué datos se piden de sus activos y quién los registra.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-5 space-y-7">
          <Seccion titulo="General">
            {esAdmin && (
              <div className="space-y-1.5">
                <Label htmlFor="cat-depto">Departamento</Label>
                <NativeSelect id="cat-depto" value={depto} disabled={tieneActivos}
                  onChange={(v) => setForm((f) => ({ ...f, departamento: v, responsables: [], padre_id: '', posicion_label: '', capacidad_campo: '' }))}>
                  {deptos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </NativeSelect>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_120px] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cat-nombre">Nombre<span className="text-[#dc2626]"> *</span></Label>
                <Input id="cat-nombre" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. Herramienta eléctrica" className="h-11" data-testid="cat-nombre" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-plural">Plural</Label>
                <Input id="cat-plural" value={form.plural} onChange={(e) => set('plural', e.target.value)} placeholder="Ej. Herramientas eléctricas" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-prefijo">Prefijo<span className="text-[#dc2626]"> *</span></Label>
                <Input id="cat-prefijo" value={form.prefijo} maxLength={5} disabled={tieneActivos}
                  onChange={(e) => set('prefijo', e.target.value.replace(/[^a-z]/gi, '').toUpperCase())} placeholder="HER" className="h-11 font-mono uppercase" data-testid="cat-prefijo" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-1">
              Código de sus activos: <span className="font-mono font-semibold">{(form.prefijo || 'XXX').toUpperCase()}-001</span>, {(form.prefijo || 'XXX').toUpperCase()}-002…
              {tieneActivos && ' El prefijo ya no se puede cambiar porque hay activos con ese código.'}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Descripción</Label>
              <Input id="cat-desc" value={form.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Opcional" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label>Ícono</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Ícono">
                {Object.keys(ICONOS).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={form.icono === k} aria-label={k} onClick={() => set('icono', k)}
                    className={`h-10 w-10 rounded-xl border grid place-items-center transition-colors ${form.icono === k
                      ? 'border-[#00a5df] bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                    <CategoriaIcono icono={k} className="h-[18px] w-[18px]" />
                  </button>
                ))}
              </div>
            </div>
          </Seccion>

          <Seccion titulo="Campos propios" ayuda="Los datos que se piden al registrar cada activo de esta categoría (además de nombre, sucursal y ubicación).">
            {form.campos.length > 0 && (
              <div className="space-y-2">
                {form.campos.map((c, i) => (
                  <div key={c._k} className="rounded-xl border p-3 space-y-2" data-testid="cat-campo">
                    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_190px_auto] gap-2 items-center">
                      <Input value={c.etiqueta} onChange={(e) => setCampo(i, 'etiqueta', e.target.value)} placeholder="Nombre del campo (ej. Marca)" className="h-10" aria-label={`Nombre del campo ${i + 1}`} />
                      <NativeSelect value={c.tipo} onChange={(v) => setCampo(i, 'tipo', v)} className="h-10 col-span-2 sm:col-span-1 row-start-2 sm:row-start-auto" aria-label={`Tipo del campo ${i + 1}`}>
                        {Object.entries(TIPOS_CAMPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </NativeSelect>
                      <div className="flex items-center gap-0.5 row-start-1 col-start-2 sm:col-start-auto">
                        <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir" className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" onClick={() => mover(i, 1)} disabled={i === form.campos.length - 1} aria-label="Bajar" className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" onClick={() => quitar(i)} aria-label="Quitar campo" className="h-9 w-9 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]"><X className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {c.tipo === 'opcion' && (
                      <Input value={c.opcionesTxt} onChange={(e) => setCampo(i, 'opcionesTxt', e.target.value)} placeholder="Opciones separadas por coma (ej. 110 V, 220 V, Batería)" className="h-10" />
                    )}
                    <label className="flex items-center gap-2 text-sm text-muted-foreground w-fit cursor-pointer">
                      <Checkbox checked={!!c.obligatorio} onCheckedChange={(v) => setCampo(i, 'obligatorio', !!v)} /> Obligatorio
                    </label>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => setForm((f) => ({ ...f, campos: [...f.campos, nuevoCampo()] }))} className="rounded-xl" data-testid="cat-agregar-campo">
              <Plus className="h-4 w-4 mr-1" /> Agregar campo
            </Button>
          </Seccion>

          <Seccion titulo="Textos del formulario" ayuda="Cómo se llaman el nombre y la ubicación al registrar (opcional).">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="cat-nl">En lugar de «Nombre»</Label>
                <Input id="cat-nl" value={form.nombre_label} onChange={(e) => set('nombre_label', e.target.value)} placeholder="Nombre" className="h-10" /></div>
              <div className="space-y-1.5"><Label htmlFor="cat-ne">Ejemplo</Label>
                <Input id="cat-ne" value={form.nombre_ejemplo} onChange={(e) => set('nombre_ejemplo', e.target.value)} placeholder="Ej. Taladro percutor 1/2" className="h-10" /></div>
              <div className="space-y-1.5"><Label htmlFor="cat-ul">En lugar de «Ubicación»</Label>
                <Input id="cat-ul" value={form.ubicacion_label} onChange={(e) => set('ubicacion_label', e.target.value)} placeholder="Ubicación" className="h-10" /></div>
              <div className="space-y-1.5"><Label htmlFor="cat-ue">Ejemplo</Label>
                <Input id="cat-ue" value={form.ubicacion_ejemplo} onChange={(e) => set('ubicacion_ejemplo', e.target.value)} placeholder="Ej. Bodega de mantenimiento" className="h-10" /></div>
            </div>
          </Seccion>

          <Seccion titulo="Pertenece a otra categoría" ayuda="Opcional. Ej. cada cámara pertenece a un NVR; toma la sucursal de él.">
            {tieneHijas ? (
              <p className="text-sm text-muted-foreground">Otras categorías pertenecen a esta, así que no puede pertenecer a otra.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-padre">Pertenece a</Label>
                  <NativeSelect id="cat-padre" value={form.padre_id} disabled={tieneActivos}
                    onChange={(v) => setForm((f) => ({ ...f, padre_id: v, posicion_label: v ? f.posicion_label : '', capacidad_campo: '' }))}>
                    <option value="">No pertenece a otra</option>
                    {madres.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </NativeSelect>
                </div>
                {form.padre_id && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="cat-pos">Posición numerada</Label>
                      <Input id="cat-pos" value={form.posicion_label} onChange={(e) => set('posicion_label', e.target.value)} placeholder="Ej. Canal (opcional)" className="h-11" />
                    </div>
                    {form.posicion_label.trim() && (
                      <div className="space-y-1.5">
                        <Label htmlFor="cat-cap">Máximo según</Label>
                        <NativeSelect id="cat-cap" value={form.capacidad_campo} onChange={(v) => set('capacidad_campo', v)}>
                          <option value="">Sin máximo</option>
                          {numericosMadre.map((c) => <option key={c.clave} value={c.clave}>{c.etiqueta} de {madre.nombre}</option>)}
                        </NativeSelect>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {tieneActivos && !tieneHijas && <p className="text-xs text-muted-foreground">No se puede cambiar a qué pertenece porque ya tiene activos.</p>}
          </Seccion>

          <Seccion titulo="Responsables" ayuda="Registran, editan y dan de baja los activos de esta categoría. Solo ellos y los administradores la ven.">
            <Responsables usuarios={usuarios} value={form.responsables} onChange={(v) => set('responsables', v)} />
          </Seccion>
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[140px]" data-testid="cat-guardar">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editando ? 'Guardar cambios' : 'Crear categoría'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* Categorías de activos: las crea quien administra Activos; cada una con sus
   campos propios, prefijo del código y responsables. */
export default function ActivosCategorias() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cats, setCats] = useState(null);
  const [form, setForm] = useState(null); // { categoria? }
  const esAdmin = esSuperAdmin(user);
  // departamentos que la persona ve (el super admin, todos) y sus ubicaciones
  const [meta, setMeta] = useState(null);
  const cargarMeta = useCallback(() => api.get('/activos/meta').then(({ data }) => setMeta(data)).catch(() => {}), []);
  useEffect(() => { cargarMeta(); }, [cargarMeta]);
  const deptos = meta?.departamentos || [];

  const load = useCallback(async () => {
    try { const { data } = await api.get('/activos/categorias'); setCats(data); }
    catch (e) { toast.error('No se pudieron cargar las categorías'); setCats([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!canAdminActivos(user)) return <Navigate to="/activos" replace />;

  const eliminar = async (c) => {
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Eliminar la categoría ${c.nombre}?`, mensaje: 'No tiene activos registrados. No se puede deshacer.',
      textoConfirmar: 'Eliminar', textoCargando: 'Eliminando…', textoExito: 'Categoría eliminada',
      accion: () => api.delete(`/activos/categorias/${c.id}`),
    });
    if (ok) load();
  };
  const nombreDe = (id) => cats?.find((c) => c.id === id)?.nombre;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <button type="button" onClick={() => navigate('/activos')} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Activos
      </button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Shapes className="h-7 w-7 text-[#00a5df]" /> Categorías de activos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Cada categoría define su código, sus campos y quién registra sus activos.</p>
        </div>
        <Button onClick={() => setForm({})} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white w-full sm:w-auto" data-testid="cat-nueva">
          <Plus className="h-4 w-4 mr-1" /> Nueva categoría
        </Button>
      </div>

      {cats === null ? (
        <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>
      ) : !cats.length ? (
        <div className="rounded-[18px] border border-dashed bg-card p-10 text-center">
          <Shapes className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aún no hay categorías. Crea la primera, por ejemplo Herramientas o Vehículos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cats.map((c) => (
            <div key={c.id} className="rounded-[18px] border bg-card shadow-card p-4 flex flex-col gap-3" data-testid="cat-tarjeta">
              <div className="flex items-start gap-3">
                <span className="h-11 w-11 rounded-xl bg-[rgba(0,165,223,0.12)] text-[#00a5df] grid place-items-center shrink-0">
                  <CategoriaIcono icono={c.icono} className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-heading font-semibold truncate">{c.nombre}</h2>
                    <span className="font-mono text-[11px] font-semibold rounded-md px-1.5 py-0.5 bg-muted text-muted-foreground">{c.prefijo}-001</span>
                    {esAdmin && <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${tonoDepto(deptos, c.departamento)}`}>{nombreDepto(deptos, c.departamento)}</span>}
                  </div>
                  {c.descripcion && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.descripcion}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button type="button" onClick={() => setForm({ categoria: c })} aria-label={`Editar ${c.nombre}`} className="h-9 w-9 grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Pencil className="h-4 w-4" /></button>
                  <button type="button" onClick={() => eliminar(c)} disabled={c.conteo.total > 0} aria-label={`Eliminar ${c.nombre}`}
                    title={c.conteo.total > 0 ? 'Tiene activos registrados' : 'Eliminar'}
                    className="h-9 w-9 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] disabled:opacity-30 disabled:hover:bg-transparent"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span><b className="text-foreground">{c.conteo.activos}</b> en uso{c.conteo.total > c.conteo.activos ? ` · ${c.conteo.total - c.conteo.activos} de baja` : ''}</span>
                <span>{c.campos.length} campo{c.campos.length === 1 ? '' : 's'}</span>
                {c.padre_id && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> Pertenece a {nombreDe(c.padre_id)}{c.posicion_label ? ` (por ${c.posicion_label.toLowerCase()})` : ''}</span>}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {c.responsables_info.length ? (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="flex -space-x-2">
                      {c.responsables_info.slice(0, 4).map((u) => (
                        <Avatar key={u.id} className="h-6 w-6 border-2 border-card"><AvatarImage src={u.avatar_url} alt={u.name} /><AvatarFallback className="text-[10px]">{u.name?.[0]}</AvatarFallback></Avatar>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{c.responsables_info.map((u) => u.name.split(' ')[0]).join(', ')}</span>
                  </div>
                ) : <span className="text-xs text-muted-foreground">Sin responsables: solo los administradores</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {deptos.filter((d) => d.id !== RETAIL).map((d) => (
        <UbicacionesDepto key={d.id} depto={d} lista={meta.ubicaciones?.[d.id] || []} onSaved={cargarMeta} />
      ))}

      <CategoriaForm open={!!form} onOpenChange={(v) => { if (!v) setForm(null); }} categoria={form?.categoria}
        categorias={cats || []} deptos={deptos} onSaved={load} />
    </div>
  );
}

// Ubicaciones de los activos de un departamento que no es Retail (Retail usa
// sus sucursales H1, H2, H5, H6). Una ubicación con activos no se puede quitar.
function UbicacionesDepto({ depto, lista, onSaved }) {
  const [nueva, setNueva] = useState('');
  const [guardando, setGuardando] = useState(false);
  const guardar = async (ubicaciones) => {
    setGuardando(true);
    try {
      await api.put('/activos/ubicaciones', { departamento: depto.id, ubicaciones });
      setNueva('');
      toast.success('Ubicaciones guardadas');
      onSaved();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudieron guardar las ubicaciones');
    } finally { setGuardando(false); }
  };
  return (
    <section className="mt-6 rounded-[18px] border bg-card shadow-card p-4 sm:p-5" data-testid="ubicaciones-depto">
      <h2 className="font-heading font-semibold">Ubicaciones de {depto.nombre}</h2>
      <p className="text-xs text-muted-foreground mt-0.5">Dónde están sus activos (bodegas, CEDIS…). Ventas Retail usa sus sucursales.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {lista.map((u) => (
          <span key={u} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-3 pr-1 py-1 text-sm">
            {u}
            <button type="button" aria-label={`Quitar ${u}`} disabled={guardando || lista.length === 1}
              onClick={() => guardar(lista.filter((x) => x !== u))}
              className="h-6 w-6 grid place-items-center rounded-full text-muted-foreground hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] disabled:opacity-30">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (nueva.trim()) guardar([...lista, nueva.trim()]); }}>
        <Input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva ubicación (ej. CEDIS)" className="h-10 max-w-xs" data-testid="ubicacion-nueva" />
        <Button type="submit" variant="outline" disabled={guardando || !nueva.trim()} className="rounded-xl h-10"><Plus className="h-4 w-4 mr-1" /> Agregar</Button>
      </form>
    </section>
  );
}
