import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ShoppingBag,
  IndianRupee,
  Sparkles,
  PlusCircle,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';
import { adminDashboardService } from '../../../services/adminDashboardService';
import { StatusBadge } from '../components/StatusBadge';
import { DashboardSkeleton } from '../components/SkeletonLoaders';
import { formatINR } from '../../../utils/formatters';
import { AreaLineChart } from '../components/charts/AreaLineChart';
import { DonutPieChart } from '../components/charts/DonutPieChart';
import { SparklineChart } from '../components/charts/SparklineChart';

export const DashboardPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [activeTimeframe, setActiveTimeframe] = useState('6 Months');
  const [stats, setStats] = useState({
    totalCustomers: 0,
    totalPurchases: 0,
    monthSales: 0,
    pointsIssued: 0,
  });
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [revenueTrendsByTimeframe, setRevenueTrendsByTimeframe] = useState({});
  const [categoryDistribution, setCategoryDistribution] = useState([]);
  const [sparklines, setSparklines] = useState(null);
  const [loadError, setLoadError] = useState('');

  const loadDashboardData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      // Aggregated server-side in one call
      const dashboard = await adminDashboardService.getDashboard();
      setStats(dashboard.stats);
      setRevenueTrendsByTimeframe(dashboard.revenueTrends);
      setCategoryDistribution(dashboard.categoryDistribution);
      setSparklines(dashboard.sparklines);
      setRecentPurchases(dashboard.recentPurchases);
    } catch (err) {
      setLoadError(err.message || 'Unable to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-7 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Store Overview</h1>
          <p className="text-xs text-stone-500 mt-0.5">Real-time store performance, invoicing activity, and customer loyalty.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/admin/purchases/new')}
            className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Record Purchase</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <span>{loadError}</span>
          <button onClick={loadDashboardData} className="font-medium underline cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* Fluid Open Metrics Strip (Seamless, un-boxed metrics with subtle dividers) */}
      <div className="bg-white rounded-xl border border-stone-200/80 divide-y sm:divide-y-0 sm:divide-x divide-stone-100 grid grid-cols-2 lg:grid-cols-4 shadow-2xs">
        {/* Total Customers */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500">Total Customers</span>
            <Users className="w-4 h-4 text-brand-600/80" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-stone-900 tabular-nums">
              {stats.totalCustomers.toLocaleString('en-IN')}
            </span>
            <SparklineChart
              data={sparklines?.customers ?? []}
              color="var(--color-brand-500)"
              width={65}
              height={22}
            />
          </div>
        </div>

        {/* Total Purchases */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500">Invoices Billed</span>
            <ShoppingBag className="w-4 h-4 text-emerald-600/80" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-stone-900 tabular-nums">
              {stats.totalPurchases.toLocaleString('en-IN')}
            </span>
            <SparklineChart
              data={sparklines?.purchases ?? []}
              color="#10B981"
              width={65}
              height={22}
            />
          </div>
        </div>

        {/* This Month's Sales */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500">Monthly Revenue</span>
            <IndianRupee className="w-4 h-4 text-amber-600/80" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-stone-900 tabular-nums">
              {stats.monthSales >= 100000
                ? `₹${(stats.monthSales / 100000).toFixed(2)}L`
                : formatINR(stats.monthSales)}
            </span>
            <SparklineChart
              data={sparklines?.sales ?? []}
              color="#F59E0B"
              width={65}
              height={22}
            />
          </div>
        </div>

        {/* Loyalty Points Issued */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-stone-500">Points Distributed</span>
            <Sparkles className="w-4 h-4 text-brand-600/80" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-semibold text-stone-900 tabular-nums">
              {stats.pointsIssued >= 100000
                ? `${(stats.pointsIssued / 100000).toFixed(2)}L`
                : stats.pointsIssued.toLocaleString('en-IN')}
            </span>
            <SparklineChart
              data={sparklines?.loyaltyPoints ?? []}
              color="var(--color-brand-500)"
              width={65}
              height={22}
            />
          </div>
        </div>
      </div>

      {/* Visual Analytics Strip (Un-boxed, clean surface) */}
      <div className="bg-white rounded-xl border border-stone-200/80 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-stone-100 shadow-2xs">
        <div className="lg:col-span-7 p-5 flex flex-col justify-between">
          <AreaLineChart
            data={revenueTrendsByTimeframe[activeTimeframe] || revenueTrendsByTimeframe['6 Months']}
            title="Revenue Trajectory"
            subtitle="Gross store sales billed across timeline"
            height={220}
            accentColor="var(--color-brand-500)"
            timeframes={['30 Days', '6 Months', '1 Year']}
            activeTimeframe={activeTimeframe}
            onTimeframeChange={(tf) => setActiveTimeframe(tf)}
          />
        </div>

        <div className="lg:col-span-5 p-5 flex flex-col justify-between">
          <DonutPieChart
            data={categoryDistribution}
            title="Category Share"
            subtitle="Product revenue breakdown by category"
            totalLabel="Total Sales"
            totalValue={formatINR(stats.totalSales ?? 0)}
            size={155}
            strokeWidth={22}
          />
        </div>
      </div>

      {/* Recent Purchases Table (Clean Enterprise Data Sheet) */}
      <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Recent Invoices</h3>
            <p className="text-xs text-stone-500 mt-0.5">Latest retail transactions recorded at the counter</p>
          </div>
          <button
            onClick={() => navigate('/admin/purchases')}
            className="text-xs font-medium text-brand-600 hover:text-brand-800 inline-flex items-center gap-1 transition-colors cursor-pointer"
          >
            <span>View all invoices</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50/60 border-b border-stone-100 text-xs font-medium text-stone-500">
                <th className="py-2.5 px-5">Customer</th>
                <th className="py-2.5 px-4">Product</th>
                <th className="py-2.5 px-4">Amount</th>
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-700">
              {recentPurchases.map((purchase) => (
                <tr key={purchase.id} className="hover:bg-stone-50/70 transition-colors">
                  <td className="py-3 px-5">
                    <span className="font-medium text-stone-900 block">{purchase.customerName || 'Customer'}</span>
                    <span className="text-xs text-stone-400 font-normal">{purchase.customerMobile}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-medium text-stone-800 truncate max-w-[220px] block">{purchase.product?.name}</span>
                    <span className="text-[11px] text-stone-400 font-mono">{purchase.invoiceNumber}</span>
                  </td>
                  <td className="py-3 px-4 font-medium text-stone-900 tabular-nums whitespace-nowrap">
                    {formatINR(purchase.amount)}
                  </td>
                  <td className="py-3 px-4 text-xs text-stone-500 whitespace-nowrap">
                    {purchase.formattedDate}
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={purchase.paymentStatus} size="sm" />
                  </td>
                  <td className="py-3 px-5 text-right whitespace-nowrap">
                    <button
                      onClick={() => navigate(`/admin/purchases/${purchase.id}`)}
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
      </div>
    </div>
  );
};

