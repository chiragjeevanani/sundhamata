import React from 'react';

/**
 * Reusable Status Badge Component
 * Intentional, muted semantic colors:
 * - Purchased / Paid: subtle sage green
 * - Pending: subtle warm amber
 * - Cancelled: subtle soft rose
 */
export const StatusBadge = ({ status = 'Purchased', size = 'md' }) => {
  const normalized = (status || '').toLowerCase();

  let colorClasses = 'bg-emerald-50/90 text-emerald-800 border-emerald-200/70';
  let dotColor = 'bg-emerald-500';

  if (normalized === 'pending') {
    colorClasses = 'bg-amber-50/90 text-amber-800 border-amber-200/70';
    dotColor = 'bg-amber-500';
  } else if (normalized === 'cancelled') {
    colorClasses = 'bg-rose-50/90 text-rose-800 border-rose-200/70';
    dotColor = 'bg-rose-500';
  } else if (normalized === 'paid' || normalized === 'purchased') {
    colorClasses = 'bg-emerald-50/90 text-emerald-800 border-emerald-200/70';
    dotColor = 'bg-emerald-500';
  }

  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-md border tracking-tight tabular-nums select-none ${colorClasses} ${
        isSmall ? 'text-[10.5px] px-2 py-0.5' : 'text-[11.5px] px-2.5 py-1'
      }`}
    >
      <span className={`rounded-full shrink-0 ${dotColor} ${isSmall ? 'w-1.5 h-1.5' : 'w-1.5 h-1.5'}`} />
      <span>{status}</span>
    </span>
  );
};
