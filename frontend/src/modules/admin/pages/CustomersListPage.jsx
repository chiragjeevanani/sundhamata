import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, X } from 'lucide-react';
import { customerService } from '../../../services/customerService';
import { StatusBadge } from '../components/StatusBadge';
import { TableSkeleton } from '../components/SkeletonLoaders';

export const CustomersListPage = () => {
  const navigate = useNavigate();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await customerService.getCustomers({
        search,
        status: statusFilter,
      });
      setCustomers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchCustomers();
    }, 180);
    return () => clearTimeout(handler);
  }, [search, statusFilter]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Customers</h1>
          <p className="text-xs text-stone-500 mt-0.5">Directory of registered store customers, purchase history, and loyalty balances.</p>
        </div>

        <button
          onClick={() => navigate('/admin/customers/new')}
          className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Add Customer</span>
        </button>
      </div>

      {/* Seamless Open Toolbar (Search & Filter) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, mobile number, or ID..."
            className="w-full pl-8 pr-7 py-2 bg-white border border-stone-200 rounded-lg text-stone-900 font-normal placeholder:text-stone-400 focus:outline-hidden focus:border-brand-600 transition-all shadow-2xs"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg self-start sm:self-auto">
          {['all', 'active', 'inactive'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all cursor-pointer ${
                statusFilter === st
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Data Table (Clean Enterprise Data Sheet) */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-xs text-stone-400">
            No customers match your search criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50/60 border-b border-stone-100 text-xs font-medium text-stone-500">
                  <th className="py-2.5 px-5">Customer</th>
                  <th className="py-2.5 px-4">Mobile</th>
                  <th className="py-2.5 px-4">Interest</th>
                  <th className="py-2.5 px-4 text-center">Purchases</th>
                  <th className="py-2.5 px-4 text-right">Loyalty Points</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-stone-50/70 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/admin/customers/${c.id}`)}
                  >
                    <td className="py-3 px-5">
                      <span className="font-medium text-stone-900 group-hover:text-brand-700 block">
                        {c.name}
                      </span>
                      <span className="text-[11px] text-stone-400 font-mono font-normal">{c.customerCode}</span>
                    </td>

                    <td className="py-3 px-4 font-normal text-stone-700 whitespace-nowrap">
                      {c.phone || c.mobile}
                    </td>

                    <td className="py-3 px-4">
                      <span className="text-xs text-stone-600 font-normal">
                        {c.interest || 'Smartphones'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-center font-normal text-stone-800 tabular-nums">
                      {c.totalPurchases || 0}
                    </td>

                    <td className="py-3 px-4 text-right font-medium text-amber-700 tabular-nums whitespace-nowrap">
                      {c.loyaltyPoints?.toLocaleString('en-IN') || 0} pts
                    </td>

                    <td className="py-3 px-4">
                      <StatusBadge status={c.status || 'Active'} size="sm" />
                    </td>

                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/customers/${c.id}`);
                        }}
                        className="py-1 px-2.5 rounded-md text-xs font-medium text-stone-700 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
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

