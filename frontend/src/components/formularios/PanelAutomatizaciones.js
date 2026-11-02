import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { DESTINOS_REGLA, EVENTOS_REGLA, FAMILIA, describirCondicion, preguntasDe, uid } from '@/lib/formularios';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import { Interruptor } from '@/components/formularios/PanelDiseno';
import EditorCondicion from '@/components/formularios/Condicion';
import SelectorCriterio, { nombresDe, useOpcionesCriterio } from '@/components/formularios/SelectorCriterio';

/* Pestaña Automatizaciones: CUANDO pase algo → SI se cumple → AVISAR a alguien.
   Solo avisan. Se guardan solas y se aplican sin volver a publicar; el servidor
   las sigue en backend/formularios_automatizaciones.py. */

const nueva = () => ({ id: uid(), activa: true, cuando: 'entregado', condicion: null, avisar: { a: ['creador'], personas: [] }, mensaje: '' });

function resumen(r, porId, opciones) {
  const [, , cuando] = EVENTOS_REGLA.find(([k]) => k === r.cuando);
  const condicion = r.condicion ? describirCondicion(r.condicion, porId) : '';
  const si = !condicion ? '' : r.cuando === 'respuesta' ? ` ${condicion}` : `, si ${condicion}`;
  const quienes = [...DESTINOS_REGLA.filter(([k]) => r.avisar.a.includes(k)).map(([, n]) => n.toLowerCase()), ...nombresDe(r.avisar, opciones, 'personas')];
  return `${cuando}${si} → avisar a ${quienes.join(', ') || 'nadie todavía'}`;
}

function Regla({ r, n, formId, preguntas, porId, opciones, onCambio, onQuitar }) {
  const set = (patch) => onCambio({ ...r, ...patch });
  const marcar = (k) => set({ avisar: { ...r.avisar, a: r.avisar.a.includes(k) ? r.avisar.a.filter((x) => x !== k) : [...r.avisar.a, k] } });
  const falta = r.cuando === 'respuesta' && !r.condicion ? 'Elige qué respuesta se detecta.' : !r.avisar.a.length && !r.avisar.personas.length ? 'Elige a quién avisar.' : null;
  return (
    <article className={`rounded-2xl border bg-card p-4 flex flex-col gap-3 ${r.activa ? '' : 'opacity-70'}`}>
      <div className="flex items-start gap-2">
        <p className="flex-1 min-w-0 text-sm font-semibold">{n}. {resumen(r, porId, opciones)}</p>
        <button type="button" aria-label={`Quitar la regla ${n}`} title="Quitar regla" onClick={onQuitar} className="h-8 w-8 grid place-items-center rounded-lg text-[#dc2626] hover:bg-muted shrink-0"><Trash2 className="h-4 w-4" /></button>
      </div>
      <label className="flex flex-col gap-1 text-xs font-bold text-[#1e395e] dark:text-[#3cbef6]">CUANDO
        <NativeSelect value={r.cuando} onChange={(v) => set({ cuando: v, ...(v === 'vencido' ? { condicion: null } : {}) })} className="h-10 font-normal text-foreground">
          {EVENTOS_REGLA.map(([k, nombre]) => <option key={k} value={k}>{nombre}</option>)}
        </NativeSelect>
      </label>
      {r.cuando !== 'vencido' && (
        <EditorCondicion condicion={r.condicion} onCambio={(c) => set({ condicion: c })} anteriores={preguntas} porId={porId} formId={formId} verbo="SI"
          frase="Solo si" sinPreguntas="Agrega preguntas en Contenido para poner una condición." />
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold text-[#1e395e] dark:text-[#3cbef6]">AVISAR A</span>
        <div className="flex flex-wrap gap-1.5">
          {DESTINOS_REGLA.map(([k, nombre]) => {
            const on = r.avisar.a.includes(k);
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => marcar(k)}
                className={`min-h-[34px] px-2.5 rounded-full text-xs ${on ? 'border-2 border-[#1e395e] bg-[#e8eef7] text-[#1e395e] font-semibold dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6]' : 'border hover:bg-muted'}`}>
                {on ? '✓ ' : ''}{nombre}
              </button>
            );
          })}
        </div>
        <SelectorCriterio criterio={r.avisar} opciones={opciones} tabs={[['personas', 'Otras personas']]} onCambio={(c) => set({ avisar: { ...r.avisar, personas: c.personas } })} />
      </div>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Mensaje (opcional)
        <Input value={r.mensaje} maxLength={300} onChange={(e) => set({ mensaje: e.target.value })} placeholder="Si lo dejas vacío, se escribe solo" className="h-10 text-sm text-foreground" />
      </label>
      <div className="flex items-center justify-between gap-3 border-t pt-2">
        <span className="text-xs font-medium text-[#b42318] dark:text-[#f87171]">{falta}</span>
        <div className="w-[150px]"><Interruptor label="Activa" valor={r.activa} onCambio={(v) => set({ activa: v })} /></div>
      </div>
    </article>
  );
}

export default function PanelAutomatizaciones({ formId, contenido, inicial, onGuardado }) {
  const opciones = useOpcionesCriterio(formId);
  const [reglas, setReglas] = useState(inicial);
  const timer = useRef(null);
  const pendiente = useRef(null);
  const guardar = (valor) => {
    pendiente.current = null;
    api.put(`/formularios-v2/${formId}/ajustes`, { reglas: valor })
      .then(() => onGuardado({ reglas: valor }))
      .catch((e) => toast.error(e?.response?.data?.detail || 'No se pudieron guardar las reglas'));
  };
  const poner = (nuevas) => {
    setReglas(nuevas);
    pendiente.current = nuevas;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => guardar(nuevas), 700);
  };
  useEffect(() => () => { clearTimeout(timer.current); if (pendiente.current) guardar(pendiente.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const preguntas = useMemo(() => preguntasDe(contenido).map(({ it }) => it).filter((it) => FAMILIA[it.tipo]), [contenido]);
  const porId = useMemo(() => Object.fromEntries(preguntas.map((it) => [it.id, it])), [preguntas]);

  return (
    <div className="max-w-[760px] mx-auto flex flex-col gap-3">
      <div>
        <h2 className="font-heading text-[15px] font-semibold">Reglas de aviso</h2>
        <p className="text-[13px] text-muted-foreground mt-0.5">CUANDO pase algo, SI se cumple una condición, AVISAR a alguien en la campana y al celular. Se guardan solas y se aplican sin volver a publicar.</p>
      </div>
      {reglas.map((r, i) => (
        <Regla key={r.id} r={r} n={i + 1} formId={formId} preguntas={preguntas} porId={porId} opciones={opciones}
          onCambio={(x) => poner(reglas.map((y) => (y.id === r.id ? x : y)))} onQuitar={() => poner(reglas.filter((y) => y.id !== r.id))} />
      ))}
      {!reglas.length && <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Sin reglas todavía. Ya se avisa solo cuando alguien tiene algo por llenar, por revisar o vencido; agrega una regla para avisar a alguien más.</div>}
      <button type="button" disabled={reglas.length >= 30} onClick={() => poner([...reglas, nueva()])}
        className="min-h-[44px] rounded-2xl border border-dashed bg-card text-sm font-medium text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
        <Plus className="h-4 w-4" /> Agregar regla
      </button>
      <p className="text-xs text-muted-foreground">Cada regla avisa una sola vez por entrega. Las reglas no cambian nada del formulario: solo avisan.</p>
    </div>
  );
}
