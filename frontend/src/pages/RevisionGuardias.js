import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheck, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessGuardias, canFillGuardias } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import GuardiaWizard from '@/components/guardias/GuardiaWizard';
import Historial from '@/components/guardias/Historial';

export default function RevisionGuardias() {
  const { user } = useAuth();
  const canFill = canFillGuardias(user);
  const [historyKey, setHistoryKey] = useState(0);
  const [tab, setTab] = useState(canFill ? 'nueva' : 'historial');

  if (!canAccessGuardias(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1100px] mx-auto pt-2">
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-[#00a5df]" /> Revisión de Guardias
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Supervisión de guardias de seguridad — ECCP</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5 shrink-0">
          <Lock className="h-3.5 w-3.5" /> Módulo restringido
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl mb-5">
          {canFill && <TabsTrigger value="nueva" className="rounded-lg" data-testid="guardias-tab-nueva">Nueva evaluación</TabsTrigger>}
          <TabsTrigger value="historial" className="rounded-lg" data-testid="guardias-tab-historial">Historial</TabsTrigger>
        </TabsList>

        {canFill && (
          <TabsContent value="nueva">
            <GuardiaWizard onSubmitted={() => setHistoryKey((k) => k + 1)} />
          </TabsContent>
        )}
        <TabsContent value="historial">
          <Historial refreshKey={historyKey} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
