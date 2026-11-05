import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Search, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { confirmar } from '@/components/ConfirmDialog';

/* Promociones del mes › Revisores por categoría. Algunas categorías (p. ej.
   Pinturas y Revestimiento) las revisa además otra persona por tienda, como el
   Jefe de Negocios. Si se abre un seguimiento en esas categorías, lo valida
   esa persona. Solo quien administra Promociones lo cambia. */

const iniciales = (n) => (n || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function Persona({ p, sub }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#1e395e] text-[11px] font-semibold text-white">{iniciales(p.name)}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm">{p.name}</span>
        {sub && <span className="block truncate text-[11.5px] text-muted-foreground">{sub}</span>}
      </span>
    </span>
  );
}

// Buscador de una persona (por nombre)
function ElegirPersona({ valor, onChange, testid }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [res, setRes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const caja = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    setCargando(true);
    const t = setTimeout(() => {
      api.get('/promo-tareas/personas', { params: { q } }).then(({ data }) => setRes(data)).catch(() => setRes([]))
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, abierto]);
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  if (!abierto) {
    return (
      <div className="flex min-w-0 items-center gap-1">
        <button type="button" onClick={() => { setQ(''); setAbierto(true); }} data-testid={testid}
          className="flex h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border px-2 text-left hover:bg-muted/50">
          {valor ? <Persona p={valor} /> : <span className="pl-1 text-sm text-muted-foreground">Nadie (solo jefe y gerente)</span>}
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
        {valor && (
          <button type="button" aria-label="Quitar" onClick={() => onChange(null)} className="grid h-10 w-9 place-items-center rounded-xl text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }
  return (
    <div ref={caja} className="relative min-w-0">
      <div className="flex h-10 items-center gap-2 rounded-xl border px-2.5 ring-2 ring-[#00a5df]/40">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none" data-testid={`${testid}-buscar`} />
        {cargando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="absolute left-0 right-0 top-11 z-50 max-h-60 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg">
        {res.length === 0 && !cargando && <p className="px-3 py-2 text-sm text-muted-foreground">Nadie con ese nombre</p>}
        {res.map((u) => (
          <button key={u.id} type="button" onClick={() => { onChange({ id: u.id, name: u.name }); setAbierto(false); }}
            className="flex w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted">
            <Persona p={u} sub={[u.position, u.area].filter(Boolean).join(' · ')} />
          </button>
        ))}
      </div>
    </div>
  );
}

function EditarRegla({ regla, tiendas, onClose, onGuardar }) {
  const [cats, setCats] = useState(regla?.categorias || []);
  const [nueva, setNueva] = useState('');
  const [por, setPor] = useState(regla?.por_tienda || {});
  const [guardando, setGuardando] = useState(false);
  const agregar = () => {
    const c = nueva.trim().replace(/\s+/g, ' ');
    if (c && !cats.some((x) => x.toLowerCase() === c.toLowerCase())) setCats([...cats, c]);
    setNueva('');
  };
  const listo = cats.length > 0 && Object.values(por).some(Boolean);
  const guardar = async () => {
    setGuardando(true);
    const ok = await onGuardar({ ...regla, categorias: cats, por_tienda: por });
    setGuardando(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[520px] rounded-[22px] overflow-visible" data-testid="revcat-ventana">
        <DialogHeader>
          <DialogTitle className="font-heading">Revisores de categoría</DialogTitle>
          <DialogDescription>Revisan junto con el jefe y el gerente de tienda, y validan los seguimientos de estas categorías.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Categorías</p>
            <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 rounded-xl border px-2 py-1.5">
              {cats.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-[rgba(236,144,50,0.13)] px-2.5 py-1 text-[12.5px] font-semibold text-[#a85c12]">
                  {c}
                  <button type="button" aria-label={`Quitar ${c}`} onClick={() => setCats(cats.filter((x) => x !== c))}><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              <input value={nueva} onChange={(e) => setNueva(e.target.value)} data-testid="revcat-categoria"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregar(); } }} onBlur={agregar}
                placeholder={cats.length ? 'Otra categoría…' : 'Escribe una categoría y presiona Enter'}
                className="min-w-[140px] flex-1 bg-transparent px-1 text-sm outline-none" />
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Se reconoce por el nombre, sin importar mayúsculas ni tildes.</p>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">Quién revisa en cada tienda</p>
            <div className="space-y-2">
              {tiendas.map((t) => (
                <div key={t.tienda} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-2.5">
                  <span className="flex items-center gap-1.5 text-sm">
                    <span className="rounded-full bg-[rgba(0,165,223,0.12)] px-1.5 py-0.5 text-[11px] font-semibold text-[#1e395e] dark:text-[#93c5fd]">{t.sucursal}</span>
                    <span className="truncate">{t.tienda}</span>
                  </span>
                  <ElegirPersona valor={por[t.tienda] || null} testid={`revcat-persona-${t.sucursal}`}
                    onChange={(p) => setPor((x) => ({ ...x, [t.tienda]: p }))} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-xl" onClick={onClose}>Cancelar</Button>
          <Button className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white" disabled={!listo || guardando} onClick={guardar} data-testid="revcat-guardar">
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RevisoresCategoria() {
  const [datos, setDatos] = useState(null);
  const [editando, setEditando] = useState(null); // regla o {} para una nueva
  useEffect(() => { api.get('/promo-tareas/revisores-categoria').then(({ data }) => setDatos(data)).catch(() => {}); }, []);
  if (!datos) return null;
  const { reglas, tiendas } = datos;

  const guardarTodas = async (lista, msg) => {
    try {
      const { data } = await api.put('/promo-tareas/revisores-categoria', { reglas: lista });
      setDatos((d) => ({ ...d, reglas: data.reglas }));
      toast.success(msg);
      return true;
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo guardar'); return false; }
  };
  const guardarRegla = (r) => {
    const limpia = { ...r, por_tienda: Object.fromEntries(Object.entries(r.por_tienda || {}).filter(([, p]) => p)) };
    const lista = r.id ? reglas.map((x) => (x.id === r.id ? limpia : x)) : [...reglas, limpia];
    return guardarTodas(lista, 'Revisores guardados');
  };
  const borrar = async (r) => {
    const ok = await confirmar({
      tipo: 'danger', titulo: '¿Quitar estos revisores?',
      mensaje: <>{r.categorias.join(' y ')} volverán a revisarlas solo el jefe y el gerente de cada tienda.</>,
      textoConfirmar: 'Quitar', textoCargando: 'Quitando…', textoExito: 'Revisores quitados',
      accion: async () => {
        const { data } = await api.put('/promo-tareas/revisores-categoria', { reglas: reglas.filter((x) => x.id !== r.id) });
        setDatos((d) => ({ ...d, reglas: data.reglas }));
      },
    });
    return ok;
  };

  return (
    <div className="rounded-[18px] bg-card border shadow-card p-5 mb-5 space-y-4" data-testid="promos-revisores-categoria">
      <div>
        <h2 className="font-heading font-semibold">Revisores por categoría</h2>
        <p className="text-xs text-muted-foreground">Personas que revisan algunas categorías además del jefe y el gerente de cada tienda.</p>
      </div>
      {reglas.length === 0 && <p className="text-sm text-muted-foreground">Todas las categorías las revisan el jefe y el gerente de cada tienda.</p>}
      {reglas.map((r) => (
        <div key={r.id} className="overflow-hidden rounded-[14px] border" data-testid="revcat-regla">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/60 px-3.5 py-2.5">
            <div className="flex flex-wrap gap-1.5">
              {r.categorias.map((c) => (
                <span key={c} className="rounded-full bg-[rgba(236,144,50,0.13)] px-2.5 py-1 text-[12.5px] font-semibold text-[#a85c12]">{c}</span>
              ))}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="rounded-xl h-8" onClick={() => setEditando(r)}>Editar</Button>
              <Button size="sm" variant="ghost" className="rounded-xl h-8 text-muted-foreground" onClick={() => borrar(r)}>Quitar</Button>
            </div>
          </div>
          <div className="divide-y">
            {tiendas.map((t) => {
              const p = r.por_tienda?.[t.tienda];
              return (
                <div key={t.tienda} className="grid grid-cols-[minmax(0,130px)_minmax(0,1fr)] items-center gap-3 px-3.5 py-2.5 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <span className="rounded-full bg-[rgba(0,165,223,0.12)] px-1.5 py-0.5 text-[11px] font-semibold text-[#1e395e] dark:text-[#93c5fd]">{t.sucursal}</span>
                    <span className="truncate">{t.tienda}</span>
                  </span>
                  {p ? <Persona p={p} /> : <span className="text-sm text-muted-foreground">Solo jefe y gerente</span>}
                  <span className="hidden text-xs text-muted-foreground sm:block">{p ? '+ jefe y gerente de tienda' : ''}</span>
                </div>
              );
            })}
          </div>
          <p className="border-t px-3.5 py-2.5 text-xs text-muted-foreground">
            Revisan estas categorías de su tienda (la primera persona que revisa la cierra). Si hay errores, el seguimiento lo valida la persona de esta lista.
          </p>
        </div>
      ))}
      <button type="button" onClick={() => setEditando({})} data-testid="revcat-nueva"
        className="flex w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed px-3 py-3 text-sm font-medium text-muted-foreground hover:border-[#1e395e] hover:text-[#1e395e]">
        <Plus className="h-4 w-4" /> Agregar categorías con otros revisores
      </button>
      {editando && <EditarRegla regla={editando} tiendas={tiendas} onClose={() => setEditando(null)} onGuardar={guardarRegla} />}
    </div>
  );
}
