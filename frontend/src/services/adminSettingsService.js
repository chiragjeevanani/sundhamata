// Sundhamata Mobile - Store Admin Settings Service

import { adminApi } from './api/apiClient';

const toUiSettings = (s) => ({
  storeName: s.storeName,
  tagline: s.tagline,
  legalName: s.legalName,
  gstin: s.gstin,
  address: s.address,
  city: s.city,
  state: s.state,
  pincode: s.pincode,
  phone: s.contactNumber,
  supportPhone: s.supportNumber,
  email: s.email,
  workingHours: s.workingHours,
  loyalty: {
    pointsPerHundred: s.loyalty.pointsPerHundredRupees,
    rupeeValuePerPoint: s.loyalty.rupeeValuePerPoint,
    minRedeemPoints: s.loyalty.minRedeemPoints,
    expiryMonths: s.loyalty.expiryMonths,
  },
});

export const adminSettingsService = {
  async getSettings() {
    const data = await adminApi.get('/admin/settings');
    return toUiSettings(data.settings);
  },

  async updateSettings(updates) {
    const { phone, loyalty, ...rest } = updates;
    const body = { ...rest };
    if (phone !== undefined) body.contactNumber = phone;
    if (loyalty) {
      body.loyalty = {};
      if (loyalty.pointsPerHundred !== undefined) body.loyalty.pointsPerHundredRupees = loyalty.pointsPerHundred;
      if (loyalty.rupeeValuePerPoint !== undefined) body.loyalty.rupeeValuePerPoint = loyalty.rupeeValuePerPoint;
    }
    const data = await adminApi.patch('/admin/settings', body);
    return toUiSettings(data.settings);
  },

  /**
   * PREVIEW ONLY (e.g. "Points to credit" while filling the form). Mirrors the
   * server rule; the server recalculates and is authoritative when recording.
   */
  calculatePoints(amount, settings = null) {
    if (!amount || isNaN(amount) || amount <= 0) return 0;
    const rate = settings?.loyalty?.pointsPerHundred ?? 1;
    return Math.floor((Math.round(amount * 100) * Math.round(rate * 100)) / 1_000_000);
  },
};
