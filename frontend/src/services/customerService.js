// Sundhamata Mobile - Admin Customer Service
// Customer search, profile retrieval, registration and updates for the Store Admin Panel.

import { adminApi } from './api/apiClient';
import { toUiCustomer } from './api/adapters';

export const customerService = {
  /**
   * @param {{search?: string, status?: 'all'|'active'|'inactive', limit?: number, sort?: string}} params
   * @returns {Promise<Array>}
   */
  async getCustomers({ search = '', status = 'all', limit = 100, sort = '-createdAt' } = {}) {
    const data = await adminApi.get('/admin/customers', {
      search: search.trim() || undefined,
      status,
      limit,
      sort,
    });
    return data.items.map(toUiCustomer);
  },

  /** Quick search by name, mobile or email (customer pickers, global search) */
  async searchCustomers(query) {
    if (!query || !query.trim()) return [];
    const data = await adminApi.get('/admin/customers', { search: query.trim(), limit: 8 });
    return data.items.map(toUiCustomer);
  },

  async getCustomerById(id) {
    const data = await adminApi.get(`/admin/customers/${encodeURIComponent(id)}`);
    return toUiCustomer(data.customer);
  },

  /** @param {{name: string, mobile: string, interest: string, budget?: number, email?: string}} data */
  async createCustomer({ name, mobile, interest, budget, email }) {
    const data = await adminApi.post('/admin/customers', {
      name,
      mobile,
      interest,
      ...(budget !== undefined && budget !== '' ? { budget } : {}),
      ...(email ? { email } : {}),
    });
    return toUiCustomer(data.customer);
  },

  async updateCustomer(id, updates) {
    const data = await adminApi.patch(`/admin/customers/${encodeURIComponent(id)}`, updates);
    return toUiCustomer(data.customer);
  },
};
