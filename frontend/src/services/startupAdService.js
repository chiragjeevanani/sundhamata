// Sundhamata Mobile - advertisement poster shown when the customer app opens (Admin → Advertisement)

import { API_BASE_URL, adminApi, publicApi } from './api/apiClient';

/** Full URL of a poster path from the API ("/startup-ad/posters/<key>") */
export const posterUrl = (path) => (path ? `${API_BASE_URL}${path}` : null);

export const startupAdService = {
  /** Customer app: { id, posterPath, skipAfterSeconds, autoCloseSeconds } or null when nothing is live */
  async getLive() {
    const data = await publicApi.get('/startup-ad');
    return data.ad;
  },
};

export const adminStartupAdService = {
  /** { enabled, skipAfterSeconds, autoCloseSeconds, poster: { path, size, uploadedAt } | null, live } */
  async get() {
    const data = await adminApi.get('/admin/startup-ad');
    return data.ad;
  },

  /** { enabled?, skipAfterSeconds?, autoCloseSeconds? (null = until skipped) } */
  async update(patch) {
    const data = await adminApi.patch('/admin/startup-ad', patch);
    return data.ad;
  },

  /** Poster image (already scaled down in the browser) */
  async uploadPoster(blob) {
    const data = await adminApi.upload('/admin/startup-ad/poster', blob);
    return data.ad;
  },

  async removePoster() {
    const data = await adminApi.delete('/admin/startup-ad/poster');
    return data.ad;
  },
};
