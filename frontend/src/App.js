import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
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

// Carga diferida: arrastra recharts, solo lo necesita quien abre este módulo.
const ReportesCams = lazy(() => import('@/pages/ReportesCams'));
// Carga diferida: arrastra jsPDF, solo lo necesita quien abre este módulo.
const Formulario = lazy(() => import('@/pages/Formulario'));
const RutinaOperativa = lazy(() => import('@/pages/RutinaOperativa'));
const CustomFormBuilderPage = lazy(() => import('@/pages/CustomFormBuilderPage'));
const CustomFormPage = lazy(() => import('@/pages/CustomFormPage'));
const PromoPublishWizardPage = lazy(() => import('@/pages/PromoPublishWizardPage'));

const PageFallback = () => (
  <div className="p-10 text-center text-sm text-muted-foreground">Cargando…</div>
);

function App() {
  return (
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
              <Route path="/formularios/nuevo" element={<Suspense fallback={<PageFallback />}><CustomFormBuilderPage /></Suspense>} />
              <Route path="/formularios/custom/:id" element={<Suspense fallback={<PageFallback />}><CustomFormPage /></Suspense>} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/organigrama" element={<Organigrama />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="/notificaciones" element={<Notificaciones />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
