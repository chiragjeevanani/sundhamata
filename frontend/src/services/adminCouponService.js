// Sundhamata Mobile - coupons in the admin panel (redeemed with `couponCode` when recording a purchase)

import { adminApi } from './api/apiClient';
import { toUiCustomer } from './api/adapters';

export const adminCouponService = {
  /**
   * Looks up a typed or scanned code before billing.
   * @returns {Promise<{ coupon, customer, usable: boolean, reason: string|null }>}
   */
  async lookup(code) {
    const data = await adminApi.get(`/admin/coupons/${encodeURIComponent(code.trim())}`);
    return { ...data, customer: toUiCustomer(data.customer) };
  },

  async listForCustomer(customerId) {
    const data = await adminApi.get(`/admin/customers/${encodeURIComponent(customerId)}/coupons`);
    return data.items;
  },
};
