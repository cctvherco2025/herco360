import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Package, Plus, Search, Info, ChevronRight, Shapes } from 'lucide-react';
import api from '@/lib/api';
import useEsMovil from '@/lib/useEsMovil';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/recorridos/RecorridoWizard';
import ActivoForm from '@/components/activos/ActivoForm';
import Tour, { useTour, BotonTour, BotonRecorrido } from '@/components/Tour';
import { useRecorridoPrimeraVez } from '@/lib/recorridoActivos';
import { ConNovedad } from '@/components/Novedad';
import {
  useActivosMeta, CategoriaIcono, EstadoActivo, CodigoChip, perteneceA, capacidad, valorCampo, pluralEs,
} from '@/components/activos/comunes';

// Los dos primeros datos con valor (p. ej. "Hikvision · DS-7616") para la lista.
function detalle(a, cat) {
  if (!cat) return '—';
  const vals = cat.campos.map((c) => [c, a.datos?.[c.clave]]).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
    .slice(0, 2).map(([c, v]) => valorCampo(c, v));
  return vals.join(' · ') || '—';
}

// "3 de 16 canales" para un activo madre con posiciones; "2 cámaras" sin posiciones.
function contenido(a, cat) {
  const hija = cat?.hijas?.[0];
  if (!hija) return '';
  const cap = capacidad(a, hija);
  if (cap && hija.posicion_label) return `${a.hijos} de ${cap} ${cap === 1 ? hija.posicion_label.toLowerCase() : pluralEs(hija.posicion_label.toLowerCase())}`;
  return `${a.hijos} ${(hija.plural || hija.nombre).toLowerCase()}`;
}

