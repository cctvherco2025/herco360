import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ClipboardCheck, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessFlos } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AuditWizard from '@/components/formulario/AuditWizard';
import Historial from '@/components/formulario/Historial';

export default function Formulario() {
  const { user } = useAuth();
  const [historyKey, setHistoryKey] = useState(0);
  const [tab, setTab] = useState('nueva');

  if (!canAccessFlos(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ClipboardCheck className="h-7 w-7 text-[#00a5df]" /> Formulario
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Auditoría de piso FLOS — Frenteo, Limpieza, Orden y Surtido</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5">
          <Lock className="h-3.5 w-3.5" /> Módulo restringido
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="nueva" className="rounded-lg" data-testid="flos-tab-nueva">Nueva auditoría</TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg" data-testid="flos-tab-historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="nueva">
          <AuditWizard onSubmitted={() => { setHistoryKey((k) => k + 1); setTab('historial'); }} />
        </TabsContent>
        <TabsContent value="historial">
          <Historial refreshKey={historyKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
