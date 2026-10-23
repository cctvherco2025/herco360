import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Wrench, CalendarClock, AlertTriangle, CheckCircle2, ListTodo } from 'lucide-react';
import api from '@/lib/api';
import { TareaFila } from '@/components/mantenimiento/comunes';
import Tour, { useTour, BotonTour, BotonRecorrido } from '@/components/Tour';
import { useRecorridoPrimeraVez } from '@/lib/recorridoActivos';

const SECCIONES = [
  { key: 'vencidas', label: 'Vencidas', icon: AlertTriangle, color: 'text-[#dc2626]', vacio: null },
  { key: 'pendientes', label: 'Por hacer', icon: ListTodo, color: 'text-[#00a5df]', vacio: 'No tienes mantenimientos por hacer.' },
  { key: 'proximas', label: 'Próximos 7 días (puedes adelantarlos)', icon: CalendarClock, color: 'text-muted-foreground', vacio: null },
  { key: 'historial', label: 'Hechos recientemente', icon: CheckCircle2, color: 'text-[#16a34a]', vacio: null },
];

/* Mis mantenimientos: lo que la persona tiene que hacer (vencido, por hacer,
   próximo) y lo último que hizo. Cada tarea abre el checklist. */
export default function MisMantenimientos() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { const { data: d } = await api.get('/mantenimiento/mis-tareas'); setData(d); }
    catch (e) { toast.error('No se pudieron cargar tus mantenimientos'); setData({ vencidas: [], pendientes: [], proximas: [], historial: [] }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const tour = useTour('tour-mis-mantenimientos', !!data, { auto: false });
  const recorrido = useRecorridoPrimeraVez(!!data); // la primera vez: el recorrido completo
  const hayTarea = !!data && ['vencidas', 'pendientes', 'proximas', 'historial'].some((k) => data[k]?.length);
  const pasos = [
    { target: null, titulo: 'Tus mantenimientos',
      texto: 'Aquí te llegan los mantenimientos de los activos que tienes a cargo. Se generan solos según la planificación, y los llenas desde el celular.' },
    { target: 'mis-mant-secciones', titulo: 'Qué te toca',
      texto: 'Vencidas: pasaron su plazo (si aceptan entrega tarde, todavía puedes hacerlas).\nPor hacer: ya disponibles.\nPróximos 7 días: todavía no te llega el aviso, pero puedes adelantarlos.\nHechos: lo último que enviaste.' },
    ...(hayTarea ? [{ target: 'mis-mant-tarea', titulo: 'Llenar un mantenimiento',
      texto: 'Toca la tarea. Contesta una pregunta por pantalla: Bien, Falla o No aplica, números y fotos. Si marcas Falla, describe qué encontraste y toma foto. Al final, Enviar.' }] : []),
    { target: 'campana', titulo: 'Avisos',
      texto: 'Te avisamos cuando un mantenimiento está listo para hacerse, antes de que venza y si te cambian la fecha.' },
  ];

  return (
    <div className="max-w-[760px] mx-auto pt-2">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Wrench className="h-7 w-7 text-[#00a5df]" /> Mis mantenimientos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Checklists que tienes asignados en los activos.</p>
        </div>
        {data && <div className="flex gap-2"><BotonRecorrido onClick={recorrido} /><BotonTour tour={tour} /></div>}
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>
      ) : (
        <div className="space-y-6" data-tour="mis-mant-secciones">
          {SECCIONES.map((s) => {
            const lista = data[s.key] || [];
            if (!lista.length && !s.vacio) return null;
            return (
              <section key={s.key} data-testid={`mis-mant-${s.key}`}>
                <h2 className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${s.color}`}>
                  <s.icon className="h-4 w-4" /> {s.label}{lista.length ? ` · ${lista.length}` : ''}
                </h2>
                {lista.length ? (
                  <div className="space-y-2.5">
                    {lista.map((t) => (
                      <div key={t.id} data-tour="mis-mant-tarea">
                        <TareaFila t={t} ahora={data.ahora} onClick={() => navigate(`/mantenimiento/tareas/${t.id}`)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[18px] border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">{s.vacio}</div>
                )}
              </section>
            );
          })}
        </div>
      )}
      <Tour tour={tour} pasos={pasos} />
    </div>
  );
}
