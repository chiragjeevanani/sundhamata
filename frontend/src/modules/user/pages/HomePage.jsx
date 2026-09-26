import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShoppingBag,
  ArrowRight,
  ChevronRight,
  PhoneCall,
  Sparkles,
} from 'lucide-react';
import { Header } from '../components/Header';
import { PurchaseCard } from '../components/PurchaseCard';
import { StatusBadge } from '../components/StatusBadge';
import { HomeSkeleton } from '../components/SkeletonLoader';
import { ErrorState } from '../components/ErrorState';
import { useAuth } from '../context/AuthContext';
import { purchaseService } from '../../../services/purchaseService';
import { loyaltyService } from '../../../services/loyaltyService';
import { formatINR, formatDate } from '../../../utils/formatters';

export const HomePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { onOpenStoreInfo } = useOutletContext() || {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [loyaltySummary, setLoyaltySummary] = useState(null);

  const loadHomeData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, recents, loySum] = await Promise.all([
        purchaseService.getPurchaseSummary(),
        purchaseService.getRecentPurchases(4),
        loyaltyService.getSummary(),
      ]);
      setSummary(sum);
      setRecentPurchases(recents);
      setLoyaltySummary(loySum);
    } catch (err) {
      setError(err.message || 'Failed to load purchase records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeData();
  }, []);

  const customerFirstName = user?.name ? user.name.split(' ')[0] : '';
  const latestPurchase = summary?.latestPurchase;
  // Exclude latest purchase from recent list below so it is never duplicated on screen
  const previousPurchases = recentPurchases.filter(
    (p) => p.id !== latestPurchase?.id
  );

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Header */}
      <Header onOpenStoreInfo={onOpenStoreInfo} />

      <div className="p-3.5 sm:p-4 space-y-3">
        {loading ? (
          <HomeSkeleton />
        ) : error ? (
          <ErrorState
            title="Unable to load purchases"
            description={error}
            onRetry={loadHomeData}
          />
        ) : (
          <>
            {/* Greeting */}
            <div className="pt-0.5">
              <h1 className="text-xl font-black text-ink-900 tracking-tight">
                Hello, {customerFirstName}
              </h1>
            </div>

            {/* Quick 2-Column Overview (Purchases & Points) */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => navigate('/purchases')}
                className="bg-white rounded-xl p-3 border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] hover:border-stone-300 transition-all text-left cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    Purchases
                  </span>
                  <span className="text-lg font-extrabold text-ink-900 font-mono tabular-nums leading-tight mt-0.5 block">
                    {summary?.totalPurchases || 0}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-brand-50 text-[#B55B1F] flex items-center justify-center shrink-0">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </button>

              <button
                onClick={() => navigate('/loyalty')}
                className="bg-white rounded-xl p-3 border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] hover:border-stone-300 transition-all text-left cursor-pointer flex items-center justify-between group"
              >
                <div>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    Points
                  </span>
                  <span className="text-lg font-extrabold text-ink-900 font-mono tabular-nums leading-tight mt-0.5 block">
                    {loyaltySummary?.currentBalance?.toLocaleString('en-IN') || 0}
                  </span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-[#D97706] flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
              </button>
            </div>

            {/* Latest Purchase Highlight */}
            {latestPurchase && (
              <section className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Latest Purchase
                  </h2>
                </div>

                <div className="bg-ink-900 text-white rounded-xl p-3.5 border border-ink-700 shadow-[0_1px_4px_rgba(15,32,66,0.08)]">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[14.5px] font-extrabold text-white tracking-tight leading-snug truncate">
                          {latestPurchase.product.name}
                        </h3>
                        <p className="text-[11.5px] text-stone-300 mt-0.5 font-medium truncate">
                          {[latestPurchase.product.variant, latestPurchase.product.color].filter(Boolean).join(' • ')}
                        </p>
                      </div>

                      <div className="shrink-0">
                        <StatusBadge status={latestPurchase.status} size="sm" />
                      </div>
                    </div>

                    {/* Date and Amount */}
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                      <span className="text-xs text-stone-200 font-medium">
                        {latestPurchase.formattedDate || formatDate(latestPurchase.purchaseDate)}
                      </span>

                      <span className="text-[15px] font-extrabold text-white font-mono tabular-nums">
                        {formatINR(latestPurchase.amount)}
                      </span>
                    </div>

                    {/* View Details Button */}
                    <button
                      onClick={() => navigate(`/purchases/${latestPurchase.id}`)}
                      className="mt-0.5 w-full py-2 px-3 rounded-lg bg-white hover:bg-stone-100 text-ink-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] cursor-pointer"
                    >
                      <span>View Details</span>
                      <ArrowRight className="w-3.5 h-3.5 text-[#B55B1F]" />
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Previous Purchases List (No duplication with Latest Purchase) */}
            {previousPurchases.length > 0 && (
              <section className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Previous Purchases
                  </h2>
                  <button
                    onClick={() => navigate('/purchases')}
                    className="text-[11px] font-bold text-brand-700 hover:text-brand-900 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>View All</span>
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2">
                  {previousPurchases.slice(0, 2).map((purchase) => (
                    <PurchaseCard key={purchase.id} purchase={purchase} />
                  ))}
                </div>
              </section>
            )}

            {/* Zero Purchases State for Newly Registered Customers */}
            {!latestPurchase && previousPurchases.length === 0 && (
              <div className="bg-white rounded-xl p-4 border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] text-center space-y-2">
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-[#B55B1F] mx-auto flex items-center justify-center">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-stone-900">
                    No purchases recorded yet
                  </h3>
                  <p className="text-xs text-stone-500 font-normal max-w-xs mx-auto">
                    Your device purchases and warranty invoices will appear here once billed at our store.
                  </p>
                </div>
              </div>
            )}

            {/* Need Help? Store Contact */}
            <section className="pt-0.5">
              <div
                onClick={onOpenStoreInfo}
                className="bg-white rounded-xl p-2.5 px-3 border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] flex items-center justify-between cursor-pointer hover:border-stone-300 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                    <PhoneCall className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-[11.5px] font-bold text-stone-900 group-hover:text-brand-700 transition-colors leading-tight">
                      Need help with your purchase?
                    </h3>
                    <p className="text-[10px] text-stone-500 mt-0.5 font-normal">
                      Contact Sundhamata Mobile store team
                    </p>
                  </div>
                </div>

                <span className="w-6 h-6 rounded-full bg-stone-50 group-hover:bg-stone-100 flex items-center justify-center text-stone-400 transition-colors shrink-0">
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
