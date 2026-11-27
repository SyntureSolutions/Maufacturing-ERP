'use client';

import React from 'react';
import Image from 'next/image';

interface ProdexaLogoProps {
  variant?: 'light' | 'dark'; // 'light' text for dark background, 'dark' text for light background
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export default function ProdexaLogo({ variant = 'light', size = 'md', showText = true }: ProdexaLogoProps) {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12'
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl'
  };

  return (
    <div className="flex items-center gap-3 select-none">
      {/* Brand Icon Mark */}
      <div className={`${iconSizes[size]} relative rounded-xl overflow-hidden shrink-0 bg-white shadow-md flex items-center justify-center`}>
        <img
          src="/images/prodexa_logo.jpg"
          alt="Prodexa ERP Logo"
          className="w-full h-full object-contain rounded-lg"
        />
      </div>

      {/* Brand Name Text */}
      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`${textSizes[size]} font-black tracking-tight ${variant === 'light' ? 'text-white' : 'text-slate-900'}`}>
            Prod<span className="text-amber-500">ex</span>a
          </div>
          <div className="text-[10px] font-extrabold tracking-[0.25em] text-amber-500 uppercase mt-0.5">
            — ERP
          </div>
        </div>
      )}
    </div>
  );
}
