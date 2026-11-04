import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import api from '@/lib/api';

const CADA_MS = 3500;

/* Mantiene al día una tarea o un seguimiento mientras su pantalla está abierta
   y visible: cada pocos segundos pregunta al servidor si algo cambió
   (GET {ruta}/cambios?desde=updated_at) y, si cambió, reemplaza el objeto.
   Si llegan mensajes de otra persona y quien mira está al final de la página,
   baja sola; si está más arriba, cuenta los nuevos para mostrar el aviso.
   `clave` es el campo de la respuesta ('tarea' o 'ticket'). */
export default function useChatEnVivo({ ruta, clave, obj, setObj, pausado, miId, finRef }) {
  const [nuevos, setNuevos] = useState(0);
  const actual = useRef(obj);
  actual.current = obj;
  const pausa = useRef(pausado);
  pausa.current = pausado;

  useEffect(() => {
    if (!ruta) return undefined;
    let vivo = true;
    let enCurso = false;
    const revisar = async () => {
      const o = actual.current;
      if (!o || enCurso || pausa.current || document.visibilityState !== 'visible') return;
      enCurso = true;
      try {
        const { data } = await api.get(`${ruta}/cambios`, { params: { desde: o.updated_at || '' } });
        if (!vivo || !data.cambio || !data[clave]) return;
        // si mientras tanto la persona hizo algo (ya tiene una versión más nueva), no pisarla
        if (actual.current && actual.current.updated_at && data[clave].updated_at < actual.current.updated_at) return;
        const antes = new Set((actual.current?.mensajes || []).map((m) => m.id));
        const llegados = (data[clave].mensajes || []).filter((m) => !antes.has(m.id) && m.de_id !== miId && m.rol !== 'sistema');
        const alFinal = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
        setObj(data[clave]);
        if (llegados.length) {
          if (alFinal) setTimeout(() => finRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60);
          else setNuevos((n) => n + llegados.length);
        }
      } catch (e) { /* sin conexión un momento: se intenta en la próxima vuelta */ }
      finally { enCurso = false; }
    };
    const t = setInterval(revisar, CADA_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [ruta, clave, setObj, miId, finRef]);

  // al llegar al final de la página el aviso ya no hace falta
  useEffect(() => {
    if (!nuevos) return undefined;
    const f = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160) setNuevos(0);
    };
    window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [nuevos]);

  const verNuevos = () => { setNuevos(0); finRef?.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); };
  return { nuevos, verNuevos };
}

// Botón flotante "N mensajes nuevos ↓"
export function AvisoNuevos({ nuevos, onClick }) {
  if (!nuevos) return null;
  return (
    <button type="button" onClick={onClick} data-testid="chat-nuevos"
      className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-[#1e395e] px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-[#162c49] lg:bottom-8">
      {nuevos === 1 ? '1 mensaje nuevo' : `${nuevos} mensajes nuevos`} <ArrowDown className="h-4 w-4" />
    </button>
  );
}
