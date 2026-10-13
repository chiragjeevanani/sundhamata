// Sundhamata Mobile - inquiries the customer sends to the store (Profile → Make an Inquiry)

import { customerApi } from './api/apiClient';

export const INQUIRY_CATEGORY_LABELS = Object.freeze({
  mobile: 'Mobile',
  accessories: 'Accessories',
  service: 'Service',
});

export const inquiryService = {
  /** { category: 'mobile' | 'accessories' | 'service', budget: number | null, message } */
  async create(inquiry) {
    const data = await customerApi.post('/customer/inquiries', inquiry);
    return data.inquiry;
  },

  /** The customer's own inquiries, newest first */
  async listMine() {
    const data = await customerApi.get('/customer/inquiries');
    return data.items;
  },
};
