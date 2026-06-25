import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import PendingApproval from '@/pages/PendingApproval';
import Dashboard from '@/pages/Dashboard';
import Agenda from '@/pages/Agenda';
import SalaDeJuntas from '@/pages/SalaDeJuntas';
import SalaPublica from '@/pages/SalaPublica';
import Inventario from '@/pages/Inventario';
import Reportes from '@/pages/Reportes';
import Usuarios from '@/pages/Usuarios';
import Configuracion from '@/pages/Configuracion';
import Notificaciones from '@/pages/Notificaciones';
import '@/App.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/pending" element={<PendingApproval />} />
            <Route path="/sala" element={<SalaPublica />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/sala-de-juntas" element={<SalaDeJuntas />} />
              <Route path="/inventario" element={<Inventario />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/usuarios" element={<Usuarios />} />
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
