// Sundhamata Mobile - Admin Loyalty Service
// Store-wide loyalty metrics, the points ledger and manual adjustments.

import { adminApi } from './api/apiClient';
import { byTimeframe, toUiTransaction } from './api/adapters';

const FILTER_DIRECTION = { earned: 'credit', redeemed: 'debit' };

export const adminLoyaltyService = {
  async getOverview() {
    const data = await adminApi.get('/admin/loyalty/summary');
    return {
      totalPointsIssued: data.totalPointsIssued,
      pointsRedeemed: data.pointsRedeemed,
      totalPointsDebited: data.totalPointsDebited,
      pointsOutstanding: data.pointsOutstanding,
      customersWithPoints: data.customersWithPoints,
      totalCustomers: data.totalCustomers,
      tierShare: data.tierDistribution.map((tier) => ({
        label: tier.label,
        value: tier.customers,
        formattedValue: `${tier.customers} cust`,
        color: tier.color,
      })),
      issuedTrend: byTimeframe(data.issuedTrend),
      recentActivity: data.recentActivity.map(toUiTransaction),
    };
  },

  /** @param {{filter?: 'all'|'earned'|'redeemed', customerId?: string, limit?: number}} params */
  async getTransactions({ filter = 'all', customerId, limit = 50 } = {}) {
    const data = await adminApi.get('/admin/loyalty/transactions', {
      direction: FILTER_DIRECTION[filter] ?? 'all',
      customerId,
      limit,
    });
    return data.items.map(toUiTransaction);
  },

  /**
   * Manual add/deduct. The server refuses deductions beyond the balance.
   * @returns {Promise<{transaction: object, newBalance: number}>}
   */
  async adjustPoints(customerId, { points, type = 'add', reason = '' }) {
    const data = await adminApi.post('/admin/loyalty/adjust', {
      customerId,
      type,
      points: Number(points),
      reason: reason.trim(),
    });
    return { transaction: toUiTransaction(data.transaction), newBalance: data.balance };
  },
};
