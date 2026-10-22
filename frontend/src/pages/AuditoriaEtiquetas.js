import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Tags, Lock, Info } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canAccessEtiquetas, canFillEtiquetas, canAdminEtiquetas } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import EtiquetasWizard, { useEtiquetasConfig } from '@/components/etiquetas/EtiquetasWizard';
import Historial from '@/components/etiquetas/Historial';
import Indicadores from '@/components/etiquetas/Indicadores';

export default function AuditoriaEtiquetas() {
  const { user } = useAuth();
  const canFill = canFillEtiquetas(user);
  const isAdmin = canAdminEtiquetas(user);
  const { cfg, error, reload } = useEtiquetasConfig();
  const [historyKey, setHistoryKey] = useState(0);
  const [tab, setTab] = useState(canFill ? 'nueva' : 'historial');

  if (!canAccessEtiquetas(user)) return <Navigate to="/" replace />;

  return (
    <div className="max-w-[1180px] mx-auto pt-2">
      <div className="flex flex-wrap items-start sm:items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <Tags className="h-7 w-7 text-[#00a5df]" /> Auditoría de Etiquetas
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Auditoría semanal de etiquetas de precios — ECCP</p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,165,223,0.12)] text-[#00a5df] text-xs font-semibold px-3 py-1.5 shrink-0">
          <Lock className="h-3.5 w-3.5" /> Módulo restringido
        </span>
      </div>

      {error ? (
        <div className="rounded-[18px] bg-card border shadow-card p-8 text-center">
          <Info className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">No se pudo cargar el módulo. Intenta de nuevo más tarde.</p>
        </div>
      ) : !cfg ? (
        <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="rounded-xl mb-5">
            {canFill && <TabsTrigger value="nueva" className="rounded-lg" data-testid="etiquetas-tab-nueva">Nueva auditoría</TabsTrigger>}
            <TabsTrigger value="historial" className="rounded-lg" data-testid="etiquetas-tab-historial">Historial</TabsTrigger>
            {isAdmin && <TabsTrigger value="indicadores" className="rounded-lg" data-testid="etiquetas-tab-indicadores">Indicadores</TabsTrigger>}
          </TabsList>
          {canFill && (
            <TabsContent value="nueva">
              <EtiquetasWizard cfg={cfg} onSubmitted={() => setHistoryKey((k) => k + 1)} />
            </TabsContent>
          )}
          <TabsContent value="historial">
            <Historial cfg={cfg} refreshKey={historyKey} />
          </TabsContent>
          {isAdmin && (
            <TabsContent value="indicadores">
              <Indicadores cfg={cfg} onConfigChanged={reload} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
