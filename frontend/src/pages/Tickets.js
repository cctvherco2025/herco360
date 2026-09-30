import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Ticket } from 'lucide-react';
import api from '@/lib/api';
import { timeAgoEs } from '@/lib/time';
import { PlazoChip } from '@/lib/promoPlazos';

export const ESTADO_TICKET = {
  abierto: { label: 'Abierto', cls: 'bg-[rgba(220,38,38,0.1)] text-[#dc2626]' },
  corregido: { label: 'Corregido', cls: 'bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6]' },
  cerrado: { label: 'Cerrado', cls: 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' },
  cancelado: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground' },
};

export function EstadoTicket({ estado }) {
  const e = ESTADO_TICKET[estado] || ESTADO_TICKET.abierto;
  return <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${e.cls}`}>{e.label}</span>;
}

// "Por atender": lo que espera algo de la persona (corregir si lo tiene
// asignado; validar si revisa en esa tienda).
const porAtender = (t) => (t.soy_asignado ? t.estado === 'abierto' : t.estado === 'corregido');
const FILTROS = [
  { key: 'atender', label: 'Por atender', fn: porAtender },
  { key: 'abierto', label: 'Abiertos', fn: (t) => t.estado === 'abierto' },
  { key: 'corregido', label: 'Corregidos', fn: (t) => t.estado === 'corregido' },
  { key: 'cerrado', label: 'Cerrados', fn: (t) => t.estado === 'cerrado' || t.estado === 'cancelado' },
  { key: 'todos', label: 'Todos', fn: () => true },
];

/* Formulario → Tickets: inconsistencias de Promociones del mes. El coordinador
   ve las que tiene asignadas; el jefe y el gerente, las de su tienda. */
export default function Tickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState(null);
  const [filtro, setFiltro] = useState('atender');

  const load = useCallback(async () => {
    try { const { data } = await api.get('/tickets'); setTickets(data); }
    catch (e) { toast.error('No se pudieron cargar los tickets'); setTickets([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const f = FILTROS.find((x) => x.key === filtro);
  const lista = (tickets || []).filter(f.fn);

  return (
    <div className="max-w-[900px] mx-auto pt-2">
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Ticket className="h-7 w-7 text-[#00a5df]" /> Tickets
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Inconsistencias de Promociones del mes: se corrigen en piso y las valida el jefe o el gerente de tienda.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4" role="tablist">
        {FILTROS.map((x) => {
          const n = (tickets || []).filter(x.fn).length;
          return (
            <button key={x.key} type="button" role="tab" aria-selected={filtro === x.key} onClick={() => setFiltro(x.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${filtro === x.key ? 'bg-[#1e395e] text-white border-transparent' : 'bg-card text-muted-foreground hover:text-foreground'}`}
              data-testid={`tickets-filtro-${x.key}`}>
              {x.label}{tickets ? ` · ${n}` : ''}
            </button>
          );
        })}
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="rounded-[18px] bg-card border shadow-card overflow-hidden">
        {tickets === null && <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>}
        {tickets && lista.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12">
            {filtro === 'atender' ? 'No tienes tickets por atender.' : 'Sin tickets en este filtro.'}
          </p>
        )}
        {lista.map((t) => {
          const total = (t.lineas || []).length;
          const hechas = (t.lineas || []).filter((l) => l.corregida).length;
          return (
            <button key={t.id} type="button" onClick={() => navigate(`/formularios/tickets/${t.id}`)}
              className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-4 border-b last:border-0 hover:bg-muted/40 transition-colors"
              data-testid="ticket-row">
              <span className="font-mono text-xs text-muted-foreground w-[88px] shrink-0">{t.numero}</span>
              <span className="flex-1 min-w-[180px]">
                <span className="block text-sm font-medium">{t.titulo}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.origen?.periodo_label ? `Promociones de ${t.origen.periodo_label} · ` : ''}
                  {t.soy_asignado ? 'Asignado a ti' : `Asignado a ${t.asignado_a?.name || '—'}`}
                  {t.reaperturas ? ` · reabierto ${t.reaperturas} vez${t.reaperturas === 1 ? '' : 'es'}` : ''}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{hechas}/{total} corregidas</span>
              {(t.estado === 'abierto' || t.estado === 'corregido') && t.vence && <PlazoChip vence={t.vence} />}
              <EstadoTicket estado={t.estado} />
              <span className="text-xs text-muted-foreground w-[90px] text-right">{timeAgoEs(t.updated_at)}</span>
            </button>
          );
        })}
      </motion.div>
    </div>
  );
}
