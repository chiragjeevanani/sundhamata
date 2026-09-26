import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Download,
  IndianRupee,
  ShoppingBag,
  Users,
  Sparkles,
  Printer,
} from 'lucide-react';
import { adminDashboardService } from '../../../services/adminDashboardService';
import { formatINR } from '../../../utils/formatters';
import { AreaLineChart } from '../components/charts/AreaLineChart';
import { DonutPieChart } from '../components/charts/DonutPieChart';
import { BarChartGroup } from '../components/charts/BarChartGroup';
import { DashboardSkeleton } from '../components/SkeletonLoaders';

export const ReportsPage = () => {
  const [loading, setLoading] = useState(true);
  const [activeRange, setActiveRange] = useState('6 Months');
  const [data, setData] = useState({
    totalSales: 0,
    totalOrders: 0,
    totalCustomers: 0,
    pointsIssued: 0,
  });
  const [revenueTrends, setRevenueTrends] = useState({});
  const [brandMarketShare, setBrandMarketShare] = useState([]);
  const [hourlyFootfall, setHourlyFootfall] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        // All aggregation happens on the server
        const report = await adminDashboardService.getReportSummary();
        setData({
          totalSales: report.totals.totalSales,
          totalOrders: report.totals.totalOrders,
          totalCustomers: report.totals.totalCustomers,
          pointsIssued: report.totals.pointsIssued,
        });
        setRevenueTrends(report.revenueTrends);
        setBrandMarketShare(report.brandShare);
        setHourlyFootfall(report.hourlySales);
      } catch (err) {
        setLoadError(err.message || 'Unable to load reports.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-7 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">Reports & Analytics</h1>
          <p className="text-xs text-slate-500 mt-0.5">Revenue velocity, OEM brand market share, and hourly peak volume.</p>
        </div>

        <button
          onClick={() => alert('Exporting store sales report as CSV...')}
          className="py-2 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shadow-2xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {loadError && (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">{loadError}</div>
      )}

      {/* Fluid Open Metrics Strip */}
      <div className="bg-white rounded-xl border border-slate-200/80 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 grid grid-cols-2 lg:grid-cols-4 shadow-2xs">
        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Gross Revenue</span>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {formatINR(data.totalSales)}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Invoices Billed</span>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {data.totalOrders.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Customer Base</span>
          <div className="text-2xl font-semibold text-slate-900 tabular-nums mt-1">
            {data.totalCustomers.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <span className="text-xs font-medium text-slate-500">Points Distributed</span>
          <div className="text-2xl font-semibold text-brand-700 tabular-nums mt-1">
            {data.pointsIssued >= 100000
              ? `${(data.pointsIssued / 100000).toFixed(2)}L`
              : data.pointsIssued.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Visual Analytics Strip (Un-boxed, clean surface) */}
      <div className="bg-white rounded-xl border border-slate-200/80 grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-100 shadow-2xs">
        <div className="lg:col-span-7 p-5 flex flex-col justify-between">
          <AreaLineChart
            data={revenueTrends[activeRange] ?? []}
            title="Monthly Sales Velocity"
            subtitle="Store sales performance over time"
            height={220}
            accentColor="#D77F3F"
            timeframes={['30 Days', '6 Months', '1 Year']}
            activeTimeframe={activeRange}
            onTimeframeChange={(tf) => setActiveRange(tf)}
          />
        </div>

        <div className="lg:col-span-5 p-5 flex flex-col justify-between">
          <DonutPieChart
            data={brandMarketShare}
            title="Brand Market Share"
            subtitle="Revenue contribution by OEM"
            totalLabel="Total Sales"
            totalValue={formatINR(data.totalSales)}
            size={155}
            strokeWidth={22}
          />
        </div>
      </div>

      {/* Hourly Sales Bar Chart */}
      <div className="bg-white rounded-xl p-5 border border-slate-200/80 shadow-2xs">
        <BarChartGroup
          data={hourlyFootfall}
          title="Hourly Sales Volume"
          subtitle="Sales billing by time of day across retail hours"
          height={180}
          isCurrency={true}
        />
      </div>
    </div>
  );
};

