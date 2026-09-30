import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DIAS_SEMANA, ORDINALES, datosFecha, leerRegla, construirRegla, reglaMensualDia, reglaAnual,
  describirRegla, proximasFechas, fechaLarga,
} from '@/lib/recurrence';

const UNIDADES = [
  { value: 'DAILY', uno: 'día', varios: 'días' },
  { value: 'WEEKLY', uno: 'semana', varios: 'semanas' },
  { value: 'MONTHLY', uno: 'mes', varios: 'meses' },
  { value: 'YEARLY', uno: 'año', varios: 'años' },
];

// Al tocar un número se selecciona completo: escribir lo reemplaza (si no,
// tocar el "1" y escribir "2" deja "12").
const seleccionar = (e) => e.target.select();

const sumarMeses = (fecha, n) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const f = new Date(y, m - 1 + n, Math.min(d, 28));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

// Estado del formulario a partir de la regla actual (o de la fecha si no hay).
function estadoInicial(regla, fecha) {
  const { wd, nth } = datosFecha(fecha);
  const o = regla ? leerRegla(regla) : null;
  return {
    freq: o?.freq || 'WEEKLY',
    interval: o?.interval || 1,
    dias: o?.freq === 'WEEKLY' && o.byday.length ? o.byday : [wd],
    modoMes: o?.freq === 'MONTHLY' && o.byday.length ? 'nth' : 'dia',
    nth: o?.freq === 'MONTHLY' && o.byday.length ? String(o.bysetpos || 1) : String(nth <= 4 ? nth : -1),
    nthDia: o?.freq === 'MONTHLY' && o.byday.length ? o.byday[0] : wd,
    fin: o?.count ? 'veces' : o?.until ? 'fecha' : 'nunca',
    hasta: o?.until || sumarMeses(fecha, 3),
    veces: o?.count || 10,
  };
}

/* "Personalizado…": repetir cada N días/semanas/meses/años, días de la
   semana, día del mes o N-ésimo día de la semana, y cuándo termina. Abajo el
   resumen y las próximas 4 fechas. "Listo" devuelve la regla RRULE. */
