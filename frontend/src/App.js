import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import ProtectedRoute from '@/components/ProtectedRoute';
import ConModulo from '@/components/ConModulo';
import AppLayout from '@/components/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import RecuperarPassword from '@/pages/RecuperarPassword';
import PendingApproval from '@/pages/PendingApproval';
import Dashboard from '@/pages/Dashboard';
import Agenda from '@/pages/Agenda';
import Vacaciones from '@/pages/Vacaciones';
import SalaDeJuntas from '@/pages/SalaDeJuntas';
import SalaPublica from '@/pages/SalaPublica';
import Inventario from '@/pages/Inventario';
import Reportes from '@/pages/Reportes';
import FormulariosHub from '@/pages/FormulariosHub';
import PromocionesHome from '@/pages/PromocionesHome';
import Usuarios from '@/pages/Usuarios';
import Organigrama from '@/pages/Organigrama';
import Configuracion from '@/pages/Configuracion';
import Notificaciones from '@/pages/Notificaciones';
import '@/App.css';

// Carga diferida (lazyWithRetry: si tras un deploy el chunk viejo ya no existe,
// recarga una vez en lugar de dejar la pantalla en blanco).
const ReportesCams = lazyWithRetry(() => import('@/pages/ReportesCams'), 'ReportesCams');
const Formulario = lazyWithRetry(() => import('@/pages/Formulario'), 'Formulario');
const RutinaOperativa = lazyWithRetry(() => import('@/pages/RutinaOperativa'), 'RutinaOperativa');
const RevisionGuardias = lazyWithRetry(() => import('@/pages/RevisionGuardias'), 'RevisionGuardias');
const RecorridosPreventivos = lazyWithRetry(() => import('@/pages/RecorridosPreventivos'), 'RecorridosPreventivos');
const AuditoriaEtiquetas = lazyWithRetry(() => import('@/pages/AuditoriaEtiquetas'), 'AuditoriaEtiquetas');
const Activos = lazyWithRetry(() => import('@/pages/Activos'), 'Activos');
const ActivoDetalle = lazyWithRetry(() => import('@/pages/ActivoDetalle'), 'ActivoDetalle');
const ActivosCategorias = lazyWithRetry(() => import('@/pages/ActivosCategorias'), 'ActivosCategorias');
const MisMantenimientos = lazyWithRetry(() => import('@/pages/MisMantenimientos'), 'MisMantenimientos');
const MantTarea = lazyWithRetry(() => import('@/pages/MantTarea'), 'MantTarea');
const MantPlanes = lazyWithRetry(() => import('@/pages/MantPlanes'), 'MantPlanes');
const MantPlanForm = lazyWithRetry(() => import('@/pages/MantPlanForm'), 'MantPlanForm');
const MantPlanDetalle = lazyWithRetry(() => import('@/pages/MantPlanDetalle'), 'MantPlanDetalle');
const MantChecklists = lazyWithRetry(() => import('@/pages/MantChecklists'), 'MantChecklists');
const CustomFormBuilderPage = lazyWithRetry(() => import('@/pages/CustomFormBuilderPage'), 'CustomFormBuilderPage');
const CustomFormPage = lazyWithRetry(() => import('@/pages/CustomFormPage'), 'CustomFormPage');
const PromoPublishWizardPage = lazyWithRetry(() => import('@/pages/PromoPublishWizardPage'), 'PromoPublishWizardPage');
const Tickets = lazyWithRetry(() => import('@/pages/Tickets'), 'Tickets');
const TicketDetalle = lazyWithRetry(() => import('@/pages/TicketDetalle'), 'TicketDetalle');
const Tareas = lazyWithRetry(() => import('@/pages/Tareas'), 'Tareas');
const TareaDetalle = lazyWithRetry(() => import('@/pages/TareaDetalle'), 'TareaDetalle');

const PageFallback = () => (
  <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
);

