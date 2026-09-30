import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

const TITULOS = {
  guardar: 'Guardar actividad que se repite',
  eliminar: 'Eliminar actividad que se repite',
  mover: 'Mover actividad que se repite',
};
const OPCIONES = [
  { value: 'esta', label: 'Solo esta actividad' },
  { value: 'siguientes', label: 'Esta y las siguientes' },
  { value: 'todas', label: 'Todas las actividades de la serie' },
];

/* Al guardar, eliminar o mover una actividad que se repite: ¿a qué aplica?
   "Solo esta" se deshabilita cuando cambió la repetición (una regla nueva no
   puede aplicar a una sola fecha). */
export default function AlcanceDialog({ open, onOpenChange, accion = 'guardar', soloEstaDeshabilitada, onAceptar, ocupado }) {
  const [alcance, setAlcance] = useState('esta');
  useEffect(() => {
    if (open) setAlcance(soloEstaDeshabilitada ? 'siguientes' : 'esta');
  }, [open, soloEstaDeshabilitada]);
  const eliminar = accion === 'eliminar';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[380px] rounded-[22px] p-0 overflow-hidden" data-testid="alcance-dialog">
        <DialogHeader className="px-6 pt-6 pb-1">
          <DialogTitle className="font-heading text-lg">{TITULOS[accion]}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2">
          <RadioGroup value={alcance} onValueChange={setAlcance} className="gap-3 py-2">
            {OPCIONES.map((o) => {
              const off = o.value === 'esta' && soloEstaDeshabilitada;
              return (
                <label key={o.value}
                  className={`flex items-center gap-2.5 text-sm ${off ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <RadioGroupItem value={o.value} disabled={off} data-testid={`alcance-${o.value}`} />
                  {o.label}
                </label>
              );
            })}
          </RadioGroup>
          {soloEstaDeshabilitada && (
            <p className="text-xs text-muted-foreground">Cambiaste la repetición: aplica a esta y las siguientes o a todas.</p>
          )}
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={() => onAceptar(alcance)} disabled={ocupado} data-testid="alcance-aceptar"
            className={`rounded-xl text-white ${eliminar ? 'bg-[#dc2626] hover:bg-[#b91c1c]' : 'bg-[#1e395e] hover:bg-[#162c49]'}`}>
            {eliminar ? 'Eliminar' : 'Aceptar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