export default function RecurrenceDialog({ open, onOpenChange, regla, fecha, horaInicio, onListo }) {
  const [s, setS] = useState(() => estadoInicial(regla, fecha));
  useEffect(() => { if (open) setS(estadoInicial(regla, fecha)); }, [open, regla, fecha]);
  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const { d } = datosFecha(fecha);
  const intervalo = Math.max(1, Math.min(99, Number(s.interval) || 1));
  const veces = Math.max(1, Math.min(500, Number(s.veces) || 1));
  const finInvalido = s.fin === 'fecha' && (!s.hasta || s.hasta < fecha);

  const nueva = useMemo(() => {
    let base;
    if (s.freq === 'DAILY') base = { freq: 'DAILY' };
    else if (s.freq === 'WEEKLY') base = { freq: 'WEEKLY', byday: DIAS_SEMANA.map((x) => x.code).filter((c) => s.dias.includes(c)) };
    else if (s.freq === 'MONTHLY') base = s.modoMes === 'nth'
      ? { freq: 'MONTHLY', byday: [s.nthDia], bysetpos: Number(s.nth) }
      : reglaMensualDia(fecha);
    else base = reglaAnual(fecha);
    return construirRegla({
      ...base, interval: intervalo,
      count: s.fin === 'veces' ? veces : null,
      until: s.fin === 'fecha' ? s.hasta : null,
    });
  }, [s, fecha, intervalo, veces]);

  const proximas = useMemo(() => proximasFechas(nueva, fecha, horaInicio, 4), [nueva, fecha, horaInicio]);
  const toggleDia = (code) => set('dias', s.dias.includes(code)
    ? (s.dias.length > 1 ? s.dias.filter((c) => c !== code) : s.dias) // al menos uno
    : [...s.dias, code]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-[22px] p-0 overflow-hidden max-h-[92vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="font-heading text-lg">Repetición personalizada</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2 space-y-4">
          <div className="space-y-1.5">
            <Label>Repetir cada</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} max={99} value={s.interval} onChange={(e) => set('interval', e.target.value)}
                onFocus={seleccionar} onClick={seleccionar}
                className="h-11 w-20" data-testid="recurrence-interval" />
              <Select value={s.freq} onValueChange={(v) => set('freq', v)}>
                <SelectTrigger className="h-11 flex-1" data-testid="recurrence-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNIDADES.map((u) => <SelectItem key={u.value} value={u.value}>{intervalo === 1 ? u.uno : u.varios}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {s.freq === 'WEEKLY' && (
            <div className="flex justify-between gap-1" data-testid="recurrence-weekdays">
              {DIAS_SEMANA.map((x) => {
                const on = s.dias.includes(x.code);
                return (
                  <button key={x.code} type="button" title={x.nombre} onClick={() => toggleDia(x.code)}
                    className={`h-9 w-9 rounded-full text-xs font-semibold transition-colors ${
                      on ? 'bg-[#00a5df] text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70'}`}>
                    {x.corto}
                  </button>
                );
              })}
            </div>
          )}

          {s.freq === 'MONTHLY' && (
            <RadioGroup value={s.modoMes} onValueChange={(v) => set('modoMes', v)} className="gap-3">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                <RadioGroupItem value="dia" /> El día {d} de cada mes
              </label>
              <div className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="nth" id="rec-nth" />
                <label htmlFor="rec-nth" className="cursor-pointer">El</label>
                <Select value={s.nth} onValueChange={(v) => { set('nth', v); set('modoMes', 'nth'); }}>
                  <SelectTrigger className="h-9 w-[104px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['1', '2', '3', '4', '-1'].map((k) => <SelectItem key={k} value={k}>{ORDINALES[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={s.nthDia} onValueChange={(v) => { set('nthDia', v); set('modoMes', 'nth'); }}>
                  <SelectTrigger className="h-9 w-[116px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIAS_SEMANA.map((x) => <SelectItem key={x.code} value={x.code}>{x.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">del mes</span>
              </div>
            </RadioGroup>
          )}

          <div className="space-y-1.5">
            <Label>Termina</Label>
            <RadioGroup value={s.fin} onValueChange={(v) => set('fin', v)} className="gap-2.5">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer h-9">
                <RadioGroupItem value="nunca" /> Nunca
              </label>
              <div className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="fecha" id="rec-fin-fecha" />
                <label htmlFor="rec-fin-fecha" className="w-16 cursor-pointer">El</label>
                <Input type="date" value={s.hasta} min={fecha} onChange={(e) => { set('hasta', e.target.value); set('fin', 'fecha'); }}
                  className="h-9 flex-1" data-testid="recurrence-until" />
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                <RadioGroupItem value="veces" id="rec-fin-veces" />
                <label htmlFor="rec-fin-veces" className="w-16 cursor-pointer">Después de</label>
                <Input type="number" min={1} max={500} value={s.veces} onChange={(e) => { set('veces', e.target.value); set('fin', 'veces'); }}
                  onFocus={seleccionar} onClick={seleccionar}
                  className="h-9 w-20" data-testid="recurrence-count" />
                <span className="text-muted-foreground">{veces === 1 ? 'vez' : 'veces'}</span>
              </div>
            </RadioGroup>
            {finInvalido && <p className="text-xs text-[#dc2626]">La fecha de fin no puede ser antes del inicio</p>}
          </div>

          <div className="border-t pt-3 pb-1" data-testid="recurrence-summary">
            <p className="text-sm font-semibold">Se repite {describirRegla(nueva)}</p>
            {proximas.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">{proximas.map(fechaLarga).join(' · ')}</p>
            )}
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
          <Button onClick={() => onListo(nueva)} disabled={finInvalido || !proximas.length}
            className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" data-testid="recurrence-done">
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
