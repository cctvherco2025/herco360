import React, { useEffect, useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { SUCURSALES } from '@/lib/constants';
import { FAMILIA, OPERADORES, NOMBRE_OP, NOMBRE_OP_FECHA, SIN_VALOR, nombreDe, describirCondicion } from '@/lib/formularios';
import { Input } from '@/components/ui/input';

/* Armador de una condición «mostrar solo si…» (preguntas, secciones y pasos).
   `anteriores`: las preguntas que se pueden mirar (las que van antes).
   onCambio(condicion | null, clave) — la clave agrupa los cambios para deshacer. */

const sel = 'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground min-w-0';

export default function EditorCondicion({ condicion, onCambio, anteriores, verbo, formId, porId, frase = 'Se muestra solo si', sinPreguntas = 'No hay preguntas antes para poner una condición.' }) {
  const [listas, setListas] = useState(null);
  const necesitaListas = (condicion?.reglas || []).some((r) => ['colaborador', 'caja'].includes(porId[r.pregunta_id]?.tipo));
  useEffect(() => {
    if (!necesitaListas || listas || !formId) return;
    api.get(`/formularios-v2/${formId}/listas`).then(({ data }) => setListas(data)).catch(() => setListas({ colaboradores: [], cajas: [] }));
  }, [necesitaListas, listas, formId]);

  const reglas = condicion?.reglas || [];
  const set = (c, clave) => onCambio(c, clave);
  const nuevaRegla = () => {
    const p = anteriores[anteriores.length - 1];
    return { pregunta_id: p.id, op: OPERADORES[FAMILIA[p.tipo]][0], valor: valorInicial(p) };
  };
  const cambiarRegla = (i, patch, clave) => set({ ...condicion, reglas: reglas.map((r, j) => (j === i ? { ...r, ...patch } : r)) }, clave);
  const activa = !!condicion;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{verbo}</span>
        <div role="radiogroup" aria-label={verbo} className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
          {[[false, 'Siempre'], [true, 'Solo si…']].map(([v, n]) => (
            <button key={n} type="button" role="radio" aria-checked={activa === v} disabled={v && !anteriores.length}
              onClick={() => set(v ? (condicion || { union: 'y', reglas: [nuevaRegla()] }) : null, 'cond.modo')}
              className={`flex-1 h-8 rounded-lg text-xs disabled:opacity-40 ${activa === v ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
          ))}
        </div>
        {!anteriores.length && <p className="text-xs text-muted-foreground">{sinPreguntas}</p>}
      </div>

      {activa && (
        <>
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span>si se cumple</span>
            <div role="radiogroup" aria-label="Cómo se combinan" className="flex gap-0.5 p-[3px] bg-muted rounded-[10px]">
              {[['y', 'todas (Y)'], ['o', 'alguna (O)']].map(([k, n]) => (
                <button key={k} type="button" role="radio" aria-checked={condicion.union === k} onClick={() => set({ ...condicion, union: k }, 'cond.union')}
                  className={`h-7 px-2.5 rounded-lg text-xs ${condicion.union === k ? 'bg-background font-semibold text-[#1e395e] dark:text-[#3cbef6] shadow-sm' : 'text-muted-foreground'}`}>{n}</button>
              ))}
            </div>
            <span>de estas:</span>
          </div>

          {reglas.map((r, i) => {
            const p = porId[r.pregunta_id];
            const valida = anteriores.some((x) => x.id === r.pregunta_id);
            const fam = p ? FAMILIA[p.tipo] : null;
            const ops = fam ? OPERADORES[fam] : [];
            return (
              <div key={i} className="rounded-xl border bg-muted/30 p-2.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#1e395e] dark:text-[#3cbef6] w-5 shrink-0">{i === 0 ? 'SI' : condicion.union === 'y' ? 'Y' : 'O'}</span>
                  <select value={valida ? r.pregunta_id : ''} aria-label="Pregunta" className={`${sel} flex-1`}
                    onChange={(e) => { const np = porId[e.target.value]; cambiarRegla(i, { pregunta_id: np.id, op: OPERADORES[FAMILIA[np.tipo]][0], valor: valorInicial(np) }, `cond.${i}.p`); }}>
                    {!valida && <option value="">{p ? `${nombreDe(p)} (ahora va después)` : '(pregunta que ya no existe)'}</option>}
                    {anteriores.map((x) => <option key={x.id} value={x.id}>{nombreDe(x)}</option>)}
                  </select>
                  <button type="button" aria-label="Quitar condición" title="Quitar condición"
                    onClick={() => set(reglas.length > 1 ? { ...condicion, reglas: reglas.filter((_, j) => j !== i) } : null, 'cond.quitar')}
                    className="h-8 w-8 grid place-items-center rounded-lg text-[#dc2626] hover:bg-muted shrink-0"><X className="h-4 w-4" /></button>
                </div>
                {!valida && (
                  <p className="text-[11px] text-[#b45309] flex items-center gap-1 pl-6"><AlertTriangle className="h-3.5 w-3.5" /> Solo se puede mirar una pregunta anterior: elige otra.</p>
                )}
                {p && (
                  <div className="flex gap-1.5 pl-6">
                    <select value={r.op} aria-label="Operador" className={`${sel} flex-1`}
                      onChange={(e) => cambiarRegla(i, { op: e.target.value, ...(SIN_VALOR.has(e.target.value) ? { valor: null } : { valor: r.valor ?? valorInicial(p) }) }, `cond.${i}.op`)}>
                      {ops.map((op) => <option key={op} value={op}>{(fam === 'fecha' && NOMBRE_OP_FECHA[op]) || NOMBRE_OP[op]}</option>)}
                    </select>
                    {!SIN_VALOR.has(r.op) && (
                      <Valor p={p} valor={r.valor} listas={listas} onCambio={(v) => cambiarRegla(i, { valor: v }, `cond.${i}.v`)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" disabled={!anteriores.length || reglas.length >= 20}
            onClick={() => set({ ...condicion, reglas: [...reglas, nuevaRegla()] }, 'cond.agregar')}
            className="self-start h-8 px-2.5 rounded-lg border border-dashed text-xs text-[#1e395e] dark:text-[#3cbef6] hover:bg-muted inline-flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Agregar condición
          </button>
          <p className="text-xs rounded-xl bg-[rgba(0,165,223,0.08)] p-2.5">{frase} {describirCondicion(condicion, porId)}.</p>
        </>
      )}
    </div>
  );
}

function valorInicial(p) {
  if (p.opciones?.length) return p.tipo === 'cumple' ? (p.opciones.find((o) => o.falla) || p.opciones[0]).id : p.opciones[0].id;
  if (p.tipo === 'sucursal') return SUCURSALES[0];
  return '';
}

function Valor({ p, valor, listas, onCambio }) {
  const fam = FAMILIA[p.tipo];
  if (p.opciones?.length) {
    return (
      <select value={valor ?? ''} aria-label="Valor" className={`${sel} flex-1`} onChange={(e) => onCambio(e.target.value)}>
        {p.opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    );
  }
  if (p.tipo === 'sucursal') {
    return (
      <select value={valor ?? ''} aria-label="Valor" className={`${sel} flex-1`} onChange={(e) => onCambio(e.target.value)}>
        {SUCURSALES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  if (p.tipo === 'colaborador' || p.tipo === 'caja') {
    const lista = p.tipo === 'colaborador' ? (listas?.colaboradores || []) : (listas?.cajas || []);
    return (
      <select value={valor ?? ''} aria-label="Valor" className={`${sel} flex-1`} onChange={(e) => onCambio(e.target.value)}>
        <option value="">{listas ? 'Elige…' : 'Cargando…'}</option>
        {lista.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
      </select>
    );
  }
  const tipoInput = { numero: 'number', fecha: { fecha: 'date', hora: 'time', fechahora: 'datetime-local' }[p.tipo] }[fam] || 'text';
  return (
    <Input type={tipoInput} value={valor ?? ''} aria-label="Valor" onChange={(e) => onCambio(e.target.value)}
      className="h-9 flex-1 min-w-0 text-sm text-foreground" placeholder={fam === 'texto' ? 'Texto' : ''} />
  );
}
