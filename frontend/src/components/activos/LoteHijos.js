import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import useEsMovil from '@/lib/useEsMovil';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DIALOG_CLS, CampoDato, usePadres, posicionesLibres, faltaCampo } from '@/components/activos/ActivoForm';

// Por fila van los campos de texto o IP no obligatorios (serie, IP…), hasta 3;
// el resto se llena una vez para todos.
export const camposPorFila = (cat) => cat.campos.filter((c) => !c.obligatorio && (c.tipo === 'texto' || c.tipo === 'ip')).slice(0, 3);

/* Registrar varios activos de una categoría que ocupan posiciones numeradas
   en un mismo activo (p. ej. las cámaras de un NVR, una por canal): una fila
   por posición libre; las filas sin nombre se ignoran. */
export default function LoteHijos({ open, onOpenChange, cat, padreId, onSaved }) {
  const padres = usePadres(cat, open);
  const padre = padres.find((p) => p.id === padreId);
  const libres = posicionesLibres(padre) || [];
  const porFila = cat ? camposPorFila(cat) : [];
  const comunesDef = cat ? cat.campos.filter((c) => !porFila.includes(c)) : [];
  const [comunes, setComunes] = useState({});
  const [filas, setFilas] = useState([]);
  const [saving, setSaving] = useState(false);
  const esMovil = useEsMovil();

  // se reinicia al abrir y cuando llegan las posiciones libres (no en cada render)
  const clave = libres.join(',');
  useEffect(() => {
    if (!open) return;
    setComunes({});
    setFilas(clave ? clave.split(',').map((p) => ({ posicion: Number(p), nombre: '', ubicacion: '', datos: {} })) : []);
  }, [open, clave]);

  const setFila = (i, k, v) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const setFilaDato = (i, k, v) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, datos: { ...f.datos, [k]: v } } : f)));
  const llenas = filas.filter((f) => f.nombre.trim());
  if (!cat) return null;
  const pl = cat.posicion_label;
  // en PC una fila por posición con columnas; en celular, tarjetas de 2 columnas
  const colStyle = esMovil ? undefined : { gridTemplateColumns: `64px 1.4fr 1fr${' 1fr'.repeat(porFila.length)}` };

  const guardar = async () => {
    const falta = faltaCampo({ campos: comunesDef }, comunes);
    if (falta) { toast.error(`Completa: ${falta.etiqueta}`); return; }
    if (!llenas.length) { toast.error(`Escribe ${cat.nombre_label.toLowerCase()} de al menos uno`); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/activos/lote', { categoria_id: cat.id, padre_id: padreId, datos: comunes, items: llenas });
      toast.success(`${data.length} registrado${data.length === 1 ? '' : 's'}: ${data[0].codigo}${data.length > 1 ? ` a ${data[data.length - 1].codigo}` : ''}`);
      onOpenChange(false);
      onSaved?.(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'No se pudieron registrar');
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${DIALOG_CLS} sm:w-[min(860px,100%)]`}>
        <DialogHeader className="px-6 pt-6 pb-2 text-left">
          <DialogTitle className="font-heading text-xl">Agregar {(cat.plural || cat.nombre).toLowerCase()} a {padre?.codigo || '…'}</DialogTitle>
          <DialogDescription>
            Llena {cat.nombre_label.toLowerCase()} de cada {pl.toLowerCase()} que se use; los que dejes vacíos no se registran. Cada uno recibe su código {cat.prefijo}-…
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4 space-y-5">
          {comunesDef.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Iguales para todos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {comunesDef.map((c) => (
                  <CampoDato key={c.clave} campo={c} value={comunes[c.clave]} onChange={(v) => setComunes((x) => ({ ...x, [c.clave]: v }))} />
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Libres · {llenas.length} de {filas.length} con datos
            </p>
            {!filas.length ? (
              <p className="text-sm text-muted-foreground rounded-xl border border-dashed p-4 text-center">
                {padre ? `${padre.codigo} no tiene espacios libres.` : 'Cargando…'}
              </p>
            ) : (
              <div className="rounded-xl border divide-y">
                <div style={colStyle} className={`hidden sm:grid gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted/40`}>
                  <span>{pl}</span><span>{cat.nombre_label}</span><span>{cat.ubicacion_label}</span>
                  {porFila.map((c) => <span key={c.clave} className="truncate">{c.etiqueta}</span>)}
                </div>
                {filas.map((f, i) => (
                  <div key={f.posicion} style={colStyle} className="grid grid-cols-2 gap-2 px-3 py-2.5 items-center" data-testid="lote-fila">
                    <span className="col-span-2 sm:col-span-1 text-sm font-semibold"><span className="sm:hidden">{pl} </span>{f.posicion}</span>
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="sm:sr-only text-xs">{cat.nombre_label}</Label>
                      <Input value={f.nombre} onChange={(e) => setFila(i, 'nombre', e.target.value)} placeholder={cat.nombre_ejemplo || undefined} className="h-10" aria-label={`${cat.nombre_label} ${pl} ${f.posicion}`} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Label className="sm:sr-only text-xs">{cat.ubicacion_label}</Label>
                      <Input value={f.ubicacion} onChange={(e) => setFila(i, 'ubicacion', e.target.value)} placeholder="Opcional" className="h-10" aria-label={`${cat.ubicacion_label} ${pl} ${f.posicion}`} />
                    </div>
                    {porFila.map((c) => (
                      <div key={c.clave}>
                        <Label className="sm:sr-only text-xs">{c.etiqueta}</Label>
                        <Input value={f.datos[c.clave] || ''} onChange={(e) => setFilaDato(i, c.clave, e.target.value)} placeholder="Opcional"
                          inputMode={c.tipo === 'ip' ? 'decimal' : undefined} className="h-10" aria-label={`${c.etiqueta} ${pl} ${f.posicion}`} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2 flex-row justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={guardar} disabled={saving || !llenas.length} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white min-w-[120px]" data-testid="lote-guardar">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Registrar ${llenas.length || ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
