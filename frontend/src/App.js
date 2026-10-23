import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import ProtectedRoute from '@/components/ProtectedRoute';
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
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/vacaciones" element={<Vacaciones />} />
              <Route path="/sala-de-juntas" element={<SalaDeJuntas />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/reportes-cams" element={<Suspense fallback={<PageFallback />}><ReportesCams /></Suspense>} />
              <Route path="/formularios" element={<FormulariosHub />} />
              <Route path="/formularios/promociones" element={<PromocionesHome />} />
              <Route path="/formularios/promociones/nuevo" element={<Suspense fallback={<PageFallback />}><PromoPublishWizardPage /></Suspense>} />
              <Route path="/formulario" element={<Suspense fallback={<PageFallback />}><Formulario /></Suspense>} />
              <Route path="/rutina-operativa" element={<Suspense fallback={<PageFallback />}><RutinaOperativa /></Suspense>} />
              <Route path="/revision-guardias" element={<Suspense fallback={<PageFallback />}><RevisionGuardias /></Suspense>} />
              <Route path="/recorridos-preventivos" element={<Suspense fallback={<PageFallback />}><RecorridosPreventivos /></Suspense>} />
              <Route path="/auditoria-etiquetas" element={<Suspense fallback={<PageFallback />}><AuditoriaEtiquetas /></Suspense>} />
              <Route path="/activos" element={<Suspense fallback={<PageFallback />}><Activos /></Suspense>} />
              <Route path="/activos/categorias" element={<Suspense fallback={<PageFallback />}><ActivosCategorias /></Suspense>} />
              <Route path="/activos/:id" element={<Suspense fallback={<PageFallback />}><ActivoDetalle /></Suspense>} />
              <Route path="/mantenimiento" element={<Suspense fallback={<PageFallback />}><MisMantenimientos /></Suspense>} />
              <Route path="/mantenimiento/tareas/:id" element={<Suspense fallback={<PageFallback />}><MantTarea /></Suspense>} />
              <Route path="/mantenimiento/planificaciones" element={<Suspense fallback={<PageFallback />}><MantPlanes /></Suspense>} />
              <Route path="/mantenimiento/planificaciones/nueva" element={<Suspense fallback={<PageFallback />}><MantPlanForm /></Suspense>} />
              <Route path="/mantenimiento/planificaciones/:id/editar" element={<Suspense fallback={<PageFallback />}><MantPlanForm /></Suspense>} />
              <Route path="/mantenimiento/planificaciones/:id" element={<Suspense fallback={<PageFallback />}><MantPlanDetalle /></Suspense>} />
              <Route path="/mantenimiento/checklists" element={<Suspense fallback={<PageFallback />}><MantChecklists /></Suspense>} />
              <Route path="/formularios/nuevo" element={<Suspense fallback={<PageFallback />}><CustomFormBuilderPage /></Suspense>} />
              <Route path="/formularios/custom/:id/editar" element={<Suspense fallback={<PageFallback />}><CustomFormBuilderPage /></Suspense>} />
              <Route path="/formularios/custom/:id" element={<Suspense fallback={<PageFallback />}><CustomFormPage /></Suspense>} />
              <Route path="/formularios/tickets" element={<Suspense fallback={<PageFallback />}><Tickets /></Suspense>} />
              <Route path="/formularios/tickets/:id" element={<Suspense fallback={<PageFallback />}><TicketDetalle /></Suspense>} />
              <Route path="/tareas" element={<Suspense fallback={<PageFallback />}><Tareas /></Suspense>} />
              <Route path="/tareas/:id" element={<Suspense fallback={<PageFallback />}><TareaDetalle /></Suspense>} />
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
