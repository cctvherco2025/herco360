import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { GRUPOS_PERMISOS } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import SelectorCriterio, { TABS_CRITERIO, nombresDe, useOpcionesCriterio } from '@/components/formularios/SelectorCriterio';

/* Pestaña Permisos: a quién más se le da cada acción sobre este formulario.
   Quien lo creó y los admins siempre pueden. Se guarda sola y el servidor
   revisa cada acción; lo de aquí no solo esconde botones. */

const TABS = TABS_CRITERIO.filter(([k]) => k !== 'grupos');
const NOMBRES = Object.fromEntries(GRUPOS_PERMISOS.flatMap(([, filas]) => filas.map(([k, n]) => [k, n])));
const EN_OTRO_LADO = [
  ['Crear formularios', 'Jerarquía › Perfiles › Formularios personalizados.'],
  ['Completar', 'pestaña Asignaciones.'],
  ['Revisar, aprobar y devolver', 'pestaña Supervisión.'],
  ['Configurar automatizaciones', 'lo hace quien administra asignaciones.'],
];

export default function PanelPermisos({ formId, inicial, onGuardado }) {
  const opciones = useOpcionesCriterio(formId);
  const [p, setP] = useState(inicial);
  const [sel, setSel] = useState('resultados');
  const timer = useRef(null);
  const pendiente = useRef(null);
  const guardar = (valor) => {
    pendiente.current = null;
    api.put(`/formularios-v2/${formId}/ajustes`, { permisos: valor })
      .then(() => onGuardado({ permisos: valor }))
      .catch((e) => toast.error(e?.response?.data?.detail || 'No se pudieron guardar los permisos'));
  };
  const cambiar = (c) => {
    const nuevo = { ...p, [sel]: c };
    setP(nuevo);
    pendiente.current = nuevo;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => guardar(nuevo), 600);
  };
  useEffect(() => () => { clearTimeout(timer.current); if (pendiente.current) guardar(pendiente.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (k) => {
    setSel(k);
    if (window.matchMedia?.('(max-width: 1023px)').matches) setTimeout(() => document.getElementById('elegir-quien')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="grid gap-4 items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
      <section aria-label="Permisos del formulario" className="min-w-0 flex flex-col gap-3">
        <p className="rounded-xl bg-[#e8eef7] dark:bg-[rgba(60,190,246,0.12)] text-[#1e395e] dark:text-[#bae6fd] px-3.5 py-2.5 text-[13px]">
          Siempre pueden todo: <b>quien lo creó</b> y los <b>admins del departamento</b>. El jefe del departamento siempre ve los resultados. Aquí agregas a quién más.
        </p>
        {GRUPOS_PERMISOS.map(([grupo, filas]) => (
          <div key={grupo} className="rounded-2xl border bg-card overflow-hidden">
            <h2 className="px-3.5 py-2.5 bg-muted/50 border-b font-heading text-sm font-semibold">{grupo}</h2>
            {filas.map(([k, nombre, desc]) => {
              const c = p[k] || {};
              const quienes = [...nombresDe(c, opciones, 'cargos'), ...nombresDe(c, opciones, 'areas'), ...nombresDe(c, opciones, 'sucursales'), ...nombresDe(c, opciones, 'personas')];
              return (
                <div key={k} className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 border-b last:border-0 ${sel === k ? 'bg-[#f5f8fc] dark:bg-[rgba(60,190,246,0.08)]' : ''}`}>
                  <span className="flex-[1_1_220px] min-w-0">
                    <span className="block text-sm font-semibold">{nombre}</span>
                    {desc && <span className="block text-xs text-muted-foreground">{desc}</span>}
                  </span>
                  <div className="flex-[1_1_240px] flex flex-wrap gap-1 items-center">
                    {quienes.map((q) => <span key={q} className="min-h-[28px] px-2 rounded-full bg-[#e8eef7] text-[#1e395e] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6] text-xs inline-flex items-center">{q}</span>)}
                    {!quienes.length && <span className="text-xs text-muted-foreground">Solo quien lo creó y los admins</span>}
                  </div>
                  <Button variant="outline" size="sm" className="rounded-lg min-h-[36px]" aria-pressed={sel === k} onClick={() => elegir(k)}>Cambiar</Button>
                </div>
              );
            })}
          </div>
        ))}
        <div className="rounded-2xl border bg-card px-3.5 py-3 flex flex-col gap-1.5">
          <h2 className="font-heading text-sm font-semibold">Esto se define en otro lado</h2>
          {EN_OTRO_LADO.map(([a, d]) => <p key={a} className="text-[13px]"><b>{a}:</b> <span className="text-muted-foreground">{d}</span></p>)}
        </div>
      </section>

      <aside id="elegir-quien" aria-label="Elegir quién" className="scroll-mt-20 rounded-2xl border bg-card p-4 flex flex-col gap-3 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
        <div>
          <p className="text-xs text-muted-foreground">Quién puede</p>
          <h2 className="font-heading text-base font-semibold mt-0.5">{NOMBRES[sel]}</h2>
        </div>
        <SelectorCriterio key={sel} criterio={p[sel] || {}} opciones={opciones} tabs={TABS} onCambio={cambiar} tope="max-h-[280px]" />
        <p className="text-xs text-muted-foreground">Igual que en Asignaciones: cargo, área y sucursal se cruzan; las personas se suman. Editar, publicar o administrar asignaciones también le abre el constructor.</p>
        <p className="text-xs text-muted-foreground border-t pt-2.5">Cada permiso se revisa también en el servidor, no solo se esconde el botón. Si en su perfil tiene apagado «Formularios personalizados», no ve el formulario en el menú: manda el interruptor.</p>
      </aside>
    </div>
  );
}
