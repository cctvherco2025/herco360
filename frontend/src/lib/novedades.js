import { useCallback } from 'react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/* Novedades: cada cosa nueva lleva un punto que late y, al pasar o tocarlo,
   explica qué es. Al abrirla o tocar "Entendido" queda vista para esa persona
   (se guarda en su usuario: POST /users/me/vistos), en todos sus dispositivos.
   Después de `hasta` dejan de mostrarse aunque no se hayan visto.
   Los recorridos guiados usan la misma lista de vistos con claves 'tour-…'. */
const HASTA = '2027-01-31';

export const NOVEDADES = {
  activos: {
    titulo: 'Nuevo: Activos',
    texto: 'Registra los equipos y herramientas de Herco por categoría, con ficha, código QR e historial de cada uno.',
  },
  'mis-mantenimientos': {
    titulo: 'Nuevo: Mis mantenimientos',
    texto: 'Aquí te llegan los mantenimientos que te toca hacer. Se llenan desde el celular, con fotos.',
  },
  planificaciones: {
    titulo: 'Nuevo: Planificaciones',
    texto: 'Programa mantenimientos que se repiten solos (cada semana, mes, trimestre…) y asígnalos a un responsable.',
  },
  checklists: {
    titulo: 'Nuevo: Checklists',
    texto: 'Las preguntas de cada mantenimiento: Bien / Falla / No aplica, números, texto y fotos.',
  },
  'activos-categorias': {
    titulo: 'Categorías de activos',
    texto: 'Crea categorías (herramientas, vehículos, CCTV…), con sus propios campos, el prefijo del código y sus responsables.',
  },
  guardias: {
    titulo: 'Nuevo: Revisión de Guardias',
    texto: 'Evaluación de los guardias de seguridad en 10 criterios, con fotos, % de cumplimiento y PDF.',
  },
  recorridos: {
    titulo: 'Nuevo: Recorridos Preventivos',
    texto: 'Registra los hallazgos de cada recorrido en tienda con fotos; el administrador les da seguimiento.',
  },
  etiquetas: {
    titulo: 'Nuevo: Auditoría de Etiquetas',
    texto: 'Auditoría semanal de etiquetas de precios con fotos, diferencia de precio y reportes en PDF y Excel.',
  },
  'cambiar-fecha': {
    titulo: 'Nuevo: cambiar la fecha',
    texto: 'Mueve un mantenimiento a otro día, aunque quede fuera de su ciclo. Se mantienen el aviso y el plazo, y se avisa al responsable.',
  },
};

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Marca claves como vistas (o las vuelve a mostrar con quitar=true), primero en pantalla y luego en el servidor.
export function useVistos() {
  const { user, setUser } = useAuth();
  const vistos = user?.vistos || [];
  const marcar = useCallback((claves, quitar = false) => {
    const lista = (Array.isArray(claves) ? claves : [claves]).filter(Boolean);
    if (!lista.length) return;
    setUser((u) => (u ? {
      ...u, vistos: quitar ? (u.vistos || []).filter((c) => !lista.includes(c)) : [...new Set([...(u.vistos || []), ...lista])],
    } : u));
    api.post('/users/me/vistos', { claves: lista, quitar }).catch(() => {});
  }, [setUser]);
  return { vistos, marcar, listo: !!user };
}

// ¿Se muestra la novedad `clave`? (existe, no la ha visto y no venció)
export function useNovedad(clave) {
  const { vistos, marcar, listo } = useVistos();
  const visible = !!clave && listo && !!NOVEDADES[clave] && !vistos.includes(clave) && hoy() <= HASTA;
  const vista = useCallback(() => { if (visible) marcar(clave); }, [visible, marcar, clave]);
  return { visible, vista, info: NOVEDADES[clave] };
}
