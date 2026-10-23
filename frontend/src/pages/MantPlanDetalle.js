import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Pause, Play, Archive, ArchiveRestore, Trash2, Info, History, ChevronRight, Rocket, CalendarClock } from 'lucide-react';
import api from '@/lib/api';
import { parseApiDate, fmtHora } from '@/lib/time';
import useEsMovil from '@/lib/useEsMovil';
import { Button } from '@/components/ui/button';
import { confirmar } from '@/components/ConfirmDialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { fechaCorta } from '@/components/CalendarioFecha';
import { EstadoPlan, EstadoTarea, frecuenciaTexto, fechaHora } from '@/components/mantenimiento/comunes';
import CambiarFecha from '@/components/mantenimiento/CambiarFecha';
import { cuandoTexto } from '@/components/mantenimiento/CuandoToca';
import { NovedadPunto } from '@/components/Novedad';

const finMenos1 = (s) => { const d = new Date(`${s}T00:00`); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function fmtAt(iso) {
  const d = parseApiDate(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} · ${fmtHora(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)}`;
}
const AVISO = { 0: 'el mismo día', 1: '1 día antes', 3: '3 días antes', 7: '1 semana antes' };

const Card = ({ title, action, children }) => (
  <section className="rounded-[18px] border bg-card shadow-card p-4 sm:p-5">
    {(title || action) && <div className="flex items-center justify-between gap-2 mb-3">{title && <h2 className="font-heading text-base font-semibold">{title}</h2>}{action}</div>}
    {children}
  </section>
);

// Los mantenimientos que vienen (ciclo en curso y los próximos 3), cada uno
// con su fecha; quien gestiona la planificación puede cambiarla.
function Proximos({ planId, reloadKey, onCambio }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [todos, setTodos] = useState(false);
  const load = useCallback(() => {
    api.get(`/mantenimiento/planes/${planId}/proximos`, { params: { ciclos: 3 } }).then(({ data: d }) => setData(d)).catch(() => setData(null));
  }, [planId]);
  useEffect(() => { load(); }, [load, reloadKey]);
  if (!data || !data.proximos.length) return null;
  const lista = todos ? data.proximos : data.proximos.slice(0, 8);
  const guardar = (body) => (sel.tarea_id
    ? api.post(`/mantenimiento/tareas/${sel.tarea_id}/reprogramar`, body)
    : api.post(`/mantenimiento/planes/${planId}/reprogramar`, { ...body, ciclo: sel.ciclo, definicion_id: sel.definicion_id }))
    .then(() => { load(); onCambio(); });
  return (
    <Card title={<span data-novedad-ancla="" className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-[#00a5df]" /> Próximos mantenimientos{data.puede_gestionar && <NovedadPunto clave="cambiar-fecha" />}</span>}>
      <div className="rounded-xl border divide-y">
        {lista.map((x) => (
          <div key={`${x.ciclo}-${x.definicion_id}`} className="flex items-center gap-3 px-3 py-2.5" data-testid="plan-proximo">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{x.activo_codigo} · {x.activo_nombre}</p>
              <p className="text-xs text-muted-foreground truncate">Ciclo {x.ciclo} · {x.checklist}{x.numero ? ` · ${x.numero}` : ''}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-medium whitespace-nowrap">{fechaHora(x.disponible_desde)}</p>
              <p className="text-[11px] whitespace-nowrap">
                {x.reprogramada
                  ? <span className="text-[#ec9032] font-semibold">Reprogramada{x.fecha_original ? ` (era ${fechaCorta(x.fecha_original)})` : ''}</span>
                  : <span className="text-muted-foreground">{x.estado === 'futura' ? 'Se crea al iniciar el ciclo' : x.estado === 'pendiente' ? 'Pendiente' : 'Programada'}</span>}
              </p>
            </div>
            {data.puede_gestionar && (
              <Button variant="outline" size="sm" className="rounded-lg shrink-0" onClick={() => setSel(x)} data-testid="plan-cambiar-fecha">Cambiar fecha</Button>
            )}
          </div>
        ))}
      </div>
      {data.proximos.length > 8 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="mt-2 text-xs font-medium text-[#00a5df] hover:underline">
          {todos ? 'Ver menos' : `Ver los ${data.proximos.length}`}
        </button>
      )}
      <CambiarFecha open={!!sel} onOpenChange={(v) => { if (!v) setSel(null); }}
        titulo={sel ? `Cambiar fecha · ${sel.activo_codigo}` : ''} detalle={sel ? `Ciclo ${sel.ciclo} · ${sel.checklist}.` : ''}
        fecha={sel?.fecha} hora={sel?.disponible_desde?.slice(11, 16)} original={sel?.reprogramada ? sel.fecha_original || null : null}
        guardar={guardar} />
    </Card>
  );
}

export default function MantPlanDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const esMovil = useEsMovil();
  const [data, setData] = useState(null);
  const [ciclo, setCiclo] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get(`/mantenimiento/planes/${id}`, { params: ciclo ? { ciclo } : {} });
      setData(d); setError(null);
    } catch (e) { setError(e?.response?.status === 403 ? 'No tienes acceso a esta planificación.' : 'No se pudo cargar la planificación.'); }
  }, [id, ciclo]);
  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="max-w-[600px] mx-auto pt-16 text-center">
        <Info className="h-9 w-9 mx-auto text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => navigate('/mantenimiento/planificaciones')} className="rounded-xl mt-4">Planificaciones</Button>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const p = data.plan;
  const c = data.ciclo;
  const persona = (uid) => data.personas[uid]?.name || '—';
  const accion = async (acc, titulo, mensaje, ok) => {
    const r = await confirmar({ titulo, mensaje, textoConfirmar: ok, textoCargando: 'Guardando…', textoExito: 'Listo',
      accion: () => api.post(`/mantenimiento/planes/${p.id}/accion/${acc}`) });
    if (r) load();
  };
  const eliminar = async () => {
    const r = await confirmar({ tipo: 'danger', titulo: `¿Eliminar el borrador ${p.numero}?`, mensaje: 'No se puede deshacer.', textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…', textoExito: 'Borrador eliminado', accion: () => api.delete(`/mantenimiento/planes/${p.id}`) });
    if (r) navigate('/mantenimiento/planificaciones');
  };
  const fin = p.fin_tipo === 'ciclos' ? `después de ${p.fin_valor} ciclos` : p.fin_tipo === 'fecha' ? `el ${fechaCorta(p.fin_valor)}` : 'nunca';
  const pct = c?.total ? Math.round((c.completadas / c.total) * 100) : 0;

  return (
    <div className="max-w-[1100px] mx-auto pt-2">
      <button type="button" onClick={() => navigate('/mantenimiento/planificaciones')} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Planificaciones
      </button>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="font-mono text-[12px] font-semibold text-muted-foreground">{p.numero}</span><EstadoPlan estado={p.estado} /></div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold mt-1 break-words">{p.nombre}</h1>
          {p.descripcion && <p className="text-sm text-muted-foreground mt-0.5">{p.descripcion}</p>}
        </div>
        {data.puede_gestionar && (
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            {!['archivada', 'finalizada'].includes(p.estado) && (
              <Button variant="outline" className="rounded-xl flex-1 sm:flex-none" onClick={() => navigate(`/mantenimiento/planificaciones/${p.id}/editar`)} data-testid="plan-editar">
                <Pencil className="h-4 w-4 mr-1.5" /> Editar
              </Button>
            )}
            {p.estado === 'borrador' && (
              <Button className="rounded-xl flex-1 sm:flex-none bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="plan-activar-det"
                onClick={() => accion('activar', `¿Activar ${p.numero}?`, 'Se crean los ciclos que correspondan desde la fecha de inicio y se avisa al responsable.', 'Activar')}>
                <Rocket className="h-4 w-4 mr-1.5" /> Activar
              </Button>
            )}
            {p.estado === 'activa' && (
              <Button variant="outline" className="rounded-xl flex-1 sm:flex-none"
                onClick={() => accion('pausar', `¿Pausar ${p.numero}?`, 'No se crean ciclos nuevos mientras esté pausada. Las tareas ya creadas siguen.', 'Pausar')}>
                <Pause className="h-4 w-4 mr-1.5" /> Pausar
              </Button>
            )}
            {p.estado === 'pausada' && (
              <Button variant="outline" className="rounded-xl flex-1 sm:flex-none"
                onClick={() => accion('reanudar', `¿Reanudar ${p.numero}?`, 'No se crean los ciclos que pasaron mientras estuvo pausada: sigue en el próximo.', 'Reanudar')}>
                <Play className="h-4 w-4 mr-1.5" /> Reanudar
              </Button>
            )}
            {p.estado === 'archivada' ? (
              <Button variant="outline" className="rounded-xl flex-1 sm:flex-none" onClick={() => accion('desarchivar', `¿Desarchivar ${p.numero}?`, 'Vuelve como estaba (si estaba activa, queda pausada para que la reanudes).', 'Desarchivar')}>
                <ArchiveRestore className="h-4 w-4 mr-1.5" /> Desarchivar
              </Button>
            ) : p.estado !== 'borrador' && (
              <Button variant="outline" className="rounded-xl" title="Archivar" aria-label="Archivar"
                onClick={() => accion('archivar', `¿Archivar ${p.numero}?`, 'Deja de generar ciclos y sale de la lista principal. Sus datos se conservan.', 'Archivar')}>
                <Archive className="h-4 w-4" />
              </Button>
            )}
            {p.estado === 'borrador' && (
              <Button variant="outline" className="rounded-xl text-[#dc2626] hover:text-[#dc2626]" onClick={eliminar} aria-label="Eliminar borrador"><Trash2 className="h-4 w-4" /></Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <Card title={c ? `Ciclo ${c.numero} · ${fechaCorta(c.inicio)} – ${fechaCorta(finMenos1(c.fin))}` : 'Ciclos'}
            action={data.ciclos.length > 1 && (
              <NativeSelect value={String(c?.numero || '')} onChange={(v) => setCiclo(Number(v))} className="h-9 w-[150px]" aria-label="Ver ciclo">
                {data.ciclos.map((x) => <option key={x.numero} value={x.numero}>Ciclo {x.numero}{x.estado === 'abierto' ? ' (en curso)' : ''}</option>)}
              </NativeSelect>
            )}>
            {!c ? (
              <p className="text-sm text-muted-foreground">
                {p.estado === 'borrador' ? 'Es un borrador: actívalo para que empiece a generar ciclos.'
                  : data.proximo_ciclo ? `El primer ciclo empieza el ${fechaCorta(data.proximo_ciclo.inicio)}.` : 'Sin ciclos.'}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-2">
                  <span><b>{c.completadas}</b> de {c.total} hechas</span>
                  <span className="text-[#16a34a]">{c.a_tiempo} a tiempo</span>
                  <span className="text-[#ec9032]">{c.tardias} tarde</span>
                  <span className="text-[#dc2626]">{c.incompletas} incompletas</span>
                  <span className="text-muted-foreground">{c.estado === 'abierto' ? 'En curso' : 'Cerrado'}{c.atrasado ? ' (creado tarde)' : ''}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-4"><div className="h-full bg-[#16a34a]" style={{ width: `${pct}%` }} /></div>
                {esMovil ? (
                  <div className="space-y-2">
                    {data.tareas.map((t) => (
                      <Link key={t.id} to={`/mantenimiento/tareas/${t.id}`} className="flex items-center gap-3 rounded-xl border p-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2"><span className="font-mono text-[11px] font-semibold text-muted-foreground">{t.numero}</span><EstadoTarea tarea={t} ahora={data.ahora} /></div>
                          <p className="text-sm font-medium truncate mt-0.5">{t.activo_codigo} · {t.activo_nombre}</p>
                          <p className="text-xs text-muted-foreground truncate">{t.checklist.nombre} · vence {fechaHora(t.vence_en)}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <tr className="text-left"><th className="px-3 py-2">Tarea</th><th className="px-3 py-2">Activo</th><th className="px-3 py-2">Checklist</th>
                          <th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Vence</th><th className="px-3 py-2">Estado</th></tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.tareas.map((t) => (
                          <tr key={t.id} onClick={() => navigate(`/mantenimiento/tareas/${t.id}`)} className="cursor-pointer hover:bg-[rgba(60,190,246,0.06)]" data-testid="plan-tarea">
                            <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">{t.numero}</td>
                            <td className="px-3 py-2.5"><span className="font-medium">{t.activo_codigo}</span><span className="block text-xs text-muted-foreground truncate max-w-[200px]">{t.activo_nombre} · {t.sucursal}</span></td>
                            <td className="px-3 py-2.5">{t.checklist.nombre}</td>
                            <td className="px-3 py-2.5">{persona(t.responsable_id)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap text-xs">{t.estado === 'completada' ? `Hecha ${fechaHora(t.completada_en)}` : fechaHora(t.vence_en)}</td>
                            <td className="px-3 py-2.5"><EstadoTarea tarea={t} ahora={data.ahora} />{t.tiene_falla && <span className="ml-1 text-[11px] font-semibold text-[#dc2626]">· falla</span>}</td>
                          </tr>
                        ))}
                        {!data.tareas.length && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sin tareas en este ciclo.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Card>

          {!['archivada', 'finalizada'].includes(p.estado) && <Proximos planId={p.id} reloadKey={data} onCambio={load} />}

          <Card title={`Tareas que genera cada ciclo · ${p.definiciones.length}`}>
            <div className="divide-y rounded-xl border">
              {p.definiciones.map((d, i) => {
                const a = data.activos[d.activo_id];
                const ch = data.checklists[d.checklist_id];
                return (
                  <div key={d.id} className="px-3 py-2.5 text-sm flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <span className="font-semibold w-6 text-muted-foreground">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium">{a ? `${a.codigo} · ${a.nombre}` : 'Activo eliminado'}</span>{a?.estado === 'baja' && <span className="text-xs text-[#dc2626]"> (de baja: no se genera)</span>}
                      <span className="block text-xs text-muted-foreground">{ch?.nombre || 'Checklist eliminado'}</span>
                    </span>
                    <span className="text-xs text-muted-foreground sm:text-right">
                      {cuandoTexto(d, p)} a las {fmtHora(d.hora)} · plazo {d.horas_plazo >= 24 ? `${Math.round(d.horas_plazo / 24)} d` : `${d.horas_plazo} h`} · aviso {AVISO[d.aviso_previo_dias] || `${d.aviso_previo_dias} d antes`}
                      {d.acepta_tardias ? ' · acepta tarde' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Datos">
            <dl className="space-y-2.5 text-sm">
              {[['Frecuencia', frecuenciaTexto(p)], ['Empieza', fechaCorta(p.inicio)], ['Termina', fin],
                ['Responsable', persona(data.responsable_id)], ['Supervisor', persona(p.supervisor_id)],
                ['Próximo ciclo', data.proximo_ciclo ? `${data.proximo_ciclo.numero} · ${fechaCorta(data.proximo_ciclo.inicio)}` : '—'],
                ['Creada por', `${p.created_by_name} · ${fmtAt(p.created_at)}`]].map(([k, v]) => (
                <div key={k}><dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {p.responsables.length > 1 && (
              <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                {p.responsables.map((r) => `${persona(r.usuario_id)} desde el ciclo ${r.desde_ciclo}`).join(' · ')}
              </p>
            )}
          </Card>
          <Card title={<span className="flex items-center gap-2"><History className="h-4 w-4 text-[#00a5df]" /> Historial de cambios</span>}>
            <ol className="space-y-3">
              {data.cambios.map((x) => (
                <li key={x.id} className="text-sm">
                  <p className="break-words">{x.resumen}</p>
                  <p className="text-xs text-muted-foreground">{x.user_name} · {fmtAt(x.at)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
