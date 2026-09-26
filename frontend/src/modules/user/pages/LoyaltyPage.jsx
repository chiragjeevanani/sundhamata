import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
  Info,
  Gift,
  HelpCircle,
  ShoppingBag,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import { Header } from '../components/Header';
import { AnimatedPoints } from '../components/AnimatedPoints';
import { RedemptionModal } from '../components/RedemptionModal';
import { TransactionDetailModal } from '../components/TransactionDetailModal';
import { LoyaltySkeleton } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import { loyaltyService } from '../../../services/loyaltyService';
import { formatINR } from '../../../utils/formatters';

export const LoyaltyPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [programInfo, setProgramInfo] = useState(null);

  const [filter, setFilter] = useState('all'); // 'all' | 'earned' | 'redeemed'
  const [selectedTxn, setSelectedTxn] = useState(null);
  const [showRedeemModal, setShowRedeemModal] = useState(false);

  const howItWorksRef = useRef(null);

  const loadLoyaltyData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumData, txns, info] = await Promise.all([
        loyaltyService.getSummary(),
        loyaltyService.getTransactions({ filter }),
        loyaltyService.getProgramInfo(),
      ]);
      setSummary(sumData);
      setTransactions(txns);
      setProgramInfo(info);
    } catch (err) {
      setError(err.message || 'Unable to load your loyalty points.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLoyaltyData();
  }, [filter]);

  const scrollToHowItWorks = () => {
    howItWorksRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const customerFirstName = user?.name ? user.name.split(' ')[0] : '';

  return (
    <div className="flex-1 flex flex-col">
      {/* Top App Header */}
      <Header />

      <div className="p-3.5 sm:p-4 space-y-3">
        {loading ? (
          <LoyaltySkeleton />
        ) : error ? (
          <ErrorState
            title="Unable to load your loyalty points"
            description={error}
            onRetry={loadLoyaltyData}
          />
        ) : (
          <>
            {/* Customer Greeting Row */}
            <div className="flex items-center justify-between pt-0.5">
              <h1 className="text-xl font-black text-[#0F2042] tracking-tight">
                Loyalty Points
              </h1>

              {/* Tier Chip */}
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/80 text-amber-900 text-[10.5px] font-bold select-none">
                <Sparkles className="w-3 h-3 text-[#D97706]" />
                <span>{summary?.customerTier || 'Silver Member'}</span>
              </div>
            </div>

            {/* Main Balance Card (Solid Deep Navy Surface) */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="bg-[#0F2042] text-white rounded-2xl p-4 border border-[#1E365D] shadow-[0_2px_8px_rgba(15,32,66,0.12)] text-center relative overflow-hidden"
            >
              <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider block leading-none">
                Current Balance
              </span>

              {/* Points Count with Subtle Entrance Counter */}
              <div className="my-1.5 flex items-baseline justify-center gap-1.5">
                <h2 className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight leading-none">
                  <AnimatedPoints value={summary?.currentBalance || 0} />
                </h2>
                <span className="text-xs font-bold text-brand-300 uppercase tracking-wide">
                  Points
                </span>
              </div>

              {/* Approximate Rupee Value */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200 text-[11px] font-semibold">
                <span>≈ {formatINR(summary?.estimatedValue || summary?.currentBalance || 0)} value</span>
              </div>

              <div className="flex items-center justify-center gap-1.5 text-[10.5px] text-emerald-400 font-medium mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Available to redeem</span>
              </div>

              {/* Actions row */}
              <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-2">
                <button
                  onClick={() => setShowRedeemModal(true)}
                  className="flex-1 py-2 px-3 rounded-xl bg-white hover:bg-slate-100 text-[#0F2042] font-bold text-xs uppercase tracking-wider transition-colors active:scale-[0.98] cursor-pointer shadow-2xs"
                >
                  Redeem Points
                </button>
                <button
                  onClick={scrollToHowItWorks}
                  className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  How It Works
                </button>
              </div>
            </motion.div>

            {/* Point Summary: Clean 3-Column Layout */}
            <div className="bg-white rounded-xl p-3 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)]">
              <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  This Month
                </span>
              </div>

              <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                {/* Earned */}
                <div className="px-1">
                  <span className="text-[9.5px] uppercase font-bold text-slate-400 block leading-tight">
                    Earned
                  </span>
                  <span className="text-sm font-extrabold text-emerald-700 font-mono tabular-nums mt-0.5 block">
                    +{summary?.earnedThisMonth?.toLocaleString('en-IN') || 0}
                  </span>
                </div>

                {/* Redeemed */}
                <div className="px-1">
                  <span className="text-[9.5px] uppercase font-bold text-slate-400 block leading-tight">
                    Redeemed
                  </span>
                  <span className="text-sm font-extrabold text-slate-700 font-mono tabular-nums mt-0.5 block">
                    -{summary?.redeemedThisMonth?.toLocaleString('en-IN') || 0}
                  </span>
                </div>

                {/* Net */}
                <div className="px-1">
                  <span className="text-[9.5px] uppercase font-bold text-slate-400 block leading-tight">
                    Net
                  </span>
                  <span className="text-sm font-extrabold text-[#0F2042] font-mono tabular-nums mt-0.5 block">
                    {(summary?.netThisMonth ?? 0) >= 0 ? '+' : '−'}
                    {Math.abs(summary?.netThisMonth ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            {/* How You Earn Points (Informational Cards) */}
            <section className="space-y-1.5 pt-0.5">
              <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                How You Earn Points
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {programInfo?.earningMethods?.map((method) => (
                  <div
                    key={method.id}
                    className="bg-white rounded-xl p-2.5 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.02)] flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <h4 className="text-[12px] font-bold text-slate-900 leading-tight">
                          {method.title}
                        </h4>
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-brand-50 text-brand-800 border border-brand-100 shrink-0">
                          {method.tag}
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500 leading-snug font-normal">
                        {method.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Points Activity Section (Transactions History) */}
            <section className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500 block">
                    Points Activity
                  </h3>
                </div>

                {/* Segmented Filter Control */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
                  {['all', 'earned', 'redeemed'].map((f) => {
                    const active = filter === f;
                    return (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold capitalize transition-all cursor-pointer ${
                          active
                            ? 'bg-white text-[#0F2042] shadow-2xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transactions List */}
              {transactions.length === 0 ? (
                <EmptyState
                  title="No loyalty points yet"
                  description="Make your first purchase at Sundhamata Mobile and start earning rewards."
                  actionLabel="View Purchase History"
                  onAction={() => navigate('/purchases')}
                />
              ) : (
                <div className="space-y-1.5">
                  <AnimatePresence>
                    {transactions.map((txn, index) => {
                      const isEarned = txn.isCredit;
                      return (
                        <motion.div
                          key={txn.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04, duration: 0.15 }}
                          onClick={() => setSelectedTxn(txn)}
                          className="bg-white rounded-xl p-2.5 px-3 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.02)] hover:border-slate-300 transition-all flex items-center justify-between cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {/* Direction Icon Box */}
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                                isEarned
                                  ? 'bg-emerald-50 border-emerald-200/70 text-emerald-700'
                                  : 'bg-rose-50 border-rose-200/70 text-rose-700'
                              }`}
                            >
                              {isEarned ? (
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                              ) : (
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <h4 className="text-[12.5px] font-bold text-slate-900 group-hover:text-brand-700 transition-colors truncate">
                                {txn.title}
                              </h4>
                              <p className="text-[10.5px] text-slate-500 truncate">
                                {txn.description}
                              </p>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                                <span>{txn.formattedDate}</span>
                                {txn.invoiceNumber && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono">{txn.invoiceNumber}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 pl-2">
                            <span
                              className={`font-mono font-extrabold text-[13.5px] tabular-nums block ${
                                isEarned ? 'text-emerald-700' : 'text-slate-700'
                              }`}
                            >
                              {isEarned ? `+${txn.points.toLocaleString('en-IN')}` : `-${txn.points.toLocaleString('en-IN')}`}
                            </span>
                            <span className="text-[9.5px] text-slate-400 font-mono block">
                              Bal: {txn.balanceAfter.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </section>

            {/* How Loyalty Points Work (3-Step Educational Section) */}
            <section
              ref={howItWorksRef}
              className="bg-white rounded-xl p-3.5 border border-slate-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] space-y-2.5 pt-3"
            >
              <div className="flex items-center gap-1.5 pb-1 border-b border-slate-100">
                <HelpCircle className="w-3.5 h-3.5 text-brand-700" />
                <h3 className="text-xs font-bold text-[#0F2042] uppercase tracking-wider">
                  How Loyalty Points Work
                </h3>
              </div>

              <div className="space-y-2">
                {programInfo?.programSteps?.map((item) => (
                  <div key={item.step} className="flex items-start gap-2.5 text-xs">
                    <div className="w-5 h-5 rounded-full bg-brand-50 border border-brand-100 text-brand-800 font-bold text-[10.5px] flex items-center justify-center shrink-0 mt-0.5 font-mono">
                      {item.step}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{item.title}</h4>
                      <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-snug">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Policy Disclaimer */}
              <div className="pt-2 border-t border-slate-100 flex items-start gap-1.5 text-[10px] text-slate-400 leading-relaxed font-normal">
                <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                <span>{programInfo?.termsDisclaimer}</span>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Redemption Notice Modal */}
      <RedemptionModal
        isOpen={showRedeemModal}
        onClose={() => setShowRedeemModal(false)}
        points={summary?.currentBalance ?? 0}
        estimatedValue={summary?.estimatedValue ?? 0}
      />

      {/* Transaction Details Modal */}
      <TransactionDetailModal
        isOpen={!!selectedTxn}
        onClose={() => setSelectedTxn(null)}
        transaction={selectedTxn}
      />
    </div>
  );
};
