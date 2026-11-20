// Sundhamata Mobile - Customer Profile & Store Service

import { customerApi, publicApi } from './api/apiClient';
import { customerSession } from './api/session';
import { toUiCustomer, toUiStore } from './api/adapters';

let storeInfoRequest = null;

export const userService = {
  /** GET /customer/me */
  async getProfile() {
    const data = await customerApi.get('/customer/me');
    return toUiCustomer(data.customer);
  },

  /**
   * Public store information (name, contact, address, loyalty rules).
   * Cached for the page lifetime; a failed request is retried next time.
   */
  getStoreInfo() {
    storeInfoRequest ??= publicApi
      .get('/store')
      .then((data) => toUiStore(data.store))
      .catch((err) => {
        storeInfoRequest = null;
        throw err;
      });
    return storeInfoRequest;
  },

  /** Drops the cached store details (e.g. after an admin changes the settings) */
  invalidateStoreInfo() {
    storeInfoRequest = null;
  },

  /** Profile photo (already resized on the device, see utils/photo.js) */
  async uploadPhoto(blob) {
    const data = await customerApi.upload('/customer/me/photo', blob);
    const user = toUiCustomer(data.customer);
    customerSession.update({ user });
    return user;
  },

  async removePhoto() {
    const data = await customerApi.delete('/customer/me/photo');
    const user = toUiCustomer(data.customer);
    customerSession.update({ user });
    return user;
  },

  /** Address auto-fill: 6-digit pincode → { pincode, city, state, areas[] } (404 when unknown) */
  lookupPincode(pincode) {
    return customerApi.get(`/customer/address/pincode/${encodeURIComponent(pincode)}`);
  },

  /** Address auto-fill: GPS position → { address, city, state, pincode } (any may be null) */
  addressFromLocation(lat, lng) {
    return customerApi.get('/customer/address/reverse', { lat, lng });
  },

  /** PATCH /customer/me — name, email, dob, gender, anniversaryDate, address, city, pincode, interest, budget */
  async updateProfile(updates) {
    const data = await customerApi.patch('/customer/me', updates);
    const user = toUiCustomer(data.customer);
    customerSession.update({ user });
    return user;
  },
};
