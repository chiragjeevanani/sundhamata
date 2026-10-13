// Sundhamata Mobile - inquiries sent by customers from the app (Admin → Inquiries)

import { adminApi } from './api/apiClient';

export const adminInquiryService = {
  /** { items, pagination, counts: { new, contacted, closed } } */
  list({ search = '', status = 'all', category = 'all', page = 1, limit = 50 } = {}) {
    return adminApi.get('/admin/inquiries', { search: search.trim() || undefined, status, category, page, limit });
  },

  async update(id, patch) {
    const data = await adminApi.patch(`/admin/inquiries/${encodeURIComponent(id)}`, patch);
    return data.inquiry;
  },

  remove(id) {
    return adminApi.delete(`/admin/inquiries/${encodeURIComponent(id)}`);
  },
};
