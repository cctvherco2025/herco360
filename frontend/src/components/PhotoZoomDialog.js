// Visor de foto ampliada (evidencias de FLOS, Rutina Operativa y Promociones).
//
// La foto SIEMPRE cabe entera en la pantalla (alto y ancho máximos, sin
// recortar ni deformar) y la X de cerrar va encima de la foto, siempre
// visible. Antes la imagen ocupaba todo el ancho: una foto vertical quedaba
// más alta que la pantalla y la X se perdía con el scroll, sin forma de
// cerrar el visor para seguir viendo las respuestas.
//
// Uso: <PhotoZoomDialog open={!!src} onClose={...}>
//        <img src={src} className={ZOOM_IMG_CLASS} />
//      </PhotoZoomDialog>
import React from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

// Clases para la <img> (o el componente de imagen) dentro del visor.
export const ZOOM_IMG_CLASS = 'block w-auto h-auto max-w-[calc(100vw-1.5rem)] sm:max-w-[min(90vw,900px)] max-h-[85dvh] object-contain rounded-xl';

export default function PhotoZoomDialog({ open, onClose, children }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* El contenido se ajusta al tamaño de la foto: todo lo demás es el
          fondo oscuro, que al tocarlo también cierra. Se oculta la X por
          defecto del diálogo ([&>button]) porque quedaría fuera de la foto. */}
      <DialogContent
        className="w-auto max-w-none p-0 gap-0 border-0 bg-transparent shadow-none [&>button]:hidden"
        data-testid="photo-zoom">
        <DialogTitle className="sr-only">Foto ampliada</DialogTitle>
        <div className="relative min-h-[120px] min-w-[120px] grid place-items-center">
          {children}
          <button type="button" onClick={onClose} aria-label="Cerrar foto"
            className="absolute top-2 right-2 h-10 w-10 rounded-full bg-black/70 text-white grid place-items-center shadow-lg hover:bg-black/85"
            data-testid="photo-zoom-close">
            <X className="h-5 w-5" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
