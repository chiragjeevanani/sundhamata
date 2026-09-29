// Sundhamata Mobile - product catalog (learned from recorded purchases, editable on the Products page)

import { adminApi } from './api/apiClient';

export const adminProductService = {
  /** Products, most sold first. Used for Record Purchase suggestions and the Products page. */
  async list({ search = '', category = 'all', page = 1, limit = 50 } = {}) {
    return adminApi.get('/admin/products', { search: search.trim() || undefined, category, page, limit });
  },

  async search(query, limit = 8) {
    const data = await this.list({ search: query, limit });
    return data.items;
  },

  async create(product) {
    const data = await adminApi.post('/admin/products', product);
    return data.product;
  },

  async update(id, patch) {
    const data = await adminApi.patch(`/admin/products/${encodeURIComponent(id)}`, patch);
    return data.product;
  },

  remove(id) {
    return adminApi.delete(`/admin/products/${encodeURIComponent(id)}`);
  },
};
