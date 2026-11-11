import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BadgeCheck, ClipboardCheck, ClipboardList, FileText, ChevronRight, Plus, Percent, ShieldCheck, Route as RouteIcon, Tags, Search } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessFlos, canAccessRutina, canAccessFormulariosPrincipal, canAccessPromocionesMes, canCreateCustomFormulario, canAccessGuardias, canAccessRecorridos, canAccessEtiquetas, puedeVerTickets, puede } from '@/lib/constants';
import { ESTADOS } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import NuevoFormulario from '@/components/formularios/NuevoFormulario';

// Evaluaciones fijas del sistema. Cuando se sume otra igual de "oficial" se
// agrega aquí; los formularios que arma cada usuario ("Haz tu form
// personalizado") no están hardcodeados — se cargan desde el backend.
// Cada tarjeta valida su propio permiso independiente (formularios.*):
// tener acceso al Hub no implica ver todas las evaluaciones.
const BUILT_IN = [
  { to: '/formulario', area: 'Tienda', label: 'Evaluación FLOS', desc: 'Frenteo · Limpieza · Orden · Surtido', icon: ClipboardCheck, color: '#00a5df', access: canAccessFlos },
  { to: '/rutina-operativa', area: 'Tienda', label: 'Rutina Operativa', desc: 'Evaluación mensual de gestión — Gerentes', icon: ClipboardList, color: '#ec9032', access: canAccessRutina },
  { to: '/revision-guardias', area: 'ECCP', label: 'Revisión de Guardias', desc: 'Supervisión de guardias de seguridad', icon: ShieldCheck, color: '#1e395e', access: canAccessGuardias },
  { to: '/recorridos-preventivos', area: 'ECCP', label: 'Recorridos Preventivos', desc: 'Irregularidades en tienda, evidencias y seguimiento', icon: RouteIcon, color: '#ec9032', access: canAccessRecorridos },
  { to: '/auditoria-etiquetas', area: 'ECCP', label: 'Auditoría de Etiquetas', desc: 'Auditoría semanal de etiquetas de precios', icon: Tags, color: '#16a34a', access: canAccessEtiquetas },
  { to: '/formularios/promociones', area: 'Tienda', label: 'Promociones del mes', desc: 'Disponibilidad y exhibición de promociones en tienda', icon: Percent, color: '#16a34a', access: canAccessPromocionesMes },
];

// Audiencia por listas: la etiqueta muestra lo que aplique.
const AUD_LABEL = (a) => {
  if (!a) return '';
  if (a.todos) return 'Todos';
  const parts = [];
  if ((a.areas || []).length) parts.push(`Área: ${a.areas.join(', ')}`);
  if ((a.cargos || []).length) parts.push(`Cargo: ${a.cargos.join(', ')}`);
  if ((a.user_ids || []).length) parts.push(`${a.user_ids.length} usuario(s)`);
  return parts.join(' · ');
};

