import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Check, ChevronDown, Search, ImageOff } from 'lucide-react';
import api from '@/lib/api';
import { fmtHora } from '@/lib/time';
import { fechaCorta } from '@/components/CalendarioFecha';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export const FRECUENCIAS = {
  diaria: 'Diaria', semanal: 'Semanal', quincenal: 'Cada 2 semanas', mensual: 'Mensual', bimestral: 'Cada 2 meses',
  trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', cada_n_dias: 'Cada N días',
};
export const frecuenciaTexto = (p) => (p.frecuencia === 'cada_n_dias' ? `Cada ${p.intervalo_dias} días` : FRECUENCIAS[p.frecuencia] || p.frecuencia);

export const TIPOS_ITEM = {
  estado: 'Bien / Falla / No aplica', unica: 'Selección única', multiple: 'Selección múltiple', check: 'Casilla (check)',
  numero: 'Número', texto: 'Texto', foto: 'Foto',
};
export const MODOS_FOTOS = { no: 'Sin fotos', opcional: 'Fotos opcionales', obligatoria: 'Foto obligatoria' };
export const ANTES = '__antes';
export const DESPUES = '__despues';

// Fotos de una pregunta (mismo criterio que mantenimiento._modo_fotos).
export const modoFotos = (it) => (it.tipo === 'foto' ? 'obligatoria'
  : it.fotos || (it.tipo === 'estado' || it.tipo === 'numero' ? 'opcional' : 'no'));

// ¿La respuesta reporta una falla? (Falla, o una opción marcada como falla)
export function esFalla(it, valor) {
  if (it.tipo === 'estado') return valor === 'falla';
  const fallas = (it.opciones || []).filter((o) => o.falla).map((o) => o.texto);
  if (it.tipo === 'unica') return fallas.includes(valor);
  if (it.tipo === 'multiple') return (valor || []).some((v) => fallas.includes(v));
  return false;
}

// Qué ve la persona en el menú (GET /mantenimiento/acceso).
export function useMantAcceso() {
  const [acceso, setAcceso] = useState(null);
  useEffect(() => {
    api.get('/mantenimiento/acceso').then(({ data }) => setAcceso(data)).catch(() => setAcceso({}));
  }, []);
  return acceso;
}

// 'YYYY-MM-DDTHH:MM' → "jue 23 oct 2026 · 9:00 a. m."
export function fechaHora(s) {
  if (!s) return '—';
  return `${fechaCorta(s.slice(0, 10))} · ${fmtHora(s.slice(11, 16))}`;
}

