import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { fechaCorta } from '@/components/CalendarioFecha';

/* Reprogramar un mantenimiento: nueva fecha y hora (cualquier día, aunque
   quede fuera de su ciclo) y motivo opcional. `guardar(body)` recibe
   { fecha, hora, motivo } o { fecha: null } para volver a la fecha del ciclo. */
export default function CambiarFecha({ open, onOpenChange, titulo, detalle, fecha, hora, original, guardar }) {
  const [f, setF] = useState('');
  const [h, setH] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setF(fecha || ''); setH(hora || '08:00'); setMotivo(''); } }, [open, fecha, hora]);

  const enviar = async (body, ok) => {
    setSaving(true);
    try { await guardar(body); toast.success(ok); onOpenChange(false); }
    catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo cambiar la fecha'); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(460px,100%)] max-w-none rounded-[22px]">
        <DialogHeader className="text-left">
          <DialogTitle className="font-heading text-xl">{titulo}</DialogTitle>
          <DialogDescription>
            {detalle}{original ? ` Su fecha del ciclo era el ${fechaCorta(original)}.` : ''} Se mantienen el aviso previo y el plazo; se avisa al responsable.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[1fr_130px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="cf-fecha">Nueva fecha</Label>
            <Input id="cf-fecha" type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-11" data-testid="cf-fecha" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cf-hora">Hora</Label>
            <Input id="cf-hora" type="time" value={h} onChange={(e) => setH(e.target.value)} className="h-11" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-motivo">Motivo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
          <Textarea id="cf-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. el técnico está de vacaciones esa semana" />
        </div>
        <DialogFooter className="gap-2 sm:gap-2 flex-col-reverse sm:flex-row sm:justify-between">
          {original ? (
            <Button variant="ghost" className="rounded-xl" disabled={saving} onClick={() => enviar({ fecha: null, motivo }, 'Vuelve a su fecha del ciclo')}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Volver a la fecha del ciclo
            </Button>
          ) : <span />}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[110px]" disabled={saving || !f} data-testid="cf-guardar"
              onClick={() => enviar({ fecha: f, hora: h, motivo }, 'Fecha cambiada')}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
