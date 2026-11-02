import React, { useState, useEffect, useCallback } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { BadgeCheck, ClipboardCheck, ClipboardList, FileText, ChevronRight, Plus, Users, Building2, User as UserIcon, Percent, ShieldCheck, Route as RouteIcon, Tags, Pencil } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessFlos, canAccessRutina, canAccessFormulariosPrincipal, canAccessPromocionesMes, canCreateCustomFormulario, canAccessGuardias, canAccessRecorridos, canAccessEtiquetas } from '@/lib/constants';
import { ESTADOS } from '@/lib/formularios';
import { Button } from '@/components/ui/button';
import NuevoFormulario from '@/components/formularios/NuevoFormulario';

// Evaluaciones fijas del sistema. Cuando se sume otra igual de "oficial" se
// agrega aquí; los formularios que arma cada usuario ("Haz tu form
// personalizado") no están hardcodeados — se cargan desde el backend.
// Cada tarjeta valida su propio permiso independiente (formularios.*):
// tener acceso al Hub no implica ver todas las evaluaciones.
const BUILT_IN = [
  { to: '/formulario', label: 'Evaluación FLOS', desc: 'Frenteo · Limpieza · Orden · Surtido', icon: ClipboardCheck, color: '#00a5df', access: canAccessFlos },
  { to: '/rutina-operativa', label: 'Rutina Operativa', desc: 'Evaluación mensual de gestión — Gerentes', icon: ClipboardList, color: '#ec9032', access: canAccessRutina },
  { to: '/revision-guardias', label: 'Revisión de Guardias', desc: 'Supervisión de guardias de seguridad — ECCP', icon: ShieldCheck, color: '#1e395e', access: canAccessGuardias },
  { to: '/recorridos-preventivos', label: 'Recorridos Preventivos', desc: 'Irregularidades en tienda, evidencias y seguimiento — ECCP', icon: RouteIcon, color: '#ec9032', access: canAccessRecorridos },
  { to: '/auditoria-etiquetas', label: 'Auditoría de Etiquetas', desc: 'Auditoría semanal de etiquetas de precios — ECCP', icon: Tags, color: '#16a34a', access: canAccessEtiquetas },
  { to: '/formularios/promociones', label: 'Promociones del mes', desc: 'Seguimiento a la disponibilidad y correcta exhibición de promociones en tienda', icon: Percent, color: '#16a34a', access: canAccessPromocionesMes },
];

// Audiencia por listas: puede combinar todos/áreas/cargos/usuarios a la vez;
// el ícono y la etiqueta muestran lo primero que aplique.
const AUD_ICON_FOR = (a) => {
  if (!a) return Users;
  if (a.todos) return Users;
  if ((a.areas || []).length) return Building2;
  if ((a.cargos || []).length) return UserIcon;
  return Users;
};
const AUD_LABEL = (a) => {
  if (!a) return '';
  if (a.todos) return 'Todos';
  const parts = [];
  if ((a.areas || []).length) parts.push(`Área: ${a.areas.join(', ')}`);
  if ((a.cargos || []).length) parts.push(`Cargo: ${a.cargos.join(', ')}`);
  if ((a.user_ids || []).length) parts.push(`${a.user_ids.length} usuario(s)`);
  return parts.join(' · ');
};

