// Sundhamata Mobile - Terms & Conditions and Privacy Policy text (Admin → Terms & Privacy)

import { adminApi, publicApi } from './api/apiClient';

export const legalService = {
  /** Public: { key, content (null = built-in default text), updatedAt } */
  async get(key) {
    const data = await publicApi.get(`/legal/${key}`);
    return data.document;
  },
};

export const adminLegalService = {
  /** [{ key: 'terms' | 'privacy', content, updatedAt }] */
  async list() {
    const data = await adminApi.get('/admin/legal');
    return data.documents;
  },

  /** content null = go back to the built-in default text */
  async save(key, content) {
    const data = await adminApi.patch(`/admin/legal/${key}`, { content });
    return data.document;
  },
};
