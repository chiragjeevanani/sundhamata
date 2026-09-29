// Sundhamata Mobile - new-customer offer & coupons (customer app)

import { customerApi } from './api/apiClient';

export { describeDiscount, describeOffer } from '../utils/coupons';

export const offerService = {
  /**
   * { status: 'unavailable' | 'complete_profile' | 'ready' | 'claimed', offer, missingFields, coupon }
   */
  getWelcomeOffer() {
    return customerApi.get('/customer/offers/welcome');
  },

  /** Issues the coupon once the profile is complete (claiming again returns the same one). */
  async claimWelcomeCoupon() {
    const data = await customerApi.post('/customer/offers/welcome/claim');
    return data.coupon;
  },

  async listCoupons() {
    const data = await customerApi.get('/customer/coupons');
    return data.items;
  },
};
