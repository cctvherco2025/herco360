import React from 'react';

// HERCO placeholder wordmark logo: 'HERCO' + gradient sphere + tagline.
export const Logo = ({ size = 'md', showTagline = true, className = '' }) => {
  const sizes = {
    sm: { text: 'text-xl', sphere: 'h-3.5 w-3.5', tag: 'text-[8px]' },
    md: { text: 'text-2xl', sphere: 'h-5 w-5', tag: 'text-[9px]' },
    lg: { text: 'text-4xl', sphere: 'h-7 w-7', tag: 'text-[11px]' },
  };
  const s = sizes[size] || sizes.md;
  return (
    <div className={`flex flex-col leading-none ${className}`} data-testid="herco-logo">
      <div className="flex items-center">
        <span className={`font-heading font-bold tracking-tight text-[#1e395e] dark:text-white ${s.text}`}>
          HERC
        </span>
        <span className="relative inline-flex items-center -ml-[1px]">
          <span className={`font-heading font-bold tracking-tight text-[#1e395e] dark:text-white ${s.text}`}>O</span>
          <span className={`logo-sphere rounded-full -ml-1 ${s.sphere}`} />
        </span>
      </div>
      {showTagline && (
        <span className={`font-heading font-semibold tracking-[0.18em] text-[#3cbef6] dark:text-[#3cbef6] mt-0.5 ${s.tag}`}>
          EL UNIVERSO FERRETERO
        </span>
      )}
    </div>
  );
};