const TAREA_EST = {
  programada: { label: 'Programada', cls: 'bg-muted text-muted-foreground' },
  pendiente: { label: 'Pendiente', cls: 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]' },
  vencida: { label: 'Vencida', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' },
  completada: { label: 'Completada', cls: 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' },
  tardia: { label: 'Completada tarde', cls: 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]' },
  incompleta: { label: 'Incompleta', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' },
  cancelada: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground line-through' },
};

// Estado que se muestra: una pendiente que pasó su plazo se ve "Vencida".
export function estadoVisible(t, ahora) {
  if (t.estado === 'pendiente' && ahora && t.vence_en <= ahora) return 'vencida';
  if (t.estado === 'completada' && t.tardia) return 'tardia';
  return t.estado;
}

export function EstadoTarea({ tarea, ahora }) {
  const e = TAREA_EST[estadoVisible(tarea, ahora)] || TAREA_EST.programada;
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}

const PLAN_EST = {
  borrador: { label: 'Borrador', cls: 'bg-muted text-muted-foreground' },
  activa: { label: 'Activa', cls: 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' },
  pausada: { label: 'Pausada', cls: 'bg-[rgba(236,144,50,0.14)] text-[#ec9032]' },
  finalizada: { label: 'Terminada', cls: 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]' },
  archivada: { label: 'Archivada', cls: 'bg-muted text-muted-foreground' },
};
export function EstadoPlan({ estado }) {
  const e = PLAN_EST[estado] || PLAN_EST.borrador;
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}

const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* Lista con buscador (desplegable propio, mismo estilo que el resto de la app):
   opciones [{ id, label, sub }]. */
export function Buscador({ value, onChange, opciones, placeholder = 'Elegir…', vacio = 'Nada coincide', id, className = '', disabled, testid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const sel = opciones.find((o) => o.id === value);
  const lista = useMemo(() => {
    const t = sinAcentos(q.trim());
    return t ? opciones.filter((o) => sinAcentos(`${o.label} ${o.sub || ''}`).includes(t)) : opciones;
  }, [opciones, q]);
  useEffect(() => { if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id={id} disabled={disabled} data-testid={testid}
          className={`flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-sm text-left disabled:opacity-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}>
          <span className={`truncate ${sel ? '' : 'text-muted-foreground'}`}>{sel ? sel.label : placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-xl border bg-popover shadow-lg">
        <div className="relative border-b">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…"
            className="h-10 w-full bg-transparent pl-9 pr-3 text-sm outline-none" />
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1" role="listbox">
          {!lista.length && <p className="px-3 py-2.5 text-sm text-muted-foreground">{vacio}</p>}
          {lista.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === value}
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${o.id === value
                ? 'bg-[#1e395e] text-white' : 'hover:bg-[rgba(60,190,246,0.1)]'}`}>
              <span className="flex-1 min-w-0">
                <span className="block truncate">{o.label}</span>
                {o.sub && <span className={`block truncate text-[11px] ${o.id === value ? 'text-white/75' : 'text-muted-foreground'}`}>{o.sub}</span>}
              </span>
              {o.id === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Foto de una respuesta de mantenimiento (descarga autenticada).
export function MantFoto({ tareaId, fotoId, className, onClick }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true; let objUrl;
    setSrc(null); setFailed(false);
    api.get(`/mantenimiento/tareas/${tareaId}/foto/${fotoId}`, { responseType: 'blob' }).then((res) => {
      if (!active) return;
      objUrl = URL.createObjectURL(res.data);
      setSrc(objUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [tareaId, fotoId]);
  if (failed) return <div className={`${className} bg-muted grid place-items-center text-muted-foreground`}><ImageOff className="h-5 w-5 opacity-60" /></div>;
  if (!src) return <div className={`${className} bg-muted animate-pulse`} />;
  return <img src={src} alt="Evidencia" className={className} onClick={onClick} />;
}

// Tarjeta de tarea para listas (Mis mantenimientos, ficha del activo, plan).
export function TareaFila({ t, ahora, onClick, mostrarPlan = true }) {
  return (
    <button type="button" onClick={onClick} data-testid="mant-tarea-fila"
      className="w-full text-left rounded-[18px] border bg-card shadow-card p-4 flex items-start gap-3 hover:border-[#00a5df]/50 active:scale-[0.99] transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[11px] font-semibold text-muted-foreground">{t.numero}</span>
          <EstadoTarea tarea={t} ahora={ahora} />
          {t.tiene_falla && <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-[rgba(220,38,38,0.1)] text-[#dc2626]">{t.fallas} falla{t.fallas === 1 ? '' : 's'}</span>}
        </div>
        <p className="font-medium mt-1 truncate">{t.checklist_nombre}</p>
        <p className="text-xs text-muted-foreground truncate">
          {t.activo_codigo} · {t.activo_nombre} · {t.sucursal}{t.ubicacion ? ` · ${t.ubicacion}` : ''}
        </p>
        {mostrarPlan && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{t.plan_numero} · {t.plan_nombre}</p>}
        {t.responsable_nombre && <p className="text-[11px] text-muted-foreground truncate mt-0.5">Responsable: <span className="font-medium text-foreground">{t.responsable_nombre}</span></p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-[11px] text-muted-foreground">{t.estado === 'completada' ? 'Hecha' : t.estado === 'programada' ? 'Disponible' : 'Vence'}</p>
        <p className="text-xs font-medium whitespace-nowrap">
          {fechaHora(t.estado === 'completada' ? t.completada_en : t.estado === 'programada' ? t.disponible_desde : t.vence_en)}
        </p>
      </div>
    </button>
  );
}
