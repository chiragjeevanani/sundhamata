// Explicit allow-list serializers: only fields listed here ever leave the API.
import { ROLE_LABELS } from '../config/permissions.js';
import { getLoyaltyTier, pointsToRupees } from './loyalty.js';

/** Date → "YYYY-MM-DD" (calendar dates are stored at 00:00 UTC) */
const toDateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const idOf = (value) => (value?._id ?? value)?.toString() ?? null;
const isPopulated = (value) => Boolean(value && typeof value === 'object' && value.name !== undefined);

const tierOf = (points) => {
  const tier = getLoyaltyTier(points);
  return { key: tier.key, label: tier.label };
};

export const serializeCustomer = (c) => ({
  id: idOf(c),
  customerCode: c.customerCode,
  name: c.name,
  mobile: c.mobile,
  interest: c.interest,
  budget: c.budget ?? null,
  email: c.email ?? null,
  address: c.address ?? null,
  city: c.city ?? null,
  pincode: c.pincode ?? null,
  profileImage: c.profileImage ?? null,
  dob: toDateOnly(c.dob),
  anniversaryDate: toDateOnly(c.anniversaryDate),
  gender: c.gender ?? null,
  loyaltyPoints: c.loyaltyPoints,
  loyaltyTier: tierOf(c.loyaltyPoints),
  memberSince: c.createdAt,
  isActive: c.isActive,
});

export const serializeAdminCustomer = (c, stats = {}) => ({
  ...serializeCustomer(c),
  mobileVerified: Boolean(c.mobileVerifiedAt),
  lastLoginAt: c.lastLoginAt ?? null,
  registrationSource: c.registrationSource,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  stats: {
    totalPurchases: stats.totalPurchases ?? 0,
    totalSpent: stats.totalSpent ?? 0,
    lastPurchaseDate: stats.lastPurchaseDate ?? null,
  },
});

export const serializeAdmin = (a) => {
  const initials = a.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  return {
    id: idOf(a),
    name: a.name,
    email: a.email,
    mobile: a.mobile ?? null,
    role: a.role,
    roleLabel: ROLE_LABELS[a.role] ?? a.role,
    avatarInitials: initials,
    lastLoginAt: a.lastLoginAt ?? null,
  };
};

const warrantyStatus = (purchase, now = new Date()) => {
  if (!purchase.warranty?.validUntil) return null;
  if (purchase.status === 'Cancelled') return 'Void';
  return purchase.warranty.validUntil >= now ? 'Active' : 'Expired';
};

/**
 * @param {object} p Purchase document (optionally with customerId / createdBy populated)
 * @param {{ audience?: 'admin'|'customer' }} [options]
 */
export const serializePurchase = (p, { audience = 'admin' } = {}) => {
  const base = {
    id: idOf(p),
    invoiceNumber: p.invoiceNumber,
    customerId: idOf(p.customerId),
    category: p.category,
    product: {
      name: p.product.name,
      brand: p.product.brand ?? null,
      model: p.product.model ?? null,
      variant: p.product.variant ?? null,
      color: p.product.color ?? null,
      imei: p.product.imei ?? null,
      serialNumber: p.product.serialNumber ?? null,
      quantity: p.product.quantity ?? 1,
    },
    purchaseDate: p.purchaseDate,
    payment: { method: p.payment.method, status: p.payment.status },
    pricing: {
      purchaseAmount: p.pricing.purchaseAmount,
      discount: p.pricing.discount,
      loyaltyDiscount: p.pricing.loyaltyDiscount ?? 0,
      finalAmount: p.pricing.finalAmount,
      taxRatePercent: p.pricing.taxRatePercent,
      taxAmount: p.pricing.taxAmount,
      baseAmount: p.pricing.baseAmount,
    },
    loyalty: {
      pointsEarned: p.loyalty?.pointsEarned ?? 0,
      pointsRedeemed: p.loyalty?.pointsRedeemed ?? 0,
      pointsRefunded: p.loyalty?.pointsRefunded ?? 0,
      pointsReversed: p.loyalty?.pointsReversed ?? 0,
      reversalShortfall: p.loyalty?.reversalShortfall ?? 0,
    },
    warranty: p.warranty?.validUntil
      ? {
          months: p.warranty.months ?? null,
          type: p.warranty.type,
          validUntil: p.warranty.validUntil,
          coverage: p.warranty.coverage,
          status: warrantyStatus(p),
        }
      : null,
    notes: p.notes ?? null,
    // Path relative to the API base URL (public, unguessable key).
    productImage: p.productImage?.key
      ? { path: `/product-images/${p.productImage.key}`, contentType: p.productImage.contentType, size: p.productImage.size }
      : null,
    // Metadata only; the file is fetched through the bill download endpoints.
    bill: p.bill?.fileId
      ? {
          filename: p.bill.filename,
          contentType: p.bill.contentType,
          size: p.bill.size,
          uploadedAt: p.bill.uploadedAt,
        }
      : null,
    status: p.status,
    cancelReason: p.cancelReason ?? null,
    cancelledAt: p.cancelledAt ?? null,
    billedBy: isPopulated(p.createdBy) ? p.createdBy.name : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };

  if (audience !== 'admin') return base;

  return {
    ...base,
    customer: isPopulated(p.customerId)
      ? {
          id: idOf(p.customerId),
          name: p.customerId.name,
          mobile: p.customerId.mobile,
          customerCode: p.customerId.customerCode,
        }
      : null,
    loyalty: { ...base.loyalty, pointsPerHundredRupees: p.loyalty?.pointsPerHundredRupees ?? null },
    createdBy: isPopulated(p.createdBy) ? { id: idOf(p.createdBy), name: p.createdBy.name } : idOf(p.createdBy),
  };
};

