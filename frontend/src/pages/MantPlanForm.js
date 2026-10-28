import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Plus, X, Search, CalendarDays, Info } from 'lucide-react';
import api from '@/lib/api';
import { ymd } from '@/lib/time';
import useEsMovil from '@/lib/useEsMovil';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { fechaCorta } from '@/components/CalendarioFecha';
import { Buscador, fechaHora } from '@/components/mantenimiento/comunes';
import CuandoToca, { esDeMeses, diaMesDe } from '@/components/mantenimiento/CuandoToca';

const AVISOS = [[0, 'El mismo día'], [1, '1 día antes'], [3, '3 días antes'], [7, '1 semana antes']];
const RECORDATORIOS = [[0, 'Sin recordatorio'], [1, '1 hora antes'], [2, '2 horas antes'], [24, '1 día antes'], [72, '3 días antes']];
const PLAZOS = [[8, '8 horas'], [24, '1 día'], [48, '2 días'], [72, '3 días'], [168, '1 semana'], [336, '2 semanas'], [720, '30 días']];

let uid = 0;
const DEF_BASE = { checklist_id: '', dia_ciclo: 1, hora: '08:00', horas_plazo: 48, acepta_tardias: true, aviso_previo_dias: 0, recordatorio_horas: 24 };

function Campo({ label, children, htmlFor, ayuda }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {ayuda && <p className="text-[11px] text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

// Configuración de una tarea: checklist, día, hora, plazo, aviso, recordatorio y tardías.
function ConfigTarea({ value, onChange, checklists, frecuencia, inicio, intervalo, compacta }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className={`grid gap-3 ${compacta ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
      <div className={compacta ? 'col-span-2 sm:col-span-3 lg:col-span-2' : 'sm:col-span-2 lg:col-span-3'}>
        <Campo label="Checklist">
          <Buscador value={value.checklist_id} onChange={(v) => set('checklist_id', v)} placeholder="Elegir checklist…" vacio="No hay checklists: créalos en Checklists"
            opciones={checklists.map((c) => ({ id: c.id, label: c.nombre, sub: `${c.preguntas} preguntas` }))} className={compacta ? 'h-10' : ''} />
        </Campo>
      </div>
      <CuandoToca value={value} onChange={onChange} frecuencia={frecuencia} inicio={inicio} intervalo={intervalo} compacta={compacta} />
      <Campo label="Hora">
        <Input type="time" value={value.hora} onChange={(e) => set('hora', e.target.value)} className={compacta ? 'h-10' : 'h-11'} />
      </Campo>
      <Campo label="Plazo para hacerla">
        <NativeSelect value={String(value.horas_plazo)} onChange={(v) => set('horas_plazo', Number(v))} className={compacta ? 'h-10' : ''}>
          {PLAZOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </Campo>
      <Campo label="Avisar al responsable">
        <NativeSelect value={String(value.aviso_previo_dias)} onChange={(v) => set('aviso_previo_dias', Number(v))} className={compacta ? 'h-10' : ''}>
          {AVISOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </Campo>
      <Campo label="Recordatorio">
        <NativeSelect value={String(value.recordatorio_horas)} onChange={(v) => set('recordatorio_horas', Number(v))} className={compacta ? 'h-10' : ''}>
          {RECORDATORIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </NativeSelect>
      </Campo>
      <label className={`flex items-center gap-2.5 text-sm cursor-pointer ${compacta ? 'col-span-2 sm:col-span-1 self-end h-10' : 'self-end h-11'}`}>
        <Switch checked={!!value.acepta_tardias} onCheckedChange={(v) => set('acepta_tardias', v)} />
        <span>Acepta entrega tarde</span>
      </label>
    </div>
  );
}

function ElegirActivos({ opciones, yaUsados, onAgregar }) {
  const [cat, setCat] = useState('');
  const [suc, setSuc] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState([]);
  const sucursales = [...new Set(opciones.activos.map((a) => a.sucursal))].sort();
  const catNombre = Object.fromEntries(opciones.categorias.map((c) => [c.id, c.nombre]));
  const lista = opciones.activos.filter((a) => (!cat || a.categoria_id === cat) && (!suc || a.sucursal === suc)
    && (!q.trim() || `${a.codigo} ${a.nombre} ${a.ubicacion || ''}`.toLowerCase().includes(q.trim().toLowerCase())));
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const todos = lista.length > 0 && lista.every((a) => sel.includes(a.id));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1.4fr] gap-2">
        <NativeSelect value={cat} onChange={setCat} className="h-10" aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {opciones.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </NativeSelect>
        <NativeSelect value={suc} onChange={setSuc} className="h-10" aria-label="Sucursal">
          <option value="">Todas las sucursales</option>
          {sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <div className="relative col-span-2 sm:col-span-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código o nombre…" className="h-10 pl-9" />
        </div>
      </div>
      <div className="rounded-xl border max-h-[280px] overflow-y-auto divide-y">
        {lista.length > 1 && (
          <label className="flex items-center gap-2.5 px-3 py-2 bg-muted/40 text-sm font-medium cursor-pointer sticky top-0">
            <Checkbox checked={todos} onCheckedChange={() => setSel(todos ? sel.filter((x) => !lista.some((a) => a.id === x)) : [...new Set([...sel, ...lista.map((a) => a.id)])])} />
            Elegir los {lista.length} de la lista
          </label>
        )}
        {lista.map((a) => (
          <label key={a.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/40 cursor-pointer">
            <Checkbox checked={sel.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
            <span className="font-mono text-[12px] font-semibold w-[72px] shrink-0">{a.codigo}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{a.nombre}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{catNombre[a.categoria_id]} · {a.sucursal}{a.ubicacion ? ` · ${a.ubicacion}` : ''}</span>
            </span>
            {yaUsados.has(a.id) && <span className="text-[10px] text-muted-foreground shrink-0">ya tiene tarea</span>}
          </label>
        ))}
        {!lista.length && <p className="px-3 py-4 text-sm text-muted-foreground">{opciones.activos.length ? 'Ningún activo coincide.' : 'No hay activos en uso en tus categorías.'}</p>}
      </div>
      <Button type="button" onClick={() => { onAgregar(sel); setSel([]); }} disabled={!sel.length} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="plan-agregar-activos">
        <Plus className="h-4 w-4 mr-1" /> Agregar {sel.length || ''} tarea{sel.length === 1 ? '' : 's'}
      </Button>
    </div>
  );
}

/* Crear o editar una planificación en 2 pasos: datos generales y tareas
   (checklist + activo + día + hora + plazos), con vista previa de fechas. */
export default function MantPlanForm() {
  const { id } = useParams();
  const editando = !!id;
  const navigate = useNavigate();
  const esMovil = useEsMovil();
  const [opciones, setOpciones] = useState(null);
  const [plan, setPlan] = useState(null);
  const [paso, setPaso] = useState(1);
  const [g, setG] = useState({ nombre: '', descripcion: '', supervisor_id: '', responsable_id: '', inicio: ymd(new Date()), frecuencia: 'mensual', intervalo_dias: 30, fin_tipo: 'nunca', fin_valor: '' });
  const [defs, setDefs] = useState([]);
  const [base, setBase] = useState(DEF_BASE);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/mantenimiento/opciones').then(({ data }) => setOpciones(data)).catch(() => setError('Solo quien administra activos o es responsable de una categoría puede planificar.'));
    if (!editando) return;
    api.get(`/mantenimiento/planes/${id}`).then(({ data }) => {
      const p = data.plan;
      setPlan({ ...p, responsable_id: data.responsable_id });
      setG({ nombre: p.nombre, descripcion: p.descripcion || '', supervisor_id: p.supervisor_id, responsable_id: data.responsable_id,
        inicio: p.inicio, frecuencia: p.frecuencia, intervalo_dias: p.intervalo_dias || 30, fin_tipo: p.fin_tipo || 'nunca', fin_valor: p.fin_valor ?? '' });
      setDefs(p.definiciones.map((d) => ({ ...d, _k: d.id })));
    }).catch(() => setError('No se pudo cargar la planificación.'));
  }, [id, editando]);

  const set = (k, v) => setG((x) => ({ ...x, [k]: v }));
  const activos = useMemo(() => Object.fromEntries((opciones?.activos || []).map((a) => [a.id, a])), [opciones]);
  const bloqueada = editando && plan && plan.estado !== 'borrador'; // frecuencia e inicio fijos

  const body = () => ({
    ...g, intervalo_dias: g.frecuencia === 'cada_n_dias' ? Number(g.intervalo_dias) : null,
    fin_valor: g.fin_tipo === 'nunca' ? null : String(g.fin_valor),
    // de meses: día del mes; en las demás: día del ciclo (semana, periodo…)
    definiciones: defs.map(({ _k, ...d }) => ({
      ...d, dia_ciclo: Number(d.dia_ciclo) || 1, dia_mes: esDeMeses(g.frecuencia) ? diaMesDe(d, g.inicio) : null,
    })),
  });

  // vista previa de fechas (paso 2)
  const clavePreview = JSON.stringify([g.inicio, g.frecuencia, g.intervalo_dias, g.fin_tipo, g.fin_valor, defs.map((d) => [d.dia_ciclo, d.dia_mes, d.hora, d.horas_plazo, d.aviso_previo_dias])]);
  useEffect(() => {
    if (paso !== 2 || !defs.length) { setPreview(null); return undefined; }
    const h = setTimeout(() => {
      api.post('/mantenimiento/vista-previa', body()).then(({ data }) => setPreview(data)).catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(h);
  }, [paso, clavePreview]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="max-w-[600px] mx-auto pt-16 text-center">
        <Info className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate('/mantenimiento/planificaciones')} className="rounded-xl mt-4">Planificaciones</Button>
      </div>
    );
  }
  if (!opciones || (editando && !plan)) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  // solo quien tiene el módulo en su perfil: hace los mantenimientos (Mis mantenimientos) o supervisa (Planificaciones)
  const persona = (u) => ({ id: u.id, label: u.name, sub: [u.position, u.area].filter(Boolean).join(' · ') });
  const responden = opciones.usuarios.filter((u) => u.responde !== false).map(persona);
  const supervisan = opciones.usuarios.filter((u) => u.supervisa !== false).map(persona);

  const validarPaso1 = () => {
    if (!g.nombre.trim()) return 'Escribe el nombre';
    if (!g.responsable_id) return 'Elige el responsable';
    if (!g.supervisor_id) return 'Elige el supervisor';
    if (!g.inicio) return 'Elige la fecha de inicio';
    if (g.frecuencia === 'cada_n_dias' && !(Number(g.intervalo_dias) >= 1)) return 'Indica cada cuántos días';
    if (g.fin_tipo === 'ciclos' && !(Number(g.fin_valor) >= 1)) return 'Indica cuántos ciclos';
    if (g.fin_tipo === 'fecha' && !g.fin_valor) return 'Elige la fecha de fin';
    return null;
  };

  const agregar = (ids) => {
    if (!base.checklist_id) { toast.error('Elige primero el checklist de la configuración'); return; }
    setDefs((ds) => [...ds, ...ids.map((activo_id) => ({ ...base, activo_id, _k: `n${++uid}` }))]);
    toast.success(`${ids.length} tarea${ids.length === 1 ? '' : 's'} agregada${ids.length === 1 ? '' : 's'}`);
  };
  const setDef = (k, v) => setDefs((ds) => ds.map((d) => (d._k === k ? v : d)));

  const guardar = async (activar) => {
    const e1 = validarPaso1();
    if (e1) { toast.error(e1); setPaso(1); return; }
    if (!defs.length) { toast.error('Agrega al menos una tarea'); return; }
    const sinChk = defs.findIndex((d) => !d.checklist_id);
    if (sinChk >= 0) { toast.error(`La tarea ${sinChk + 1} no tiene checklist`); return; }
    setSaving(true);
    try {
      const { data } = editando
        ? await api.put(`/mantenimiento/planes/${id}`, body())
        : await api.post(`/mantenimiento/planes${activar ? '?activar=true' : ''}`, body());
      toast.success(editando ? 'Planificación actualizada' : activar ? `${data.numero} activada` : `${data.numero} guardada como borrador`);
      navigate(`/mantenimiento/planificaciones/${data.id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); }
    finally { setSaving(false); }
  };

  const usados = new Set(defs.map((d) => d.activo_id));

  return (
    <div className="max-w-[1000px] mx-auto pt-2 pb-8">
      <button type="button" onClick={() => navigate(editando ? `/mantenimiento/planificaciones/${id}` : '/mantenimiento/planificaciones')}
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {editando ? plan.numero : 'Planificaciones'}
      </button>
      <h1 className="font-heading text-2xl sm:text-3xl font-semibold">{editando ? `Editar ${plan.numero}` : 'Nueva planificación'}</h1>
      {bloqueada && <p className="text-sm text-muted-foreground mt-1">Los cambios aplican desde el próximo ciclo; el ciclo en curso y sus tareas no cambian.</p>}

      <div className="flex gap-2 my-5" role="tablist">
        {[[1, 'Datos generales'], [2, `Tareas${defs.length ? ` · ${defs.length}` : ''}`]].map(([n, l]) => (
          <button key={n} type="button" role="tab" aria-selected={paso === n}
            onClick={() => { if (n === 2) { const e = validarPaso1(); if (e) { toast.error(e); return; } } setPaso(n); }}
            className={`flex-1 sm:flex-none rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${paso === n ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
            {n}. {l}
          </button>
        ))}
      </div>

      {paso === 1 ? (
        <div className="rounded-[18px] border bg-card shadow-card p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" data-tour="plan-generales">
            <Campo label="Nombre *" htmlFor="plan-nombre">
              <Input id="plan-nombre" value={g.nombre} onChange={(e) => set('nombre', e.target.value)} placeholder="Ej. CCTV H1 — revisión mensual" className="h-11" data-testid="plan-nombre" />
            </Campo>
            <Campo label="Descripción" htmlFor="plan-desc">
              <Input id="plan-desc" value={g.descripcion} onChange={(e) => set('descripcion', e.target.value)} placeholder="Opcional" className="h-11" />
            </Campo>
            <Campo label="Responsable * (quien hace las tareas)" ayuda={bloqueada ? 'Si cambia, aplica desde el próximo ciclo; las tareas pendientes se reasignan aparte.' : null}>
              <Buscador value={g.responsable_id} onChange={(v) => set('responsable_id', v)} opciones={responden} placeholder="Elegir persona…" testid="plan-responsable" />
            </Campo>
            <Campo label="Supervisor * (recibe avisos de fallas e incumplimientos)">
              <Buscador value={g.supervisor_id} onChange={(v) => set('supervisor_id', v)} opciones={supervisan} placeholder="Elegir persona…" testid="plan-supervisor" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t" data-tour="plan-frecuencia">
            <Campo label="Frecuencia">
              <NativeSelect value={g.frecuencia} onChange={(v) => set('frecuencia', v)} disabled={bloqueada} data-testid="plan-frecuencia">
                {Object.entries(opciones.frecuencias).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Campo>
            {g.frecuencia === 'cada_n_dias' && (
              <Campo label="Cada cuántos días" htmlFor="plan-intervalo">
                <Input id="plan-intervalo" type="number" min="1" max="730" value={g.intervalo_dias} onChange={(e) => set('intervalo_dias', e.target.value)} disabled={bloqueada} className="h-11" />
              </Campo>
            )}
            <Campo label="Empieza el" htmlFor="plan-inicio" ayuda="Primer día del ciclo 1">
              <Input id="plan-inicio" type="date" value={g.inicio} onChange={(e) => set('inicio', e.target.value)} disabled={bloqueada} className="h-11" />
            </Campo>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Campo label="Termina">
              <NativeSelect value={g.fin_tipo} onChange={(v) => setG((x) => ({ ...x, fin_tipo: v, fin_valor: '' }))}>
                <option value="nunca">Nunca</option>
                <option value="fecha">En una fecha</option>
                <option value="ciclos">Después de N ciclos</option>
              </NativeSelect>
            </Campo>
            {g.fin_tipo === 'fecha' && (
              <Campo label="Fecha de fin" htmlFor="plan-fin"><Input id="plan-fin" type="date" value={g.fin_valor} onChange={(e) => set('fin_valor', e.target.value)} className="h-11" /></Campo>
            )}
            {g.fin_tipo === 'ciclos' && (
              <Campo label="Cantidad de ciclos" htmlFor="plan-ciclos"><Input id="plan-ciclos" type="number" min="1" value={g.fin_valor} onChange={(e) => set('fin_valor', e.target.value)} className="h-11" /></Campo>
            )}
          </div>
          <p className="text-xs text-muted-foreground">El ciclo siguiente empieza por fecha, aunque el anterior se haya terminado antes. Lo que no se haga en su ciclo queda Incompleto.</p>
          <div className="flex justify-end">
            <Button onClick={() => { const e = validarPaso1(); if (e) { toast.error(e); return; } setPaso(2); }} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[160px]" data-testid="plan-siguiente" data-tour="plan-siguiente">
              Siguiente: tareas
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[18px] border bg-card shadow-card p-4 sm:p-6 space-y-4">
            <div>
              <h2 className="font-heading font-semibold">Agregar tareas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Elige la configuración y los activos: se agrega una tarea por activo (p. ej. una por cada cámara). Después puedes ajustar cada una.</p>
            </div>
            <ConfigTarea value={base} onChange={setBase} checklists={opciones.checklists} frecuencia={g.frecuencia} inicio={g.inicio} intervalo={g.intervalo_dias} />
            <ElegirActivos opciones={opciones} yaUsados={usados} onAgregar={agregar} />
          </div>

          <div className="rounded-[18px] border bg-card shadow-card p-4 sm:p-6 space-y-3">
            <h2 className="font-heading font-semibold">Tareas de cada ciclo · {defs.length}</h2>
            {!defs.length && <p className="text-sm text-muted-foreground">Aún no hay tareas.</p>}
            {defs.map((d, i) => {
              const a = activos[d.activo_id];
              return (
                <div key={d._k} className="rounded-xl border p-3 space-y-3" data-testid="plan-def">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-muted-foreground w-6">{i + 1}</span>
                    <span className="font-mono text-[12px] font-semibold">{a?.codigo || '—'}</span>
                    <span className="text-sm truncate flex-1">{a ? `${a.nombre} · ${a.sucursal}` : 'Activo no disponible (de baja o sin acceso)'}</span>
                    <button type="button" onClick={() => setDefs((ds) => ds.filter((x) => x._k !== d._k))} aria-label="Quitar tarea"
                      className="h-8 w-8 grid place-items-center rounded-lg text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] shrink-0"><X className="h-4 w-4" /></button>
                  </div>
                  <ConfigTarea value={d} onChange={(v) => setDef(d._k, v)} checklists={opciones.checklists} frecuencia={g.frecuencia} inicio={g.inicio} intervalo={g.intervalo_dias} compacta={!esMovil} />
                </div>
              );
            })}
          </div>

          {preview && preview.length > 0 && (
            <div className="rounded-[18px] border bg-card shadow-card p-4 sm:p-6">
              <h2 className="font-heading font-semibold flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#00a5df]" /> Vista previa de los próximos ciclos</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                {preview.map((c) => (
                  <div key={c.numero} className="rounded-xl border p-3">
                    <p className="text-sm font-semibold">Ciclo {c.numero}</p>
                    <p className="text-xs text-muted-foreground mb-2">{fechaCorta(c.inicio)} – {fechaCorta(c.fin)}</p>
                    <ul className="space-y-1.5">
                      {c.tareas.slice(0, 8).map((t, i) => (
                        <li key={i} className="text-xs">
                          <span className="font-mono font-semibold">{activos[defs[i]?.activo_id]?.codigo}</span> · {fechaHora(t.disponible_desde)}
                          <span className="block text-muted-foreground">vence {fechaHora(t.vence_en)}</span>
                        </li>
                      ))}
                      {c.tareas.length > 8 && <li className="text-xs text-muted-foreground">y {c.tareas.length - 8} más…</li>}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2">"Disponible" es cuando le llega al responsable (según el aviso); "vence" según el plazo.</p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setPaso(1)} className="rounded-xl">Volver</Button>
            {editando ? (
              <Button onClick={() => guardar(false)} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[160px]" data-testid="plan-guardar">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar cambios'}
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => guardar(false)} disabled={saving} className="rounded-xl" data-testid="plan-borrador">Guardar borrador</Button>
                <Button onClick={() => guardar(true)} disabled={saving} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[160px]" data-testid="plan-activar">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Activar planificación'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
