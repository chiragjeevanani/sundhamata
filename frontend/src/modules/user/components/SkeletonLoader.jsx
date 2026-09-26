import React from 'react';

export const PurchaseCardSkeleton = () => (
  <div className="bg-white rounded-xl p-3 border border-stone-200/80 shadow-2xs animate-pulse">
    {/* Top meta skeleton */}
    <div className="flex items-center justify-between pb-2 mb-2 border-b border-stone-100">
      <div className="h-2.5 bg-stone-200 rounded w-20" />
      <div className="h-3.5 bg-stone-100 rounded w-14" />
    </div>

    {/* Body skeleton */}
    <div className="flex items-center gap-3">
      <div className="w-14 h-16 bg-stone-100 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5 py-0.5">
        <div className="h-2 bg-stone-200 rounded w-12" />
        <div className="h-3.5 bg-stone-200 rounded w-36" />
        <div className="h-2.5 bg-stone-100 rounded w-28" />
        <div className="h-2 bg-stone-100 rounded w-20" />
      </div>
    </div>

    {/* Footer skeleton */}
    <div className="flex items-center justify-between pt-2 mt-2 border-t border-stone-100">
      <div className="h-3.5 bg-stone-200 rounded w-16" />
      <div className="h-2.5 bg-stone-100 rounded w-14" />
    </div>
  </div>
);

export const PurchaseListSkeleton = ({ count = 3 }) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, idx) => (
      <PurchaseCardSkeleton key={idx} />
    ))}
  </div>
);

export const HomeSkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {/* Greeting */}
    <div className="pt-0.5">
      <div className="h-6 bg-stone-200 rounded w-32" />
    </div>

    {/* 2-column KPI grid */}
    <div className="grid grid-cols-2 gap-2.5">
      <div className="bg-white rounded-xl p-3 border border-stone-200/80 h-16" />
      <div className="bg-white rounded-xl p-3 border border-stone-200/80 h-16" />
    </div>

    {/* Hero Highlight */}
    <div className="space-y-1.5">
      <div className="h-2.5 bg-stone-200 rounded w-24" />
      <div className="bg-ink-900 rounded-xl p-3.5 h-32 opacity-80" />
    </div>

    {/* Recent list skeleton */}
    <div className="space-y-2 pt-1">
      <div className="h-2.5 bg-stone-200 rounded w-24" />
      <PurchaseCardSkeleton />
      <PurchaseCardSkeleton />
    </div>
  </div>
);

export const PurchaseDetailSkeleton = () => (
  <div className="space-y-2.5 animate-pulse">
    {/* Product Image and Title Box */}
    <div className="bg-white rounded-2xl p-3.5 border border-stone-200 flex gap-3 items-center">
      <div className="w-18 h-22 bg-stone-100 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-2 bg-stone-200 rounded w-14" />
        <div className="h-4 bg-stone-200 rounded w-36" />
        <div className="h-3 bg-stone-100 rounded w-28" />
        <div className="h-3 bg-stone-100 rounded w-20" />
      </div>
    </div>

    {/* Section 1 */}
    <div className="bg-white rounded-xl p-3 border border-stone-200 space-y-2">
      <div className="h-2.5 bg-stone-200 rounded w-24 pb-1" />
      <div className="h-2.5 bg-stone-100 rounded w-full" />
      <div className="h-2.5 bg-stone-100 rounded w-full" />
      <div className="h-2.5 bg-stone-100 rounded w-3/4" />
    </div>

    {/* Section 2 */}
    <div className="bg-white rounded-xl p-3 border border-stone-200 space-y-2">
      <div className="h-2.5 bg-stone-200 rounded w-24 pb-1" />
      <div className="h-2.5 bg-stone-100 rounded w-full" />
      <div className="h-2.5 bg-stone-100 rounded w-full" />
    </div>
  </div>
);

export const LoyaltySkeleton = () => (
  <div className="space-y-3 animate-pulse">
    {/* Greeting skeleton */}
    <div className="space-y-1">
      <div className="h-2.5 bg-stone-200 rounded w-20" />
      <div className="h-5 bg-stone-200 rounded w-36" />
    </div>

    {/* Balance card skeleton */}
    <div className="bg-ink-900 rounded-2xl p-4 h-36 opacity-85" />

    {/* 3-column month summary skeleton */}
    <div className="bg-white rounded-xl p-3 h-16 border border-stone-200/80 flex justify-around items-center" />

    {/* Earning methods skeleton */}
    <div className="space-y-2 pt-1">
      <div className="h-3 bg-stone-200 rounded w-32" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="bg-white rounded-xl p-3 h-16 border border-stone-200/80" />
        <div className="bg-white rounded-xl p-3 h-16 border border-stone-200/80" />
        <div className="bg-white rounded-xl p-3 h-16 border border-stone-200/80" />
      </div>
    </div>

    {/* Transactions skeleton */}
    <div className="space-y-2 pt-1">
      <div className="h-3 bg-stone-200 rounded w-28" />
      <div className="bg-white rounded-xl p-3 h-14 border border-stone-200/80" />
      <div className="bg-white rounded-xl p-3 h-14 border border-stone-200/80" />
    </div>
  </div>
);

