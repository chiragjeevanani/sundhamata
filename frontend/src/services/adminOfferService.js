// Sundhamata Mobile - offers (coupon campaigns) created by the staff on Admin → Coupons

import { adminApi } from './api/apiClient';

export const adminOfferService = {
  /** All offers, newest first, each with `status` and `stats: { used, customers }` */
  async list() {
    const data = await adminApi.get('/admin/offers');
    return data.items;
  },

  async create(offer) {
    const data = await adminApi.post('/admin/offers', offer);
    return data.offer;
  },

  async update(id, patch) {
    const data = await adminApi.patch(`/admin/offers/${encodeURIComponent(id)}`, patch);
    return data.offer;
  },

  remove(id) {
    return adminApi.delete(`/admin/offers/${encodeURIComponent(id)}`);
  },
};