// Áreas en que se agrupa lo que hay que llenar. Los formularios del
// constructor todavía no guardan su área: van en «Otras».
const AREAS = ['ECCP', 'Tienda', 'Otras'];
const sinAcentos = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const diaCorto = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`; };

// Promociones del mes, para la franja de pendientes y la etiqueta de su fila:
// el coordinador ve las categorías sin contestar; quien revisa, las que esperan revisión.
function resumenPromos(mias) {
  const pubs = mias?.publicaciones || [];
  if (mias?.rol === 'coordinador') {
    const n = pubs.reduce((s, p) => s + (p.pendientes || 0), 0);
    const vence = pubs.map((p) => p.vence_respuesta).filter(Boolean).sort()[0];
    return n ? { n, texto: `${plural(n, 'categoría', 'categorías')} sin contestar`, vence, chip: `${n} sin contestar` } : null;
  }
  if (mias?.rol === 'revisor') {
    const n = pubs.reduce((s, p) => s + (p.por_revisar || 0), 0);
    const vence = pubs.map((p) => p.vence_revision).filter(Boolean).sort()[0];
    const tienda = pubs.find((p) => p.tienda)?.tienda;
    return n ? { n, texto: `${plural(n, 'categoría', 'categorías')}${tienda ? ` de ${tienda}` : ''} por revisar`, vence, chip: `${n} por revisar` } : null;
  }
  return null;
}

function Pendiente({ to, n, color, titulo, texto, testid }) {
  return (
    <Link to={to} data-testid={testid}
      className="group flex items-center gap-3 min-h-[56px] px-3.5 py-2.5 rounded-[14px] border bg-card hover:bg-muted/60 transition-colors">
      {n > 0
        ? <span className="min-w-[26px] h-[26px] px-1.5 rounded-full text-white text-[13px] font-bold grid place-items-center shrink-0" style={{ background: color }}>{n}</span>
        : <BadgeCheck className="h-[22px] w-[22px] shrink-0 text-[#1e395e] dark:text-[#3cbef6]" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs text-muted-foreground truncate">{texto}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

function FilaFormulario({ f }) {
  return (
    <Link to={f.to} data-testid={f.testid}
      className="group flex items-center gap-3 min-h-[68px] px-3.5 py-3 rounded-[14px] border bg-card hover:border-[#c5cfdc] hover:shadow-cardmd transition-[border-color,box-shadow] dark:hover:border-white/20">
      <span className="h-[38px] w-[38px] rounded-full grid place-items-center shrink-0" style={{ background: `${f.color}1f` }}>
        <f.icon className="h-[18px] w-[18px]" style={{ color: f.color }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold truncate">{f.label}</span>
        {f.desc && <span className="block text-xs text-muted-foreground truncate">{f.desc}</span>}
      </span>
      {f.chip && (
        <span className="shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-[#fff3e2] text-[#a2560c] dark:bg-[rgba(236,144,50,0.18)] dark:text-[#f5b56b]">{f.chip}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
    </Link>
  );
}

const pastilla = (activo) => `min-h-[36px] px-3 rounded-full text-sm transition-colors ${activo
  ? 'bg-[#1e395e] text-white font-semibold dark:bg-[#3cbef6] dark:text-[#0b1424]'
  : 'border bg-card hover:bg-muted'}`;

export default function FormulariosHub() {
  const { user } = useAuth();
  const [customForms, setCustomForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [pestana, setPestana] = useState('llenar');
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('');
  const [filtro, setFiltro] = useState('todos');
  // Supervisión: solo para quien supervisa algún formulario o es admin.
  const [supervision, setSupervision] = useState({ ver: false, pendientes: 0 });
  const [promos, setPromos] = useState(null);
  const [tickets, setTickets] = useState({ pendientes: 0, tiene: false });
  const conSeguimientos = puede(user, 'seguimientos');

  const hasAccess = canAccessFormulariosPrincipal(user);
  const verPromos = canAccessPromocionesMes(user);

  const load = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    try { const { data } = await api.get('/formularios-custom/disponibles'); setCustomForms(data); }
    catch (e) { toast.error('No se pudieron cargar los formularios personalizados'); }
    finally { setLoading(false); }
  }, [hasAccess]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!hasAccess) return;
    api.get('/formularios-v2/supervision/contador').then(({ data }) => setSupervision(data)).catch(() => {});
    if (verPromos) api.get('/promo-tareas/mias').then(({ data }) => setPromos(resumenPromos(data))).catch(() => {});
    if (conSeguimientos) api.get('/tickets/contador').then(({ data }) => setTickets(data)).catch(() => {});
  }, [hasAccess, verPromos, conSeguimientos]);
  // Seguimientos es parte de Formularios (los tickets de formularios y promociones)
  const verSeguimientos = puedeVerTickets(user) || (conSeguimientos && tickets.tiene);

  const canBuild = canCreateCustomFormulario(user);
  const estadoDe = (f) => (f.esquema === 2 ? f.estado : 'publicado');

  // Lo que se llena: los fijos a los que tiene acceso y los personalizados publicados.
  const paraLlenar = useMemo(() => {
    const fijos = BUILT_IN.filter((e) => e.access(user)).map((e) => ({
      ...e, testid: `formularios-hub-card-${e.to.replace('/', '')}`,
      chip: e.to === '/formularios/promociones' ? promos?.chip : null,
    }));
    const publicados = customForms.filter((f) => (f.esquema === 2 ? f.estado === 'publicado' && f.version : true)).map((f) => ({
      to: `/formularios/custom/${f.id}`, label: f.titulo, area: AREAS.includes(f.seccion) ? f.seccion : 'Otras', icon: ClipboardList, color: '#712146',
      desc: f.descripcion || (f.esquema === 2 ? plural(f.preguntas || 0, 'pregunta', 'preguntas') : AUD_LABEL(f.audiencia)),
      testid: `formularios-hub-custom-${f.id}`,
    }));
    return [...fijos, ...publicados];
  }, [user, customForms, promos]);
  // Lo que la persona construye.
  const mios = customForms.filter((f) => f.puede_editar || f.is_creator);

  if (!hasAccess) return <Navigate to="/" replace />;

  const q = sinAcentos(busca.trim());
  const coincide = (t) => !q || sinAcentos(t).includes(q);
  const areasConForms = AREAS.filter((a) => paraLlenar.some((f) => f.area === a));
  const grupos = AREAS.map((a) => [a, paraLlenar.filter((f) => f.area === a && (!area || area === a) && coincide(`${f.label} ${f.desc || ''}`))])
    .filter(([, l]) => l.length);

  const FILTROS = [['todos', 'Todos'], ['borrador', 'Borradores'], ['publicado', 'Publicados'], ['despublicado', 'Despublicados']];
  const conteo = (k) => mios.filter((f) => k === 'todos' || estadoDe(f) === k).length;
  const misVisibles = mios.filter((f) => (filtro === 'todos' || estadoDe(f) === filtro) && coincide(f.titulo));
  const enMios = pestana === 'mios' && canBuild;

  return (
    <div className="max-w-[1000px] mx-auto pt-2 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <FileText className="h-7 w-7 text-[#00a5df]" /> Formularios
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Lo que debes llenar, por área</p>
        </div>
        {canBuild && (
          <Button onClick={() => setNuevo(true)} className="max-sm:w-full" data-testid="formularios-hub-nuevo">
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo formulario
          </Button>
        )}
        {canBuild && <NuevoFormulario open={nuevo} onOpenChange={setNuevo} propios={mios.filter((f) => f.esquema === 2)} />}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {canBuild && (
          <div role="tablist" aria-label="Secciones" className="flex gap-1 p-1 rounded-[14px] border bg-card max-sm:w-full">
            {[['llenar', 'Formularios'], ['mios', `Mis formularios · ${mios.length}`]].map(([k, n]) => (
              <button key={k} type="button" role="tab" aria-selected={pestana === k} onClick={() => setPestana(k)} data-testid={`formularios-hub-tab-${k}`}
                className={`h-9 px-3.5 rounded-[10px] text-sm whitespace-nowrap max-sm:flex-1 transition-colors ${pestana === k ? 'bg-[#1e395e] text-white font-semibold dark:bg-[#3cbef6] dark:text-[#0b1424]' : 'text-muted-foreground hover:bg-muted'}`}>
                {n}
              </button>
            ))}
          </div>
        )}
        <label className="flex flex-1 basis-[220px] min-w-0 items-center gap-2 h-11 px-3 rounded-xl border bg-card">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar formulario" aria-label="Buscar formulario"
            spellCheck={false} autoComplete="off" className="flex-1 min-w-0 bg-transparent outline-none text-sm" data-testid="formularios-hub-buscar" />
        </label>
      </div>

      {!enMios && (
        <>
          {(supervision.ver || promos || verSeguimientos) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {supervision.ver && (
                <Pendiente to="/formularios/supervision" n={supervision.pendientes} color="#dc2626" titulo="Supervisión" testid="formularios-hub-supervision"
                  texto={supervision.pendientes ? `${plural(supervision.pendientes, 'respuesta', 'respuestas')} por revisar` : 'Nada por revisar'} />
              )}
              {promos && (
                <Pendiente to="/formularios/promociones" n={promos.n} color="#ec9032" titulo="Promociones del mes" testid="formularios-hub-promos-pendiente"
                  texto={`${promos.texto}${promos.vence ? ` · vence ${diaCorto(promos.vence)}` : ''}`} />
              )}
              {verSeguimientos && (
                <Pendiente to="/formularios/tickets" n={tickets.pendientes || 0} color="#dc2626" titulo="Seguimientos" testid="formularios-hub-seguimientos"
                  texto={tickets.pendientes ? `${plural(tickets.pendientes, 'seguimiento', 'seguimientos')} esperando tu acción` : 'Nada pendiente'} />
              )}
            </div>
          )}

          {areasConForms.length > 1 && (
            <div role="radiogroup" aria-label="Filtrar por área" className="flex flex-wrap gap-2">
              {[['', 'Todas las áreas'], ...areasConForms.map((a) => [a, a])].map(([k, n]) => (
                <button key={n} type="button" role="radio" aria-checked={area === k} onClick={() => setArea(k)} className={pastilla(area === k)}>{n}</button>
              ))}
            </div>
          )}

          {grupos.map(([a, lista]) => (
            <section key={a} className="space-y-2.5" data-testid={`formularios-hub-area-${a}`}>
              <h2 className="font-heading text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">{a} · {lista.length}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {lista.map((f) => <FilaFormulario key={f.to} f={f} />)}
              </div>
            </section>
          ))}
          {!loading && !grupos.length && (
            <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{paraLlenar.length ? 'Ningún formulario coincide con la búsqueda.' : 'No tienes formularios para llenar todavía.'}</p>
            </div>
          )}
        </>
      )}

      {enMios && (
        <>
          <div role="radiogroup" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
            {FILTROS.map(([k, n]) => (
              <button key={k} type="button" role="radio" aria-checked={filtro === k} onClick={() => setFiltro(k)} className={pastilla(filtro === k)}>{n} · {conteo(k)}</button>
            ))}
          </div>
          <div className="rounded-[16px] border bg-card overflow-hidden divide-y" data-testid="formularios-hub-mios">
            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_120px_220px_160px] gap-3 px-4 py-2.5 bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Formulario</span><span>Estado</span><span>Detalle</span><span />
            </div>
            {misVisibles.map((f) => {
              const nuevoFormato = f.esquema === 2;
              const sinPublicar = nuevoFormato && !f.version;
              const editar = nuevoFormato ? `/formularios/v2/${f.id}/editar` : `/formularios/custom/${f.id}/editar`;
              const [estadoNombre, estadoClase] = ESTADOS[estadoDe(f)] || ESTADOS.publicado;
              const detalle = nuevoFormato
                ? `${f.version ? `Versión ${f.version}` : 'Sin publicar'} · ${plural(f.preguntas || 0, 'pregunta', 'preguntas')}${f.version && f.respuestas !== null && f.respuestas !== undefined ? ` · ${plural(f.respuestas, 'respuesta', 'respuestas')}` : ''}`
                : AUD_LABEL(f.audiencia);
              return (
                <div key={f.id} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_120px_220px_160px] items-center gap-x-3 gap-y-1 px-4 py-3"
                  data-testid={`formularios-hub-mio-${f.id}`}>
                  <span className="min-w-0 text-[15px] font-semibold truncate">{f.titulo}</span>
                  <span className="max-sm:order-3"><span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${estadoClase}`}>{estadoNombre}</span></span>
                  <span className="text-xs text-muted-foreground max-sm:order-4 max-sm:col-span-2">{detalle}</span>
                  <span className="flex justify-end gap-1 max-sm:order-2 max-sm:row-span-2">
                    {!sinPublicar && (
                      <Link to={`/formularios/custom/${f.id}`} className="text-[13px] font-semibold text-[#1e395e] dark:text-[#3cbef6] rounded-lg px-2 py-1.5 hover:bg-muted">Abrir</Link>
                    )}
                    <Link to={editar} className="text-[13px] font-semibold text-[#1e395e] dark:text-[#3cbef6] rounded-lg px-2 py-1.5 hover:bg-muted whitespace-nowrap">
                      {sinPublicar ? 'Seguir editando' : 'Editar'}
                    </Link>
                  </span>
                </div>
              );
            })}
            {!misVisibles.length && (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {mios.length ? 'Ningún formulario en este estado.' : 'Todavía no has creado formularios. Usa «Nuevo formulario» para crear uno.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
