import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Crown } from 'lucide-react';
import api from '@/lib/api';

// Organigrama que se arma solo con la estructura (GET /org/organigrama):
// áreas y subáreas con sus cargos y cuánta gente hay (sin nombres). Al tocar
// un cargo se ve quién le aprueba las vacaciones, su cadena hasta el jefe del
// departamento y a quién ve (Perfiles › Gente a cargo, ver mando.py).
const NAVY = '#1e395e';
const NARANJA = '#ec9032';
const CIAN = '#00a5df';

const ESTILO = {
  sel: { background: NAVY, borderColor: NAVY, color: '#fff' },
  aprueba: { background: 'rgba(236,144,50,0.12)', borderColor: NARANJA },
  ve: { background: 'rgba(0,165,223,0.10)', borderColor: CIAN },
  normal: undefined,
};
const NOTA = { aprueba: ' · le aprueba', ve: ' · lo ve' };

const personas = (n) => `${n} ${n === 1 ? 'persona' : 'personas'}`;

function Nodo({ g, estado, onPick, grande }) {
  return (
    <button type="button" onClick={() => onPick(g.id)} aria-pressed={estado === 'sel'} data-testid="organigrama-cargo"
      className={`w-full rounded-xl px-2.5 py-1.5 text-left transition-colors ${grande ? 'min-h-[48px]' : 'min-h-[44px]'} ${estado === 'normal' ? 'border bg-card hover:bg-muted/60' : 'border-2'}`}
      style={ESTILO[estado]}>
      <span className={`block font-semibold leading-tight ${grande ? 'text-[15px]' : 'text-[13px]'}`}>{g.cargo}</span>
      <span className={`block text-[11.5px] ${estado === 'sel' ? 'text-white/80' : 'text-muted-foreground'}`}>
        {personas(g.personas)}{NOTA[estado] || ''}
      </span>
    </button>
  );
}

