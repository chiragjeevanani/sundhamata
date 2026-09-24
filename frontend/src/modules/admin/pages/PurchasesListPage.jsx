import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, PlusCircle, X } from 'lucide-react';
import { adminPurchaseService } from '../../../services/adminPurchaseService';
import { StatusBadge } from '../components/StatusBadge';
import { TableSkeleton } from '../components/SkeletonLoaders';
import { formatINR } from '../../../utils/formatters';

export const PurchasesListPage = () => {
  const navigate = useNavigate();

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const data = await adminPurchaseService.getPurchases({
        search,
        paymentStatus: statusFilter,
      });
      setPurchases(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchPurchases();
    }, 180);
    return () => clearTimeout(handler);
  }, [search, statusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">Invoices & Purchases</h1>
          <p className="text-xs text-slate-500 mt-0.5">Billing ledger, sales invoices, payment methods, and loyalty distribution.</p>
        </div>

        <button
          onClick={() => navigate('/admin/purchases/new')}
          className="py-2 px-3.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span>Record Purchase</span>
        </button>
      </div>

      {/* Seamless Open Toolbar (Search & Filter) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice number, product, or customer..."
            className="w-full pl-8 pr-7 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 font-normal placeholder:text-slate-400 focus:outline-hidden focus:border-blue-600 transition-all shadow-2xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
          {['all', 'paid', 'pending'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Purchases Data Table (Clean Enterprise Data Sheet) */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : purchases.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            No invoices found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-5">Invoice #</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4">Product</th>
                  <th className="py-2.5 px-4">Amount</th>
                  <th className="py-2.5 px-4 text-right">Points</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {purchases.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-slate-50/70 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/admin/purchases/${p.id}`)}
                  >
                    <td className="py-3 px-5 font-mono text-xs font-medium text-slate-900 group-hover:text-blue-700">
                      {p.invoiceNumber}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-medium text-slate-900 block">{p.customerName || 'Customer'}</span>
                      <span className="text-xs text-slate-400 font-normal">{p.customerMobile}</span>
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-normal text-slate-800 truncate max-w-[220px] block">{p.product?.name}</span>
                    </td>

                    <td className="py-3 px-4 font-medium text-slate-900 tabular-nums whitespace-nowrap">
                      {formatINR(p.amount)}
                    </td>

                    <td className="py-3 px-4 text-right font-medium text-emerald-700 tabular-nums whitespace-nowrap">
                      +{p.loyalty?.pointsEarned ?? 0} pts
                    </td>

                    <td className="py-3 px-4 text-slate-500 font-normal whitespace-nowrap">
                      {p.formattedDate}
                    </td>

                    <td className="py-3 px-4">
                      <StatusBadge status={p.paymentStatus} size="sm" />
                    </td>

                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/purchases/${p.id}`);
                        }}
                        className="py-1 px-2.5 rounded-md text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

