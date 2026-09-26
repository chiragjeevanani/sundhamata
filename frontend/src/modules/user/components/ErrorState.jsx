import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

export const ErrorState = ({
  title = 'Something went wrong',
  description = "We couldn't load your purchases. Please try again.",
  onRetry,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="bg-white rounded-2xl p-6 border border-rose-200/80 text-center flex flex-col items-center justify-center my-6 shadow-xs"
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600 mb-3 border border-rose-100">
        <AlertCircle className="w-6 h-6" />
      </div>

      <h3 className="text-sm font-bold text-stone-900 tracking-tight mb-1">
        {title}
      </h3>

      <p className="text-xs text-stone-500 max-w-xs leading-relaxed mb-4">
        {description}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors shadow-xs active:scale-[0.98]"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Try Again</span>
        </button>
      )}
    </motion.div>
  );
};
