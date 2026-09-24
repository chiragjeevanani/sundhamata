import React from 'react';

export const TableSkeleton = ({ rows = 5, cols = 6 }) => {
  return (
    <div className="w-full bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 animate-pulse">
      <div className="bg-slate-50/80 p-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3.5 bg-slate-200 rounded flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="p-3.5 flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className={`h-3 bg-slate-100 rounded ${c === 0 ? 'w-32' : 'flex-1'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export const CardSkeleton = () => {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-2xs space-y-3 animate-pulse">
      <div className="h-3 w-24 bg-slate-200 rounded" />
      <div className="h-7 w-32 bg-slate-200 rounded" />
      <div className="h-2.5 w-40 bg-slate-100 rounded" />
    </div>
  );
};

export const DashboardSkeleton = () => {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-72 bg-white rounded-xl border border-slate-200 p-4" />
        <div className="h-72 bg-white rounded-xl border border-slate-200 p-4" />
      </div>
    </div>
  );
};

export const DetailsSkeleton = () => {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 bg-white rounded-xl border border-slate-200 p-4" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="h-56 bg-white rounded-xl border border-slate-200 p-4" />
        <div className="h-56 bg-white rounded-xl border border-slate-200 p-4" />
      </div>
    </div>
  );
};
