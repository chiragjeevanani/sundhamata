import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, HelpCircle, X } from 'lucide-react';

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger', // 'danger' | 'warning' | 'info'
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const isDanger = type === 'danger';
  const isWarning = type === 'warning';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-sm bg-white rounded-2xl p-5 border border-stone-200 shadow-2xl space-y-4"
        >
          <div className="flex items-start justify-between">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isDanger
                  ? 'bg-rose-50 border-rose-100 text-rose-600'
                  : isWarning
                  ? 'bg-amber-50 border-amber-100 text-amber-600'
                  : 'bg-brand-50 border-brand-100 text-brand-600'
              }`}
            >
              {isDanger ? (
                <AlertCircle className="w-5 h-5" />
              ) : isWarning ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <HelpCircle className="w-5 h-5" />
              )}
            </div>

            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-stone-400 hover:text-stone-600 p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-stone-900 tracking-tight">
              {title}
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed font-normal">
              {message}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2 px-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 font-bold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs text-white transition-all shadow-2xs active:scale-[0.98] cursor-pointer disabled:opacity-50 ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : isWarning
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-ink-900 hover:bg-ink-800'
              }`}
            >
              {isLoading ? (
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                confirmText
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
