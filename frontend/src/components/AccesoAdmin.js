import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Plus, Trash2, X, ShieldCheck, CornerDownRight, Search as SearchIcon, Copy } from 'lucide-react';
import api from '@/lib/api';
import { NIVELES } from '@/lib/organizacion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { confirmar } from '@/components/ConfirmDialog';

/* Permisos por perfiles en Jerarquía y permisos (backend/acceso.py):
   - Perfiles: qué incluye cada paquete, por módulo (pestañas General,
     Formularios y Activos) y lo de adentro de cada módulo (Ver, Hacer,
     Administrar). Los arma el super admin; "Comparar perfiles" los pone lado
     a lado.
   - Perfil por cargo: qué perfil usa cada cargo, con ajustes por área que
     valen también para sus subáreas.
   - Personas: excepciones de una persona (Según su perfil / Dar / Quitar).
   Los admins y el jefe del departamento tienen acceso total fijo. */

const ORDEN_GRUPOS = ['ver', 'hacer', 'admin'];
const avisarError = (e) => toast.error(e?.response?.data?.detail || 'No se pudo guardar');
const textoPersonas = (n) => `${n} persona${n === 1 ? '' : 's'}`;

function useCatalogo(depto) {
  const [catalogo, setCatalogo] = useState(null);
  useEffect(() => {
    api.get('/acceso/catalogo', { params: depto ? { departamento: depto } : {} })
      .then(({ data }) => setCatalogo(data)).catch(() => setCatalogo(false));
  }, [depto]);
  return catalogo;
}

