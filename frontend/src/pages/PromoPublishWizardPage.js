import React from 'react';
import { Navigate, Link } from 'react-router-dom';
import { Percent, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canManagePromos } from '@/lib/constants';
import PromoPublishWizard from '@/components/promociones/PromoPublishWizard';

export default function PromoPublishWizardPage() {
  const { user } = useAuth();
  if (!canManagePromos(user)) return <Navigate to="/formularios/promociones" replace />;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <Link to="/formularios/promociones" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="h-3.5 w-3.5" /> Promociones del mes
      </Link>
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <Percent className="h-7 w-7 text-[#16a34a]" /> Nueva publicación de Promociones
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Cargar Excel → Detectar columnas → Generar preguntas → Configurar → Publicar</p>
      </div>
      <PromoPublishWizard />
    </div>
  );
}
