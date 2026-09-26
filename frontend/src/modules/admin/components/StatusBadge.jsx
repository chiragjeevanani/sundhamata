import React from 'react';

export const StatusBadge = ({ status, size = 'sm' }) => {
  if (!status) return null;

  const s = status.toLowerCase();

  let styles = 'bg-stone-100 text-stone-700 border-stone-200/80';
  let dotColor = 'bg-stone-400';

  if (s === 'paid' || s === 'purchased' || s === 'completed' || s === 'active' || s === 'earned') {
    styles = 'bg-emerald-50/80 text-emerald-800 border-emerald-200/70';
    dotColor = 'bg-emerald-500';
  } else if (s === 'pending' || s === 'partially paid' || s === 'adjustment') {
    styles = 'bg-amber-50/80 text-amber-800 border-amber-200/70';
    dotColor = 'bg-amber-500';
  } else if (s === 'cancelled' || s === 'redeemed' || s === 'error') {
    styles = 'bg-rose-50/80 text-rose-800 border-rose-200/70';
    dotColor = 'bg-rose-500';
  }

  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md border select-none ${styles} ${
        isSmall ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-0.5'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
      <span>{status}</span>
    </span>
  );
};

