import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { QUIEN_SUPERVISA, ENTREGAS, preguntasDe, nombreDe } from '@/lib/formularios';
import { Grupo, Segmento, Interruptor } from '@/components/formularios/PanelDiseno';
import SelectorCriterio, { useOpcionesCriterio } from '@/components/formularios/SelectorCriterio';

/* Pestaña Supervisión: si lo que se entrega lo tiene que aprobar alguien. Se
   guarda sola y se aplica a lo que se envíe de ahí en adelante; lo ya enviado
   sigue con quien le tocó. A la derecha, cómo le llega al supervisor. */

const PLAZOS = [[24, '1 día'], [48, '2 días'], [72, '3 días'], [0, 'Sin plazo']];

export default function PanelSupervision({ formId, titulo, contenido, inicial, onGuardado }) {
  const opciones = useOpcionesCriterio(formId);
  const [s, setS] = useState(inicial);
  const timer = useRef(null);
  const pendiente = useRef(null);
  const guardar = (valor) => {
    pendiente.current = null;
    api.put(`/formularios-v2/${formId}/ajustes`, { supervision: valor })
      .then(() => onGuardado({ supervision: valor }))
      .catch((e) => toast.error(e?.response?.data?.detail || 'No se pudo guardar la supervisión'));
  };
  const set = (patch) => {
    const nuevo = { ...s, ...patch };
    setS(nuevo);
    pendiente.current = nuevo;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => guardar(nuevo), 600);
  };
  useEffect(() => () => { clearTimeout(timer.current); if (pendiente.current) guardar(pendiente.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const muestra = preguntasDe(contenido).slice(0, 4);
  const [revision, chip] = ENTREGAS.revision;
  return (
    <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      <aside aria-label="Configurar supervisión" className="rounded-2xl border bg-card p-4 flex flex-col gap-3.5">
        <Interruptor label="Requiere supervisión" nota={s.activa ? 'Al enviar queda «En revisión» hasta que lo aprueben' : 'Apagada: termina al enviar'}
          valor={s.activa} onCambio={(v) => set({ activa: v })} />
        {s.activa && (
          <>
            <Grupo titulo="¿Quién supervisa?">
              <div role="radiogroup" aria-label="Quién supervisa" className="flex flex-col gap-1.5">
                {QUIEN_SUPERVISA.map(([k, nombre, desc]) => (
                  <button key={k} type="button" role="radio" aria-checked={s.quien === k} onClick={() => set({ quien: k })}
                    className={`px-3 py-2.5 rounded-xl text-left flex flex-col gap-0.5 ${s.quien === k ? 'border-2 border-[#1e395e] bg-[#f5f8fc] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.1)]' : 'border hover:bg-muted'}`}>
                    <span className={`text-sm font-semibold ${s.quien === k ? 'text-[#1e395e] dark:text-[#3cbef6]' : ''}`}>{nombre}</span>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </button>
                ))}
              </div>
              {s.quien === 'personas' && (
                <SelectorCriterio criterio={{ personas: s.personas }} opciones={opciones} tabs={[['personas', 'Personas']]} onCambio={(c) => set({ personas: c.personas })} />
              )}
              <p className="text-xs text-muted-foreground">Si el supervisor es la misma persona que llenó, sube a su jefe según Gente a cargo. Los admins del departamento también pueden aprobar o devolver desde Asignaciones.</p>
            </Grupo>
            <div className="border-t pt-3">
              <Segmento label="Plazo para revisar" valor={s.plazo_horas} opciones={PLAZOS} onCambio={(v) => set({ plazo_horas: v })} />
            </div>
            <div className="border-t pt-3">
              <p className="text-[13px] font-semibold">Seguimientos</p>
              <p className="text-xs text-muted-foreground mt-0.5">Los que abra este formulario los revisa el supervisor. Se abren al enviar, como hoy, sin esperar la aprobación.</p>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground border-t pt-3">Varios niveles de aprobación (responsable → supervisor → jefatura) llegan en la etapa 4.</p>
      </aside>

      <section aria-label="Así revisa el supervisor" className="min-w-0 flex flex-col gap-3">
        <div className="rounded-2xl border bg-card px-4 py-3.5 flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <div className="flex-[1_1_280px] min-w-0">
            <p className="text-xs text-muted-foreground">Así le llega al supervisor</p>
            <h2 className="font-heading text-[17px] font-semibold mt-0.5 truncate">{titulo || 'Formulario'}</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">Quien llenó · enviado hoy</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${chip}`}>{revision}</span>
        </div>
        <div className="rounded-2xl border bg-card overflow-hidden">
          {muestra.map(({ it }) => (
            <div key={it.id} className="px-3.5 py-3 border-b last:border-0">
              <p className="text-[13px] font-semibold">{nombreDe(it)}</p>
              <p className="text-[13px] text-muted-foreground">Su respuesta, con fotos y observaciones</p>
            </div>
          ))}
          {!muestra.length && <p className="px-3.5 py-5 text-sm text-muted-foreground">Agrega preguntas en Contenido para verlas aquí.</p>}
        </div>
        <div className="rounded-2xl border bg-card p-3.5 flex flex-col gap-2.5">
          <p className="text-[13px] font-semibold">Observaciones</p>
          <div className="min-h-[56px] rounded-lg border bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground">Obligatorio si lo devuelve: qué hay que corregir</div>
          <div className="flex flex-wrap gap-2 justify-end">
            <span className="min-h-[44px] px-4 rounded-[10px] border border-[#c2410c] text-[#8a4b0f] dark:text-[#f5b56b] text-sm font-semibold inline-flex items-center">Devolver para corregir</span>
            <span className="min-h-[44px] px-[18px] rounded-[10px] bg-[#16794a] text-white text-sm font-semibold inline-flex items-center">Aprobar</span>
          </div>
          <p className="text-xs text-muted-foreground">Quien llenó recibe un aviso; si lo devuelve, le vuelve a aparecer para corregir y reenviar.</p>
        </div>
      </section>
    </div>
  );
}
