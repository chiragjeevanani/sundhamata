import React, { useEffect, useState } from 'react';
import { useMotionValue, useTransform, animate } from 'framer-motion';

/**
 * Smooth, subtle animated points counter using Framer Motion
 * Increments smoothly from 0 to target value with no jarring bounce
 */
export const AnimatedPoints = ({ value = 0, duration = 0.5, className = '' }) => {
  const motionVal = useMotionValue(0);
  const [displayValue, setDisplayValue] = useState('0');

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: duration,
      ease: [0.16, 1, 0.3, 1], // Natural easeOut
      onUpdate: (latest) => {
        setDisplayValue(Math.round(latest).toLocaleString('en-IN'));
      },
    });

    return () => controls.stop();
  }, [value, duration, motionVal]);

  return <span className={`tabular-nums font-mono ${className}`}>{displayValue}</span>;
};
