import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowLeft, Trash2, Pencil, MoreVertical } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAdminPromos, esRevisorTienda } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmar } from '@/components/ConfirmDialog';
import CustomFormWizard from '@/components/customform/CustomFormWizard';
import CustomFormHistorial from '@/components/customform/CustomFormHistorial';
import PromoResultados from '@/components/promociones/PromoResultados';
import PromoRevision from '@/components/promociones/PromoRevision';

export default function CustomFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'responder');
  // una notificación puede abrir la misma página en otra pestaña (?tab=revision)
  useEffect(() => { if (params.get('tab')) setTab(params.get('tab')); }, [params]);
  const [historyKey, setHistoryKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try { const { data } = await api.get(`/formularios-custom/${id}`); setSchema(data); }
    catch (e) { setError(e?.response?.data?.detail || 'No se pudo cargar el formulario'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    const ok = await confirmar({
      tipo: 'danger',
      titulo: '¿Eliminar formulario?',
      mensaje: <>Se eliminará <b>{schema?.titulo}</b> y todas sus respuestas. Esta acción no se puede deshacer.</>,
      textoConfirmar: 'Eliminar',
      textoCargando: 'Eliminando…',
      textoExito: 'Formulario eliminado',
      accion: () => api.delete(`/formularios-custom/${id}`),
    });
    if (ok) navigate('/formularios');
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

  // Quien tiene "Administrar Promociones del mes" ve y administra cualquier
  // publicación de Promociones como si la hubiera creado.
  const promoAdmin = schema.kind === 'promociones' && canAdminPromos(user);
  const canSeeAll = user?.role === 'admin' || (user?.position || '').trim() === 'Director comercial' || schema.creator_id === user?.id || promoAdmin;
  const canManage = user?.role === 'admin' || schema.creator_id === user?.id || promoAdmin;
  // Promociones con tareas: el jefe o gerente de tienda (y quien administra) revisa.
  const puedeRevisar = !!schema.flujo_tareas && (esRevisorTienda(user) || promoAdmin);

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-start gap-2 break-words">
            <ClipboardList className="h-7 w-7 text-[#00a5df] shrink-0 mt-0.5 sm:mt-1" /> <span className="min-w-0">{schema.titulo}</span>
          </h1>
          {schema.descripcion && <p className="text-muted-foreground text-sm mt-0.5">{schema.descripcion}</p>}
        </div>
        {canManage && (
          // celular: menú de tres puntos
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 -mr-2 text-muted-foreground" aria-label="Más opciones" data-testid="customform-menu-button">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl">
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link to={`/formularios/custom/${id}/editar`}><Pencil className="h-4 w-4 mr-2" /> Editar</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => remove()} className="cursor-pointer text-[#dc2626] focus:text-[#dc2626] focus:bg-[rgba(220,38,38,0.08)]">
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {canManage && (
          <div className="hidden md:flex items-center gap-1 shrink-0">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="customform-edit-button">
              <Link to={`/formularios/custom/${id}/editar`}><Pencil className="h-4 w-4 mr-1.5" /> Editar</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={remove} className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="customform-delete-button">
              <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
            </Button>
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="rounded-xl mb-5">
          <TabsTrigger value="responder" className="rounded-lg" data-testid="customform-tab-responder">Responder</TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg" data-testid="customform-tab-historial">Historial</TabsTrigger>
          {puedeRevisar && (
            <TabsTrigger value="revision" className="rounded-lg" data-testid="customform-tab-revision">Revisión</TabsTrigger>
          )}
          {schema.kind === 'promociones' && (
            <TabsTrigger value="resultados" className="rounded-lg" data-testid="customform-tab-resultados">Resultados</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="responder">
          <CustomFormWizard schema={schema} onSubmitted={() => { setHistoryKey((k) => k + 1); setTab('historial'); }} />
        </TabsContent>
        <TabsContent value="historial">
          <CustomFormHistorial key={historyKey} schema={schema} canSeeAll={canSeeAll} canManage={canManage} />
        </TabsContent>
        {puedeRevisar && (
          <TabsContent value="revision">
            <PromoRevision schema={schema} />
          </TabsContent>
        )}
        {schema.kind === 'promociones' && (
          <TabsContent value="resultados">
            <PromoResultados formId={schema.id} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
