import React from 'react';

/**
 * Sundhamata Mobile Official Brand Logo
 * Refined retail brand mark with deep navy emblem, subtle amber accent, and crisp typography.
 * Tagline: "Smart Phones • Smart People"
 */
export const BrandLogo = ({ size = 'md', showTagline = true, light = false, className = '' }) => {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Brand Monogram Icon */}
      <div
        className={`relative flex items-center justify-center shrink-0 transition-transform ${
          light
            ? 'bg-white text-[#0F2042]'
            : 'bg-[#0F2042] text-white border border-[#1E365D]'
        } ${
          isSm
            ? 'w-7.5 h-7.5 rounded-lg'
            : isLg
            ? 'w-11 h-11 rounded-2xl'
            : 'w-9 h-9 rounded-xl'
        }`}
      >
        {/* Smartphone Silhouette Graphic */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isSm ? 'w-4 h-4' : isLg ? 'w-5.5 h-5.5' : 'w-4.5 h-4.5'}
        >
          <rect width="13" height="19" x="5.5" y="2.5" rx="2.5" ry="2.5" />
          <path d="M12 18h.01" />
        </svg>

        {/* Subtle Warm Amber Spark Accent */}
        <span
          className={`absolute -top-0.5 -right-0.5 rounded-full bg-[#F59E0B] ring-2 ${
            light ? 'ring-[#0F2042]' : 'ring-[#F8F9FA]'
          } ${isSm ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}
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
              light ? 'text-blue-300' : 'text-[#2563EB]'
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
