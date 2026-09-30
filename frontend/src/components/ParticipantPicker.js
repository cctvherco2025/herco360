// Selector de participantes con buscador (modal "Nueva actividad" de Agenda).
//
// - Campo con lupa; las personas elegidas van como chips dentro del campo.
// - Al enfocar se abre la lista: primero GRUPOS (atajo para agregar varias
//   personas) y luego las personas agrupadas por departamento (encabezados
//   fijos).
// - Búsqueda en tiempo real: personas por nombre, puesto y departamento;
//   grupos por nombre y descripción. Ignora mayúsculas y tildes; varias
//   palabras deben coincidir todas, en cualquier orden. Se resalta lo que
//   coincide.
// - Un grupo agrega a sus integrantes como participantes INDIVIDUALES (no
//   hay chip de grupo), sin duplicar; si ya están todos, los quita.
// - Teclado: ↑/↓ recorren grupos y personas, Enter marca/desmarca, Escape
//   cierra, Backspace con el campo vacío quita el último chip.
//
// La lista NO es un Popover de Radix (se llevaría el foco del campo): es un
// panel absoluto dentro de la zona con scroll del modal, así nunca tapa los
// botones del pie. `onOpenChange` avisa al modal si está abierta para que
// Escape cierre solo la lista y no el modal completo.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Search, X, Check, Users } from 'lucide-react';

export const SIN_AREA = 'Sin área';

// minúsculas y sin tildes, carácter por carácter, guardando a qué posición del
// texto original corresponde cada carácter (para poder resaltar el original)
function normalizarConMapa(texto) {
  let norm = '';
  const mapa = [];
  [...(texto || '')].forEach((ch, i) => {
    const n = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const c of n) { norm += c; mapa.push(i); }
  });
  return { norm, mapa };
}
export const normalizar = (t) => normalizarConMapa(t).norm;
export const palabrasDe = (q) => normalizar(q).split(/\s+/).filter(Boolean);
export const coincide = (texto, palabras) => { const t = normalizar(texto); return palabras.every((p) => t.includes(p)); };

// Resalta en `texto` todas las apariciones de cada palabra buscada.
export function Resaltado({ texto, palabras }) {
  if (!texto || !palabras.length) return <>{texto}</>;
  const chars = [...texto];
  const { norm, mapa } = normalizarConMapa(texto);
  const marcado = new Array(chars.length).fill(false);
  palabras.forEach((p) => {
    for (let desde = norm.indexOf(p); desde !== -1; desde = norm.indexOf(p, desde + 1)) {
      for (let k = desde; k < desde + p.length; k += 1) marcado[mapa[k]] = true;
    }
  });
  const partes = [];
  chars.forEach((ch, i) => {
    const ultima = partes[partes.length - 1];
    if (ultima && ultima.m === marcado[i]) ultima.t += ch;
    else partes.push({ t: ch, m: marcado[i] });
  });
  return (
    <>
      {partes.map((p, i) => (p.m
        ? <mark key={i} className="bg-yellow-200/80 dark:bg-yellow-400/30 text-inherit font-semibold rounded-[3px]">{p.t}</mark>
        : <React.Fragment key={i}>{p.t}</React.Fragment>))}
    </>
  );
}