function Tarjeta({ titulo, ayuda, acciones, children, testid }) {
  return (
    <section className="mb-8 rounded-[22px] border bg-card p-5 sm:p-7 shadow-card no-print" data-testid={testid}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 h-6 w-1.5 shrink-0 rounded-full bg-[#712146]" />
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground">{titulo}</h2>
            {ayuda && <p className="text-[12px] text-muted-foreground">{ayuda}</p>}
          </div>
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

function SinMigrar() {
  return (
    <p className="rounded-xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
      Los perfiles todavía no están activos: falta pasar los permisos de hoy al sistema nuevo. Mientras tanto, cada persona sigue con los permisos de antes.
    </p>
  );
}

// Pestañas subrayadas (General, Formularios, Activos)
function Pestanas({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div role="tablist" aria-label={etiqueta} className="flex flex-wrap gap-1 border-b">
      {opciones.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={valor === o.id} onClick={() => onCambio(o.id)}
          className={`-mb-px inline-flex min-h-[44px] items-center gap-2 border-b-2 px-3.5 text-sm transition-colors ${valor === o.id
            ? 'border-[#1e395e] font-semibold text-[#1e395e] dark:border-[#3cbef6] dark:text-[#3cbef6]' : 'border-transparent font-medium text-muted-foreground hover:text-foreground'}`}>
          {o.nombre}
          {o.conteo != null && (
            <span className={`rounded-full px-2 py-px text-[11px] font-semibold ${valor === o.id ? 'bg-[#1e395e] text-white dark:bg-[#3cbef6] dark:text-[#0b1424]' : 'bg-muted text-muted-foreground'}`}>{o.conteo}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function Segmentado({ opciones, valor, onCambio, etiqueta }) {
  return (
    <div role="group" aria-label={etiqueta} className="flex gap-1 rounded-xl border bg-muted/40 p-1">
      {opciones.map(([id, nombre]) => (
        <button key={id} type="button" aria-pressed={valor === id} onClick={() => onCambio(id)}
          className={`h-9 rounded-lg px-3 text-[13px] transition-colors ${valor === id ? 'bg-[#1e395e] font-semibold text-white' : 'font-medium text-[#1e395e] dark:text-[#3cbef6] hover:bg-background'}`}>
          {nombre}
        </button>
      ))}
    </div>
  );
}

const iguales = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

// Antes de guardar un cambio de permisos: si a alguien se le quita algún
// módulo, se pide confirmar diciendo a cuántas personas afecta y quién tiene
// pendientes ahí (esos pendientes se quedan donde están). Si no se pudo
// calcular, no frena el cambio.
const listaY = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}` : xs[0] || '');

export async function confirmarQuitarAcceso(cambios) {
  let personas = [];
  try {
    const r = await Promise.all(cambios.map((c) => api.post('/acceso/impacto', c)));
    const vistas = new Map();
    r.flatMap(({ data }) => data.personas || []).forEach((p) => { if (!vistas.has(p.id)) vistas.set(p.id, p); });
    personas = [...vistas.values()];
  } catch (e) { return true; }
  if (!personas.length) return true;
  const modulos = [...new Set(personas.flatMap((p) => p.modulos || []))];
  const conPendientes = personas.filter((p) => p.pendientes);
  return confirmar({
    tipo: 'danger',
    titulo: `Vas a quitar ${listaY(modulos)} a ${personas.length === 1 ? '1 persona' : `${personas.length} personas`}`,
    mensaje: (
      <>
        <p className="mb-2">Dejarán de verlo en cuanto guardes: {personas.slice(0, 6).map((p) => p.nombre.trim()).join(', ')}{personas.length > 6 ? ` y ${personas.length - 6} más` : ''}.</p>
        {conPendientes.length > 0 ? (
          <>
            <p className="mb-1">Tienen pendientes ahí (se quedan donde están, pero no los van a ver):</p>
            <ul className="mb-1 list-disc space-y-0.5 pl-5">
              {conPendientes.slice(0, 8).map((p) => <li key={p.id}><b>{p.nombre}</b>: {p.pendientes}</li>)}
            </ul>
            {conPendientes.length > 8 && <p>…y {conPendientes.length - 8} más.</p>}
          </>
        ) : <p>Nadie tiene pendientes en lo que se quita.</p>}
      </>
    ),
    textoConfirmar: 'Quitar y guardar',
  });
}

// ── Perfiles ─────────────────────────────────────────────────────
export function PerfilesAcceso({ depto }) {
  const catalogo = useCatalogo(depto);
  const [perfiles, setPerfiles] = useState(null);
  const [sel, setSel] = useState(null);
  const [borradores, setBorradores] = useState({}); // perfil -> Set de permisos sin guardar
  const [pestana, setPestana] = useState('general');
  const [vista, setVista] = useState('perfil');
  const [abiertos, setAbiertos] = useState({});
  const [nuevo, setNuevo] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => api.get('/acceso/perfiles', { params: { departamento: depto } })
    .then(({ data }) => setPerfiles(data.perfiles)).catch(() => setPerfiles([])), [depto]);
  useEffect(() => { cargar(); }, [cargar]);

  const modulos = useMemo(() => (catalogo ? catalogo.modulos.filter((m) => m.disponible) : []), [catalogo]);
  if (catalogo === false) return null;
  if (!catalogo || !perfiles) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!catalogo.migrado) return <Tarjeta titulo="Perfiles"><SinMigrar /></Tarjeta>;

  const editable = catalogo.puede_editar_perfiles;
  const actual = perfiles.find((p) => p.id === sel) || perfiles[0];
  const permisosDe = (p) => borradores[p.id] || new Set(p.permisos);
  const pendientes = perfiles.filter((p) => borradores[p.id] && !iguales(borradores[p.id], new Set(p.permisos)));
  const alternar = (p, clave) => {
    const s = new Set(permisosDe(p));
    if (s.has(clave)) s.delete(clave); else s.add(clave);
    setBorradores((b) => ({ ...b, [p.id]: s }));
  };
  const guardar = async () => {
    if (!(await confirmarQuitarAcceso(pendientes.map((p) => ({ perfil_id: p.id, permisos: [...borradores[p.id]] }))))) return;
    setGuardando(true);
    try {
      for (const p of pendientes) {
        await api.put(`/acceso/perfiles/${p.id}`, { nombre: p.nombre, descripcion: p.descripcion, permisos: [...borradores[p.id]] });
      }
      toast.success(pendientes.length === 1 ? `${pendientes[0].nombre} actualizado` : `${pendientes.length} perfiles actualizados`);
      setBorradores({});
      await cargar();
    } catch (e) { avisarError(e); } finally { setGuardando(false); }
  };
  const crear = async (e, base) => {
    e?.preventDefault?.();
    const nombre = base ? `${base.nombre} (copia)` : nuevo;
    try {
      const { data } = await api.post('/acceso/perfiles', { departamento: depto, nombre, permisos: base ? [...permisosDe(base)] : [] });
      toast.success(`Perfil ${data.nombre} creado`);
      setNuevo(null);
      await cargar();
      setSel(data.id);
      setVista('perfil');
    } catch (err) { avisarError(err); }
  };
  const quitar = async (p) => {
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Quitar el perfil ${p.nombre}?`, mensaje: 'Ningún cargo lo usa. No se puede deshacer.',
      textoConfirmar: 'Quitar', textoCargando: 'Quitando…', textoExito: 'Perfil quitado',
      accion: () => api.delete(`/acceso/perfiles/${p.id}`),
    });
    if (ok) { setSel(null); cargar(); }
  };

  const delTab = modulos.filter((m) => m.pestana === pestana);
  const conteoTab = (id) => {
    const mods = modulos.filter((m) => m.pestana === id);
    if (vista === 'comparar' || !actual) return mods.length;
    const s = permisosDe(actual);
    return `${mods.filter((m) => s.has(m.id)).length}/${mods.length}`;
  };
  const barraGuardar = pendientes.length > 0 && (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f3dcb8] bg-[#fff8ec] px-4 py-3 dark:bg-[rgba(236,144,50,0.1)]">
      <p className="text-sm text-foreground">Cambios sin guardar en {pendientes.map((p) => p.nombre).join(', ')}. Al guardar se recalculan los permisos de quienes los usan.</p>
      <div className="flex gap-2">
        <Button variant="outline" className="rounded-xl" onClick={() => setBorradores({})} disabled={guardando}>Descartar</Button>
        <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
      </div>
    </div>
  );

  return (
    <Tarjeta testid="acceso-perfiles" titulo="Perfiles"
      ayuda="Cada perfil es un paquete de permisos. Apagar un módulo apaga todo lo de adentro. Los admins y el jefe del departamento tienen acceso total fijo: no usan perfil."
      acciones={<Segmentado etiqueta="Vista" valor={vista} onCambio={setVista} opciones={[['perfil', 'Un perfil'], ['comparar', 'Comparar perfiles']]} />}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {vista === 'perfil' && (
          <div className="flex w-full shrink-0 flex-col gap-1.5 lg:w-[280px]">
            {perfiles.map((p) => (
              <button key={p.id} type="button" aria-pressed={actual?.id === p.id} onClick={() => setSel(p.id)} data-testid="acceso-perfil"
                className={`flex min-h-[56px] items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${actual?.id === p.id
                  ? 'border-[#1e395e] bg-[#eaf0f8] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.12)]' : 'border-transparent hover:bg-muted'}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{p.nombre}{borradores[p.id] && !iguales(borradores[p.id], new Set(p.permisos)) ? ' •' : ''}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p.descripcion || '—'}</span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{textoPersonas(p.personas)}</span>
              </button>
            ))}
            {editable && (nuevo === null ? (
              <Button variant="outline" className="mt-2 rounded-xl" onClick={() => setNuevo('')}><Plus className="mr-1.5 h-4 w-4" /> Nuevo perfil</Button>
            ) : (
              <form onSubmit={crear} className="mt-2 flex gap-1.5">
                <Input autoFocus value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre del perfil" className="h-10" aria-label="Nombre del perfil nuevo" />
                <Button type="submit" disabled={!nuevo.trim()} className="h-10 rounded-lg bg-[#1e395e] hover:bg-[#162c49] text-white">Crear</Button>
                <Button type="button" variant="ghost" className="h-10 rounded-lg" onClick={() => setNuevo(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
              </form>
            ))}
            {!editable && <p className="mt-2 text-[11px] text-muted-foreground">Solo el super admin crea y edita perfiles. Qué perfil usa cada cargo se elige en Perfil por cargo.</p>}
          </div>
        )}

        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border">
          {vista === 'perfil' && actual && (
            <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0">
                <p className="text-[12px] text-muted-foreground">Perfil</p>
                <h3 className="font-heading text-xl font-semibold text-foreground">{actual.nombre}</h3>
                <p className="text-[12px] text-muted-foreground">Lo usan {textoPersonas(actual.personas)}{actual.por_defecto ? ' · es el de quien no tiene otro' : ''}</p>
              </div>
              {editable && (
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => crear(null, actual)}><Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicar</Button>
                  {!actual.por_defecto && (
                    <Button variant="outline" size="sm" className="rounded-lg text-[#dc2626]" disabled={actual.personas > 0}
                      title={actual.personas ? 'Lo usan personas: cambia su perfil primero' : 'Quitar'} onClick={() => quitar(actual)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="px-3 pt-1 sm:px-5">
            <Pestanas etiqueta="Grupo de módulos" valor={pestana} onCambio={setPestana}
              opciones={catalogo.pestanas.map((t) => ({ ...t, conteo: conteoTab(t.id) }))} />
          </div>

          {vista === 'perfil' && actual && (
            <ul className="divide-y">
              {delTab.map((m) => {
                const s = permisosDe(actual);
                const on = s.has(m.id);
                const abierto = !!abiertos[m.id];
                const dentro = m.permisos.filter((p) => on && s.has(p.id)).length;
                return (
                  <li key={m.id}>
                    <div className="flex items-center gap-2 px-3 py-1 sm:px-5">
                      <button type="button" aria-expanded={abierto} disabled={!m.permisos.length}
                        onClick={() => setAbiertos((a) => ({ ...a, [m.id]: !a[m.id] }))}
                        className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left disabled:cursor-default">
                        {m.permisos.length ? (abierto ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />)
                          : <span className="w-4" />}
                        <span className="text-sm font-semibold text-foreground">{m.nombre}</span>
                        <span className="ml-auto whitespace-nowrap pl-3 text-[12px] text-muted-foreground">
                          {!on ? 'Sin acceso' : m.permisos.length ? `${dentro} de ${m.permisos.length}` : 'Con acceso'}
                        </span>
                      </button>
                      <Switch checked={on} disabled={!editable} onCheckedChange={() => alternar(actual, m.id)} aria-label={`Acceso a ${m.nombre}`} />
                    </div>
                    {abierto && m.permisos.length > 0 && (
                      <div className="space-y-2 px-5 pb-4 pl-12">
                        {!on && <p className="text-[12px] text-muted-foreground">Sin acceso al módulo. Enciéndelo para elegir qué puede hacer adentro.</p>}
                        {ORDEN_GRUPOS.map((g) => {
                          const del = m.permisos.filter((p) => p.grupo === g);
                          if (!del.length) return null;
                          return (
                            <div key={g}>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{catalogo.grupos[g]}</p>
                              <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
                                {del.map((p) => (
                                  <label key={p.id} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 text-sm text-foreground">
                                    <input type="checkbox" className="h-4 w-4 accent-[#1e395e]" checked={on && s.has(p.id)} disabled={!editable || !on}
                                      onChange={() => alternar(actual, p.id)} />
                                    {p.nombre}
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {vista === 'comparar' && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="bg-muted/60">
                    <th className="sticky left-0 z-10 min-w-[240px] bg-muted px-4 py-3 text-left text-[12px] font-semibold text-foreground">Permiso</th>
                    {perfiles.map((p) => (
                      <th key={p.id} className="min-w-[88px] px-2 py-3 text-center text-[12px] font-semibold leading-tight text-foreground">{p.nombre}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {delTab.map((m) => {
                    const abierto = !!abiertos[m.id];
                    return (
                      <React.Fragment key={m.id}>
                        <tr className="border-t bg-muted/30">
                          <th scope="row" className="sticky left-0 z-10 bg-card px-4 py-1 text-left">
                            <button type="button" aria-expanded={abierto} disabled={!m.permisos.length}
                              onClick={() => setAbiertos((a) => ({ ...a, [m.id]: !a[m.id] }))}
                              className="flex min-h-[40px] items-center gap-2 text-sm font-semibold text-foreground disabled:cursor-default">
                              {m.permisos.length ? (abierto ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />) : <span className="w-4" />}
                              {m.nombre}
                            </button>
                          </th>
                          {perfiles.map((p) => (
                            <td key={p.id} className="px-2 text-center">
                              <input type="checkbox" className="h-4 w-4 accent-[#1e395e]" checked={permisosDe(p).has(m.id)} disabled={!editable}
                                onChange={() => alternar(p, m.id)} aria-label={`${p.nombre}: acceso a ${m.nombre}`} />
                            </td>
                          ))}
                        </tr>
                        {abierto && m.permisos.map((perm) => (
                          <tr key={perm.id} className="border-t">
                            <th scope="row" className="sticky left-0 z-10 bg-card py-2 pl-10 pr-4 text-left text-sm font-normal text-foreground">
                              <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{catalogo.grupos[perm.grupo]}</span>{perm.nombre}
                            </th>
                            {perfiles.map((p) => {
                              const s = permisosDe(p);
                              return (
                                <td key={p.id} className="px-2 text-center">
                                  {s.has(m.id) ? (
                                    <input type="checkbox" className="h-4 w-4 accent-[#1e395e]" checked={s.has(perm.id)} disabled={!editable}
                                      onChange={() => alternar(p, perm.id)} aria-label={`${p.nombre}: ${m.nombre}, ${perm.nombre}`} />
                                  ) : <span className="text-muted-foreground" title="Sin acceso al módulo">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-4 py-3 text-[12px] text-muted-foreground">—: el perfil no tiene acceso a ese módulo, así que lo de adentro no aplica.</p>
            </div>
          )}
        </div>
      </div>
      {barraGuardar}
      <p className="mt-4 flex items-start gap-1.5 text-[12px] text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1e395e] dark:text-[#3cbef6]" />
        Cada permiso se cumple en la pantalla y en el servidor. Sobre qué aplica (su tienda, su área, su gente) lo sigue decidiendo la estructura.
      </p>
    </Tarjeta>
  );
}

// ── Perfil por cargo ─────────────────────────────────────────────
export function PerfilPorCargo({ depto }) {
  const [datos, setDatos] = useState(null);
  const [migrado, setMigrado] = useState(null);
  const [nuevoAjuste, setNuevoAjuste] = useState(null); // { cargo_id, area_id, perfil_id }
  const cargar = useCallback(async () => {
    try {
      const [{ data }, { data: cat }] = await Promise.all([
        api.get('/acceso/asignaciones', { params: { departamento: depto } }),
        api.get('/acceso/catalogo', { params: { departamento: depto } }),
      ]);
      setDatos(data);
      setMigrado(cat.migrado);
    } catch (e) { setDatos(false); }
  }, [depto]);
  useEffect(() => { cargar(); }, [cargar]);
  if (datos === false) return null;
  if (!datos) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  if (!migrado) return <Tarjeta titulo="Perfil por cargo"><SinMigrar /></Tarjeta>;

  const guardar = async (cargo_id, area_id, perfil_id, ok = 'Perfil actualizado') => {
    if (!(await confirmarQuitarAcceso([{ cargo_id, area_id: area_id || null, perfil_id }]))) return;
    try {
      await api.put('/acceso/asignaciones', { cargo_id, area_id: area_id || null, perfil_id });
      toast.success(ok);
      setNuevoAjuste(null);
      await cargar();
    } catch (e) { avisarError(e); }
  };
  const quitarAjuste = async (c, a) => {
    if (!(await confirmarQuitarAcceso([{ cargo_id: c.cargo_id, area_id: a.area_id, quitar: true }]))) return;
    const ok = await confirmar({
      tipo: 'danger', titulo: `¿Quitar el ajuste de ${c.cargo} en ${a.area}?`,
      mensaje: `Esas personas pasan a usar el perfil del cargo (${datos.perfiles.find((p) => p.id === c.perfil_id)?.nombre || '—'}).`,
      textoConfirmar: 'Quitar', textoCargando: 'Quitando…', textoExito: 'Ajuste quitado',
      accion: () => api.delete(`/acceso/asignaciones/${encodeURIComponent(a.id)}`),
    });
    if (ok) cargar();
  };
  const opciones = datos.perfiles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>);

  return (
    <Tarjeta testid="acceso-cargos" titulo="Perfil por cargo"
      ayuda="Qué perfil usa cada cargo. Si un cargo necesita otro perfil en un área, agrégale un ajuste: vale también para sus subáreas. El jefe del departamento y los admins tienen acceso total fijo.">
      <ul className="space-y-2">
        {datos.cargos.map((c) => (
          <li key={c.cargo_id} className="rounded-xl border px-4 py-3" data-testid="acceso-cargo">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-foreground">{c.cargo}</span>
                <span className="rounded-md bg-[#e8eef7] px-2 py-0.5 text-[11px] font-medium text-[#1e395e] dark:bg-[rgba(60,190,246,0.12)] dark:text-[#3cbef6]">{NIVELES[c.nivel] || c.nivel}</span>
              </div>
              {c.fijo ? (
                <span className="inline-flex h-10 w-full items-center gap-2 rounded-lg bg-[#e7f6ec] px-3 text-sm font-semibold text-[#166534] sm:w-[260px] dark:bg-[rgba(22,163,74,0.15)] dark:text-[#4ade80]">
                  <ShieldCheck className="h-4 w-4" /> Acceso total (fijo)
                </span>
              ) : (
                <NativeSelect value={c.perfil_id} onChange={(v) => guardar(c.cargo_id, null, v, `${c.cargo}: perfil actualizado`)}
                  className="h-10 w-full sm:w-[260px]" aria-label={`Perfil del cargo ${c.cargo}`}>{opciones}</NativeSelect>
              )}
              <span className="w-full text-[12px] text-muted-foreground sm:w-[150px]">
                {c.fijo ? '' : `${textoPersonas(c.personas)}${c.ajustes.length ? ' en otras áreas' : ''}`}
              </span>
            </div>
            {c.ajustes.map((a) => (
              <div key={a.id} className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/40 px-3 py-2 sm:ml-5">
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground">
                  <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>En el área <b className="font-semibold">{a.area}</b> y sus subáreas usa</span>
                </span>
                <NativeSelect value={a.perfil_id} onChange={(v) => guardar(c.cargo_id, a.area_id, v, `${c.cargo} en ${a.area}: perfil actualizado`)}
                  className="h-10 w-full sm:w-[260px]" aria-label={`Perfil del cargo ${c.cargo} en ${a.area}`}>{opciones}</NativeSelect>
                <span className="flex w-full items-center justify-between gap-2 text-[12px] text-muted-foreground sm:w-[150px]">
                  {textoPersonas(a.personas)}
                  <button type="button" onClick={() => quitarAjuste(c, a)} aria-label={`Quitar el ajuste de ${c.cargo} en ${a.area}`}
                    className="grid h-9 w-9 place-items-center rounded-lg hover:bg-muted hover:text-[#dc2626]"><X className="h-4 w-4" /></button>
                </span>
              </div>
            ))}
            {!c.fijo && (nuevoAjuste?.cargo_id === c.cargo_id ? (
              <form className="mt-2 flex flex-wrap items-center gap-2 sm:ml-5"
                onSubmit={(e) => { e.preventDefault(); guardar(c.cargo_id, nuevoAjuste.area_id, nuevoAjuste.perfil_id, 'Ajuste agregado'); }}>
                <span className="text-sm text-foreground">En el área</span>
                <NativeSelect value={nuevoAjuste.area_id} onChange={(v) => setNuevoAjuste({ ...nuevoAjuste, area_id: v })} className="h-10 w-full sm:w-[240px]" aria-label="Área del ajuste">
                  <option value="">Elige el área</option>
                  {datos.areas.filter((ar) => !c.ajustes.some((a) => a.area_id === ar.id)).map((ar) => <option key={ar.id} value={ar.id}>{ar.nombre}</option>)}
                </NativeSelect>
                <span className="text-sm text-foreground">usa</span>
                <NativeSelect value={nuevoAjuste.perfil_id} onChange={(v) => setNuevoAjuste({ ...nuevoAjuste, perfil_id: v })} className="h-10 w-full sm:w-[220px]" aria-label="Perfil del ajuste">{opciones}</NativeSelect>
                <Button type="submit" disabled={!nuevoAjuste.area_id} className="h-10 rounded-lg bg-[#1e395e] hover:bg-[#162c49] text-white">Agregar</Button>
                <Button type="button" variant="ghost" className="h-10 rounded-lg" onClick={() => setNuevoAjuste(null)} aria-label="Cancelar"><X className="h-4 w-4" /></Button>
              </form>
            ) : (
              <button type="button" onClick={() => setNuevoAjuste({ cargo_id: c.cargo_id, area_id: '', perfil_id: c.perfil_id })}
                className="mt-1.5 inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] font-semibold text-[#1e395e] hover:bg-muted dark:text-[#3cbef6]">
                <Plus className="h-4 w-4" /> Ajuste por área
              </button>
            ))}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[12px] text-muted-foreground">Si una persona necesita algo distinto a su perfil, se le pone una excepción en Personas.</p>
    </Tarjeta>
  );
}

// ── Excepciones de una persona ──────────────────────────────────
// Para cada permiso: según su perfil, dar o quitar. Con `conGuardar` guarda
// por sí misma; si no, avisa los cambios a `onCambio` (diálogo de Usuarios).
export function ExcepcionesAcceso({ userId, onCambio, conGuardar, onGuardado }) {
  const catalogo = useCatalogo(null);
  const [datos, setDatos] = useState(null);
  const [cambios, setCambios] = useState({});
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    setCambios({});
    api.get(`/acceso/usuario/${userId}`).then(({ data }) => setDatos(data)).catch(() => setDatos(false));
  }, [userId]);
  if (datos === false || catalogo === false) return null;
  if (!datos || !catalogo) return <p className="py-4 text-sm text-muted-foreground">Cargando permisos…</p>;
  if (datos.fijo) {
    return <p className="rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">{datos.admin ? 'Es administrador' : 'Es el jefe del departamento'}: tiene acceso total fijo y no usa perfil.</p>;
  }
  if (!datos.migrado) return <SinMigrar />;

  const porId = Object.fromEntries(datos.permisos.map((p) => [p.id, p]));
  const valor = (id) => (id in cambios ? cambios[id] : porId[id]?.excepcion ?? null);
  const propio = (id) => { const v = valor(id); return v === true ? true : v === false ? false : !!porId[id]?.por_perfil; };
  const cambiar = (id, v) => {
    setCambios((c) => ({ ...c, [id]: v }));
    onCambio?.((prev) => ({ ...prev, [id]: v }));
  };
  const guardar = async () => {
    if (!(await confirmarQuitarAcceso([{ usuario_id: userId, excepciones: cambios }]))) return;
    setGuardando(true);
    try {
      const { data } = await api.put(`/acceso/usuario/${userId}`, { excepciones: cambios });
      setDatos(data);
      setCambios({});
      toast.success('Permisos actualizados');
      onGuardado?.();
    } catch (e) { avisarError(e); } finally { setGuardando(false); }
  };
  const fila = (id, nombre, sub, modulo) => {
    const v = valor(id);
    const puede = propio(id) && (!modulo || propio(modulo));
    return (
      <div key={id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${sub ? 'pl-6' : ''}`}>
        <span className={`min-w-0 flex-1 text-sm text-foreground ${sub ? '' : 'font-semibold'}`}>{nombre}</span>
        <select value={v === true ? 'dar' : v === false ? 'quitar' : 'perfil'}
          onChange={(e) => cambiar(id, e.target.value === 'dar' ? true : e.target.value === 'quitar' ? false : null)}
          className={`h-9 rounded-lg border px-2 text-[13px] ${v === null ? 'border-input bg-background' : 'border-[#ec9032] bg-[rgba(236,144,50,0.08)]'}`}
          aria-label={`Ajuste de ${nombre}`}>
          <option value="perfil">Según su perfil ({porId[id]?.por_perfil ? 'sí' : 'no'})</option>
          <option value="dar">Dar</option>
          <option value="quitar">Quitar</option>
        </select>
        <span className={`w-[78px] rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${puede
          ? 'bg-[#e7f6ec] text-[#166534] dark:bg-[rgba(22,163,74,0.15)] dark:text-[#4ade80]' : 'bg-[#fdecec] text-[#b42318] dark:bg-[rgba(220,38,38,0.15)] dark:text-[#f87171]'}`}>
          {puede ? 'Puede' : 'No puede'}
        </span>
      </div>
    );
  };
  const hayCambios = Object.keys(cambios).length > 0;
  return (
    <div className="space-y-2" data-testid="excepciones-acceso">
      <p className="text-[12px] text-muted-foreground">Por su cargo y área usa el perfil <b className="text-foreground">{datos.perfil?.nombre || '—'}</b>. Cambia solo lo que sea distinto para esta persona.</p>
      {catalogo.pestanas.map((t) => {
        const mods = catalogo.modulos.filter((m) => m.pestana === t.id && porId[m.id]);
        if (!mods.length) return null;
        return (
          <div key={t.id} className="rounded-xl border px-3">
            <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t.nombre}</p>
            <div className="divide-y">
              {mods.map((m) => (
                <div key={m.id}>
                  {fila(m.id, m.nombre, false)}
                  {m.permisos.filter((p) => porId[p.id]).map((p) => fila(p.id, p.nombre, true, m.id))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {conGuardar && hayCambios && (
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" className="rounded-xl" onClick={() => setCambios({})} disabled={guardando}>Descartar</Button>
          <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      )}
    </div>
  );
}

// ── Personas ─────────────────────────────────────────────────────
export function PersonasAcceso({ depto }) {
  const [gente, setGente] = useState(null);
  const [q, setQ] = useState('');
  const [soloExc, setSoloExc] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const cargar = useCallback(() => api.get('/acceso/personas', { params: { departamento: depto } })
    .then(({ data }) => setGente(data)).catch(() => setGente(false)), [depto]);
  useEffect(() => { cargar(); }, [cargar]);
  if (gente === false) return null;
  if (!gente) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando…</p>;
  const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const filtradas = gente.filter((u) => (!soloExc || u.excepciones > 0)
    && (!q.trim() || norm([u.name, u.email, u.position, u.area, u.sucursal, u.perfil].join(' ')).includes(norm(q.trim()))));
  return (
    <Tarjeta testid="acceso-personas" titulo="Personas"
      ayuda="Lo que puede cada persona: su perfil más sus excepciones. Usa las excepciones solo para lo que sea distinto a su puesto."
      acciones={<Segmentado etiqueta="Filtro" valor={soloExc ? 'exc' : 'todas'} onCambio={(v) => setSoloExc(v === 'exc')}
        opciones={[['todas', 'Todas'], ['exc', 'Con excepciones']]} />}>
      <div className="relative mb-3 max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, cargo, área o perfil" className="h-11 pl-9" aria-label="Buscar persona" />
      </div>
      <ul className="divide-y rounded-xl border">
        {filtradas.map((u) => (
          <li key={u.id}>
            <button type="button" aria-expanded={abierta === u.id} onClick={() => setAbierta(abierta === u.id ? null : u.id)}
              className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-muted/40">
              {abierta === u.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{u.name}</span>
                <span className="block text-[12px] text-muted-foreground">{[u.position, u.area, u.sucursal && u.sucursal !== 'Casa Matriz' ? u.sucursal : ''].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="text-[12px] text-muted-foreground">{u.fijo ? 'Acceso total fijo' : u.perfil || '—'}</span>
              {u.excepciones > 0 && (
                <span className="rounded-full bg-[#fdf1e3] px-2.5 py-0.5 text-[11px] font-semibold text-[#8a4b0f] dark:bg-[rgba(236,144,50,0.15)] dark:text-[#f5b56b]">
                  {u.excepciones} excepci{u.excepciones === 1 ? 'ón' : 'ones'}
                </span>
              )}
            </button>
            {abierta === u.id && (
              <div className="border-t bg-muted/20 px-4 py-3">
                <ExcepcionesAcceso userId={u.id} conGuardar onGuardado={cargar} />
              </div>
            )}
          </li>
        ))}
        {!filtradas.length && <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nadie coincide.</li>}
      </ul>
    </Tarjeta>
  );
}
