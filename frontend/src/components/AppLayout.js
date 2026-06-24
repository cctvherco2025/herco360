import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
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