function Resumen({ resumen, meta, filtro, onFiltrar }) {
  if (!resumen) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5" data-tour="activos-resumen">
      {meta.categorias.map((c) => {
        const r = resumen.categorias[c.id] || { total: 0, por_sucursal: {} };
        const activo = filtro === c.id;
        return (
          <button key={c.id} type="button" onClick={() => onFiltrar(activo ? '' : c.id)} aria-pressed={activo}
            className={`text-left rounded-[18px] border bg-card shadow-card p-4 transition-colors ${activo ? 'border-[#00a5df] ring-1 ring-[#00a5df]' : 'hover:border-[#00a5df]/50'}`}
            data-testid={`activos-tile-${c.prefijo}`}>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground min-w-0">
              <CategoriaIcono icono={c.icono} className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{c.plural || c.nombre}</span>
            </p>
            <p className="font-heading text-3xl font-semibold mt-1">{r.total}</p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">
              {Object.keys(r.por_sucursal).length ? meta.sucursales.filter((s) => r.por_sucursal[s]).map((s) => `${s}: ${r.por_sucursal[s]}`).join(' · ') : 'En uso'}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function Tabla({ rows, cat, onOpen }) {
  return (
    <div className="rounded-[18px] border bg-card shadow-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr className="text-left">
            <th className="px-4 py-2.5 font-semibold">Código</th>
            <th className="px-3 py-2.5 font-semibold">Nombre</th>
            <th className="px-3 py-2.5 font-semibold">Categoría</th>
            <th className="px-3 py-2.5 font-semibold">Sucursal</th>
            <th className="px-3 py-2.5 font-semibold">Pertenece a / contiene</th>
            <th className="px-3 py-2.5 font-semibold">Detalle</th>
            <th className="px-3 py-2.5 font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((a) => {
            const c = cat(a.categoria_id);
            return (
              <tr key={a.id} onClick={() => onOpen(a)} className="cursor-pointer hover:bg-[rgba(60,190,246,0.06)]" data-testid="activo-fila">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2"><CategoriaIcono icono={c?.icono} className="h-4 w-4 text-[#00a5df] shrink-0" /><CodigoChip codigo={a.codigo} /></span>
                </td>
                <td className="px-3 py-3">
                  <a href={`/activos/${a.id}`} onClick={(e) => { e.preventDefault(); onOpen(a); }} className="font-medium hover:underline">{a.nombre}</a>
                  {a.ubicacion && <span className="block text-xs text-muted-foreground">{a.ubicacion}</span>}
                </td>
                <td className="px-3 py-3">{c?.nombre}</td>
                <td className="px-3 py-3">{a.sucursal}</td>
                <td className="px-3 py-3 whitespace-nowrap">{a.padre ? perteneceA(a, c) : <span className="text-muted-foreground">{contenido(a, c) || '—'}</span>}</td>
                <td className="px-3 py-3 max-w-[240px] truncate">{detalle(a, c)}</td>
                <td className="px-3 py-3"><EstadoActivo estado={a.estado} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Tarjetas({ rows, cat, onOpen }) {
  return (
    <div className="space-y-2.5">
      {rows.map((a) => {
        const c = cat(a.categoria_id);
        const extra = a.padre ? perteneceA(a, c) : contenido(a, c);
        return (
          <button key={a.id} type="button" onClick={() => onOpen(a)} data-testid="activo-tarjeta"
            className="w-full text-left rounded-[18px] border bg-card shadow-card p-4 flex items-center gap-3 active:scale-[0.99] transition-transform">
            <span className="h-10 w-10 rounded-xl bg-[rgba(0,165,223,0.12)] text-[#00a5df] grid place-items-center shrink-0">
              <CategoriaIcono icono={c?.icono} className="h-5 w-5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap"><CodigoChip codigo={a.codigo} />{a.estado === 'baja' && <EstadoActivo estado="baja" />}</span>
              <span className="block font-medium truncate mt-1">{a.nombre}</span>
              <span className="block text-xs text-muted-foreground truncate">
                {[c?.nombre, a.sucursal, extra, a.ubicacion].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

/* Activos de Herco por categoría (CCTV, herramientas, vehículos…). Cada
   activo tiene ficha con historial; es la base del mantenimiento preventivo. */
export default function Activos() {
  const navigate = useNavigate();
  const esMovil = useEsMovil();
  const { meta, error, categoria } = useActivosMeta();
  const [rows, setRows] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [cat, setCat] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [estado, setEstado] = useState('activo');
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ data }, { data: r }] = await Promise.all([
        api.get('/activos', { params: { categoria: cat || undefined, sucursal: sucursal || undefined, estado: estado || undefined } }),
        api.get('/activos/resumen'),
      ]);
      setRows(data); setResumen(r);
    } catch (e) { toast.error('No se pudieron cargar los activos'); setRows([]); }
  }, [cat, sucursal, estado]);
  useEffect(() => { if (meta) load(); }, [meta, load]);

  // la búsqueda filtra en pantalla, también dentro de los datos propios de cada categoría
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!rows || !t) return rows || [];
    return rows.filter((a) => [a.codigo, a.nombre, a.ubicacion, a.padre?.codigo, ...Object.values(a.datos || {})]
      .some((v) => (v ?? '').toString().toLowerCase().includes(t)));
  }, [rows, q]);

  const abrir = (a) => navigate(`/activos/${a.id}`);
  const puedeRegistrar = meta?.categorias.some((c) => c.puede_editar);

  // Recorrido guiado (la primera vez que entra; se repite con "¿Cómo funciona?")
  const listoTour = !!meta && rows !== null && meta.categorias.length > 0;
  const tour = useTour('tour-activos', listoTour, { auto: false });
  const recorrido = useRecorridoPrimeraVez(listoTour); // la primera vez: el recorrido completo
  const pasos = !meta ? [] : [
    { target: null, titulo: 'Bienvenido a Activos',
      texto: 'Aquí se registran los equipos y herramientas de Herco por categoría, y se programa su mantenimiento preventivo. Te mostramos lo principal en unos pasos.' },
    { target: 'activos-resumen', titulo: 'Tus categorías',
      texto: 'Cada tarjeta es una categoría con cuántos activos hay en uso por sucursal. Tócala para ver solo esa categoría.' },
    { target: 'activos-filtros', titulo: 'Buscar y filtrar',
      texto: 'Busca por código, nombre, serie o cualquier dato, y filtra por categoría, sucursal o estado (en uso o de baja).' },
    ...(puedeRegistrar ? [{ target: 'activos-nuevo', titulo: 'Registrar un activo',
      texto: 'Elige la categoría y llena sus datos. La plataforma le pone el código (ej. HER-001) y crea su ficha con QR.' }] : []),
    ...(meta.admin ? [{ target: 'activos-categorias', titulo: 'Categorías',
      texto: 'Crea categorías nuevas (herramientas, vehículos…) con sus propios campos, el prefijo del código y quiénes son sus responsables.' }] : []),
    { target: 'activos-lista', titulo: 'La ficha de cada activo',
      texto: 'Toca un activo para ver sus datos, su QR, sus mantenimientos y el historial de todo lo que se le hizo.' },
    { target: 'menu-grupo-activos', titulo: 'Mantenimiento',
      texto: 'En el menú Activos también están Mis mantenimientos (lo que te toca hacer), Planificaciones (mantenimientos que se repiten solos) y Checklists (las preguntas de cada mantenimiento).' },
  ];

  return (
    <div className="max-w-[1180px] mx-auto pt-2">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Package className="h-7 w-7 text-[#00a5df]" /> Activos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Equipos y herramientas de Herco por categoría, con ficha e historial.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {meta?.categorias.length > 0 && <><BotonRecorrido onClick={recorrido} /><BotonTour tour={tour} /></>}
          {meta?.admin && (
            <ConNovedad clave="activos-categorias" className="flex-1 sm:flex-none">
              <Button variant="outline" onClick={() => navigate('/activos/categorias')} className="rounded-xl w-full" data-testid="activos-categorias" data-tour="activos-categorias">
                <Shapes className="h-4 w-4 mr-1.5" /> Categorías
              </Button>
            </ConNovedad>
          )}
          {puedeRegistrar && (
            <Button onClick={() => setNuevo(true)} className="rounded-xl bg-[#1e395e] hover:bg-[#162c49] text-white flex-1 sm:flex-none" data-testid="activos-nuevo" data-tour="activos-nuevo">
              <Plus className="h-4 w-4 mr-1" /> Registrar activo
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
          <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No tienes acceso a Activos o no se pudo cargar el módulo.</p>
        </div>
      ) : !meta ? (
        <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>
      ) : !meta.categorias.length ? (
        <div className="rounded-[18px] border border-dashed bg-card p-10 text-center">
          <Shapes className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">Aún no hay categorías de activos.</p>
          {meta.admin && <Button onClick={() => navigate('/activos/categorias')} className="rounded-xl mt-4 bg-[#1e395e] hover:bg-[#162c49] text-white">Crear la primera categoría</Button>}
        </div>
      ) : (
        <>
          <Resumen resumen={resumen} meta={meta} filtro={cat} onFiltrar={setCat} />

          <div className="flex flex-wrap items-center gap-2 mb-4" data-tour="activos-filtros">
            <div className="relative w-full sm:w-[280px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar código, nombre, serie…" className="h-10 pl-9" data-testid="activos-buscar" />
            </div>
            <div className="grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto sm:ml-auto">
              <NativeSelect value={cat} onChange={setCat} className="h-10 sm:w-[180px]" aria-label="Categoría">
                <option value="">Todas las categorías</option>
                {meta.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </NativeSelect>
              <NativeSelect value={sucursal} onChange={setSucursal} className="h-10 sm:w-[150px]" aria-label="Sucursal">
                <option value="">Todas las sucursales</option>
                {meta.sucursales.map((s) => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
              <NativeSelect value={estado} onChange={setEstado} className="h-10 sm:w-[130px]" aria-label="Estado">
                <option value="activo">En uso</option>
                <option value="baja">De baja</option>
                <option value="">Todos</option>
              </NativeSelect>
            </div>
          </div>

          {rows === null ? (
            <p className="text-sm text-muted-foreground text-center py-12">Cargando…</p>
          ) : !lista.length ? (
            <div className="rounded-[18px] border border-dashed bg-card p-10 text-center">
              <Package className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                {rows.length ? 'Ningún activo coincide con la búsqueda.' : 'No hay activos con estos filtros.'}
              </p>
            </div>
          ) : <div data-tour="activos-lista">{esMovil ? <Tarjetas rows={lista} cat={categoria} onOpen={abrir} /> : <Tabla rows={lista} cat={categoria} onOpen={abrir} />}</div>}
          {resumen?.bajas > 0 && estado === 'activo' && (
            <p className="text-xs text-muted-foreground mt-3">
              {resumen.bajas} activo{resumen.bajas === 1 ? '' : 's'} de baja: elige "De baja" en el filtro para verlos.
            </p>
          )}
        </>
      )}

      <Tour tour={tour} pasos={pasos} />
      {meta && (
        <ActivoForm open={nuevo} onOpenChange={setNuevo} meta={meta} inicial={categoria(cat)?.puede_editar ? { categoria_id: cat } : undefined}
          onSaved={(a) => navigate(`/activos/${a.id}`)} />
      )}
    </div>
  );
}
