import React, { useState } from 'react';
import { ESTILOS, SIN_RESPUESTA } from '@/lib/formularios';
import { Input } from '@/components/ui/input';
import FormRenderer from '@/components/formularios/FormRenderer';
import { Grupo, Segmento, Interruptor, Vista } from '@/components/formularios/PanelDiseno';

/* Pestaña Navegación del constructor: cómo se llena (estilo base y estilo de
   cada paso, que es el modo mixto), progreso, botones y resumen, con vista
   previa en teléfono o PC. */

const ESTILO_PASO = [['igual', 'Como el formulario'], ['paso', 'Paso a paso'], ['una', 'Una a la vez'], ['checklist', 'Checklist']];

export default function PanelNavegacion({ formId, titulo, contenido, onCambioNav, onEstiloPaso }) {
  const n = contenido.navegacion;
  const set = (patch, clave) => onCambioNav({ ...n, ...patch }, clave || `nav.${Object.keys(patch).join(',')}`);
  const [ver, setVer] = useState(contenido.pasos[0]?.id || null);
  const [disp, setDisp] = useState('telefono');
  const [oscuro, setOscuro] = useState(false);
  const pagina = n.estilo === 'pagina';
  const cuantas = (p) => p.secciones.reduce((a, s) => a + s.items.filter((it) => !SIN_RESPUESTA.has(it.tipo)).length, 0);
  const vistas = [...contenido.pasos.map((p, i) => [p.id, `${i + 1}. ${p.nombre || 'Paso'}`]), ...(n.resumen ? [['resumen', 'Resumen']] : [])];
  const verValido = vistas.some(([k]) => k === ver) ? ver : vistas[0]?.[0];

  return (
    <div className="grid gap-4 items-start lg:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[400px_minmax(0,1fr)]">
      <aside aria-label="Navegación del formulario" className="rounded-2xl border bg-card p-4 flex flex-col gap-4 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <Grupo titulo="Cómo se llena">
          <div role="radiogroup" aria-label="Estilo del formulario" className="grid grid-cols-2 gap-2">
            {ESTILOS.map(([k, nombre, desc]) => (
              <button key={k} type="button" role="radio" aria-checked={n.estilo === k} onClick={() => set({ estilo: k }, 'nav.estilo')}
                className={`min-h-[92px] p-2.5 rounded-xl border text-left flex flex-col gap-1 ${n.estilo === k ? 'border-2 border-[#1e395e] bg-[#f5f8fc] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.1)]' : 'hover:bg-muted'}`}>
                <span className={`text-sm font-semibold ${n.estilo === k ? 'text-[#1e395e] dark:text-[#3cbef6]' : ''}`}>{nombre}</span>
                <span className="text-xs text-muted-foreground">{desc}</span>
              </button>
            ))}
          </div>
        </Grupo>

        <Grupo titulo="Estilo de cada paso">
          <p className="text-xs text-muted-foreground -mt-1">{pagina ? 'Con «Todo en una página» todos los pasos van juntos: elige otro estilo para cambiar paso por paso.' : 'Un paso puede llenarse distinto al resto (estilo mixto).'}</p>
          {contenido.pasos.map((p, i) => (
            <div key={p.id} className={`rounded-xl border p-2.5 flex flex-col gap-2 ${pagina ? 'opacity-50' : ''}`}>
              <p className="text-sm font-semibold">{i + 1}. {p.nombre || 'Sin nombre'} <span className="font-normal text-xs text-muted-foreground">· {cuantas(p)} preguntas</span></p>
              <div role="radiogroup" aria-label={`Estilo del paso ${p.nombre}`} className="flex flex-wrap gap-1">
                {ESTILO_PASO.map(([k, nombre]) => (
                  <button key={k} type="button" role="radio" aria-checked={(p.estilo || 'igual') === k} disabled={pagina}
                    onClick={() => { onEstiloPaso(p.id, k); setVer(p.id); }}
                    className={`h-8 px-2.5 rounded-full border text-xs ${(p.estilo || 'igual') === k ? 'border-2 border-[#1e395e] bg-[#e8eef7] text-[#1e395e] font-semibold dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6]' : 'hover:bg-muted'}`}>{nombre}</button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Si una condición oculta un paso completo, se salta solo.</p>
        </Grupo>

        <Grupo titulo="Progreso y botones">
          <Segmento label="Indicador de progreso" valor={n.progreso} opciones={[['barra', 'Barra'], ['pasos', 'Pasos'], ['porcentaje', 'Porcentaje'], ['nada', 'Nada']]}
            onCambio={(v) => set({ progreso: v })} />
          <div className="grid grid-cols-3 gap-2">
            {[['siguiente', 'Siguiente'], ['anterior', 'Anterior'], ['enviar', 'Enviar']].map(([k, label]) => (
              <label key={k} className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">Botón {label.toLowerCase()}
                <Input value={n[k]} maxLength={30} onChange={(e) => set({ [k]: e.target.value }, `nav.${k}`)} className="h-9 text-sm text-foreground min-w-0" />
              </label>
            ))}
          </div>
          <Interruptor label="Permitir volver atrás" nota="Si se apaga, no se regresa a lo ya contestado" valor={n.volver} onCambio={(v) => set({ volver: v })} />
          <Interruptor label="Resumen antes de enviar" nota="Todas las respuestas para revisarlas" valor={n.resumen} onCambio={(v) => set({ resumen: v })} />
          <p className="text-[11px] text-muted-foreground">Lo que se va contestando se guarda solo, fotos incluidas: se puede seguir desde otro equipo. Con «Una pregunta a la vez», Enter avanza y las letras eligen la opción.</p>
        </Grupo>
      </aside>

      <Vista vistas={pagina ? null : vistas} vista={verValido} setVista={setVer} disp={disp} setDisp={setDisp} oscuro={oscuro} setOscuro={setOscuro}>
        <FormRenderer key={`${pagina ? 'pagina' : verValido}-${disp}-${n.estilo}`} form={{ id: formId, titulo, contenido, version: 'previa' }} modo="vista"
          irA={pagina ? null : verValido} pantallaInicial="preguntas" oscuro={oscuro} compacto={disp === 'telefono'} />
      </Vista>
    </div>
  );
}
