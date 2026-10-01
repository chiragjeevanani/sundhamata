// Sundhamata Mobile - coupons in the admin panel (redeemed with `couponCode` when recording a purchase)

import { adminApi } from './api/apiClient';
import { toUiCustomer } from './api/adapters';

export const adminCouponService = {
  /**
   * Looks up a typed code (personal SM-… code or a voucher code like WELCOME6D) or a scanned QR.
   * @returns {Promise<{ coupon, customer, usable: boolean, reason: string|null }>}
   */
  async lookup(code, customerId) {
    // A voucher code like WELCOME6D is checked against the selected customer
    const data = await adminApi.get(`/admin/coupons/${encodeURIComponent(code.trim())}`, customerId ? { customerId } : undefined);
    return { ...data, customer: toUiCustomer(data.customer) };
  },

  async listForCustomer(customerId) {
    const data = await adminApi.get(`/admin/customers/${encodeURIComponent(customerId)}/coupons`);
    return data.items;
  },
};
