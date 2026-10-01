// Sundhamata Mobile - new-customer offer & coupons (customer app)

import { customerApi } from './api/apiClient';

export { describeDiscount, describeMinimum } from '../utils/coupons';

export const offerService = {
  /**
   * Welcome vouchers: { status: 'unavailable' | 'ready' | 'claimed', vouchers: [{ key, title, description,
   * campaignCode, discount, minBillAmount, appliesTo, validityDays, status: 'ready' | 'claimed', coupon }] }
   */
  getWelcomeOffer() {
    return customerApi.get('/customer/offers/welcome');
  },

  /** Claims one welcome voucher ("glass" or "accessories"); claiming again returns the same one. */
  async claimVoucher(key) {
    const data = await customerApi.post(`/customer/offers/welcome/${encodeURIComponent(key)}/claim`);
    return data.coupon;
  },

  async listCoupons() {
    const data = await customerApi.get('/customer/coupons');
    return data.items;
  },
};
