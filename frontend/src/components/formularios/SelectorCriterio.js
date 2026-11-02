import React, { useEffect, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import api from '@/lib/api';

/* Elegir gente por cargo, área, sucursal, grupo o persona, de la Jerarquía del
   departamento del formulario. Lo usan las pestañas Asignaciones, Supervisión
   y Permisos. Un criterio es { todos, cargos, areas, sucursales, grupos, personas }:
   cargo, área y sucursal se cruzan; grupos y personas se suman (el servidor resuelve). */

export const TABS_CRITERIO = [['cargos', 'Cargos'], ['areas', 'Áreas'], ['sucursales', 'Sucursales'], ['grupos', 'Grupos'], ['personas', 'Personas']];
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function useOpcionesCriterio(formId) {
  const [opciones, setOpciones] = useState(null);
  useEffect(() => {
    let vivo = true;
    api.get(`/formularios-v2/${formId}/opciones-criterio`).then(({ data }) => vivo && setOpciones(data))
      .catch(() => vivo && setOpciones({ cargos: [], areas: [], sucursales: [], grupos: [], personas: [] }));
    return () => { vivo = false; };
  }, [formId]);
  return opciones;
}

const lista = (nombres, y) => (nombres.length < 2 ? (nombres[0] || '') : `${nombres.slice(0, -1).join(', ')} ${y} ${nombres[nombres.length - 1]}`);

// Los nombres de lo elegido, para mostrarlo en chips o en una frase.
export function nombresDe(c, opciones, clave) {
  const por = Object.fromEntries((opciones?.[clave] || []).map((o) => [o.id, o.nombre]));
  return (c?.[clave] || []).map((id) => por[id]).filter(Boolean);
}

export function describirCriterio(c, opciones) {
  if (c.todos) return 'Todo el departamento';
  const n = (k) => nombresDe(c, opciones, k);
  const base = [lista(n('cargos'), 'o'), lista(n('areas'), 'o'), n('sucursales').length ? `de ${lista(n('sucursales'), 'y')}` : ''].filter(Boolean).join(' ');
  const sumados = [...n('grupos'), ...(c.personas?.length ? [`${c.personas.length} ${c.personas.length === 1 ? 'persona' : 'personas'}`] : [])];
  if (!base) return sumados.join(' y ');
  return sumados.length ? `${base} · más ${sumados.join(' y ')}` : base;
}

export default function SelectorCriterio({ criterio, onCambio, opciones, tabs = TABS_CRITERIO, tope = 'max-h-[148px]' }) {
  const [tab, setTab] = useState(tabs[0][0]);
  const [q, setQ] = useState('');
  if (!opciones) return <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>;
  const todas = opciones[tab] || [];
  const filtro = sinAcentos(q.trim());
  const visibles = todas.filter((o) => !filtro || sinAcentos(`${o.nombre} ${o.detalle || ''}`).includes(filtro));
  const sel = criterio[tab] || [];
  const marcar = (id) => onCambio({ ...criterio, [tab]: sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id] }, `criterio.${tab}`);
  return (
    <div className="flex flex-col gap-2.5">
      <div role="tablist" aria-label="Elegir por" className="flex flex-wrap gap-0.5 p-[3px] bg-muted rounded-[10px]">
        {tabs.map(([k, n]) => {
          const cuantos = (criterio[k] || []).length;
          return (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setQ(''); }}
              className={`flex-1 min-h-[32px] px-2 rounded-lg text-xs whitespace-nowrap ${tab === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>
              {n}{cuantos > 0 ? ` · ${cuantos}` : ''}
            </button>
          );
        })}
      </div>
      {todas.length > 10 && (
        <label className="flex items-center gap-2 h-9 px-2.5 border rounded-lg text-muted-foreground">
          <Search className="h-4 w-4 shrink-0" />
          <input aria-label="Buscar" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="border-0 outline-none flex-1 min-w-0 bg-transparent text-sm text-foreground" />
        </label>
      )}
      <div className={`flex flex-wrap gap-1.5 overflow-y-auto ${tope}`}>
        {visibles.map((o) => {
          const on = sel.includes(o.id);
          return (
            <button key={o.id} type="button" aria-pressed={on} onClick={() => marcar(o.id)} title={o.detalle || undefined}
              className={`min-h-[34px] px-2.5 rounded-full text-xs text-left ${on ? 'border-2 border-[#1e395e] bg-[#e8eef7] text-[#1e395e] font-semibold dark:border-[#3cbef6] dark:bg-[rgba(60,190,246,0.14)] dark:text-[#3cbef6]' : 'border hover:bg-muted'}`}>
              {on ? '✓ ' : ''}{o.nombre}
            </button>
          );
        })}
        {!visibles.length && <p className="text-xs text-muted-foreground py-1">{todas.length ? 'Sin coincidencias' : 'No hay opciones en este departamento'}</p>}
      </div>
    </div>
  );
}
