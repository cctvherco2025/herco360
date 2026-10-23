import { useCallback, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useVistos } from '@/lib/novedades';
import { useRecorrido } from '@/components/Tour';

/* Recorrido completo de Activos y mantenimiento, de pantalla en pantalla:
   registrar el activo → crear el checklist → programar el mantenimiento →
   llenarlo → darle seguimiento. Se arma según lo que la persona puede hacer
   (GET /activos/acceso y /mantenimiento/acceso): quien solo hace tareas ve la
   parte de "Mis mantenimientos". Al terminar quedan vistos también los
   recorridos de cada pantalla, para que no se abran encima. */
export const CLAVE_RECORRIDO = 'tour-recorrido-activos';
const CLAVES_PANTALLAS = ['tour-activos', 'tour-mis-mantenimientos', 'tour-planificaciones'];

export function pasosRecorrido({ verActivos, planificar, misTareas }) {
  const pasos = [{
    ruta: verActivos ? '/activos' : '/mantenimiento', target: null, titulo: 'Recorrido completo',
    texto: planificar
      ? 'Te llevamos por cada pantalla, en el orden en que se trabaja:\n1. Registrar el activo\n2. Crear el checklist\n3. Programar el mantenimiento\n4. Llenarlo\n5. Darle seguimiento'
      : 'Te mostramos dónde te llegan tus mantenimientos y cómo se llenan desde el celular.',
  }];
  if (verActivos) {
    pasos.push(
      { etapa: '1. Activos', ruta: '/activos', target: 'activos-nuevo', titulo: 'Registra el activo',
        texto: 'Toca "Registrar activo", busca la categoría (NVR, aires, herramientas…) y llena sus datos. La plataforma le pone el código y crea su ficha con QR.' },
      { etapa: '1. Activos', ruta: '/activos', target: 'activos-lista', titulo: 'La ficha del activo',
        texto: 'Toca un activo para ver su ficha: datos, foto, QR para pegar en el equipo, sus mantenimientos y todo su historial.' },
    );
  }
  if (planificar) {
    pasos.push(
      { etapa: '2. Checklist', ruta: '/mantenimiento/checklists', target: 'chk-plantillas', titulo: 'Crea el checklist con una plantilla',
        texto: 'El checklist son las preguntas del mantenimiento. Lo más rápido: toca "Usar plantilla" (NVR y cámaras, aires acondicionados o máquinas de pintura), ajústala y guarda.' },
      { etapa: '2. Checklist', ruta: '/mantenimiento/checklists', target: 'chk-nuevo', titulo: 'O empieza en blanco',
        texto: 'Con "Nuevo checklist" armas el tuyo: Bien/Falla/No aplica, selección única o múltiple, casilla, número, texto y foto. Cada pregunta dice si lleva fotos, y puedes pedir foto del antes y del después.' },
      { etapa: '3. Programar', ruta: '/mantenimiento/planificaciones/nueva', target: 'plan-generales', titulo: 'Programa el mantenimiento',
        texto: 'En "Nueva planificación" pones el nombre, quién lo hace (responsable) y quién lo supervisa. Si el responsable eres tú, las tareas te llegan a ti.' },
      { etapa: '3. Programar', ruta: '/mantenimiento/planificaciones/nueva', target: 'plan-frecuencia', titulo: 'Cada cuánto y desde cuándo',
        texto: 'Elige la frecuencia (semanal, mensual, trimestral…), la fecha en que empieza y si termina. El ciclo siguiente empieza solo, por fecha.' },
      { etapa: '3. Programar', ruta: '/mantenimiento/planificaciones/nueva', target: 'plan-siguiente', titulo: 'Las tareas',
        texto: 'En "Siguiente: tareas" eliges el checklist, qué día toca (ej. "cada miércoles" o "el 15 de cada mes"), la hora y el plazo, y marcas los activos. Revisas la vista previa de fechas y tocas "Activar planificación".' },
    );
  }
  if (misTareas || planificar) {
    pasos.push(
      { etapa: '4. Llenar', ruta: '/mantenimiento', target: 'mis-mant-secciones', titulo: 'El responsable lo llena aquí',
        texto: 'En "Mis mantenimientos" le llegan sus tareas: vencidas, por hacer y próximas. También le llega una notificación al celular.' },
      { etapa: '4. Llenar', ruta: '/mantenimiento', target: 'mis-mant-tarea', titulo: 'Llenar una tarea',
        texto: 'Toca la tarea: se contesta una pregunta por pantalla con botones grandes y fotos de la cámara. Si algo está en falla, se describe y se toma foto. Al final, "Enviar". Si todavía no le llega el aviso, igual puede adelantarla.' },
    );
  }
  if (planificar) {
    pasos.push(
      { etapa: '5. Seguimiento', ruta: '/mantenimiento/planificaciones', target: 'planes-lista', titulo: 'Seguimiento',
        texto: 'Aquí ves el avance de cada planificación. Al abrirla puedes cambiar la fecha de un mantenimiento, reasignarlo, pausar la planificación y ver el historial. En "Cumplimiento" ves el % por periodo y por responsable.' },
    );
  }
  pasos.push({
    ruta: verActivos ? '/activos' : '/mantenimiento', target: null, titulo: '¡Listo!',
    texto: 'Ya conoces el recorrido completo. En cada pantalla, el botón "¿Cómo funciona?" te explica esa pantalla, y "Recorrido completo" repite este recorrido cuando quieras.',
  });
  return pasos;
}

// Arranca el recorrido completo (pide primero qué puede hacer la persona).
export function useRecorridoActivos() {
  const { iniciar } = useRecorrido();
  return useCallback(async () => {
    const [a, m] = await Promise.all([
      api.get('/activos/acceso').then((r) => r.data).catch(() => ({})),
      api.get('/mantenimiento/acceso').then((r) => r.data).catch(() => ({})),
    ]);
    iniciar(pasosRecorrido({ verActivos: !!a.ver, planificar: !!m.planificar, misTareas: !!m.mis_tareas }),
      [CLAVE_RECORRIDO, ...CLAVES_PANTALLAS]);
  }, [iniciar]);
}

// La primera vez que entra a Activos o a Mis mantenimientos, el recorrido completo se abre solo.
export function useRecorridoPrimeraVez(listo) {
  const { vistos, listo: hayUsuario } = useVistos();
  const { activo } = useRecorrido();
  const arrancar = useRecorridoActivos();
  const lanzado = useRef(false);
  useEffect(() => {
    if (!listo || !hayUsuario || activo || lanzado.current || vistos.includes(CLAVE_RECORRIDO)) return undefined;
    const t = setTimeout(() => { lanzado.current = true; arrancar(); }, 800);
    return () => clearTimeout(t);
  }, [listo, hayUsuario, activo, vistos, arrancar]);
  return arrancar;
}