// Las tarjetas son para llenar; esto es para revisar lo que llenó la gente, y
// por eso va aparte: una línea discreta, con el número solo si hay algo por revisar.
function FranjaSupervision({ pendientes }) {
  return (
    <Link to="/formularios/supervision" data-testid="formularios-hub-supervision"
      className="group mb-4 flex items-center gap-2.5 min-h-[44px] px-3.5 py-2 rounded-xl border bg-card hover:bg-muted transition-colors">
      <BadgeCheck className="h-[18px] w-[18px] shrink-0 text-[#1e395e] dark:text-[#3cbef6]" />
      <span className="text-sm font-medium">Supervisión</span>
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {pendientes > 0 && (
          <span title={`${pendientes} por revisar`} className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#dc2626] text-white text-[11px] font-semibold grid place-items-center">{pendientes}</span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
}

export default function FormulariosHub() {
  const { user } = useAuth();
  const [customForms, setCustomForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  // Supervisión: solo para quien supervisa algún formulario o es admin.
  const [supervision, setSupervision] = useState({ ver: false, pendientes: 0 });

  const hasAccess = canAccessFormulariosPrincipal(user);

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
  }, [hasAccess]);

  if (!hasAccess) return <Navigate to="/" replace />;

  const builtIn = BUILT_IN.filter((e) => e.access(user));
  const canBuild = canCreateCustomFormulario(user);
  // del constructor nuevo: quien los edita ve también borradores y despublicados, con filtro por estado
  const editables = customForms.filter((f) => f.esquema === 2 && f.puede_editar);
  const estadoDe = (f) => (f.esquema === 2 ? f.estado : 'publicado');
  const conteo = (k) => customForms.filter((f) => k === 'todos' || estadoDe(f) === k).length;
  const visibles = customForms.filter((f) => filtro === 'todos' || estadoDe(f) === filtro);
  const FILTROS = [['todos', 'Todos'], ['borrador', 'Borradores'], ['publicado', 'Publicados'], ['despublicado', 'Despublicados']];

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <FileText className="h-7 w-7 text-[#00a5df]" /> Formularios
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Elige una evaluación para comenzar</p>
        </div>
        {canBuild && (
          <Button onClick={() => setNuevo(true)} data-testid="formularios-hub-nuevo">
            <Plus className="h-4 w-4 mr-1.5" /> Nuevo formulario
          </Button>
        )}
        {canBuild && <NuevoFormulario open={nuevo} onOpenChange={setNuevo} propios={editables} />}
      </div>

      {supervision.ver && <FranjaSupervision pendientes={supervision.pendientes} />}

      {builtIn.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {builtIn.map((e, i) => (
            <Link key={e.to} to={e.to} data-testid={`formularios-hub-card-${e.to.replace('/', '')}`}>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}
                className="group h-full rounded-[18px] bg-card border shadow-card p-5 hover:shadow-cardmd hover:-translate-y-0.5 transition-[transform,box-shadow]">
                <span className="h-11 w-11 rounded-full grid place-items-center" style={{ background: `${e.color}22` }}>
                  <e.icon className="h-5 w-5" style={{ color: e.color }} />
                </span>
                <p className="font-heading font-semibold mt-3">{e.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{e.desc}</p>
                <span className="inline-flex items-center gap-1 text-xs font-medium mt-3" style={{ color: e.color }}>
                  Comenzar <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </motion.div>
            </Link>
          ))}
        </div>
      )}

      {!loading && customForms.length > 0 && (
        <>
          <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Formularios personalizados</h2>
          {editables.length > 0 && (
            <div role="radiogroup" aria-label="Filtrar por estado" className="flex flex-wrap gap-2 mb-3">
              {FILTROS.map(([k, n]) => (
                <button key={k} type="button" role="radio" aria-checked={filtro === k} onClick={() => setFiltro(k)}
                  className={`min-h-[36px] px-3 rounded-full text-sm ${filtro === k ? 'bg-[#1e395e] text-white font-semibold dark:bg-[#3cbef6] dark:text-[#0b1424]' : 'border bg-card hover:bg-muted'}`}>
                  {n} · {conteo(k)}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibles.map((f, i) => {
              const AudIcon = AUD_ICON_FOR(f.audiencia);
              const nuevoFormato = f.esquema === 2;
              const sinPublicar = nuevoFormato && !f.version;
              const editar = nuevoFormato ? `/formularios/v2/${f.id}/editar` : `/formularios/custom/${f.id}/editar`;
              const [estadoNombre, estadoClase] = ESTADOS[f.estado] || ESTADOS.publicado;
              return (
                <motion.div key={f.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="group relative h-full rounded-[18px] bg-card border shadow-card p-5 hover:shadow-cardmd hover:-translate-y-0.5 transition-[transform,box-shadow]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="h-11 w-11 rounded-full grid place-items-center bg-[rgba(113,33,70,0.13)]">
                      <ClipboardList className="h-5 w-5 text-[#712146]" />
                    </span>
                    {nuevoFormato && f.puede_editar && <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${estadoClase}`}>{estadoNombre}</span>}
                  </div>
                  <p className="font-heading font-semibold mt-3">
                    {/* toda la tarjeta abre el formulario (o el constructor si nunca se publicó) */}
                    <Link to={sinPublicar && f.puede_editar ? editar : `/formularios/custom/${f.id}`} data-testid={`formularios-hub-custom-${f.id}`}
                      className="after:absolute after:inset-0 after:rounded-[18px] focus-visible:outline-none">{f.titulo}</Link>
                    {f.is_creator && <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground align-middle">· tuyo</span>}
                  </p>
                  {f.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.descripcion}</p>}
                  {!nuevoFormato && <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><AudIcon className="h-3 w-3" /> {AUD_LABEL(f.audiencia)}{!f.has_scoring && ' · sin puntaje'}</p>}
                  {nuevoFormato && f.puede_editar && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {f.version ? `Versión ${f.version}` : 'Sin publicar'} · {f.preguntas} {f.preguntas === 1 ? 'pregunta' : 'preguntas'}
                      {f.respuestas !== null && f.respuestas !== undefined ? ` · ${f.respuestas} ${f.respuestas === 1 ? 'respuesta' : 'respuestas'}` : ''}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#712146]">
                      {sinPublicar ? 'Seguir editando' : 'Comenzar'} <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    {nuevoFormato && f.puede_editar && !sinPublicar && (
                      <Link to={editar} className="relative z-10 inline-flex items-center gap-1 text-xs font-medium text-[#1e395e] dark:text-[#3cbef6] rounded-lg px-2 py-1.5 -my-1.5 hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Link>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {!visibles.length && <p className="text-sm text-muted-foreground sm:col-span-2">Ningún formulario en este estado.</p>}
          </div>
        </>
      )}

      {!loading && builtIn.length === 0 && customForms.length === 0 && !supervision.ver && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No tienes formularios disponibles todavía.</p>
        </div>
      )}
    </div>
  );
}

