import React from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardEdit } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canUseFormularioModule } from '@/lib/constants';
import FormBuilder from '@/components/customform/FormBuilder';

export default function CustomFormBuilderPage() {
  const { user } = useAuth();
  if (!canUseFormularioModule(user)) return <Navigate to="/formularios" replace />;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="mb-5">
        <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
          <ClipboardEdit className="h-7 w-7 text-[#00a5df]" /> Haz tu form personalizado
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Arma tus preguntas, decide si llevan puntaje y a quién va dirigido</p>
      </div>
      <FormBuilder />
    </div>
  );
}
