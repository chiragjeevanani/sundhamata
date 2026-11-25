// Sundhamata Mobile - Home screen banners (Admin → Banners)

import { API_BASE_URL, adminApi, publicApi } from './api/apiClient';

export const BANNER_PLACEMENTS = Object.freeze({
  top: { label: 'Top carousel', hint: 'Under “Hello, name”', size: '1200 × 430' },
  middle: { label: 'Middle banner', hint: 'Under “Looking for something?”', size: '1200 × 350' },
});

/** Full URL of an image path from the API ("/banners/images/<key>") */
export const bannerImageUrl = (path) => (path ? `${API_BASE_URL}${path}` : null);

export const bannerService = {
  /** Banners showing now: [{ id, placement, title, link, imagePath, width, height }] */
  async getLive() {
    const data = await publicApi.get('/banners');
    return data.banners;
  },
};

const sizeQuery = (size) => (size ? { width: size.width, height: size.height } : {});

export const adminBannerService = {
  async list() {
    const data = await adminApi.get('/admin/banners');
    return data.banners;
  },

  /**
   * @param {Blob} blob image, already scaled down in the browser
   * @param {{ width, height }} size of the image
   * @param {{ placement, title?, link?, active?, startsAt?, endsAt? }} fields
   */
  async create(blob, size, fields) {
    const query = { ...sizeQuery(size) };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== null && value !== undefined && value !== '') query[key] = String(value);
    }
    const data = await adminApi.upload('/admin/banners', blob, query);
    return data.banner;
  },

  /** { placement?, title?, link?, active?, startsAt?, endsAt? } (null clears) */
  async update(id, patch) {
    const data = await adminApi.patch(`/admin/banners/${id}`, patch);
    return data.banner;
  },

  async replaceImage(id, blob, size) {
    const data = await adminApi.upload(`/admin/banners/${id}/image`, blob, sizeQuery(size));
    return data.banner;
  },

  async remove(id) {
    await adminApi.delete(`/admin/banners/${id}`);
  },

  /** ids first to last; returns every banner */
  async reorder(placement, ids) {
    const data = await adminApi.post('/admin/banners/reorder', { placement, ids });
    return data.banners;
  },
};