/**
 * @param {object} t LoyaltyTransaction (optionally with purchaseId / customerId populated)
 */
export const serializeLoyaltyTransaction = (t, { audience = 'admin' } = {}) => {
  const purchase = t.purchaseId && typeof t.purchaseId === 'object' && t.purchaseId.invoiceNumber ? t.purchaseId : null;
  const base = {
    id: idOf(t),
    type: t.type,
    source: t.source,
    points: t.points,
    direction: t.points > 0 ? 'credit' : 'debit',
    title: t.title,
    description: t.description ?? null,
    reason: t.reason ?? null,
    purchaseId: idOf(t.purchaseId),
    invoiceNumber: purchase?.invoiceNumber ?? null,
    balanceAfter: t.balanceAfter,
    createdAt: t.createdAt,
  };
  if (audience !== 'admin') return base;

  return {
    ...base,
    customerId: idOf(t.customerId),
    customer: isPopulated(t.customerId)
      ? { id: idOf(t.customerId), name: t.customerId.name, mobile: t.customerId.mobile, customerCode: t.customerId.customerCode }
      : null,
    createdBy: isPopulated(t.createdBy) ? { id: idOf(t.createdBy), name: t.createdBy.name } : idOf(t.createdBy),
  };
};

export const serializeLoyaltyBalance = (points, settings) => ({
  balance: points,
  tier: tierOf(points),
  estimatedValue: pointsToRupees(points, settings.loyalty.rupeeValuePerPoint),
  rupeeValuePerPoint: settings.loyalty.rupeeValuePerPoint,
  pointsPerHundredRupees: settings.loyalty.pointsPerHundredRupees,
  minRedeemPoints: settings.loyalty.minRedeemPoints,
  expiryMonths: settings.loyalty.expiryMonths,
});

const PUBLIC_STORE_FIELDS = [
  'storeName',
  'tagline',
  'legalName',
  'gstin',
  'address',
  'city',
  'state',
  'pincode',
  'contactNumber',
  'supportNumber',
  'whatsappNumber',
  'email',
  'workingHours',
  'googleMapsUrl',
];

export const serializePublicStore = (s) => ({
  ...Object.fromEntries(PUBLIC_STORE_FIELDS.map((key) => [key, s[key] ?? null])),
  loyalty: {
    pointsPerHundredRupees: s.loyalty.pointsPerHundredRupees,
    rupeeValuePerPoint: s.loyalty.rupeeValuePerPoint,
    minRedeemPoints: s.loyalty.minRedeemPoints,
    expiryMonths: s.loyalty.expiryMonths,
  },
});

export const serializeSettings = (s) => ({
  ...serializePublicStore(s),
  tax: { gstRatePercent: s.tax?.gstRatePercent ?? 18 },
  updatedAt: s.updatedAt,
});
