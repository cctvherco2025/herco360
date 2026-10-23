import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';

/* "¿Qué día toca?" según la frecuencia, en vez del número de día del ciclo:
   semanal → día de la semana; cada 2 semanas → semana 1 o 2 + día; de meses
   → día del mes (31 = último día); diaria → todos los días; cada N días →
   día del periodo. Por dentro se guarda `dia_ciclo` (1 = primer día del
   ciclo, que empieza en `inicio`) o `dia_mes` (mantenimiento_motor). */
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_CORTO = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lunes primero
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PASO_MESES = { mensual: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };

export const esDeMeses = (frecuencia) => !!PASO_MESES[frecuencia];
const fecha = (s) => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : new Date(); };

// Día del mes que corresponde a una tarea guardada solo con día del ciclo.
export function diaMesDe(d, inicio) {
  if (d.dia_mes) return Number(d.dia_mes);
  const f = fecha(inicio);
  f.setDate(f.getDate() + (Number(d.dia_ciclo) || 1) - 1);
  return f.getDate();
}

const lista = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}` : xs[0] || '');

// En palabras: "cada miércoles", "el 15 de cada mes", "el 10 de ene, abr, jul y oct"…
export function cuandoTexto(d, { frecuencia, inicio, intervalo_dias: intervalo }) {
  const dia = Number(d.dia_ciclo) || 1;
  if (frecuencia === 'diaria') return 'todos los días';
  if (frecuencia === 'semanal' || frecuencia === 'quincenal') {
    const wd = DIAS[(fecha(inicio).getDay() + dia - 1) % 7];
    return frecuencia === 'semanal' ? `cada ${wd}` : `cada 2 semanas, el ${wd}${dia > 7 ? ' de la 2.ª semana' : ' de la 1.ª semana'}`;
  }
  if (esDeMeses(frecuencia)) {
    const dm = diaMesDe(d, inicio);
    const nombre = dm >= 31 ? 'el último día' : `el ${dm}`;
    const nota = dm >= 29 && dm < 31 ? ' (o el último día si el mes es más corto)' : '';
    const paso = PASO_MESES[frecuencia];
    if (paso === 1) return `${nombre} de cada mes${nota}`;
    // meses en que cae: el primero desde el inicio y luego cada `paso` meses
    const f = fecha(inicio);
    const primero = dm >= f.getDate() || dm >= 31 ? f.getMonth() : (f.getMonth() + 1) % 12;
    if (paso === 12) return `${nombre} de ${MESES[primero]} de cada año${nota}`;
    const meses = Array.from({ length: 12 / paso }, (_, k) => MESES_CORTO[(primero + k * paso) % 12]);
    return `${nombre} de ${lista(meses)}${nota}`;
  }
  return `el día ${dia} de cada periodo de ${intervalo || 'N'} días`;
}

export default function CuandoToca({ value, onChange, frecuencia, inicio, intervalo, compacta }) {
  const h = compacta ? 'h-10' : 'h-11';
  const dia = Number(value.dia_ciclo) || 1;
  const w0 = fecha(inicio).getDay();
  const pista = <p className="text-[11px] text-[#00a5df] font-medium">→ {cuandoTexto(value, { frecuencia, inicio, intervalo_dias: intervalo })}</p>;

  if (frecuencia === 'diaria') {
    return (
      <div className="space-y-1.5">
        <Label>¿Qué día?</Label>
        <div className={`${h} flex items-center rounded-md border border-dashed px-3 text-sm text-muted-foreground`}>Todos los días</div>
      </div>
    );
  }

  if (frecuencia === 'semanal' || frecuencia === 'quincenal') {
    const semana = dia > 7 ? 2 : 1;
    const wd = (w0 + dia - 1) % 7;
    const elegir = (nuevoWd, nuevaSemana = semana) => onChange({ ...value, dia_mes: null, dia_ciclo: (nuevaSemana - 1) * 7 + ((nuevoWd - w0 + 7) % 7) + 1 });
    return (
      <div className={`space-y-1.5 ${compacta ? '' : 'sm:col-span-2'}`}>
        <Label>¿Qué día?</Label>
        <div className="flex flex-wrap gap-2">
          {frecuencia === 'quincenal' && (
            <NativeSelect value={String(semana)} onChange={(v) => elegir(wd, Number(v))} className={`${h} w-[130px]`} aria-label="Semana">
              <option value="1">1.ª semana</option>
              <option value="2">2.ª semana</option>
            </NativeSelect>
          )}
          {compacta ? (
            <NativeSelect value={String(wd)} onChange={(v) => elegir(Number(v))} className={`${h} w-[140px]`} aria-label="Día de la semana">
              {ORDEN.map((k) => <option key={k} value={k}>{DIAS[k][0].toUpperCase() + DIAS[k].slice(1)}</option>)}
            </NativeSelect>
          ) : (
            <div className="flex gap-1" role="radiogroup" aria-label="Día de la semana">
              {ORDEN.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={wd === k} aria-label={DIAS[k]} onClick={() => elegir(k)}
                  className={`h-11 w-10 rounded-lg border text-sm font-semibold transition-colors ${wd === k ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}>
                  {DIAS_CORTO[k]}
                </button>
              ))}
            </div>
          )}
        </div>
        {pista}
      </div>
    );
  }

  if (esDeMeses(frecuencia)) {
    const dm = diaMesDe(value, inicio);
    return (
      <div className="space-y-1.5">
        <Label>¿Qué día del mes?</Label>
        <NativeSelect value={String(dm)} onChange={(v) => onChange({ ...value, dia_mes: Number(v), dia_ciclo: 1 })} className={h} aria-label="Día del mes">
          {Array.from({ length: 30 }, (_, k) => <option key={k + 1} value={k + 1}>{k + 1}</option>)}
          <option value="31">Último día del mes</option>
        </NativeSelect>
        {pista}
      </div>
    );
  }

  // cada N días
  return (
    <div className="space-y-1.5">
      <Label>¿Qué día del periodo?</Label>
      <Input type="number" min="1" max={intervalo || undefined} inputMode="numeric" value={value.dia_ciclo}
        onChange={(e) => onChange({ ...value, dia_mes: null, dia_ciclo: e.target.value })} className={h} />
      {pista}
    </div>
  );
}