export default function OrganigramaVivo({ departamento }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [selId, setSelId] = useState(null);
  const panel = useRef(null);

  useEffect(() => {
    setDatos(null); setError(''); setSelId(null);
    api.get('/org/organigrama', { params: departamento ? { departamento } : {} })
      .then(({ data }) => setDatos(data))
      .catch((e) => setError(e?.response?.data?.detail || 'No se pudo cargar el organigrama'));
  }, [departamento]);

  const vista = useMemo(() => {
    if (!datos) return null;
    const area = Object.fromEntries(datos.areas.map((a) => [a.id, a]));
    const grupo = Object.fromEntries(datos.grupos.map((g) => [g.id, g]));
    const deArea = {};
    datos.grupos.filter((g) => !g.jefe_depto).forEach((g) => { (deArea[g.area_id] = deArea[g.area_id] || []).push(g); });
    // cada área principal con sus subáreas (vienen en orden de árbol, con su nivel)
    const bloques = datos.areas.reduce((acc, a) => {
      if (!a.padre_id || !acc.length) acc.push([a]); else acc[acc.length - 1].push(a);
      return acc;
    }, []);
    const total = (b) => b.reduce((n, a) => n + (deArea[a.id] || []).reduce((m, g) => m + g.personas, 0), 0);
    const soloJefes = (b) => !total(b) && datos.grupos.some((g) => g.jefe_depto && b.some((a) => a.id === g.area_id));
    return {
      area, grupo, deArea,
      jefes: datos.grupos.filter((g) => g.jefe_depto),
      bloques: bloques.filter((b) => !soloJefes(b)).map((b) => ({ areas: b, total: total(b) })),
      sinArea: deArea[null] || deArea.undefined || [],
    };
  }, [datos]);

  if (error) return <p className="py-10 text-center text-sm text-muted-foreground">{error}</p>;
  if (!vista) return <p className="py-10 text-center text-sm text-muted-foreground">Cargando organigrama…</p>;

  const sel = selId ? vista.grupo[selId] : null;
  const etiqueta = (g) => (g.jefe_depto || !vista.area[g.area_id] ? g.cargo : `${g.cargo} · ${vista.area[g.area_id].nombre}`);
  const estado = (g) => {
    if (!sel) return 'normal';
    if (g.id === sel.id) return 'sel';
    if (sel.aprobadores.includes(g.id)) return 'aprueba';
    if (!sel.jefe_depto && sel.ve.includes(g.id)) return 've';
    return 'normal';
  };
  const elegir = (id) => {
    setSelId((actual) => (actual === id ? null : id));
    // con el panel debajo (pantallas angostas), mostrarlo al tocar un cargo
    if (window.innerWidth < 1280) setTimeout(() => panel.current?.scrollIntoView({ block: 'nearest' }), 50);
  };

  // cadena hacia arriba: quien le aprueba, y quien aprueba a ese, hasta el jefe del departamento
  const cadena = [];
  if (sel) {
    const vistos = new Set();
    let g = sel;
    while (g && !vistos.has(g.id)) {
      vistos.add(g.id);
      cadena.push(g);
      if (g.jefe_depto) break;
      const actual = g;
      g = actual.aprobadores.map((id) => vista.grupo[id]).find((x) => x && x.id !== actual.id);
    }
  }
  const aprobadores = sel ? sel.aprobadores.map((id) => vista.grupo[id]).filter(Boolean) : [];
  const ve = sel && !sel.jefe_depto ? sel.ve.map((id) => vista.grupo[id]).filter(Boolean) : [];
  const lista = (gs) => gs.map(etiqueta).sort((x, y) => x.localeCompare(y, 'es', { numeric: true })).join(', ');

  return (
    <div data-testid="organigrama-vivo">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded" style={{ background: NAVY }} />Seleccionado</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded border-2" style={ESTILO.aprueba} />Le aprueba las vacaciones</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-3.5 w-3.5 rounded border-2" style={ESTILO.ve} />Lo ve (calendario y vacaciones)</span>
        <span className="ml-auto">{personas(datos.personas)} · {datos.areas.length} áreas</span>
      </div>

      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <section aria-label="Organigrama" className="min-w-0 flex-1">
          <div className="flex flex-col items-center">
            <div className="w-full max-w-sm rounded-2xl border bg-card p-3 shadow-sm">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Crown className="h-3.5 w-3.5" style={{ color: NARANJA }} /> Jefe del departamento
              </p>
              <div className="space-y-1.5">
                {vista.jefes.length ? vista.jefes.map((g) => <Nodo key={g.id} g={g} estado={estado(g)} onPick={elegir} grande />)
                  : <p className="text-[13px] text-muted-foreground">Sin asignar</p>}
              </div>
            </div>
            <span aria-hidden="true" className="h-5 w-0.5 bg-border" />
          </div>
          <div className="grid grid-cols-1 gap-3 border-t-2 pt-4 md:grid-cols-2 2xl:grid-cols-3">
            {vista.bloques.map(({ areas, total }) => {
              const raiz = areas[0];
              return (
                <div key={raiz.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3 shadow-sm" data-testid="organigrama-area">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-heading text-[15px] font-semibold text-foreground">{raiz.nombre}</h3>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{personas(total)}</span>
                  </div>
                  {!total && <p className="text-[13px] text-muted-foreground">Nadie registrado en esta área.</p>}
                  {(vista.deArea[raiz.id] || []).map((g) => <Nodo key={g.id} g={g} estado={estado(g)} onPick={elegir} />)}
                  {areas.slice(1).map((a) => (
                    <div key={a.id} className="flex flex-col gap-1.5 rounded-xl border border-dashed bg-muted/30 p-2"
                      style={{ marginLeft: `${Math.max(0, a.nivel_arbol - raiz.nivel_arbol - 1) * 12}px` }}>
                      <p className="text-[12px] font-semibold" style={{ color: CIAN }}>↳ {a.nombre}</p>
                      {(vista.deArea[a.id] || []).map((g) => <Nodo key={g.id} g={g} estado={estado(g)} onPick={elegir} />)}
                      {!(vista.deArea[a.id] || []).length && !areas.some((x) => x.padre_id === a.id)
                        && <p className="text-[12px] text-muted-foreground">Sin gente</p>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {vista.sinArea.length > 0 && (
            <div className="mt-3 rounded-2xl border bg-card p-3">
              <h3 className="mb-2 text-[13px] font-semibold text-muted-foreground">Sin área</h3>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                {vista.sinArea.map((g) => <Nodo key={g.id} g={g} estado={estado(g)} onPick={elegir} />)}
              </div>
            </div>
          )}
        </section>

        <aside aria-label="Flujo de mando" className="flex flex-col gap-4 xl:sticky xl:top-4 xl:w-[320px] xl:shrink-0">
          <div ref={panel} className="scroll-mt-4 rounded-2xl border bg-card p-4 shadow-sm" data-testid="organigrama-panel">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Flujo de mando</p>
            {!sel ? (
              <p className="mt-2 text-[13px] text-muted-foreground">Toca un cargo para ver quién le aprueba las vacaciones, su cadena hasta el jefe del departamento y a quién ve.</p>
            ) : (
              <div className="mt-1 space-y-3">
                <div>
                  <h3 className="font-heading text-lg font-semibold leading-tight text-foreground">{etiqueta(sel)}</h3>
                  <p className="text-[12.5px] text-muted-foreground">
                    {personas(sel.personas)}{sel.le_reportan ? ` · le reportan ${personas(sel.le_reportan)}` : ''}
                  </p>
                </div>
                <div>
                  <h4 className="mb-1 text-[12.5px] font-semibold" style={{ color: NARANJA }}>Le aprueba las vacaciones</h4>
                  <p className="text-[13.5px] text-foreground">
                    {aprobadores.length ? aprobadores.map((g) => (g.id === sel.id ? `${g.cargo} (entre ellos)` : etiqueta(g))).join(', ') : 'Nadie'}
                  </p>
                </div>
                <div>
                  <h4 className="mb-1.5 text-[12.5px] font-semibold text-foreground">Cadena hacia arriba</h4>
                  <ol className="space-y-0">
                    {cadena.map((g, i) => (
                      <li key={g.id} className="flex gap-2.5">
                        <span aria-hidden="true" className="flex w-3 flex-col items-center">
                          <span className="mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: i ? NAVY : NARANJA }} />
                          {i < cadena.length - 1 && <span className="w-0.5 flex-1 bg-border" />}
                        </span>
                        <span className="pb-2.5 text-[13.5px] text-foreground">{etiqueta(g)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h4 className="mb-1 text-[12.5px] font-semibold" style={{ color: CIAN }}>
                    Ve calendarios y vacaciones de · {sel.jefe_depto ? 'todo el departamento' : personas(sel.ve_personas)}
                  </h4>
                  {!sel.jefe_depto && <p className="text-[13.5px] text-foreground">{ve.length ? lista(ve) : 'Nadie'}</p>}
                </div>
              </div>
            )}
          </div>
          {datos.puede_editar && (
            <div className="rounded-2xl border bg-card p-4 shadow-sm" data-testid="organigrama-avisos">
              <h3 className="mb-2 text-[14px] font-semibold text-foreground">Avisos de la estructura · {datos.avisos.length}</h3>
              {datos.avisos.length ? (
                <div className="space-y-1.5">
                  {datos.avisos.map((a) => (
                    <button key={a.texto} type="button" onClick={() => a.grupo_id && setSelId(a.grupo_id)}
                      className="flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left text-[12.5px] text-foreground"
                      style={{ borderColor: 'rgba(236,144,50,0.35)', background: 'rgba(236,144,50,0.08)' }}>
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: NARANJA }} />{a.texto}
                    </button>
                  ))}
                </div>
              ) : <p className="text-[13px] text-muted-foreground">Todo en orden.</p>}
              <p className="mt-3 text-[11.5px] text-muted-foreground">Quién aprueba y a quién ve cada cargo se cambia en Perfiles › Gente a cargo; el equipo de cada uno sale de las áreas.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
