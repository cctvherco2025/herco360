import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { ENTREGAS, FRECUENCIAS, MODOS_ASIGNACION, ahoraLocal, cuando, cuandoVence, diaCorto } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { Grupo, Segmento, Interruptor } from '@/components/formularios/PanelDiseno';
import SelectorCriterio, { describirCriterio, useOpcionesCriterio } from '@/components/formularios/SelectorCriterio';
import SelectorHora from '@/components/SelectorHora';

/* Pestaña Asignaciones: cómo se reparte, a quién le toca, cuándo y cada cuánto,
   y cómo va cada entrega. No se aplica con cada clic: al guardar se le avisa a
   la gente, así que se aplica con un botón cuando la selección está lista. */

const RECORDAR = [[0, 'No'], [1, '1 hora'], [24, '1 día'], [48, '2 días']];
const FINES = [['nunca', 'Nunca'], ['fecha', 'En una fecha'], ['ciclos', 'Tras varias veces']];
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted-foreground';
const numero = (v, min, max) => Math.min(max, Math.max(min, parseInt(v, 10) || min));
const CONTEOS = [['pendiente', 'Pendientes'], ['proceso', 'En proceso'], ['revision', 'En revisión'], ['devuelto', 'Devueltos'], ['completado', 'Completados'], ['vencido', 'Vencidos']];

function resumen(a, alcance, opciones) {
  const quien = describirCriterio(a, opciones);
  if (!alcance) return `${quien || 'Elige a quién'}: calculando…`;
  const inicio = `${quien || 'Elige a quién'}: `;
  if (a.modo === 'sucursal') { const n = (a.sucursales.length || alcance.sucursales.length); return `${inicio}${n} ${n === 1 ? 'entrega' : 'entregas'}, una por tienda.`; }
  if (a.modo === 'disponible') return `${inicio}lo ${alcance.personas === 1 ? 'puede llenar 1 persona' : `pueden llenar ${alcance.personas} personas`}.`;
  const cadaVez = a.repeticion?.frecuencia && a.repeticion.frecuencia !== 'una' ? ' en cada repetición' : '';
  return `${inicio}${alcance.personas} ${alcance.personas === 1 ? 'pendiente' : 'pendientes'}, uno por persona${cadaVez}.`;
}

