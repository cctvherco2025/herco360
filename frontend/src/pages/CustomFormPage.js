import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ClipboardList, ArrowLeft, Trash2, Pencil, MoreVertical } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { canAdminPromos, esRevisorTienda, revisaPromos } from '@/lib/constants';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { confirmar } from '@/components/ConfirmDialog';
import CustomFormWizard from '@/components/customform/CustomFormWizard';
import CustomFormHistorial from '@/components/customform/CustomFormHistorial';
import { LlenarPorFormulario } from '@/pages/LlenarFormulario';
import ResultadosFormulario from '@/components/formularios/ResultadosFormulario';
import PromoResultados from '@/components/promociones/PromoResultados';
import PromoRevision from '@/components/promociones/PromoRevision';

export default function CustomFormPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState(null);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || null);
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
  // Promociones con tareas: el jefe o gerente de tienda (y quien administra) revisa.
  const puedeRevisar = !!schema.flujo_tareas && (esRevisorTienda(user) || promoAdmin || revisaPromos(user).length > 0);
  const nuevoFormato = schema.esquema === 2;
  // Constructor nuevo: lo dice el servidor, según la pestaña Permisos del formulario.
  const mis = schema.mis_permisos || {};
  const canSeeAll = nuevoFormato ? !!mis.resultados : user?.role === 'admin' || (user?.position || '').trim() === 'Director comercial' || schema.creator_id === user?.id || promoAdmin;
  const canManage = nuevoFormato ? !!mis.eliminar : user?.role === 'admin' || schema.creator_id === user?.id || promoAdmin;
  const puedeEditar = nuevoFormato ? !!schema.puede_editar : canManage;
  // formato de siempre: contesta salvo que el servidor diga que no (quien solo revisa por categoría)
  const puedeResponder = nuevoFormato ? !!schema.puede_llenar : schema.puede_llenar !== false;
  const pestanaInicial = puedeResponder ? 'responder' : (puedeRevisar ? 'revision' : 'historial');
  const pestana = tab || pestanaInicial;
  const editar = nuevoFormato ? `/formularios/v2/${id}/editar` : `/formularios/custom/${id}/editar`;

  return (
    <div className="max-w-[1000px] mx-auto pt-2">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-2xl sm:text-3xl font-semibold flex items-start gap-2 break-words">
            <ClipboardList className="h-7 w-7 text-[#00a5df] shrink-0 mt-0.5 sm:mt-1" /> <span className="min-w-0">{schema.titulo}</span>
          </h1>
          {schema.descripcion && <p className="text-muted-foreground text-sm mt-0.5">{schema.descripcion}</p>}
        </div>
        {(canManage || puedeEditar) && (
          // celular: menú de tres puntos
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 -mr-2 text-muted-foreground" aria-label="Más opciones" data-testid="customform-menu-button">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[160px] rounded-xl">
              {puedeEditar && (
                <DropdownMenuItem asChild className="cursor-pointer">
                  <Link to={editar}><Pencil className="h-4 w-4 mr-2" /> Editar</Link>
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem onSelect={() => remove()} className="cursor-pointer text-[#dc2626] focus:text-[#dc2626] focus:bg-[rgba(220,38,38,0.08)]">
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {(canManage || puedeEditar) && (
          <div className="hidden md:flex items-center gap-1 shrink-0">
            {puedeEditar && (
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="customform-edit-button">
                <Link to={editar}><Pencil className="h-4 w-4 mr-1.5" /> Editar</Link>
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" size="sm" onClick={remove} className="text-[#dc2626] hover:text-[#dc2626] hover:bg-[rgba(220,38,38,0.08)]" data-testid="customform-delete-button">
                <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
              </Button>
            )}
          </div>
        )}
      </div>

      <Tabs value={pestana} onValueChange={setTab}>
        <TabsList className="rounded-xl mb-5">
          {puedeResponder && <TabsTrigger value="responder" className="rounded-lg" data-testid="customform-tab-responder">Responder</TabsTrigger>}
          <TabsTrigger value="historial" className="rounded-lg" data-testid="customform-tab-historial">Historial</TabsTrigger>
          {puedeRevisar && (
            <TabsTrigger value="revision" className="rounded-lg" data-testid="customform-tab-revision">Revisión</TabsTrigger>
          )}
          {(schema.kind === 'promociones' || (nuevoFormato && mis.resultados)) && (
            <TabsTrigger value="resultados" className="rounded-lg" data-testid="customform-tab-resultados">Resultados</TabsTrigger>
          )}
        </TabsList>

        {puedeResponder && (
          <TabsContent value="responder">
            {nuevoFormato
              ? <ResponderV2 schema={schema} puedeEditar={puedeEditar} editar={editar} onEnviado={() => setHistoryKey((k) => k + 1)} />
              : <CustomFormWizard schema={schema} onSubmitted={() => { setHistoryKey((k) => k + 1); setTab('historial'); }} />}
          </TabsContent>
        )}
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
        {nuevoFormato && mis.resultados && (
          <TabsContent value="resultados">
            <ResultadosFormulario formId={schema.id} titulo={schema.titulo} puedeExportar={mis.exportar} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// Formularios del constructor nuevo: se contesta lo publicado (la versión vigente).
function ResponderV2({ schema, puedeEditar, editar, onEnviado }) {
  if (schema.estado !== 'publicado') {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">{schema.estado === 'despublicado' ? 'Este formulario está despublicado: ya no recibe respuestas.' : 'Este formulario todavía no está publicado.'}</p>
        {puedeEditar && <Button asChild variant="outline" className="rounded-xl mt-4"><Link to={editar}><Pencil className="h-4 w-4 mr-1.5" /> Abrir el constructor</Link></Button>}
      </div>
    );
  }
  return <LlenarPorFormulario formId={schema.id} onEnviado={onEnviado} />;
}
