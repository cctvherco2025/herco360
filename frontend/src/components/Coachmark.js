import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as PopoverPrimitive from '@radix-ui/react-popover';

/* Coachmark: el ÚNICO componente para tooltips de onboarding (novedades y
   recorridos guiados). Todo tooltip de onboarding nuevo debe usarlo.

   Se posiciona con Floating UI (vía Radix Popper) con detección de choques:
   offset (12 px), flip (si no cabe abajo va arriba), shift con 16 px de
   margen a cada lado y flecha que apunta al elemento. La posición se
   recalcula en cada cuadro (updatePositionStrategy="always"), así sigue al
   elemento durante la animación del menú, el scroll, la rotación y el resize.

   Lado: 'auto' = a la DERECHA del elemento si hay espacio para el globo
   (p. ej. a la derecha del menú lateral en PC) y si no, DEBAJO (o arriba si
   no cabe): nunca encima del elemento. Ancho máximo: calc(100vw - 32px).

   Si el globo no cabe ni abajo ni arriba del elemento (elemento grande o
   globo alto en un celular), se muestra como hoja fija abajo (o arriba si el
   elemento está en la mitad de abajo), sin tapar el borde del elemento.

   anchor: un elemento del DOM (o un objeto con getBoundingClientRect).
   z-index por encima del menú en celular, su capa oscura y los diálogos. */
const MARGEN = 16;

function ladoAuto(el, ancho) {
  if (!el) return 'bottom';
  const r = el.getBoundingClientRect();
  const derecha = window.innerWidth - r.right;
  return window.innerWidth >= 768 && derecha >= ancho + MARGEN * 2 ? 'right' : 'bottom';
}

export default function Coachmark({
  open, onOpenChange, anchor, lado = 'auto', ancho = 300, children, className = '', cerrarAlTocarFuera = true,
  onPointerEnter, onPointerLeave, testid, conFlecha = true, llevarAVista = true,
}) {
  const anchorRef = useRef(null);
  anchorRef.current = anchor || null;
  const [side, setSide] = useState(lado === 'auto' ? 'bottom' : lado);
  const [hoja, setHoja] = useState(null); // null | 'abajo' | 'arriba'
  const contenido = useRef(null);
  const sideRef = useRef(side);
  sideRef.current = side;

  // ¿cabe el globo junto al elemento? si no, pasa a hoja fija
  useLayoutEffect(() => {
    if (!open) { setHoja(null); return undefined; }
    const calc = () => {
      const el = contenido.current;
      const a = anchorRef.current;
      if (!el || !a?.getBoundingClientRect) return;
      const r = a.getBoundingClientRect();
      const necesita = el.offsetHeight + 12 + MARGEN;
      const H = window.innerHeight;
      const cabe = sideRef.current === 'right' || sideRef.current === 'left' || H - r.bottom >= necesita || r.top >= necesita;
      setHoja(cabe ? null : (r.top + r.height / 2 > H / 2 ? 'arriba' : 'abajo'));
    };
    const raf = requestAnimationFrame(calc);
    window.addEventListener('resize', calc);
    window.addEventListener('orientationchange', calc);
    window.addEventListener('scroll', calc, true);
    const ro = typeof ResizeObserver !== 'undefined' && contenido.current ? new ResizeObserver(calc) : null;
    if (ro) ro.observe(contenido.current);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', calc); window.removeEventListener('orientationchange', calc); window.removeEventListener('scroll', calc, true);
      if (ro) ro.disconnect();
    };
  }, [open, anchor, side]);

  // en modo hoja, tocar fuera cierra (como el globo normal)
  useEffect(() => {
    if (!open || !hoja || !cerrarAlTocarFuera) return undefined;
    const fuera = (e) => { if (contenido.current && !contenido.current.contains(e.target)) onOpenChange?.(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [open, hoja, cerrarAlTocarFuera, onOpenChange]);

  // el lado se decide al abrir y se revisa al rotar o cambiar el tamaño
  useLayoutEffect(() => {
    if (!open || lado !== 'auto') return undefined;
    const calc = () => setSide(ladoAuto(anchorRef.current, ancho));
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('orientationchange', calc);
    return () => { window.removeEventListener('resize', calc); window.removeEventListener('orientationchange', calc); };
  }, [open, lado, ancho, anchor]);

  // el elemento señalado tiene que verse: si está fuera de la vista (p. ej.
  // abajo en el menú), se lleva a la vista antes de mostrar el globo
  useEffect(() => {
    if (llevarAVista && open && anchor?.scrollIntoView) anchor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, anchor, llevarAVista]);

  if (!anchor) return null;
  const ancho_ = `min(${ancho}px, calc(100vw - ${MARGEN * 2}px))`;
  const clases = `z-[130] rounded-xl border bg-popover text-popover-foreground shadow-xl outline-none ${className}`;
  if (open && hoja) {
    return createPortal(
      <div ref={contenido} data-testid={testid} data-coachmark="" data-side="hoja" role="dialog"
        onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
        className={`fixed left-1/2 -translate-x-1/2 animate-in fade-in-0 ${clases}`}
        style={{ width: ancho_, ...(hoja === 'abajo'
          ? { bottom: `calc(${MARGEN}px + env(safe-area-inset-bottom))` }
          : { top: `calc(${MARGEN}px + env(safe-area-inset-top))` }) }}>
        {children}
      </div>,
      document.body,
    );
  }
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <PopoverPrimitive.Anchor virtualRef={anchorRef} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side} align="center" sideOffset={12}
          avoidCollisions collisionPadding={MARGEN} sticky="always" hideWhenDetached={false}
          updatePositionStrategy="always"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => { if (!cerrarAlTocarFuera) e.preventDefault(); }}
          onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
          ref={contenido} data-testid={testid} data-coachmark=""
          style={{ width: ancho_ }}
          className={`${clases} data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95`}>
          {children}
          {conFlecha && <PopoverPrimitive.Arrow width={18} height={9} className="fill-popover drop-shadow-sm" />}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