function Repeticion({ rep, set, proximas }) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <label className={`flex-[1_1_140px] ${LABEL}`}>Empieza
          <Input type="date" value={rep.inicio} onChange={(e) => e.target.value && set({ inicio: e.target.value })} className="h-10 text-sm text-foreground" />
        </label>
        {rep.frecuencia === 'cada_n_dias' && (
          <label className={`flex-[1_1_100px] ${LABEL}`}>Cada cuántos días
            <Input type="number" min={1} max={365} value={rep.intervalo_dias ?? 1} onChange={(e) => set({ intervalo_dias: numero(e.target.value, 1, 365) })} className="h-10 text-sm text-foreground" />
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={`flex-[1_1_100px] ${LABEL}`}>Abre a las
          <SelectorHora value={rep.abre} onChange={(v) => set({ abre: v })} className="h-10 text-sm text-foreground" />
        </label>
        <label className={`flex-[1_1_100px] ${LABEL}`}>Días de plazo
          <Input type="number" min={0} max={365} value={rep.vence_dias ?? 0} onChange={(e) => set({ vence_dias: numero(e.target.value, 0, 365) })} className="h-10 text-sm text-foreground" />
        </label>
        <label className={`flex-[1_1_100px] ${LABEL}`}>Hora límite
          <SelectorHora value={rep.vence_hora} onChange={(v) => set({ vence_hora: v })} className="h-10 text-sm text-foreground" />
        </label>
      </div>
      <p className="text-xs text-muted-foreground -mt-1">Días de plazo: 0 es el mismo día que abre.</p>
      <Segmento label="Termina" valor={rep.fin_tipo} opciones={FINES} onCambio={(v) => set({ fin_tipo: v, fin_valor: v === 'ciclos' ? 4 : null })} />
      {rep.fin_tipo === 'fecha' && (
        <label className={LABEL}>Última fecha
          <Input type="date" value={rep.fin_valor || ''} onChange={(e) => set({ fin_valor: e.target.value || null })} className="h-10 text-sm text-foreground" />
        </label>
      )}
      {rep.fin_tipo === 'ciclos' && (
        <label className={LABEL}>Cuántas veces
          <Input type="number" min={1} max={9999} value={rep.fin_valor ?? 1} onChange={(e) => set({ fin_valor: numero(e.target.value, 1, 9999) })} className="h-10 text-sm text-foreground" />
        </label>
      )}
      {proximas?.length > 0 && (
        <div className="rounded-[10px] bg-muted/50 px-2.5 py-2 text-xs">
          <p className="font-medium mb-0.5">Las próximas</p>
          {proximas.map((p) => (
            <p key={p.abre} className="text-muted-foreground">
              {diaCorto(p.abre)}, abre {p.abre.slice(11)} y vence {p.vence.slice(0, 10) === p.abre.slice(0, 10) ? '' : `${diaCorto(p.vence)} `}{p.vence.slice(11)}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function detalle(f) {
  const a = f.avance || {};
  if (f.estado === 'proceso') return `Empezó ${cuando(f.empezada_at)}${a.total ? ` · ${a.hechas || 0} de ${a.total}` : ''}`;
  if (f.estado === 'revision') return `Enviado ${cuando(f.enviada_at)} por ${f.enviada_por?.name}`;
  if (f.estado === 'devuelto') return `Devuelto a ${f.enviada_por?.name}`;
  if (f.estado === 'completado') return `Entregado ${cuando(f.enviada_at)} por ${f.enviada_por?.name}${f.tardia ? ' · tarde' : ''}`;
  const v = cuandoVence(f.vence);
  return f.estado === 'vencido' ? `Venció ${v.texto}` : (f.vence ? `Vence ${v.texto}` : 'Sin fecha límite');
}

export default function PanelAsignaciones({ formId, publicado, inicial, valor, onEditar, onGuardado, misPermisos }) {
  const opciones = useOpcionesCriterio(formId);
  const a = valor || inicial;
  const [alcance, setAlcance] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [lista, setLista] = useState(null);
  const [reabrir, setReabrir] = useState(null);
  const sinAplicar = !!valor && JSON.stringify(valor) !== JSON.stringify(inicial);
  const disponible = a.modo === 'disponible';
  const set = (patch) => onEditar({ ...a, ...patch });
  const rep = a.repeticion || { frecuencia: 'una' };
  const repite = rep.frecuencia !== 'una';
  const setRep = (patch) => set({ repeticion: { ...rep, ...patch } });
  const cambiarFrecuencia = (f) => {
    if (f === 'una') { set({ repeticion: { frecuencia: 'una' } }); return; }
    set({ fecha_limite: null, repeticion: {
      frecuencia: f, intervalo_dias: f === 'cada_n_dias' ? (rep.intervalo_dias || 3) : null, inicio: rep.inicio || ahoraLocal().slice(0, 10), abre: rep.abre || '07:00',
      vence_dias: rep.vence_dias || 0, vence_hora: rep.vence_hora || '17:00', fin_tipo: rep.fin_tipo || 'nunca', fin_valor: rep.fin_valor ?? null,
    } });
  };

  const cargarLista = useCallback((ciclo) => {
    api.get(`/formularios-v2/${formId}/asignaciones`, { params: ciclo === undefined ? {} : { ciclo } })
      .then(({ data }) => setLista(data)).catch(() => setLista({ filas: [], conteo: {} }));
  }, [formId]);
  useEffect(() => { cargarLista(); }, [cargarLista]);

  const texto = JSON.stringify(a);
  useEffect(() => {
    let vigente = true; // si llega tarde la respuesta de algo que ya cambió, no cuenta
    const t = setTimeout(() => {
      api.post(`/formularios-v2/${formId}/alcance`, JSON.parse(texto)).then(({ data }) => vigente && setAlcance(data)).catch(() => vigente && setAlcance(null));
    }, 350);
    return () => { vigente = false; clearTimeout(t); };
  }, [formId, texto]);

  const aplicar = async () => {
    setGuardando(true);
    try {
      const { data } = await api.put(`/formularios-v2/${formId}/ajustes`, { asignacion: a });
      setAlcance(data.alcance);
      onGuardado({ asignacion: a });
      cargarLista();
      toast.success(publicado ? 'Listo: ya les aparece a quienes les toca' : 'Guardado: les aparece al publicar');
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const fecha = (a.fecha_limite || '').slice(0, 10);
  const hora = (a.fecha_limite || '').slice(11, 16);
  const ponerFecha = (d, h) => set({ fecha_limite: d ? `${d}T${h || '12:00'}` : null, ...(d ? {} : { recordar_horas: 0, permite_tarde: false }) });

  return (
    <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
      <aside aria-label="Configurar asignaciones" className="rounded-2xl border bg-card p-4 flex flex-col gap-4">
        <Grupo titulo="¿Cómo se reparte?">
          <div role="radiogroup" aria-label="Cómo se reparte" className="flex flex-col gap-1.5">
            {MODOS_ASIGNACION.map(([k, nombre, desc]) => (
              <button key={k} type="button" role="radio" aria-checked={a.modo === k}
                onClick={() => set({ modo: k, ...(k === 'disponible' ? { fecha_limite: null, recordar_horas: 0, permite_tarde: false, repeticion: { frecuencia: 'una' } } : {}) })}
                className={`px-3 py-2.5 rounded-xl text-left flex flex-col gap-0.5 ${a.modo === k ? 'border-2 border-[#1e395e] bg-[#f5f8fc] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.1)]' : 'border hover:bg-muted'}`}>
                <span className={`text-sm font-semibold ${a.modo === k ? 'text-[#1e395e] dark:text-[#3cbef6]' : ''}`}>{nombre}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </button>
            ))}
          </div>
        </Grupo>

        <Grupo titulo={disponible ? '¿Quién lo puede llenar?' : '¿A quién le toca?'}>
          <Interruptor label="Todo el departamento" valor={a.todos} onCambio={(v) => set({ todos: v })} />
          {!a.todos && (
            <>
              <SelectorCriterio criterio={a} opciones={opciones} onCambio={(c) => onEditar(c)} />
              <p className="text-xs text-muted-foreground">Cargo, área y sucursal se cruzan: «Coordinador» con «H1 y H2» son los coordinadores de esas tiendas. Grupos y personas se suman a eso. Todo sale de Jerarquía.</p>
            </>
          )}
          <p className="rounded-[10px] bg-[#f0f7fc] dark:bg-[rgba(0,165,223,0.12)] text-[#0b3a52] dark:text-[#bae6fd] px-2.5 py-2 text-[13px] font-medium">{resumen(a, alcance, opciones)}</p>
          {alcance?.sin_modulo > 0 && (
            <p className="text-xs text-[#8a4b0f] dark:text-[#f5b56b]">{alcance.sin_modulo} {alcance.sin_modulo === 1 ? 'persona no tiene' : 'personas no tienen'} encendido «Mis formularios» en su perfil: no {alcance.sin_modulo === 1 ? 'cuenta' : 'cuentan'} hasta que se encienda en Jerarquía › Perfiles.</p>
          )}
        </Grupo>

        {!disponible && (
          <Grupo titulo="¿Cuándo?">
            <label className={LABEL}>Se llena
              <NativeSelect value={rep.frecuencia} onChange={cambiarFrecuencia} className="h-10 text-foreground">
                {FRECUENCIAS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
              </NativeSelect>
            </label>
            {repite ? <Repeticion rep={rep} set={setRep} proximas={alcance?.proximas} /> : (
              <div className="flex flex-wrap gap-2">
                <label className={`flex-[1_1_140px] ${LABEL}`}>Fecha límite
                  <Input type="date" value={fecha} onChange={(e) => ponerFecha(e.target.value, hora)} className="h-10 text-sm text-foreground" />
                </label>
                <label className={`flex-[1_1_100px] ${LABEL}`}>Hora
                  <SelectorHora value={hora} disabled={!fecha} onChange={(v) => ponerFecha(fecha, v)} className="h-10 text-sm text-foreground" />
                </label>
              </div>
            )}
            {alcance?.error && <p role="alert" className="text-xs font-medium text-[#b42318] dark:text-[#f87171]">{alcance.error}</p>}
            {(fecha || repite) && (
              <>
                <Segmento label="Recordar antes de vencer" valor={a.recordar_horas} opciones={RECORDAR} onCambio={(v) => set({ recordar_horas: v })} />
                <Interruptor label="Se puede entregar tarde" nota="Si se apaga, al vencer queda cerrado hasta que lo reabran" valor={a.permite_tarde} onCambio={(v) => set({ permite_tarde: v })} />
              </>
            )}
            <p className="text-xs text-muted-foreground">Al vencer queda «Vencido» y se avisa a la persona y a quien creó el formulario.{repite ? ' Cada repetición sale a su hora; lo no entregado queda vencido y sigue la nueva, no se acumula.' : ''}</p>
          </Grupo>
        )}

        <div className="border-t pt-3 flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">Cambiar a quién le toca no pide volver a publicar. Si alguien entra después a ese cargo o área, le llega solo. Si ya no le toca y no lo ha empezado, se le quita; lo ya contestado se conserva.</p>
          <div className="flex items-center justify-end gap-2">
            {sinAplicar && <Button variant="ghost" className="rounded-xl" onClick={() => onEditar(null)} disabled={guardando}>Descartar</Button>}
            <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={aplicar} disabled={!sinAplicar || guardando || !!alcance?.error}>
              {guardando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {sinAplicar ? (publicado ? 'Aplicar y avisar' : 'Guardar') : 'Sin cambios'}
            </Button>
          </div>
        </div>
      </aside>

      <section aria-label="Cómo va" className="min-w-0 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {CONTEOS.map(([e, nombre]) => (
            <div key={e} className="flex-[1_1_96px] rounded-xl border bg-card px-3 py-2.5">
              <p className={`font-heading text-[22px] font-semibold ${ENTREGAS[e][2]}`}>{lista?.conteo?.[e] || 0}</p>
              <p className="text-xs text-muted-foreground">{nombre}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 px-3.5 py-3 border-b">
            <h2 className="font-heading text-[15px] font-semibold">{a.modo === 'sucursal' ? 'Entregas por tienda' : 'Asignaciones'}</h2>
            {lista?.ciclos?.length > 1 ? (
              <NativeSelect value={String(lista.ciclo)} onChange={(v) => cargarLista(Number(v))} aria-label="Repetición" className="h-9 w-auto max-w-[240px] text-foreground">
                {lista.ciclos.map((c) => {
                  const nombre = `${c.abre ? `Del ${diaCorto(c.abre)}` : 'Una sola vez'} · ${c.hechas} de ${c.total}`;
                  return <option key={c.ciclo} value={c.ciclo}>{nombre}</option>;
                })}
              </NativeSelect>
            ) : <span className="text-xs text-muted-foreground">Cada una con su estado y sus fechas</span>}
          </div>
          {!lista && <p className="px-3.5 py-5 text-sm text-muted-foreground">Cargando…</p>}
          {lista && !lista.filas.length && (
            <p className="px-3.5 py-5 text-[13px] text-muted-foreground">
              {inicial.modo === 'disponible' ? 'No genera pendientes: aparece en la sección Formulario del menú y cada quien lo llena cuando lo necesite, las veces que quiera. Sus respuestas se ven en Historial.'
                : publicado ? 'Todavía no le toca a nadie. Elige a quién y aplica los cambios.' : 'Las asignaciones se crean al publicar.'}
            </p>
          )}
          {lista?.filas.map((f) => {
            const [nombre, chip] = ENTREGAS[f.estado] || ENTREGAS.pendiente;
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 border-b last:border-0">
                <span className="flex-[1_1_200px] min-w-0">
                  <span className="block text-sm font-semibold truncate">{f.tipo === 'sucursal' ? `Tienda ${f.sucursal}` : f.user_name}</span>
                  <span className="block text-xs text-muted-foreground">{detalle(f)}</span>
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${chip}`}>{nombre}</span>
                {f.estado === 'vencido' && lista.puede_reabrir && (
                  <Button variant="outline" size="sm" className="rounded-lg h-8" onClick={() => setReabrir(f)}>Reabrir</Button>
                )}
                {f.respuesta_id && misPermisos.resultados && (
                  <Button asChild variant="outline" size="sm" className="rounded-lg h-8"><Link to={`/mis-formularios/${f.id}`}>{f.estado === 'revision' ? 'Revisar' : 'Ver'}</Link></Button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <Reabrir fila={reabrir} onCerrar={() => setReabrir(null)} onListo={() => { setReabrir(null); cargarLista(); }} />
    </div>
  );
}

function Reabrir({ fila, onCerrar, onListo }) {
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('17:00');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { if (fila) { setFecha(''); setHora('17:00'); } }, [fila]);
  const reabrir = async () => {
    setEnviando(true);
    try {
      await api.post(`/formularios-v2/asignaciones/${fila.id}/reabrir`, { vence: fecha ? `${fecha}T${hora || '17:00'}` : null });
      toast.success('Reabierto: se le avisó');
      onListo();
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo reabrir'); }
    finally { setEnviando(false); }
  };
  return (
    <Dialog open={!!fila} onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading">Reabrir la entrega</DialogTitle>
          <DialogDescription>{fila?.tipo === 'sucursal' ? `Tienda ${fila?.sucursal}` : fila?.user_name}: le vuelve a aparecer con la fecha que elijas. Sin fecha, queda abierta.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          <label className="flex-[1_1_140px] flex flex-col gap-1 text-xs font-medium text-muted-foreground">Nueva fecha
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10 text-sm text-foreground" />
          </label>
          <label className="flex-[1_1_100px] flex flex-col gap-1 text-xs font-medium text-muted-foreground">Hora
            <SelectorHora value={hora} disabled={!fecha} onChange={setHora} className="h-10 text-sm text-foreground" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onCerrar}>Cancelar</Button>
          <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={reabrir} disabled={enviando}>{enviando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Reabrir</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
