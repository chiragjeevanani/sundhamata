// Sundhamata Mobile - Admin Purchase Service
// Recording, editing, cancelling and listing purchases in the Store Admin Panel.

import { adminApi } from './api/apiClient';
import { toUiPurchase } from './api/adapters';
import { dateInputToTimestamp } from '../utils/purchaseDates';

const PAYMENT_STATUS_FILTER = { paid: 'Paid', pending: 'Pending', 'partially paid': 'Partially Paid', cancelled: 'Cancelled' };
const IMEI_PATTERN = /^\d{15}$/;

export const adminPurchaseService = {
  /**
   * @param {{search?: string, paymentStatus?: string, status?: string, category?: string, customerId?: string, limit?: number}} params
   */
  async getPurchases({ search = '', paymentStatus = 'all', status = 'all', category = 'all', customerId, limit = 100 } = {}) {
    const data = await adminApi.get('/admin/purchases', {
      search: search.trim() || undefined,
      paymentStatus: PAYMENT_STATUS_FILTER[paymentStatus?.toLowerCase()] ?? 'all',
      status,
      category,
      customerId,
      limit,
    });
    return data.items.map(toUiPurchase);
  },

  async getRecentPurchases(limit = 5) {
    const data = await adminApi.get('/admin/purchases', { limit, sort: '-createdAt' });
    return data.items.map(toUiPurchase);
  },

  async getPurchaseById(id) {
    const data = await adminApi.get(`/admin/purchases/${encodeURIComponent(id)}`);
    return toUiPurchase(data.purchase);
  },

  /**
   * Records a sale. Loyalty points are calculated by the server — any client
   * estimate is display-only and never sent.
   */
  async createPurchase({ customerId, invoiceNumber, product, purchaseDate, warranty, paymentMethod, paymentStatus = 'Paid', pricing, notes }) {
    const identifier = (product.imei || '').replace(/[\s-]/g, '');
    const data = await adminApi.post('/admin/purchases', {
      customerId,
      invoiceNumber: invoiceNumber.trim(),
      category: product.category || 'phones',
      product: {
        name: product.name,
        ...(identifier && IMEI_PATTERN.test(identifier) ? { imei: identifier } : {}),
        ...(identifier && !IMEI_PATTERN.test(identifier) ? { serialNumber: identifier } : {}),
      },
      purchaseDate: dateInputToTimestamp(purchaseDate),
      ...(warranty ? { warranty: { duration: Number(warranty.duration), unit: warranty.unit } } : {}),
      payment: { method: paymentMethod, status: paymentStatus },
      pricing: { purchaseAmount: pricing.purchaseAmount, discount: pricing.discount || 0 },
      ...(notes ? { notes } : {}),
    });
    return { ...toUiPurchase(data.purchase), customerLoyaltyBalance: data.customerLoyaltyBalance };
  },

  /**
   * Editable: invoice number, purchase date, warranty, payment status/method and notes.
   * Pricing is immutable once billed. The server recomputes the warranty expiry.
   */
  async updatePurchase(id, { invoiceNumber, purchaseDate, warranty, paymentStatus, paymentMethod, notes }) {
    const data = await adminApi.patch(`/admin/purchases/${encodeURIComponent(id)}`, {
      ...(invoiceNumber !== undefined ? { invoiceNumber: invoiceNumber.trim() } : {}),
      ...(purchaseDate ? { purchaseDate: dateInputToTimestamp(purchaseDate) } : {}),
      ...(warranty ? { warranty: { duration: Number(warranty.duration), unit: warranty.unit } } : {}),
      payment: { status: paymentStatus, method: paymentMethod },
      notes: notes ?? null,
    });
    return toUiPurchase(data.purchase);
  },

  /** Attach or replace the bill (PDF / image / Word / Excel) of a purchase */
  async uploadBill(id, file) {
    const data = await adminApi.upload(`/admin/purchases/${encodeURIComponent(id)}/bill`, file, { filename: file.name });
    return toUiPurchase(data.purchase);
  },

  async removeBill(id) {
    const data = await adminApi.delete(`/admin/purchases/${encodeURIComponent(id)}/bill`);
    return toUiPurchase(data.purchase);
  },

  /** @returns {Promise<Blob>} the bill file */
  downloadBill(id) {
    return adminApi.download(`/admin/purchases/${encodeURIComponent(id)}/bill`);
  },

  /** Cancels (never deletes) the purchase; the server reverses its loyalty points. */
  async cancelPurchase(id, reason) {
    const data = await adminApi.post(`/admin/purchases/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
    return { ...toUiPurchase(data.purchase), reversal: data.loyalty };
  },
};
