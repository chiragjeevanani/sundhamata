import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Gift, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatINR } from '../../../utils/formatters';
import { useStoreInfo } from '../hooks/useStoreInfo';

export const RedemptionModal = ({ isOpen, onClose, points = 0, estimatedValue = 0 }) => {
  const loyalty = useStoreInfo()?.loyalty;
  if (!isOpen) return null;

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
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 flex items-center justify-center">
              <Gift className="w-5 h-5 text-[#D97706]" />
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 block">
              Sundhamata Rewards
            </span>
            <h3 className="text-base font-extrabold text-ink-900 tracking-tight">
              Redeem at the store counter
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed font-normal">
              Tell our staff you want to use your points when you buy. They come straight off your bill
              {loyalty?.rupeeValuePerPoint ? ` — each point is worth ${formatINR(loyalty.rupeeValuePerPoint)}` : ''}
              {loyalty?.minRedeemPoints > 0 ? `, from ${loyalty.minRedeemPoints.toLocaleString('en-IN')} points at a time` : ''}.
            </p>
          </div>

          {/* Current Balance Summary Box */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                Your Balance
              </span>
              <span className="font-extrabold text-ink-900 font-mono text-sm tabular-nums">
                {points.toLocaleString('en-IN')} Points
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-stone-400 tracking-wider block">
                Approx. Value
              </span>
              <span className="font-bold text-emerald-700 font-mono text-sm tabular-nums">
                {formatINR(estimatedValue)}
              </span>
            </div>
          </div>

          {/* Confirm Button */}
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-ink-900 hover:bg-ink-800 text-white font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            Got it
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
