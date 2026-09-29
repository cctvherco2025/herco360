// Aviso único para activar las notificaciones push, UNA VEZ POR DISPOSITIVO.
//
// Las suscripciones push son por dispositivo (activarlas en la computadora no
// hace que lleguen al celular), así que el "ya lo vio" se guarda en el
// localStorage de ese dispositivo:
//   - Aparece solo si en este dispositivo no están activadas todavía.
//   - "Activar" o "Ahora no" (o cerrarlo) => no vuelve a aparecer aquí.
//   - Si ya están activadas, o el navegador las bloqueó (la app no puede volver
//     a pedir permiso), no aparece.
//   - iPhone/iPad sin la app instalada: iOS no permite push en Safari, así que
//     en su lugar se explica cómo instalarla (también una sola vez).
// El interruptor de Configuración sigue disponible para cambiar de opinión.
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BellRing, Share, PlusSquare } from 'lucide-react';
import { pushSupported, getPushState, enablePush } from '@/lib/push';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'herco360_push_prompt_visto';
const SHOW_DELAY_MS = 1500; // que no salte encima de la pantalla mientras carga

function yaVisto() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
}
function marcarVisto() {
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* sin almacenamiento: puede volver a salir */ }
}

function esIOS() {
  const ua = navigator.userAgent || '';
  // iPadOS se presenta como Mac con pantalla táctil
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}
function appInstalada() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Qué mostrar en este dispositivo: null (nada) | 'activar' | 'instalar-ios'
export async function decidirModo() {
  if (yaVisto()) return null;
  if (esIOS() && !appInstalada()) return 'instalar-ios';
  if (!pushSupported()) return null;
  let estado;
  try { estado = await getPushState(); } catch (e) { return null; }
  if (estado === 'granted-on') { marcarVisto(); return null; } // ya las tiene: nunca mostrar
  if (estado === 'default' || estado === 'granted-off') return 'activar';
  return null; // 'denied': la app ya no puede pedir permiso
}

export default function PushPrompt() {
  const [modo, setModo] = useState(null); // null | 'activar' | 'instalar-ios'
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      const m = await decidirModo();
      if (!cancelado && m) setModo(m);
    }, SHOW_DELAY_MS);
    return () => { cancelado = true; clearTimeout(t); };
  }, []);

  const cerrar = () => { marcarVisto(); setModo(null); };

  const activar = async () => {
    setTrabajando(true);
    try {
      await enablePush();
      toast.success('Notificaciones activadas en este dispositivo');
    } catch (e) {
      if (e?.code === 'denied' || (typeof Notification !== 'undefined' && Notification.permission === 'denied')) {
        toast.error('El navegador bloqueó las notificaciones. Puedes permitirlas en los ajustes del sitio.');
      } else if (e?.code === 'default') {
        toast('No se activaron. Puedes hacerlo cuando quieras en Configuración.');
      } else {
        toast.error('No se pudieron activar. Inténtalo desde Configuración.');
      }
    } finally {
      setTrabajando(false);
      cerrar();
    }
  };

  return (
    <Dialog open={!!modo} onOpenChange={(o) => { if (!o && !trabajando) cerrar(); }}>
      <DialogContent className="sm:max-w-[420px] rounded-[22px]" data-testid="push-prompt">
        {modo === 'activar' && (
          <>
            <DialogHeader>
              <span className="h-12 w-12 rounded-full grid place-items-center bg-[rgba(0,165,223,0.14)] mb-1 mx-auto sm:mx-0">
                <BellRing className="h-6 w-6 text-[#00a5df]" />
              </span>
              <DialogTitle className="font-heading">Activa las notificaciones</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-1">
              Recibe en este dispositivo los recordatorios de tus actividades, invitaciones, reservas de sala y
              aprobaciones — aunque no tengas la app abierta.
            </p>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" className="rounded-xl" onClick={cerrar} disabled={trabajando} data-testid="push-prompt-later">
                Ahora no
              </Button>
              <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={activar} disabled={trabajando} data-testid="push-prompt-enable">
                <BellRing className="h-4 w-4 mr-1.5" /> {trabajando ? 'Activando…' : 'Activar'}
              </Button>
            </DialogFooter>
          </>
        )}

        {modo === 'instalar-ios' && (
          <>
            <DialogHeader>
              <span className="h-12 w-12 rounded-full grid place-items-center bg-[rgba(0,165,223,0.14)] mb-1 mx-auto sm:mx-0">
                <BellRing className="h-6 w-6 text-[#00a5df]" />
              </span>
              <DialogTitle className="font-heading">Instala HERCO360 para recibir notificaciones</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground -mt-1">
              En iPhone las notificaciones solo funcionan con la app instalada en tu pantalla de inicio:
            </p>
            <ol className="text-sm space-y-2">
              <li className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">1</span>
                Toca <Share className="h-4 w-4 text-[#00a5df] shrink-0" /> <b>Compartir</b> en Safari.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">2</span>
                Elige <PlusSquare className="h-4 w-4 text-[#00a5df] shrink-0" /> <b>Agregar a inicio</b>.
              </li>
              <li className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">3</span>
                Abre HERCO360 desde el ícono y activa las notificaciones.
              </li>
            </ol>
            <DialogFooter>
              <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" onClick={cerrar} data-testid="push-prompt-ios-ok">
                Entendido
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
