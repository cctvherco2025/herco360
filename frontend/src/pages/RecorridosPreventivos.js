import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Route as RouteIcon, Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessRecorridos, canFillRecorridos, canAdminRecorridos } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import RecorridoWizard from '@/components/recorridos/RecorridoWizard';
import Historial from '@/components/recorridos/Historial';
import Indicadores from '@/components/recorridos/Indicadores';

export default function RecorridosPreventivos() {
  const { user } = useAuth();
  const canFill = canFillRecorridos(user);
  const isAdmin = canAdminRecorridos(user);
  const [historyKey, setHistoryKey] = useState(0);
  const [tab, setTab] = useState(canFill ? 'nuevo' : 'historial');

  if (!canAccessRecorridos(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1100px] mx-auto pt-2">
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <RouteIcon className="h-7 w-7 text-[#00a5df]" /> Recorridos Preventivos
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Irregularidades en tienda — ECCP</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5 shrink-0">
          <Lock className="h-3.5 w-3.5" /> Módulo restringido
        </span>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl mb-5">
          {canFill && <TabsTrigger value="nuevo" className="rounded-lg" data-testid="recorridos-tab-nuevo">Nuevo recorrido</TabsTrigger>}
          <TabsTrigger value="historial" className="rounded-lg" data-testid="recorridos-tab-historial">Historial</TabsTrigger>
          {isAdmin && <TabsTrigger value="indicadores" className="rounded-lg" data-testid="recorridos-tab-indicadores">Indicadores</TabsTrigger>}
        </TabsList>

        {canFill && (
          <TabsContent value="nuevo">
            <RecorridoWizard onSubmitted={() => setHistoryKey((k) => k + 1)} />
          </TabsContent>
        )}
        <TabsContent value="historial">
          <Historial refreshKey={historyKey} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="indicadores">
            <Indicadores />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
