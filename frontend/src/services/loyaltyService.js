// Sundhamata Mobile - Customer Loyalty Service
// Balances and the points ledger come from the API; the server is the only authority on points.

import { LOYALTY_EARNING_METHODS, LOYALTY_PROGRAM_STEPS } from '../data/loyaltyData';
import { customerApi } from './api/apiClient';
import { toUiTransaction } from './api/adapters';
import { userService } from './userService';

// UI filter tabs → ledger direction
const FILTER_DIRECTION = { earned: 'credit', redeemed: 'debit' };

export const loyaltyService = {
  async getSummary() {
    const data = await customerApi.get('/customer/loyalty/summary');
    return {
      currentBalance: data.balance,
      estimatedValue: data.estimatedValue,
      earnedThisMonth: data.thisMonth.earned,
      redeemedThisMonth: data.thisMonth.redeemed,
      netThisMonth: data.thisMonth.net,
      lifetimeEarned: data.lifetime.earned,
      lifetimeRedeemed: data.lifetime.redeemed,
      customerTier: data.tier.label,
      rupeeValuePerPoint: data.rupeeValuePerPoint,
      pointsPerHundredRupees: data.pointsPerHundredRupees,
    };
  },

  /** @param {{filter?: 'all'|'earned'|'redeemed'}} params */
  async getTransactions({ filter = 'all' } = {}) {
    const data = await customerApi.get('/customer/loyalty/transactions', {
      direction: FILTER_DIRECTION[filter] ?? 'all',
      limit: 50,
    });
    return data.items.map(toUiTransaction);
  },

  /** Static program content combined with the store's configured rules */
  async getProgramInfo() {
    const store = await userService.getStoreInfo().catch(() => null);
    const loyalty = store?.loyalty;
    const earnRate = loyalty ? `${loyalty.pointsPerHundredRupees} point${loyalty.pointsPerHundredRupees === 1 ? '' : 's'} per ₹100 spent` : null;
    const validity = loyalty?.expiryMonths ? `valid for ${loyalty.expiryMonths} months` : null;
    return {
      earningMethods: LOYALTY_EARNING_METHODS,
      programSteps: LOYALTY_PROGRAM_STEPS,
      termsDisclaimer: [
        earnRate && `Earn ${earnRate}.`,
        `Points are non-transferable${validity ? `, ${validity},` : ''} and can be redeemed on accessories, service charges, and phone upgrades at Sundhamata Mobile.`,
      ]
        .filter(Boolean)
        .join(' '),
    };
  },
};
