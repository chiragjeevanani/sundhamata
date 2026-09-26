import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { Header } from '../components/Header';
import { PurchaseCard } from '../components/PurchaseCard';
import { PurchaseListSkeleton } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { purchaseService } from '../../../services/purchaseService';

export const PurchaseHistoryPage = () => {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const categories = [
    { id: 'all', label: 'All' },
    { id: 'phones', label: 'Smartphones' },
    { id: 'accessories', label: 'Accessories' },
  ];

  const fetchPurchases = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseService.getPurchases({
        search: searchQuery,
        category: selectedCategory,
      });
      setPurchases(data);
    } catch (err) {
      setError(err.message || 'Could not load your purchase records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchPurchases();
    }, 180);

    return () => clearTimeout(handler);
  }, [searchQuery, selectedCategory]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Header */}
      <Header />

      <div className="p-3.5 sm:p-4 space-y-2.5">
        {/* Title */}
        <div className="pt-0.5">
          <h1 className="text-xl font-black text-ink-900 tracking-tight">
            Purchase History
          </h1>
        </div>

        {/* Compact Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-stone-400">
            <Search className="w-3.5 h-3.5 text-stone-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search purchases..."
            className="w-full pl-8 pr-7 py-1.5 bg-white border border-stone-300 rounded-lg text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden focus:border-ink-900 focus:ring-1 focus:ring-ink-900 transition-all shadow-2xs font-medium"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-2 flex items-center text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all select-none cursor-pointer ${
                  isSelected
                    ? 'bg-ink-900 text-white shadow-2xs'
                    : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200/90'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Purchases List */}
        <div className="pt-0.5">
          {loading ? (
            <PurchaseListSkeleton count={3} />
          ) : error ? (
            <ErrorState
              title="Failed to load purchases"
              description={error}
              onRetry={fetchPurchases}
            />
          ) : purchases.length === 0 ? (
            searchQuery ? (
              <EmptyState
                title="No matching purchases found"
                description={`No devices found matching "${searchQuery}".`}
                actionLabel="Clear Search"
                onAction={() => setSearchQuery('')}
              />
            ) : (
              <EmptyState
                title="No purchases yet"
                description="Your purchases from Sundhamata Mobile will appear here."
                actionLabel="Go to Home"
                onAction={() => navigate('/home')}
              />
            )
          ) : (
            <div className="space-y-2">
              <div className="text-[10.5px] font-medium text-stone-400 px-0.5">
                <span>{purchases.length} {purchases.length === 1 ? 'purchase' : 'purchases'}</span>
              </div>

              <div className="space-y-2">
                {purchases.map((purchase) => (
                  <PurchaseCard key={purchase.id} purchase={purchase} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
