import React from 'react';
import { createPortal } from 'react-dom';
import * as AD from '@radix-ui/react-alert-dialog';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { Trash2, Info, Loader2, Check } from 'lucide-react';
import useEsMovil from '@/lib/useEsMovil';

/* ── Confirmaciones y avisos propios (reemplazan confirm() / alert()) ──────
   Uso, en cualquier parte:

     const ok = await confirmar({
       tipo: 'danger',                       // 'danger' | 'normal'
       titulo: '¿Eliminar formulario?',
       mensaje: <>Se eliminará <b>{nombre}</b>. No se puede deshacer.</>,
       textoConfirmar: 'Eliminar',
       textoCancelar: 'Cancelar',            // opcional
       textoCargando: 'Eliminando…',         // opcional
       textoExito: 'Formulario eliminado',   // opcional: aviso al terminar
       accion: () => api.delete(...),        // opcional
       opciones: [{ valor, etiqueta, deshabilitada }], // opcional: elegir una
     });

   Devuelve true (o el valor de la opción elegida) si se confirmó y la acción
   terminó bien; false si se canceló. Con `accion`, el diálogo espera a que
   termine: si falla, muestra el error adentro y se puede reintentar.

   PC (≥ 768 px): modal centrado. Celular: hoja que sube desde abajo.
   Se monta una sola vez <ConfirmProvider /> (en App.js). */

let abrirGlobal = null;
let avisarGlobal = null;

// Último botón/enlace tocado: al cerrar, el foco vuelve ahí (un clic no
// siempre enfoca el botón, p. ej. en Safari de iPhone).
let ultimoTocado = null;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    ultimoTocado = e.target?.closest?.('button, a, [role=button], [role=menuitem], [tabindex]') || null;
  }, true);
}

export function confirmar(opts) {
  if (!abrirGlobal) {
    // eslint-disable-next-line no-console
    console.warn('confirmar(): falta <ConfirmProvider /> en App.js');
    return Promise.resolve(false);
  }
  return abrirGlobal(opts || {});
}

// Aviso breve abajo al centro (azul marino con check, 2 segundos).
export function avisar(texto) {
  avisarGlobal?.(texto);
}

const mensajeError = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string') return d;
  return e?.message && !/status code/i.test(e.message) ? e.message : 'No se pudo completar la acción. Intenta de nuevo.';
};

