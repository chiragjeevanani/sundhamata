import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export const ToastContainer = () => {
  const { toasts, removeToast } = useToast();

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
    >
      <AnimatePresence>
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';

          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
              className={`pointer-events-auto rounded-xl border p-3 shadow-lg flex items-start gap-2.5 bg-white ${
                isSuccess
                  ? 'border-emerald-200 text-stone-900 shadow-emerald-950/5'
                  : isError
                  ? 'border-rose-200 text-stone-900 shadow-rose-950/5'
                  : 'border-brand-200 text-stone-900 shadow-brand-950/5'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  isSuccess
                    ? 'bg-emerald-50 text-emerald-600'
                    : isError
                    ? 'bg-rose-50 text-rose-600'
                    : 'bg-brand-50 text-brand-600'
                }`}
              >
                {isSuccess ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : isError ? (
                  <AlertCircle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
              </div>

              <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-xs font-bold text-stone-900 leading-tight">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="text-[11px] text-stone-500 font-medium mt-0.5 leading-snug">
                    {toast.message}
                  </p>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="text-stone-400 hover:text-stone-600 p-0.5 rounded cursor-pointer transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
