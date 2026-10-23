import React, { useState, useRef, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import Coachmark from '@/components/Coachmark';
import { useNovedad, useNovedadAbierta, abrirNovedad } from '@/lib/novedades';

/* Punto celeste que late junto a algo nuevo. Al pasar el mouse (PC) o al
   tocarlo (celular) abre su explicación con <Coachmark> (posición con
   detección de choques, flecha y 16 px de margen), anclada al elemento
   completo (el ítem del menú o el botón), no al punto, para no taparlo.
   Solo hay una abierta a la vez en toda la app. "Entendido" la marca vista.
   No navega ni dispara el botón que tiene al lado. */
export function NovedadPunto({ clave, className = '' }) {
  const { visible, vista, info } = useNovedad(clave);
  const abierta = useNovedadAbierta();
  const [punto, setPunto] = useState(null);
  const cierre = useRef(null);
  // la misma novedad puede estar dos veces (menú de PC oculto y menú del
  // celular): solo abre la copia que se ve en pantalla
  const enPantalla = !!punto && punto.getClientRects().length > 0;
  const open = visible && abierta === clave && enPantalla;
  const abrir = useCallback(() => { clearTimeout(cierre.current); abrirNovedad(clave); }, [clave]);
  const cerrar = useCallback(() => { clearTimeout(cierre.current); if (abierta === clave) abrirNovedad(null); }, [abierta, clave]);
  const cerrarLuego = () => { cierre.current = setTimeout(cerrar, 200); };
  if (!visible) return null;
  // ancla: el ítem o botón que contiene el punto (o el que se marca con data-novedad-ancla)
  const ancla = punto?.closest('[data-novedad-ancla]') || punto?.closest('a, button') || punto;
  const parar = (e) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <>
      <span ref={setPunto} role="button" tabIndex={0} aria-label={info.titulo} aria-expanded={open} data-testid={`novedad-${clave}`} data-novedad-punto=""
        onClick={(e) => { parar(e); open ? cerrar() : abrir(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { parar(e); open ? cerrar() : abrir(); } }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') abrir(); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') cerrarLuego(); }}
        className={`relative inline-flex h-2.5 w-2.5 shrink-0 cursor-pointer ${className}`}>
        <span className="absolute inset-0 rounded-full bg-[#00a5df] opacity-60 animate-ping" />
        <span className="relative h-2.5 w-2.5 rounded-full bg-[#00a5df] ring-2 ring-background" />
      </span>
      <Coachmark open={open} onOpenChange={(v) => { if (!v) cerrar(); }} anchor={ancla} testid={`novedad-globo-${clave}`}
        onPointerEnter={() => clearTimeout(cierre.current)} onPointerLeave={cerrarLuego} className="p-4">
        <div data-novedad-punto="" onClick={(e) => e.stopPropagation()}>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 shrink-0 text-[#00a5df]" /> {info.titulo}
          </p>
          <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{info.texto}</p>
          <div className="mt-3 flex justify-end">
            <button type="button" onClick={(e) => { parar(e); cerrar(); vista(); }}
              className="rounded-lg bg-[#1e395e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162c49]" data-testid={`novedad-ok-${clave}`}>
              Entendido
            </button>
          </div>
        </div>
      </Coachmark>
    </>
  );
}

// Envuelve un botón o enlace: muestra el punto en su esquina, el globo se
// ancla a todo el botón y queda visto al usarlo.
export function ConNovedad({ clave, children, className = '' }) {
  const { visible, vista } = useNovedad(clave);
  return (
    <span data-novedad-ancla="" className={`relative inline-flex ${className}`}
      onClickCapture={(e) => { if (visible && !e.target.closest?.('[data-novedad-punto]')) vista(); }}>
      {children}
      <NovedadPunto clave={clave} className="absolute -top-1 -right-1 z-10" />
    </span>
  );
}
