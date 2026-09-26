// Sundhamata Mobile - Customer Authentication Service
// Mobile number + OTP against the Sundhamata API. Session storage is centralized in api/session.js.

import { customerApi, publicApi } from './api/apiClient';
import { customerSession } from './api/session';
import { toUiCustomer } from './api/adapters';

export const authService = {
  /**
   * Check if a mobile number belongs to an existing registered customer
   * @param {string} mobile
   * @returns {Promise<{isRegistered: boolean, mobile: string}>}
   */
  async checkCustomer(mobile) {
    const data = await publicApi.post('/auth/customer/check', { mobile });
    return { isRegistered: data.exists, mobile };
  },

  /** Send a login OTP to an existing customer */
  sendOtp(mobile) {
    return publicApi.post('/auth/customer/send-otp', { mobile });
  },

  /** Resend the OTP for the in-progress login or registration */
  resendOtp(mobile) {
    return publicApi.post('/auth/customer/resend-otp', { mobile });
  },

  /**
   * Start registration of a new customer. The account is created only after OTP verification.
   * @param {{name: string, mobile: string, interest: string, budget?: number|null}} data
   */
  registerCustomer({ name, mobile, interest, budget }) {
    return publicApi.post('/auth/customer/register', { name, mobile, interest, budget: budget ?? null });
  },

  /**
   * Verify OTP and establish the authenticated session
   * @returns {Promise<{token: string, user: object, isNewUser: boolean, expiresAt: number}>}
   */
  async verifyOtp(mobile, otp) {
    const data = await publicApi.post('/auth/customer/verify-otp', { mobile, otp });
    const session = {
      token: data.token,
      expiresAt: Date.parse(data.expiresAt),
      user: toUiCustomer(data.customer),
      isNewUser: data.isNewUser,
      // First sign-in to an account the store created while billing: ask them to confirm their details
      needsProfileReview: Boolean(data.needsProfileReview),
    };
    customerSession.set(session);
    return session;
  },

  getCurrentSession() {
    return customerSession.get();
  },

  getCurrentUser() {
    return customerSession.get()?.user ?? null;
  },

  /** Reload the profile (e.g. latest loyalty balance) and keep the stored session in sync */
  async refreshCurrentUser() {
    const data = await customerApi.get('/customer/me');
    const user = toUiCustomer(data.customer);
    customerSession.update({ user });
    return user;
  },

  /** JWTs are stateless — signing out discards the token on this device. */
  async logout(reason = 'logout') {
    customerSession.clear(reason);
  },

  /** Subscribe to session end (logout, expiry or a 401 from the API) */
  onSessionEnded(listener) {
    return customerSession.onClear(listener);
  },
};