export const iniciales = (nombre) => (nombre || '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
export const dosNombres = (nombre) => (nombre || '').trim().split(/\s+/).slice(0, 2).join(' ');

export function AvatarIniciales({ nombre, className = '', title }) {
  return (
    <span title={title} className={`shrink-0 grid place-items-center rounded-full bg-[#1e395e] text-white font-semibold ${className}`}>
      {iniciales(nombre)}
    </span>
  );
}

// "N integrantes · Ana López, Luis Pérez, Carla Díaz y 4 más"
function resumenIntegrantes(personas) {
  const nombres = personas.slice(0, 3).map((u) => dosNombres(u.name));
  const resto = personas.length - nombres.length;
  const lista = resto > 0 ? `${nombres.join(', ')} y ${resto} más` : nombres.join(', ');
  return `${personas.length} integrante${personas.length === 1 ? '' : 's'} · ${lista}`;
}

export default function ParticipantPicker({ users, groups = [], value, onChange, disabled = false, onOpenChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activo, setActivo] = useState(-1); // índice en la lista navegable (teclado)
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const filasRef = useRef({});

  const cambiarAbierto = (v) => { setOpen(v); onOpenChange?.(v); };

  // cerrar al hacer clic fuera
  useEffect(() => {
    if (!open) return undefined;
    const fuera = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) cambiarAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('touchstart', fuera); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // si el modal se desmonta con la lista abierta, avisar que ya no lo está
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onOpenChange?.(false), []);

  const palabras = useMemo(() => palabrasDe(query), [query]);
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Grupos que se pueden usar aquí: solo con integrantes que están en la lista
  // de participantes posibles (un grupo vacío no se muestra). Filtrados por
  // nombre y descripción.
  const gruposVisibles = useMemo(() => groups
    .map((g) => ({ ...g, personas: (g.miembros || []).map((id) => usersById.get(id)).filter(Boolean) }))
    .filter((g) => g.personas.length > 0)
    .filter((g) => !palabras.length || coincide(`${g.nombre} ${g.descripcion || ''}`, palabras)),
  [groups, usersById, palabras]);

  // Departamentos (A→Z) con sus personas (A→Z) que cumplen TODAS las palabras
  // en nombre + puesto + departamento. Si se escribe el nombre de un
  // departamento, calza con todas sus personas.
  const departamentos = useMemo(() => {
    const porArea = new Map();
    users.forEach((u) => {
      const area = (u.area || '').trim() || SIN_AREA;
      if (palabras.length && !coincide(`${u.name || ''} ${u.position || ''} ${area}`, palabras)) return;
      if (!porArea.has(area)) porArea.set(area, []);
      porArea.get(area).push(u);
    });
    return [...porArea.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([area, lista]) => ({ area, personas: lista.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es')) }));
  }, [users, palabras]);

  // Lista que recorre el teclado: grupos primero, luego personas.
  const navegables = useMemo(() => [
    ...gruposVisibles.map((g) => ({ key: `g:${g.id}`, tipo: 'grupo', g })),
    ...departamentos.flatMap((d) => d.personas.map((u) => ({ key: u.id, tipo: 'persona', u }))),
  ], [gruposVisibles, departamentos]);

  const seleccionados = useMemo(() => value.map((id) => usersById.get(id)).filter(Boolean), [value, usersById]);

  // al cambiar la búsqueda, la fila activa vuelve a la primera
  useEffect(() => { setActivo(navegables.length ? 0 : -1); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  // la fila activa siempre a la vista
  useEffect(() => {
    const it = navegables[activo];
    if (open && it) filasRef.current[it.key]?.scrollIntoView({ block: 'nearest' });
  }, [activo, open, navegables]);

  const despuesDeElegir = () => { setQuery(''); inputRef.current?.focus(); };

  const toggle = (id) => {
    // Set: nunca se agrega a la misma persona dos veces
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...new Set([...value, id])]);
    despuesDeElegir();
  };
  const quitar = (id) => onChange(value.filter((x) => x !== id));

  // Grupo: agrega a los integrantes que faltan (individuales, sin duplicar);
  // si ya estaban todos, los quita a todos.
  const toggleGrupo = (g) => {
    const ids = g.personas.map((u) => u.id);
    const faltan = ids.filter((id) => !value.includes(id));
    if (faltan.length === 0) {
      onChange(value.filter((id) => !ids.includes(id)));
      toast(`Se quitaron los integrantes de "${g.nombre}"`);
    } else {
      onChange([...new Set([...value, ...faltan])]);
      toast.success(`Se agregaron ${faltan.length} participante${faltan.length === 1 ? '' : 's'} de "${g.nombre}"`);
    }
    despuesDeElegir();
  };

  // "Seleccionar todos" / "Quitar todos" solo sobre las personas VISIBLES del departamento
  const toggleArea = (personas) => {
    const ids = personas.map((u) => u.id);
    const todas = ids.every((id) => value.includes(id));
    onChange(todas ? value.filter((id) => !ids.includes(id)) : [...new Set([...value, ...ids])]);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { cambiarAbierto(true); return; }
      setActivo((i) => Math.min(navegables.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = navegables[activo];
      if (!open || !it) return;
      if (it.tipo === 'grupo') toggleGrupo(it.g); else toggle(it.u.id);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); cambiarAbierto(false); }
    } else if (e.key === 'Backspace' && !query && value.length) {
      quitar(value[value.length - 1]);
    }
  };

  const esActivo = (key) => navegables[activo]?.key === key;
  const activar = (key) => setActivo(navegables.findIndex((it) => it.key === key));

  return (
    <div ref={wrapRef} className="relative">
      {/* Campo: chips + input */}
      <div
        onClick={() => { if (!disabled) { inputRef.current?.focus(); cambiarAbierto(true); } }}
        className={`w-full min-h-11 flex items-center gap-1.5 flex-wrap rounded-xl border bg-card px-3 py-1.5 text-sm transition-colors ${
          open ? 'border-[#00a5df] ring-2 ring-[#00a5df]/20' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-text'}`}
        data-testid="activity-form-participants">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        {seleccionados.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,165,223,0.12)] text-[#1e395e] dark:text-[#3cbef6] pl-0.5 pr-1.5 py-0.5 text-xs max-w-full">
            <AvatarIniciales nombre={u.name} className="h-5 w-5 text-[9px]" />
            <span className="truncate">{dosNombres(u.name)}</span>
            {!disabled && (
              <button type="button" onClick={(e) => { e.stopPropagation(); quitar(u.id); }} aria-label={`Quitar a ${u.name}`}
                className="h-4 w-4 grid place-items-center rounded-full hover:bg-[#1e395e]/15 dark:hover:bg-white/15" data-testid="participant-chip-remove">
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <div className="relative flex-1 min-w-[120px]">
          <input
            ref={inputRef}
            value={query}
            disabled={disabled}
            onChange={(e) => { setQuery(e.target.value); if (!open) cambiarAbierto(true); }}
            onFocus={() => cambiarAbierto(true)}
            onKeyDown={onKeyDown}
            placeholder={value.length ? 'Agregar más...' : 'Buscar grupo, persona, puesto o departamento...'}
            // 16 px en celular: con menos, el iPhone hace zoom al enfocar
            className="w-full bg-transparent outline-none text-base sm:text-sm py-1 pr-6 placeholder:text-muted-foreground"
            role="combobox" aria-expanded={open} aria-autocomplete="list"
            data-testid="participants-search-input"
          />
          {query && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setQuery(''); inputRef.current?.focus(); }} aria-label="Limpiar búsqueda"
              className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              data-testid="participants-search-clear">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {value.length > 0 && (
        <p className="text-xs text-muted-foreground mt-1.5" data-testid="participants-count">
          {value.length} participante{value.length === 1 ? '' : 's'}
        </p>
      )}

      {/* Lista desplegable */}
      {open && !disabled && (
        <div role="listbox"
          className="absolute left-0 right-0 z-30 mt-1.5 max-h-[260px] overflow-y-auto overscroll-contain rounded-2xl border bg-popover shadow-lg p-1.5"
          data-testid="participants-list">

          {/* ── GRUPOS (se oculta si no hay grupos que coincidan) ── */}
          {gruposVisibles.length > 0 && (
            <div className="mb-1.5">
              <div className="px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Grupos</span>
              </div>
              {gruposVisibles.map((g) => {
                const agregados = g.personas.filter((u) => value.includes(u.id)).length;
                const faltan = g.personas.length - agregados;
                const todos = faltan === 0;
                const key = `g:${g.id}`;
                return (
                  <button key={key} type="button" role="option" aria-selected={todos}
                    ref={(el) => { filasRef.current[key] = el; }}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => activar(key)}
                    onClick={() => toggleGrupo(g)}
                    className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${esActivo(key) ? 'bg-muted' : ''}`}
                    data-testid="participants-group">
                    <span className="h-7 w-7 shrink-0 rounded-lg grid place-items-center text-white" style={{ background: g.color || '#00a5df' }}>
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium truncate"><Resaltado texto={g.nombre} palabras={palabras} /></span>
                      <span className="block text-xs text-muted-foreground truncate">{resumenIntegrantes(g.personas)}</span>
                    </span>
                    <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-1 whitespace-nowrap ${
                      todos ? 'bg-[rgba(22,163,74,0.14)] text-[#16a34a]' : 'bg-[rgba(0,165,223,0.12)] text-[#00a5df]'}`}>
                      {todos ? '✓ Agregado' : agregados > 0 ? `Agregar ${faltan} más` : `Agregar ${g.personas.length}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Personas por departamento ── */}
          {departamentos.map((d) => {
            const todas = d.personas.every((u) => value.includes(u.id));
            const selCount = d.personas.filter((u) => value.includes(u.id)).length;
            return (
              <div key={d.area} className="mb-1.5 last:mb-0">
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 sticky top-0 bg-popover/95 backdrop-blur z-10">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground truncate">
                    <Resaltado texto={d.area} palabras={palabras} />
                    {selCount > 0 && <span className="text-[#00a5df] normal-case"> · {selCount}</span>}
                  </span>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => toggleArea(d.personas)}
                    className="text-[11px] font-medium text-[#00a5df] hover:underline shrink-0" data-testid="participants-area-toggle">
                    {todas ? 'Quitar todos' : 'Seleccionar todos'}
                  </button>
                </div>
                {d.personas.map((u) => {
                  const sel = value.includes(u.id);
                  return (
                    <button key={u.id} type="button" role="option" aria-selected={sel}
                      ref={(el) => { filasRef.current[u.id] = el; }}
                      onMouseDown={(e) => e.preventDefault()} // el campo no pierde el foco
                      onMouseEnter={() => activar(u.id)}
                      onClick={() => toggle(u.id)}
                      className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${esActivo(u.id) ? 'bg-muted' : ''}`}
                      data-testid="participants-option">
                      <AvatarIniciales nombre={u.name} className="h-7 w-7 text-[11px]" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate"><Resaltado texto={u.name} palabras={palabras} /></span>
                        <span className="block text-xs text-muted-foreground truncate"><Resaltado texto={u.position} palabras={palabras} /></span>
                      </span>
                      <span className={`h-5 w-5 shrink-0 rounded-md border-2 grid place-items-center transition-colors ${
                        sel ? 'bg-[#00a5df] border-[#00a5df]' : 'border-muted-foreground/40'}`}>
                        {sel && <Check className="h-3.5 w-3.5 text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {navegables.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6" data-testid="participants-empty">
              {users.length === 0 ? 'Sin usuarios' : 'No se encontraron personas'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
