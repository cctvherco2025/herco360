import { useEffect, useState } from 'react';

// true en pantallas de menos de 768 px (celular). Se actualiza al cambiar el
// tamaño de la ventana.
const MQ = '(max-width: 767px)';

export default function useEsMovil() {
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(MQ).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(MQ);
    if (!mq) return undefined;
    const cambio = () => setMovil(mq.matches);
    mq.addEventListener?.('change', cambio);
    return () => mq.removeEventListener?.('change', cambio);
  }, []);
  return movil;
}
