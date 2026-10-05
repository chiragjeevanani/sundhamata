import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const SUNDHAMATA_LETTERS = 'SUNDHAMATA'.split('');
const MOBILE_LETTERS = 'MOBILE'.split('');

/**
 * Sundhamata Mobile Official Brand Logo
 * Features the official SM Headset & Plug brand mark.
 * Tagline: "Smart Phones • Smart People"
 * Fluid letter-by-letter interactive Framer Motion spring wave animation
 */
export const BrandLogo = ({
  size = 'md',
  showTagline = true,
  light = false,
  logoSrc,
  animated = true,
  className = '',
}) => {
  const isSm = size === 'sm';
  const isLg = size === 'lg';

  const imgSizeClass = isSm ? 'w-8.5 h-8.5' : isLg ? 'w-12 h-12' : 'w-10 h-10';
  const activeLogoSrc = logoSrc || (light ? '/logo-dark.png' : '/logo.png');

  // Both SUNDHAMATA and MOBILE have the exact same bigger font size for cohesive visual balance
  const textSizeClass = isSm ? 'text-[17px] sm:text-[18px]' : isLg ? 'text-2xl' : 'text-[19px]';

  // Interactive wave trigger (auto-recurring + on hover/tap)
  const [interactKey, setInteractKey] = useState(0);

  // Check prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const media = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(media.matches);
      const listener = (e) => setReducedMotion(e.matches);
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, []);

  const isMotionActive = animated && !reducedMotion;

  const handleTrigger = () => {
    if (isMotionActive) {
      setInteractKey((prev) => prev + 1);
    }
  };

  return (
    <div
      className={`brand-logo-container inline-flex items-center gap-2.5 select-none ${className}`}
      onMouseEnter={handleTrigger}
      onTouchStart={handleTrigger}
    >
      {/* Brand Logo Emblem with tactile spring response */}
      <motion.div
        whileHover={isMotionActive ? { scale: 1.06, rotate: 1.5 } : undefined}
        whileTap={isMotionActive ? { scale: 0.94 } : undefined}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        className={`relative flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-xs ${
          light ? 'bg-stone-900/80 ring-1 ring-white/15' : 'bg-black/90 ring-1 ring-stone-800'
        } ${imgSizeClass}`}
      >
        <img
          src={activeLogoSrc}
          alt="Sundhamata Mobile"
          className="w-full h-full object-contain p-0.5 rounded-xl"
        />
      </motion.div>

      {/* Brand Typography */}
      <div className="flex flex-col text-left leading-none">
        <div
          key={interactKey}
          className="flex items-baseline gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {/* Word 1: SUNDHAMATA */}
          <span className={`font-black tracking-tight font-sans inline-flex ${textSizeClass}`}>
            {SUNDHAMATA_LETTERS.map((char, i) => (
              <motion.span
                key={`s-${i}`}
                className="inline-block origin-bottom"
                animate={
                  isMotionActive
                    ? {
                        y: [0, -3.5, 0],
                        color: light
                          ? ['#FFFFFF', '#CBD5E1', '#FFFFFF']
                          : ['#120F0D', '#292524', '#120F0D'],
                      }
                    : undefined
                }
                transition={{
                  duration: 0.45,
                  ease: [0.22, 1, 0.36, 1],
                  delay: i * 0.042,
                  repeat: isMotionActive ? Infinity : 0,
                  repeatDelay: 4.2,
                }}
                style={{ color: light ? '#FFFFFF' : '#120F0D' }}
              >
                {char}
              </motion.span>
            ))}
          </span>

          {/* Word 2: MOBILE */}
          <span className={`font-black tracking-tight inline-flex ${textSizeClass}`}>
            {MOBILE_LETTERS.map((char, i) => {
              const globalIndex = SUNDHAMATA_LETTERS.length + i;
              return (
                <motion.span
                  key={`m-${i}`}
                  className="inline-block origin-bottom"
                  animate={
                    isMotionActive
                      ? {
                          y: [0, -4.5, 0],
                          scale: [1, 1.1, 1],
                          color: light
                            ? ['#E2955A', '#FBBF24', '#E2955A']
                            : ['#D77F3F', '#EA580C', '#D77F3F'],
                          filter: [
                            'drop-shadow(0 0 0px rgba(215, 127, 63, 0))',
                            'drop-shadow(0 3px 10px rgba(234, 88, 12, 0.75))',
                            'drop-shadow(0 0 0px rgba(215, 127, 63, 0))',
                          ],
                        }
                      : undefined
                  }
                  transition={{
                    duration: 0.45,
                    ease: [0.22, 1, 0.36, 1],
                    delay: globalIndex * 0.042,
                    repeat: isMotionActive ? Infinity : 0,
                    repeatDelay: 4.2,
                  }}
                  style={{ color: light ? '#E2955A' : '#D77F3F' }}
                >
                  {char}
                </motion.span>
              );
            })}
          </span>
        </div>

        {showTagline && (
          <span
            className={`font-semibold tracking-[0.14em] uppercase mt-1 ${
              light ? 'text-stone-300' : 'text-stone-500'
            } ${isSm ? 'text-[7.5px]' : isLg ? 'text-[9.5px]' : 'text-[8.5px]'}`}
          >
            Smart Phones • Smart People
          </span>
        )}
      </div>
    </div>
  );
};

