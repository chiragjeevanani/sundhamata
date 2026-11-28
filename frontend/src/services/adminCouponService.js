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

  /**
   * Scan Coupon: uses up the customer's own coupon (code in their QR) without a bill.
   * amount: what the customer is buying (of the products it is for); the server checks the
   * coupon's conditions against it and returns the discount in `coupon.counterSale`.
   */
  async redeem(code, amount) {
    const data = await adminApi.post(`/admin/coupons/${encodeURIComponent(code.trim())}/redeem`, { amount });
    return { ...data, customer: toUiCustomer(data.customer) };
  },

  /** Gives back a coupon used by scanning (within a day) */
  async undoRedeem(couponId) {
    const data = await adminApi.post(`/admin/coupons/by-id/${encodeURIComponent(couponId)}/undo-redeem`);
    return { ...data, customer: toUiCustomer(data.customer) };
  },

  async listForCustomer(customerId) {
    const data = await adminApi.get(`/admin/customers/${encodeURIComponent(customerId)}/coupons`);
    return data.items;
  },
};
