import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAdminPromos } from '@/lib/constants';
import { PlazosPorDefecto } from '@/pages/PromocionesHome';
import RevisoresCategoria from '@/components/promociones/RevisoresCategoria';

/* Promociones del mes › Configuración (solo quien administra Promociones):
   plazos por defecto de cada mes y revisores por categoría. */
export default function PromocionesConfig() {
  const { user } = useAuth();
  if (!canAdminPromos(user)) return <Navigate to="/formularios/promociones" replace />;
  return (
    <div className="max-w-[840px] mx-auto pt-2">
      <Link to="/formularios/promociones" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Promociones del mes
      </Link>
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Settings className="h-7 w-7 text-[#1e395e] dark:text-[#93c5fd]" /> Configuración
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Plazos de cada mes y quién revisa cada categoría en Promociones del mes</p>
      </div>
      <PlazosPorDefecto />
      <RevisoresCategoria />
    </div>
  );
}
