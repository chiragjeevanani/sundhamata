import React from 'react';

/**
 * Sundhamata Mobile Official Brand Logo
 * Features the official SM Headset & Plug brand mark.
 * Tagline: "Smart Phones • Smart People"
 */
export const BrandLogo = ({ size = 'md', showTagline = true, light = false, className = '' }) => {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const imgSizeClass = isSm ? 'w-8 h-8' : isLg ? 'w-12 h-12' : 'w-10 h-10';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Brand Logo Emblem */}
      <div
        className={`relative flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-xs transition-transform ${
          light ? 'bg-slate-900/60 ring-1 ring-white/20' : 'bg-black/90 ring-1 ring-slate-800'
        } ${imgSizeClass}`}
      >
        <img
          src="/logo.png"
          alt="Sundhamata Mobile"
          className="w-full h-full object-contain p-0.5 rounded-xl"
        />
      </div>

      {/* Brand Typography */}
      <div className="flex flex-col text-left leading-none">
        <div className="flex items-center gap-1.5">
          <span
            className={`font-black tracking-tight font-sans ${
              light ? 'text-white' : 'text-[#0F2042]'
            } ${isSm ? 'text-[15px]' : isLg ? 'text-xl' : 'text-base'}`}
          >
            SUNDHAMATA
          </span>
          <span
            className={`font-bold tracking-normal ${
              light ? 'text-brand-400' : 'text-brand-500'
            } ${isSm ? 'text-xs' : isLg ? 'text-sm' : 'text-xs'}`}
          >
            MOBILE
          </span>
        </div>

        {showTagline && (
          <span
            className={`font-semibold tracking-[0.14em] uppercase mt-1 ${
              light ? 'text-slate-300' : 'text-slate-500'
            } ${isSm ? 'text-[7.5px]' : isLg ? 'text-[9.5px]' : 'text-[8.5px]'}`}
          >
            Smart Phones • Smart People
          </span>
        )}
      </div>
    </div>
  );
};

