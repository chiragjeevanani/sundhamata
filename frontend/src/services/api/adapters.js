// Sundhamata Mobile - API → UI adapters
// Keeps the existing screens' data shapes while the API stays canonical.

import { formatDate, formatPhone } from '../../utils/formatters';
import { API_BASE_URL } from './apiClient';

export const toNationalMobile = (mobile) => (mobile || '').replace(/^\+91/, '');

export const toUiCustomer = (customer) => {
  if (!customer) return null;
  const national = toNationalMobile(customer.mobile);
  return {
    ...customer,
    mobile: national,
    rawPhone: national,
    phone: formatPhone(customer.mobile),
    loyaltyTier: customer.loyaltyTier?.label ?? 'Bronze Member',
    memberSince: formatDate(customer.memberSince),
    status: customer.isActive === false ? 'Inactive' : 'Active',
    totalPurchases: customer.stats?.totalPurchases ?? 0,
    totalSpent: customer.stats?.totalSpent ?? 0,
    lastPurchaseDate: customer.stats?.lastPurchaseDate ? formatDate(customer.stats.lastPurchaseDate) : 'None',
  };
};

export const toUiPurchase = (purchase) => {
  if (!purchase) return null;
  const isCancelled = purchase.status === 'Cancelled';
  return {
    ...purchase,
    amount: purchase.pricing.finalAmount,
    taxAmount: purchase.pricing.taxAmount,
    baseAmount: purchase.pricing.baseAmount,
    formattedDate: formatDate(purchase.purchaseDate),
    paymentMethod: purchase.payment.method,
    paymentStatus: isCancelled ? 'Cancelled' : purchase.payment.status,
    product: {
      ...purchase.product,
      imei1: purchase.product.imei,
      modelNumber: purchase.product.model,
      // Product photo uploaded by the store (public link with a random key), else null
      imageUrl: purchase.productImage ? `${API_BASE_URL}${purchase.productImage.path}` : null,
    },
    warranty: purchase.warranty
      ? { ...purchase.warranty, validUntil: formatDate(purchase.warranty.validUntil), validUntilDate: purchase.warranty.validUntil }
      : null,
    store: { salesExecutive: purchase.billedBy },
    customerName: purchase.customer?.name,
    customerMobile: purchase.customer ? formatPhone(purchase.customer.mobile) : undefined,
    customerCode: purchase.customer?.customerCode,
  };
};

export const toUiTransaction = (txn) => ({
  ...txn,
  // The ledger stores signed points; screens show a magnitude with a +/- sign.
  signedPoints: txn.points,
  points: Math.abs(txn.points),
  isCredit: txn.direction === 'credit',
  date: txn.createdAt,
  formattedDate: formatDate(txn.createdAt),
  customerId: txn.customer?.id ?? txn.customerId,
  customerName: txn.customer?.name,
  customerCode: txn.customer?.customerCode,
});

export const toUiStore = (store) => ({
  ...store,
  name: store.storeName,
  phone: store.contactNumber,
  supportPhone: store.supportNumber,
  whatsapp: store.whatsappNumber || store.contactNumber,
  hours: store.workingHours,
});

// UI timeframe labels ↔ API range keys
export const TIMEFRAME_KEYS = { '30 Days': '30d', '6 Months': '6m', '1 Year': '1y' };

export const byTimeframe = (series = {}) =>
  Object.fromEntries(
    Object.entries(TIMEFRAME_KEYS).map(([label, key]) => [
      label,
      (series[key] || []).map((point) => ({ label: point.label, value: point.value })),
    ])
  );
