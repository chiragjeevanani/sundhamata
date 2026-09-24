import React from 'react';
import { PackageOpen, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export const EmptyState = ({
  title = 'No purchases yet',
  description = 'Your purchases from Sundhamata Mobile will appear here.',
  actionLabel = 'Go to Home',
  onAction,
  icon: Icon = PackageOpen,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-white rounded-2xl p-8 border border-slate-200/80 text-center flex flex-col items-center justify-center my-6 shadow-xs"
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4 border border-slate-200/60">
        <Icon className="w-7 h-7 text-[#1E365D]" />
      </div>

      <h3 className="text-base font-bold text-[#0F2042] tracking-tight mb-1">
        {title}
      </h3>

      <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-5">
        {description}
      </p>

      {onAction && actionLabel && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#0F2042] text-white text-xs font-semibold hover:bg-[#1E365D] transition-colors shadow-xs active:scale-[0.98]"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
};
