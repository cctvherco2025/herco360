import React from 'react';
import logoImg from '@/assets/herco-logo.png';

// Nombre de la plataforma (lo que ven los usuarios; lo interno sigue como herco360).
export const APP_NAME = 'HERCO OPS';
export const APP_FULL_NAME = 'Operations Management System';
export const APP_TAGLINE = 'Toda tu operación, en un solo lugar';

// Nombre + descripción bajo el logo (barra lateral).
export const AppWordmark = ({ className = '' }) => (
  <div className={`leading-tight ${className}`} data-testid="app-wordmark">
    <p className="font-heading text-[15px] font-bold tracking-wide text-[#1e395e] dark:text-white">{APP_NAME}</p>
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{APP_FULL_NAME}</p>
  </div>
);

// Official HERCO logo rendered inside a clean white "brand tile"
// so the dark navy wordmark stays legible in both light and dark themes.
export const Logo = ({ size = 'md', className = '' }) => {
  const imgH = { sm: 'h-6', md: 'h-8', lg: 'h-14' }[size] || 'h-8';
  const pad = { sm: 'px-2 py-1', md: 'px-2.5 py-1.5', lg: 'px-4 py-2.5' }[size] || 'px-2.5 py-1.5';
  return (
    <div
      className={`inline-flex w-fit items-center bg-white rounded-xl ${pad} shadow-sm ring-1 ring-black/5 ${className}`}
      data-testid="herco-logo"
    >
      <img src={logoImg} alt="HERCO — El Universo Ferretero" className={`${imgH} w-auto object-contain`} draggable={false} />
    </div>
  );
};