function App() {
  return (
    <ErrorBoundary>
     <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/recuperar" element={<RecuperarPassword />} />
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/sala" element={<SalaPublica />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/agenda" element={<ConModulo modulo={'agenda'} nombre="Agenda"><Agenda /></ConModulo>} />
              <Route path="/vacaciones" element={<ConModulo modulo={'vacaciones'} nombre="Vacaciones"><Vacaciones /></ConModulo>} />
              <Route path="/sala-de-juntas" element={<ConModulo modulo={'sala'} nombre="Sala de Juntas"><SalaDeJuntas /></ConModulo>} />
              <Route path="/inventario" element={<ConModulo modulo={'inventario'} nombre="Inventarios Autoservicio"><Inventario /></ConModulo>} />
              <Route path="/reportes" element={<ConModulo modulo={'reportes'} nombre="Reportes"><Reportes /></ConModulo>} />
              <Route path="/reportes-cams" element={<ConModulo modulo={'cams'} nombre="Reportes CAMS"><Suspense fallback={<PageFallback />}><ReportesCams /></Suspense></ConModulo>} />
              <Route path="/formularios" element={<ConModulo modulo={'formularios'} nombre="Formularios"><FormulariosHub /></ConModulo>} />
              <Route path="/formularios/promociones" element={<ConModulo modulo={'promos'} nombre="Promociones del mes"><PromocionesHome /></ConModulo>} />
              <Route path="/formularios/promociones/nuevo" element={<ConModulo modulo={'promos'} nombre="Promociones del mes"><Suspense fallback={<PageFallback />}><PromoPublishWizardPage /></Suspense></ConModulo>} />
              <Route path="/formulario" element={<ConModulo modulo={'flos'} nombre="Evaluación FLOS"><Suspense fallback={<PageFallback />}><Formulario /></Suspense></ConModulo>} />
              <Route path="/rutina-operativa" element={<ConModulo modulo={'rutina'} nombre="Rutina Operativa"><Suspense fallback={<PageFallback />}><RutinaOperativa /></Suspense></ConModulo>} />
              <Route path="/revision-guardias" element={<ConModulo modulo={'guardias'} nombre="Revisión de Guardias"><Suspense fallback={<PageFallback />}><RevisionGuardias /></Suspense></ConModulo>} />
              <Route path="/recorridos-preventivos" element={<ConModulo modulo={'recorridos'} nombre="Recorridos Preventivos"><Suspense fallback={<PageFallback />}><RecorridosPreventivos /></Suspense></ConModulo>} />
              <Route path="/auditoria-etiquetas" element={<ConModulo modulo={'etiquetas'} nombre="Auditoría de Etiquetas"><Suspense fallback={<PageFallback />}><AuditoriaEtiquetas /></Suspense></ConModulo>} />
              <Route path="/activos" element={<ConModulo modulo={'activos'} nombre="Activos"><Suspense fallback={<PageFallback />}><Activos /></Suspense></ConModulo>} />
              <Route path="/activos/categorias" element={<ConModulo modulo={'activos'} nombre="Activos"><Suspense fallback={<PageFallback />}><ActivosCategorias /></Suspense></ConModulo>} />
              <Route path="/activos/:id" element={<ConModulo modulo={'activos'} nombre="Activos"><Suspense fallback={<PageFallback />}><ActivoDetalle /></Suspense></ConModulo>} />
              <Route path="/mantenimiento" element={<ConModulo modulo={'mis_mant'} nombre="Mis mantenimientos"><Suspense fallback={<PageFallback />}><MisMantenimientos /></Suspense></ConModulo>} />
              <Route path="/mantenimiento/tareas/:id" element={<ConModulo modulo={['mis_mant', 'planes']} nombre="Mis mantenimientos"><Suspense fallback={<PageFallback />}><MantTarea /></Suspense></ConModulo>} />
              <Route path="/mantenimiento/planificaciones" element={<ConModulo modulo={'planes'} nombre="Planificaciones"><Suspense fallback={<PageFallback />}><MantPlanes /></Suspense></ConModulo>} />
              <Route path="/mantenimiento/planificaciones/nueva" element={<ConModulo modulo={'planes'} nombre="Planificaciones"><Suspense fallback={<PageFallback />}><MantPlanForm /></Suspense></ConModulo>} />
              <Route path="/mantenimiento/planificaciones/:id/editar" element={<ConModulo modulo={'planes'} nombre="Planificaciones"><Suspense fallback={<PageFallback />}><MantPlanForm /></Suspense></ConModulo>} />
              <Route path="/mantenimiento/planificaciones/:id" element={<ConModulo modulo={'planes'} nombre="Planificaciones"><Suspense fallback={<PageFallback />}><MantPlanDetalle /></Suspense></ConModulo>} />
              <Route path="/mantenimiento/checklists" element={<ConModulo modulo={'checklists'} nombre="Checklists"><Suspense fallback={<PageFallback />}><MantChecklists /></Suspense></ConModulo>} />
              <Route path="/formularios/nuevo" element={<ConModulo modulo={'formularios'} nombre="Formularios"><Suspense fallback={<PageFallback />}><CustomFormBuilderPage /></Suspense></ConModulo>} />
              <Route path="/formularios/custom/:id/editar" element={<ConModulo modulo={'formularios'} nombre="Formularios"><Suspense fallback={<PageFallback />}><CustomFormBuilderPage /></Suspense></ConModulo>} />
              <Route path="/formularios/custom/:id" element={<Suspense fallback={<PageFallback />}><CustomFormPage /></Suspense>} />
              <Route path="/formularios/tickets" element={<ConModulo modulo={'seguimientos'} nombre="Seguimientos"><Suspense fallback={<PageFallback />}><Tickets /></Suspense></ConModulo>} />
              <Route path="/formularios/tickets/:id" element={<ConModulo modulo={'seguimientos'} nombre="Seguimientos"><Suspense fallback={<PageFallback />}><TicketDetalle /></Suspense></ConModulo>} />
              <Route path="/tareas" element={<ConModulo modulo={'tareas'} nombre="Tareas"><Suspense fallback={<PageFallback />}><Tareas /></Suspense></ConModulo>} />
              <Route path="/tareas/:id" element={<ConModulo modulo={'tareas'} nombre="Tareas"><Suspense fallback={<PageFallback />}><TareaDetalle /></Suspense></ConModulo>} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/organigrama" element={<Organigrama />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/notificaciones" element={<Notificaciones />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
          <ConfirmProvider />
        </BrowserRouter>
      </AuthProvider>
     </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