function Avisos() {
  const [avisos, setAvisos] = React.useState([]);
  React.useEffect(() => {
    avisarGlobal = (texto) => {
      const id = Math.random().toString(36).slice(2);
      setAvisos((a) => [...a, { id, texto }]);
      setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), 2000);
    };
    return () => { avisarGlobal = null; };
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }} aria-live="polite">
      <AnimatePresence>
        {avisos.map((a) => (
          <motion.div key={a.id} role="status"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.18 }}
            className="flex max-w-[420px] items-center gap-2 rounded-full bg-[#1e395e] px-4 py-2.5 text-sm font-medium text-white shadow-lg"
            data-testid="aviso-toast">
            <Check className="h-4 w-4 shrink-0" strokeWidth={3} />
            <span>{a.texto}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

export function ConfirmProvider() {
  const [req, setReq] = React.useState(null); // { opts, resolve }
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState('');
  const [eleccion, setEleccion] = React.useState(null);
  const ultimo = React.useRef(null); // opciones del último diálogo (para la animación de salida)
  const esMovil = useEsMovil();
  const arrastre = useDragControls();
  const disparador = React.useRef(null); // elemento que abrió el diálogo

  React.useEffect(() => {
    abrirGlobal = (opts) => new Promise((resolve) => {
      const activo = document.activeElement;
      disparador.current = activo && activo !== document.body ? activo : ultimoTocado;
      setError('');
      setCargando(false);
      setEleccion(opts.opciones ? (opts.opciones.find((o) => !o.deshabilitada) || {}).valor ?? null : null);
      setReq((prev) => { prev?.resolve(false); return { opts, resolve }; });
    });
    return () => { abrirGlobal = null; };
  }, []);

  if (req) ultimo.current = req.opts;
  const o = req?.opts || ultimo.current || {};
  const peligro = o.tipo === 'danger';

  const terminar = (valor) => {
    req?.resolve(valor);
    setReq(null);
  };
  const cancelar = () => { if (!cargando) terminar(false); };
  const aceptar = async () => {
    if (!req || cargando) return;
    const valor = o.opciones ? eleccion : true;
    if (!o.accion) { terminar(valor); return; }
    setCargando(true);
    setError('');
    try {
      await o.accion(valor);
      setCargando(false);
      terminar(valor);
      if (o.textoExito) avisar(o.textoExito);
    } catch (e) {
      setCargando(false);
      setError(mensajeError(e));
    }
  };

  const Icono = peligro ? Trash2 : Info;
  const colorAccion = peligro ? 'bg-[#dc2626] hover:bg-[#b91c1c]' : 'bg-[#1e395e] hover:bg-[#162c49]';
  const btnBase = `inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${esMovil ? 'w-full py-[14px]' : 'py-2.5'}`;

  const botonCancelar = (
    <AD.Cancel asChild>
      <button type="button" disabled={cargando} onClick={(e) => { e.preventDefault(); cancelar(); }}
        className={`${btnBase} border border-border bg-card text-foreground hover:bg-muted`} data-testid="confirm-cancelar">
        {o.textoCancelar || 'Cancelar'}
      </button>
    </AD.Cancel>
  );
  const botonAccion = (
    <button type="button" disabled={cargando || (o.opciones && eleccion == null)} onClick={aceptar}
      className={`${btnBase} ${colorAccion} text-white`} data-testid="confirm-aceptar">
      {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
      {cargando ? (o.textoCargando || 'Procesando…') : (o.textoConfirmar || 'Aceptar')}
    </button>
  );

  const contenido = (
    <>
      <div className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-full"
        style={{ background: peligro ? 'rgba(220,38,38,0.12)' : 'rgba(0,165,223,0.14)' }}>
        <Icono className="h-6 w-6" style={{ color: peligro ? '#dc2626' : '#00a5df' }} />
      </div>
      <AD.Title className="mt-4 text-[18px] font-bold leading-snug text-foreground">{o.titulo}</AD.Title>
      {o.mensaje ? (
        <AD.Description asChild>
          <div className="mt-2 text-sm leading-[1.5] text-muted-foreground [&_b]:font-semibold [&_b]:text-foreground">{o.mensaje}</div>
        </AD.Description>
      ) : <AD.Description className="sr-only">{o.titulo}</AD.Description>}

      {o.opciones && (
        <div role="radiogroup" className="mt-4 space-y-2 text-left">
          {o.opciones.map((op) => {
            const on = eleccion === op.valor;
            return (
              <button key={op.valor} type="button" role="radio" aria-checked={on} disabled={op.deshabilitada || cargando}
                onClick={() => setEleccion(op.valor)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  on ? 'border-[#1e395e] bg-[rgba(30,57,94,0.06)] dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.08)]' : 'border-border hover:bg-muted/60'}`}
                data-testid={`confirm-opcion-${op.valor}`}>
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-[#1e395e] dark:border-[#3cbef6]' : 'border-muted-foreground/40'}`}>
                  {on && <span className="h-2 w-2 rounded-full bg-[#1e395e] dark:bg-[#3cbef6]" />}
                </span>
                <span className="text-foreground">{op.etiqueta}</span>
              </button>
            );
          })}
          {o.notaOpciones && <p className="px-1 text-xs text-muted-foreground">{o.notaOpciones}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-[rgba(220,38,38,0.08)] px-3 py-2.5 text-sm text-[#dc2626] dark:bg-[rgba(220,38,38,0.15)] dark:text-[#f87171]" data-testid="confirm-error">
          {error}
        </p>
      )}

      {esMovil ? (
        <div className="mt-5 flex flex-col gap-2.5">{botonAccion}{botonCancelar}</div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3">{botonCancelar}{botonAccion}</div>
      )}
    </>
  );

  return (
    <>
      <AD.Root open={!!req} onOpenChange={(abierto) => { if (!abierto) cancelar(); }}>
        <AnimatePresence>
          {req && (
            <AD.Portal forceMount>
              <AD.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-[100] bg-black/50" style={{ backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', pointerEvents: 'auto' }}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  onClick={cancelar} />
              </AD.Overlay>
              <AD.Content asChild forceMount aria-modal="true"
                onEscapeKeyDown={(e) => { e.preventDefault(); cancelar(); }}
                onCloseAutoFocus={(e) => {
                  // vuelve al botón que lo abrió (si sigue en pantalla)
                  const el = disparador.current;
                  if (el?.isConnected && typeof el.focus === 'function') { e.preventDefault(); el.focus({ preventScroll: true }); }
                }}>
                {esMovil ? (
                  <motion.div
                    className="fixed inset-x-0 bottom-0 z-[101] rounded-t-[22px] border-t bg-card px-5 pt-2.5 text-center shadow-2xl outline-none"
                    style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', pointerEvents: 'auto' }}
                    initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                    transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
                    drag={cargando ? false : 'y'} dragListener={false} dragControls={arrastre}
                    dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.8 }}
                    onDragEnd={(e, info) => { if (info.offset.y > 80 || info.velocity.y > 500) cancelar(); }}
                    data-testid="confirm-dialog">
                    {/* barra para arrastrar hacia abajo */}
                    <div className="-mx-5 mb-3 cursor-grab touch-none pb-2 pt-1" onPointerDown={(e) => { if (!cargando) arrastre.start(e); }}>
                      <div className="mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30" />
                    </div>
                    {contenido}
                  </motion.div>
                ) : (
                  <motion.div
                    className="fixed left-0 right-0 top-[50%] z-[101] mx-auto w-[calc(100%-32px)] max-w-[400px] rounded-[18px] border bg-card p-6 text-center shadow-2xl outline-none"
                    style={{ pointerEvents: 'auto', y: '-50%' }}
                    initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    data-testid="confirm-dialog">
                    {contenido}
                  </motion.div>
                )}
              </AD.Content>
            </AD.Portal>
          )}
        </AnimatePresence>
      </AD.Root>
      <Avisos />
    </>
  );
}
