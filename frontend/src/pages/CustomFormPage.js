import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ClipboardList, ArrowLeft, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import CustomFormWizard from '@/components/customform/CustomFormWizard';
import CustomFormHistorial from '@/components/customform/CustomFormHistorial';

export default function CustomFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('responder');
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try { const { data } = await api.get(`/formularios-custom/${id}`); setSchema(data); }
    catch (e) { setError(e?.response?.data?.detail || 'No se pudo cargar el formulario'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    if (!window.confirm('¿Eliminar este formulario? También se borran todas sus respuestas.')) return;
    try {
      await api.delete(`/formularios-custom/${id}`);
      toast.success('Formulario eliminado');
      window.location.href = '/formularios';
    } catch (e) { toast.error(e?.response?.data?.detail || 'No se pudo eliminar'); }
  };

  if (error) {
    return (
      <div className="max-w-[560px] mx-auto pt-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <Button asChild variant="outline" className="rounded-xl"><Link to="/formularios"><ArrowLeft className="h-4 w-4 mr-1.5" /> Volver a Formularios</Link></Button>
      </div>
    );
  }
  if (!schema) return <p className="text-sm text-muted-foreground text-center py-16">Cargando…</p>;

  const canSeeAll = user?.role === 'admin' || (user?.position || '').trim() === 'Director comercial' || schema.creator_id === user?.id;
  const canDelete = user?.role === 'admin' || schema.creator_id === user?.id;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-[#00a5df]" /> {schema.titulo}
          </h1>
          {schema.descripcion && <p className="text-muted-foreground text-sm mt-0.5">{schema.descripcion}</p>}
        </div>
        {canDelete && (
          <Button variant="ghost" size="sm" onClick={remove} className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)] shrink-0" data-testid="customform-delete-button">
            <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="responder" className="rounded-lg" data-testid="customform-tab-responder">Responder</TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg" data-testid="customform-tab-historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="responder">
          <CustomFormWizard schema={schema} onSubmitted={() => { setHistoryKey((k) => k + 1); setTab('historial'); }} />
        </TabsContent>
        <TabsContent value="historial">
          <CustomFormHistorial key={historyKey} schema={schema} canSeeAll={canSeeAll} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
