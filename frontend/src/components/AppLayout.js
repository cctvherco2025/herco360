import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Radix (Popover/Dialog/DropdownMenu) bloquea el <body> con pointer-events:none mientras
  // está abierto. Si el componente se desmonta a mitad de su cierre (p. ej. al navegar
  // justo al tocar un enlace dentro de uno de ellos), ese estilo se queda pegado y toda
  // la página deja de responder a clics. Lo forzamos a limpiar en cada cambio de ruta.
  useEffect(() => {
    document.body.style.pointerEvents = '';
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <div className="lg:pl-[296px] transition-[padding] duration-300">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="px-4 sm:px-6 pb-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}