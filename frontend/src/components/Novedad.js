import React, { useState, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useNovedad } from '@/lib/novedades';

/* Punto celeste que late junto a algo nuevo. Al pasar el mouse (PC) o al
   tocarlo (celular) explica qué es; "Entendido" lo marca como visto. No
   navega ni dispara el botón que tiene al lado. */
export function NovedadPunto({ clave, className = '', side = 'right' }) {
  const { visible, vista, info } = useNovedad(clave);
  const [open, setOpen] = useState(false);
  const cierre = useRef(null);
  if (!visible) return null;
  const abrir = () => { clearTimeout(cierre.current); setOpen(true); };
  const cerrarLuego = () => { cierre.current = setTimeout(() => setOpen(false), 180); };
  const parar = (e) => { e.preventDefault(); e.stopPropagation(); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span role="button" tabIndex={0} aria-label={info.titulo} data-testid={`novedad-${clave}`} data-novedad-punto=""
          onClick={(e) => { parar(e); setOpen((o) => !o); }} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { parar(e); setOpen((o) => !o); } }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') abrir(); }} onPointerLeave={(e) => { if (e.pointerType === 'mouse') cerrarLuego(); }}
          className={`relative inline-flex h-2.5 w-2.5 shrink-0 cursor-pointer ${className}`}>
          <span className="absolute inset-0 rounded-full bg-[#00a5df] opacity-60 animate-ping" />
          <span className="relative h-2.5 w-2.5 rounded-full bg-[#00a5df] ring-2 ring-background" />
        </span>
      </PopoverTrigger>
      <PopoverContent data-novedad-punto="" side={side} align="start" sideOffset={10} onPointerEnter={abrir} onPointerLeave={cerrarLuego}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(280px,calc(100vw-32px))] rounded-xl border bg-popover p-4 shadow-lg">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-[#00a5df]" /> {info.titulo}
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{info.texto}</p>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={(e) => { parar(e); setOpen(false); vista(); }}
            className="rounded-lg bg-[#1e395e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162c49]" data-testid={`novedad-ok-${clave}`}>
            Entendido
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Envuelve un botón o enlace: muestra el punto en su esquina y lo marca visto al usarlo.
export function ConNovedad({ clave, children, className = '' }) {
  const { visible, vista } = useNovedad(clave);
  return (
    <span className={`relative inline-flex ${className}`} onClickCapture={(e) => { if (visible && !e.target.closest?.('[data-novedad-punto]')) vista(); }}>
      {children}
      <NovedadPunto clave={clave} className="absolute -top-1 -right-1 z-10" side="bottom" />
    </span>
  );
}
