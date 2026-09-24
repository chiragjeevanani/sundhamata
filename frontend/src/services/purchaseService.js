// Sundhamata Mobile - Customer Purchase Service
// The API scopes every request to the signed-in customer.

import { customerApi } from './api/apiClient';
import { toUiPurchase } from './api/adapters';

const listPurchases = async ({ search = '', category = 'all', limit = 50 } = {}) => {
  const data = await customerApi.get('/customer/purchases', {
    search: search.trim() || undefined,
    category,
    limit,
  });
  return { items: data.items.map(toUiPurchase), total: data.pagination.total };
};

export const purchaseService = {
  /** @param {{search?: string, category?: string}} params */
  async getPurchases(params = {}) {
    return (await listPurchases(params)).items;
  },

  async getRecentPurchases(limit = 5) {
    return (await listPurchases({ limit })).items;
  },

  async getPurchaseById(id) {
    const data = await customerApi.get(`/customer/purchases/${encodeURIComponent(id)}`);
    return toUiPurchase(data.purchase);
  },

  /** Count and latest purchase for the customer home screen */
  async getPurchaseSummary() {
    const { items, total } = await listPurchases({ limit: 1 });
    return { totalPurchases: total, latestPurchase: items[0] ?? null };
  },
};
