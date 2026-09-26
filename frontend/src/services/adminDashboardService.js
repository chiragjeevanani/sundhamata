// Sundhamata Mobile - Admin Dashboard & Reports Service
// All aggregation happens on the server; this only shapes data for the charts.

import { adminApi } from './api/apiClient';
import { byTimeframe, toUiPurchase } from './api/adapters';

const CATEGORY_COLORS = { phones: 'var(--color-brand-600)', accessories: 'var(--color-brand-400)', service: '#10B981' };
const BRAND_COLORS = {
  Samsung: 'var(--color-brand-600)',
  Apple: '#1C1917',
  OnePlus: '#78716C',
  Xiaomi: '#10B981',
  Realme: '#10B981',
  Vivo: '#8B5CF6',
  Oppo: '#8B5CF6',
  Google: '#EA4335',
};

const compactINR = (value) => {
  if (value >= 100000) return `₹${(value / 100000).toFixed(value >= 1000000 ? 1 : 2)}L`;
  if (value >= 1000) return `₹${Math.round(value / 1000)}K`;
  return `₹${Math.round(value)}`;
};

const toShare = (rows, colors) =>
  rows.map((row) => ({
    label: row.label,
    value: row.value,
    formattedValue: compactINR(row.value),
    color: colors[row.key] ?? '#78716C',
  }));

export const adminDashboardService = {
  async getDashboard() {
    const d = await adminApi.get('/admin/dashboard');
    return {
      stats: {
        totalCustomers: d.customers.total,
        totalPurchases: d.purchases.total,
        monthSales: d.sales.thisMonth,
        totalSales: d.sales.total,
        pointsIssued: d.loyaltyPointsIssued.total,
      },
      revenueTrends: byTimeframe(d.revenueTrend),
      categoryDistribution: toShare(d.categoryDistribution, CATEGORY_COLORS),
      sparklines: d.sparklines,
      recentPurchases: d.recentPurchases.map(toUiPurchase),
      recentActivity: d.recentActivity,
    };
  },

  async getReportSummary() {
    const r = await adminApi.get('/admin/reports/summary');
    const topHours = [...r.hourlySales].sort((a, b) => b.value - a.value).slice(0, 2).filter((h) => h.value > 0);
    return {
      totals: r.totals,
      revenueTrends: byTimeframe(r.revenueTrend),
      brandShare: toShare(r.brandShare, BRAND_COLORS),
      categoryShare: toShare(r.categoryShare, CATEGORY_COLORS),
      paymentMethodShare: r.paymentMethodShare,
      hourlySales: r.hourlySales.map((h) => ({ label: h.label, value: h.value, highlight: topHours.includes(h) })),
    };
  },
};
