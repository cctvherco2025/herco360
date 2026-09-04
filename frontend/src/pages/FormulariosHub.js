import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ClipboardCheck, FileText, ChevronRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessFlos } from '@/lib/constants';

// Catálogo de evaluaciones disponibles. Hoy solo existe FLOS; cuando se sume
// otra (auditoría de seguridad, checklist de apertura…) se agrega aquí y
// aparece como otra tarjeta.
const EVALUATIONS = [
  { to: '/formulario', label: 'Evaluación FLOS', desc: 'Frenteo · Limpieza · Orden · Surtido', icon: ClipboardCheck, color: '#00a5df' },
];

export default function FormulariosHub() {
  const { user } = useAuth();
  if (!canAccessFlos(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <FileText className="h-7 w-7 text-[#00a5df]" /> Formularios
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Elige una evaluación para comenzar</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {EVALUATIONS.map((e, i) => (
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
    </div>
  );
}
