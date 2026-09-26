import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowUpRight, ArrowDownLeft, FileText, Calendar, Sparkles } from 'lucide-react';
import { formatLongDate } from '../../../utils/formatters';

export const TransactionDetailModal = ({ isOpen, onClose, transaction }) => {
  if (!isOpen || !transaction) return null;

  const isEarned = transaction.isCredit;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="relative w-full max-w-sm bg-white rounded-2xl shadow-xl border border-stone-200 z-10 overflow-hidden p-5 space-y-4"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Transaction Details
            </span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Points Amount & Badge */}
          <div className="flex items-center gap-3 py-1">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
                isEarned
                  ? 'bg-emerald-50 border-emerald-200/80 text-emerald-700'
                  : 'bg-rose-50 border-rose-200/80 text-rose-700'
              }`}
            >
              {isEarned ? (
                <ArrowDownLeft className="w-5 h-5 text-emerald-600" />
              ) : (
                <ArrowUpRight className="w-5 h-5 text-rose-600" />
              )}
            </div>

            <div>
              <span
                className={`text-xl font-extrabold font-mono tabular-nums leading-none block ${
                  isEarned ? 'text-emerald-700' : 'text-stone-800'
                }`}
              >
                {isEarned ? `+${transaction.points.toLocaleString('en-IN')}` : `-${transaction.points.toLocaleString('en-IN')}`} Points
              </span>
              <span className="text-xs font-semibold text-stone-500 mt-0.5 block">
                {transaction.title}
              </span>
            </div>
          </div>

          {/* Details Table */}
          <div className="bg-stone-50 rounded-xl p-3 border border-stone-200/80 space-y-2 text-xs divide-y divide-stone-200/60">
            {transaction.description && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-stone-500 font-medium">Activity</span>
                <span className="font-semibold text-stone-900 text-right truncate max-w-[180px]">
                  {transaction.description}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1.5">
              <span className="text-stone-500 font-medium">Date</span>
              <span className="font-medium text-stone-800">
                {transaction.formattedDate || formatLongDate(transaction.date)}
              </span>
            </div>

            {transaction.invoiceNumber && (
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-stone-500 font-medium">Linked Invoice</span>
                <span className="font-mono font-bold text-brand-700 tabular-nums">
                  {transaction.invoiceNumber}
                </span>
              </div>
            )}

            {transaction.voucherCode && (
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-stone-500 font-medium">Voucher Code</span>
                <span className="font-mono font-bold text-stone-800 tabular-nums">
                  {transaction.voucherCode}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1.5">
              <span className="text-stone-500 font-medium">Points {isEarned ? 'Earned' : 'Deducted'}</span>
              <span className={`font-mono font-bold tabular-nums ${isEarned ? 'text-emerald-700' : 'text-stone-800'}`}>
                {transaction.points.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex items-center justify-between pt-1.5">
              <span className="text-stone-500 font-medium">Balance After</span>
              <span className="font-mono font-extrabold text-ink-900 tabular-nums">
                {transaction.balanceAfter.toLocaleString('en-IN')} Points
              </span>
            </div>
          </div>

          {/* Footer close */}
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            Close
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
