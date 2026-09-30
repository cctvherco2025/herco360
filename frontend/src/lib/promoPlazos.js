// Plazos de Promociones del mes. El servidor los guarda como hora local de
// Honduras sin zona ("2026-10-08T17:00:00"); el navegador la lee como local.
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function parse(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "jue 8 oct · 17:00"
export function fechaPlazo(s) {
  const d = parse(s);
  if (!d) return '';
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// { texto: 'vence en 5 h' | 'vence jue 8 oct · 17:00' | 'venció', vencido, pronto }
export function faltaPara(s) {
  const d = parse(s);
  if (!d) return null;
  const horas = (d.getTime() - Date.now()) / 3600000;
  if (horas <= 0) return { texto: `venció ${fechaPlazo(s)}`, vencido: true, pronto: false };
  const texto = horas < 1 ? `vence en ${Math.max(1, Math.round(horas * 60))} min`
    : horas < 24 ? `vence en ${Math.round(horas)} h` : `vence ${fechaPlazo(s)}`;
  return { texto, vencido: false, pronto: horas <= 4 };
}

// Texto corto con color según la urgencia.
export function PlazoChip({ vence, prefijo = '' }) {
  const f = faltaPara(vence);
  if (!f) return null;
  const cls = f.vencido ? 'text-[#dc2626]' : f.pronto ? 'text-[#b45309] dark:text-[#fbbf24]' : 'text-muted-foreground';
  return <span className={`text-xs font-medium ${cls}`} data-testid="plazo-chip">{prefijo}{f.texto}</span>;
}

export const PLAZOS_CAMPOS = [
  { key: 'responder_dias', label: 'Días para contestar', ayuda: 'Desde que se publica el mes' },
  { key: 'revisar_dias', label: 'Días para revisar', ayuda: 'Desde que se contesta; también para validar un ticket corregido' },
  { key: 'corregir_horas', label: 'Horas para corregir un ticket', ayuda: 'Desde que se abre o se reabre' },
  { key: 'recordar_horas', label: 'Recordar antes de vencer (horas)', ayuda: 'Aviso a quien le toca actuar' },
];
