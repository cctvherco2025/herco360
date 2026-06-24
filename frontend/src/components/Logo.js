import React from 'react';
import logoImg from '@/assets/herco-logo.png';

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
