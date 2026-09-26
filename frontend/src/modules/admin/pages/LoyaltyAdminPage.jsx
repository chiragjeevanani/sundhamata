import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ArrowDownLeft,
  Search,
  IndianRupee,
  Users,
  ChevronRight,
} from 'lucide-react';
import { adminLoyaltyService } from '../../../services/adminLoyaltyService';
import { customerService } from '../../../services/customerService';
import { TableSkeleton, DashboardSkeleton } from '../components/SkeletonLoaders';
import { formatINR } from '../../../utils/formatters';
import { useToast } from '../context/ToastContext';
import { AreaLineChart } from '../components/charts/AreaLineChart';
import { DonutPieChart } from '../components/charts/DonutPieChart';
import { SparklineChart } from '../components/charts/SparklineChart';

export const LoyaltyAdminPage = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [activeTimeframe, setActiveTimeframe] = useState('6 Months');
  const [overview, setOverview] = useState({
    totalPointsIssued: 0,
    pointsRedeemed: 0,
    pointsOutstanding: 0,
    customersWithPoints: 0,
    totalCustomers: 0,
    tierShare: [],
    recentActivity: [],
    issuedTrend: {},
  });

  const [transactions, setTransactions] = useState([]);
  const [filter, setFilter] = useState('all');

  // Manual Adjust Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [adjustPoints, setAdjustPoints] = useState('500');
  const [adjustType, setAdjustType] = useState('add');
  const [adjustReason, setAdjustReason] = useState('Store promotion bonus');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  const fetchLoyaltyData = async () => {
    setLoading(true);
    try {
      const [ov, txns] = await Promise.all([
        adminLoyaltyService.getOverview(),
        adminLoyaltyService.getTransactions({ filter: 'all' }),
      ]);
      setOverview(ov);
      setTransactions(txns);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Initial data load
  useEffect(() => {
    fetchLoyaltyData();
  }, []);

  // Filter change only filters transactions without flashing entire page
  useEffect(() => {
    if (loading) return;
    const filterTxns = async () => {
      setTableLoading(true);
      try {
        const txns = await adminLoyaltyService.getTransactions({ filter });
        setTransactions(txns);
      } catch (err) {
        console.error(err);
      } finally {
        setTableLoading(false);
      }
    };
    filterTxns();
  }, [filter]);

  // Customer search inside adjustment modal
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) {
      setCustomerSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const list = await customerService.searchCustomers(customerSearch);
        setCustomerSearchResults(list);
      } catch (e) {}
    }, 180);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCustomer) {
      showError('Validation', 'Please select a customer.');
      return;
    }
    if (!adjustPoints || Number(adjustPoints) <= 0) {
      showError('Validation', 'Enter a valid points amount.');
      return;
    }

    setSubmittingAdjust(true);
    try {
      const res = await adminLoyaltyService.adjustPoints(selectedCustomer.id, {
        points: Number(adjustPoints),
        type: adjustType,
        reason: adjustReason.trim() || 'Manual adjustment',
      });

      showSuccess(
        'Points Adjusted',
        `${adjustType === 'add' ? 'Added' : 'Deducted'} ${adjustPoints} pts for ${selectedCustomer.name}.`
      );

      setAdjustModalOpen(false);
      setSelectedCustomer(null);
      setCustomerSearch('');
      fetchLoyaltyData();
    } catch (err) {
      showError('Failed', err.message || 'Unable to adjust points.');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-7 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Loyalty Program</h1>
          <p className="text-xs text-stone-500 mt-0.5">Points distribution ledger, customer reward tiers, and balance management.</p>
        </div>

        <button
          onClick={() => setAdjustModalOpen(true)}
          className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Adjust Points</span>
        </button>
      </div>

      {/* Fluid Open Metrics Strip */}
      <div className="bg-white rounded-xl border border-stone-200/80 divide-y sm:divide-y-0 sm:divide-x divide-stone-100 grid grid-cols-2 lg:grid-cols-4 shadow-2xs">
        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-stone-500">Total Points Issued</span>
          <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">
            {overview.totalPointsIssued >= 100000
              ? `${(overview.totalPointsIssued / 100000).toFixed(2)}L`
              : overview.totalPointsIssued.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-stone-500">Points Redeemed</span>
          <div className="text-2xl font-semibold text-rose-700 tabular-nums mt-1">
            {overview.pointsRedeemed >= 100000
              ? `${(overview.pointsRedeemed / 100000).toFixed(2)}L`
              : overview.pointsRedeemed.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-stone-500">Active Balance Pool</span>
          <div className="text-2xl font-semibold text-emerald-700 tabular-nums mt-1">
            {overview.pointsOutstanding >= 100000
              ? `${(overview.pointsOutstanding / 100000).toFixed(2)}L`
              : overview.pointsOutstanding.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-stone-500">Enrolled Customers</span>
          <div className="text-2xl font-semibold text-stone-900 tabular-nums mt-1">
            {overview.customersWithPoints.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Visual Analytics Strip (Un-boxed, clean surface) */}
      <div className="bg-white rounded-xl border border-stone-200/80 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-stone-100 shadow-2xs">
        <div className="lg:col-span-7 p-5 flex flex-col justify-between">
          <AreaLineChart
            data={overview.issuedTrend?.[activeTimeframe] ?? []}
            title="Points Issuance Velocity"
            subtitle="Rewards earned on customer counter purchases"
            isCurrency={false}
            height={220}
            accentColor="#F59E0B"
            timeframes={['30 Days', '6 Months', '1 Year']}
            activeTimeframe={activeTimeframe}
            onTimeframeChange={(tf) => setActiveTimeframe(tf)}
          />
        </div>

        <div className="lg:col-span-5 p-5 flex flex-col justify-between">
          <DonutPieChart
            data={overview.tierShare}
            title="Membership Tiers"
            subtitle="Customer tier distribution based on current points balance"
            totalLabel="Enrolled"
            totalValue={`${(overview.totalCustomers || overview.customersWithPoints || 0).toLocaleString('en-IN')}`}
            size={155}
            strokeWidth={22}
          />
        </div>
      </div>

      {/* Transaction Activity Ledger (Clean Enterprise Data Sheet) */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Points Activity Ledger</h3>
            <p className="text-xs text-stone-500 mt-0.5">Audit log of customer points earned and deducted</p>
          </div>

          <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
            {['all', 'earned', 'redeemed'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all cursor-pointer ${
                  filter === f
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {tableLoading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50/60 border-b border-stone-100 text-xs font-medium text-stone-500">
                  <th className="py-2.5 px-5">Customer</th>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4 text-right">Points</th>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-right">Balance</th>
                  <th className="py-2.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-stone-700">
                {transactions.map((t) => {
                  const isEarned = t.isCredit;
                  return (
                    <tr key={t.id} className="hover:bg-stone-50/70 transition-colors">
                      <td className="py-3 px-5">
                        <span className="font-medium text-stone-900 block">{t.customerName || 'Customer'}</span>
                        <span className="text-[11px] text-stone-400 font-mono font-normal">{t.customerCode}</span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-stone-800 block">{t.title}</span>
                        <span className="text-xs text-stone-400 truncate max-w-[220px] block font-normal">{t.description}</span>
                      </td>

                      <td className="py-3 px-4 text-right font-medium text-xs tabular-nums whitespace-nowrap">
                        <span className={isEarned ? 'text-emerald-700' : 'text-rose-700'}>
                          {isEarned ? `+${t.points}` : `-${t.points}`}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-stone-500 font-normal whitespace-nowrap">
                        {t.formattedDate || t.date}
                      </td>

                      <td className="py-3 px-4 text-right text-stone-800 tabular-nums whitespace-nowrap font-normal">
                        {t.balanceAfter?.toLocaleString('en-IN') || 0} pts
                      </td>

                      <td className="py-3 px-5 text-right whitespace-nowrap">
                        {t.purchaseId ? (
                          <button
                            onClick={() => navigate(`/admin/purchases/${t.purchaseId}`)}
                            className="py-1 px-2.5 rounded-md text-xs font-medium text-stone-700 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
                          >
                            Invoice
                          </button>
                        ) : (
                          <span className="text-[11px] text-stone-400 font-normal">Manual</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjustment Modal */}
      {adjustModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl max-w-sm w-full p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900">Adjust Loyalty Points</h3>
              <button
                onClick={() => setAdjustModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-xs font-normal cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-stone-700 block">Customer</label>
                {selectedCustomer ? (
                  <div className="flex justify-between items-center p-2.5 rounded-lg bg-stone-50 border border-stone-200">
                    <span className="font-medium text-stone-900">{selectedCustomer.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(null)}
                      className="text-brand-600 font-medium text-xs hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search customer name or phone..."
                    className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
                  />
                )}
                {customerSearchResults.length > 0 && !selectedCustomer && (
                  <div className="border border-stone-200 rounded-lg bg-white max-h-36 overflow-y-auto divide-y divide-stone-100 shadow-md">
                    {customerSearchResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerSearchResults([]);
                        }}
                        className="p-2.5 hover:bg-stone-50 cursor-pointer flex justify-between"
                      >
                        <span className="font-medium text-stone-900">{c.name}</span>
                        <span className="text-stone-400 font-normal">{c.phone || c.mobile}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('add')}
                  className={`py-1.5 px-3 rounded-lg font-medium border transition-colors cursor-pointer ${
                    adjustType === 'add'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-stone-700 border-stone-200'
                  }`}
                >
                  + Add Points
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('deduct')}
                  className={`py-1.5 px-3 rounded-lg font-medium border transition-colors cursor-pointer ${
                    adjustType === 'deduct'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-white text-stone-700 border-stone-200'
                  }`}
                >
                  - Deduct Points
                </button>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-stone-700 block">Points</label>
                <input
                  type="number"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg font-medium text-stone-900 tabular-nums focus:outline-hidden focus:border-brand-600 shadow-2xs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-stone-700 block">Reason</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 font-normal focus:outline-hidden focus:border-brand-600 shadow-2xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustModalOpen(false)}
                  className="py-1.5 px-3 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="py-1.5 px-4 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 cursor-pointer disabled:opacity-50"
                >
                  {submittingAdjust ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

