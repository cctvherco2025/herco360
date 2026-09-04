import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ClipboardCheck, ClipboardList, FileText, ChevronRight, Plus, Users, Building2, User as UserIcon } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAccessFlos, canAccessRutina, canUseFormularioModule } from '@/lib/constants';
import { Button } from '@/components/ui/button';

// Evaluaciones fijas del sistema. Cuando se sume otra igual de "oficial" se
// agrega aquí; los formularios que arma cada usuario ("Haz tu form
// personalizado") no están hardcodeados — se cargan desde el backend.
const BUILT_IN = [
  { to: '/formulario', label: 'Evaluación FLOS', desc: 'Frenteo · Limpieza · Orden · Surtido', icon: ClipboardCheck, color: '#00a5df', access: canAccessFlos },
  { to: '/rutina-operativa', label: 'Rutina Operativa', desc: 'Evaluación mensual de gestión — Gerentes', icon: ClipboardList, color: '#ec9032', access: canAccessRutina },
];

const AUD_ICON = { todos: Users, area: Building2, cargo: UserIcon };
const AUD_LABEL = (a) => {
  if (!a) return '';
  if (a.tipo === 'todos') return 'Todos';
  if (a.tipo === 'area') return `Área: ${a.valor}`;
  if (a.tipo === 'cargo') return `Cargo: ${a.valor}`;
  return '';
};

export default function FormulariosHub() {
  const { user } = useAuth();
  const [customForms, setCustomForms] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/formularios-custom/disponibles'); setCustomForms(data); }
    catch (e) { toast.error('No se pudieron cargar los formularios personalizados'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const builtIn = BUILT_IN.filter((e) => e.access(user));
  const canBuild = canUseFormularioModule(user);

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
          <Button asChild data-testid="formularios-hub-nuevo">
            <Link to="/formularios/nuevo"><Plus className="h-4 w-4 mr-1.5" /> Haz tu form personalizado</Link>
          </Button>
        )}
      </div>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {customForms.map((f, i) => {
              const AudIcon = AUD_ICON[f.audiencia?.tipo] || Users;
              return (
                <Link key={f.id} to={`/formularios/custom/${f.id}`} data-testid={`formularios-hub-custom-${f.id}`}>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="group h-full rounded-[18px] bg-card border shadow-card p-5 hover:shadow-cardmd hover:-translate-y-0.5 transition-[transform,box-shadow]">
                    <span className="h-11 w-11 rounded-full grid place-items-center bg-[rgba(113,33,70,0.13)]">
                      <ClipboardList className="h-5 w-5 text-[#712146]" />
                    </span>
                    <p className="font-heading font-semibold mt-3">{f.titulo}{f.is_creator && <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground align-middle">· tuyo</span>}</p>
                    {f.descripcion && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.descripcion}</p>}
                    <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1"><AudIcon className="h-3 w-3" /> {AUD_LABEL(f.audiencia)}{!f.has_scoring && ' · sin puntaje'}</p>
                    <span className="inline-flex items-center gap-1 text-xs font-medium mt-3 text-[#712146]">
                      Comenzar <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {!loading && builtIn.length === 0 && customForms.length === 0 && (
        <div className="rounded-[18px] bg-card border shadow-card p-10 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm text-muted-foreground">No tienes formularios disponibles todavía.</p>
        </div>
      )}
    </div>
  );
}

