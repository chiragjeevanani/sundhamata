import mongoose from 'mongoose';

export const COUPON_KINDS = Object.freeze({ WELCOME: 'welcome' });
export const COUPON_STATUSES = Object.freeze({ ACTIVE: 'active', REDEEMED: 'redeemed' });
export const DISCOUNT_TYPES = Object.freeze(['flat', 'percent']);

// Personal discount coupon (e.g. the welcome offer for completing the profile).
// The offer terms are copied in when the coupon is issued, so later changes to the
// offer settings never change a coupon the customer already holds.
const couponSchema = new mongoose.Schema(
  {
    // "SM-7KQ2-XH4P": printed under the QR code and typed/scanned at the counter
    code: { type: String, required: true, unique: true, immutable: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    kind: { type: String, enum: Object.values(COUPON_KINDS), required: true, immutable: true },

    discount: {
      type: { type: String, enum: DISCOUNT_TYPES, required: true },
      // ₹ for flat, % for percent
      value: { type: Number, required: true, min: 0 },
      // Cap for percentage coupons (₹); null = no cap
      maxAmount: { type: Number, min: 0, default: null },
    },
    // Bill (after any store discount) must be at least this much
    minBillAmount: { type: Number, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },

    // "Expired" is derived from expiresAt, never stored.
    status: { type: String, enum: Object.values(COUPON_STATUSES), default: COUPON_STATUSES.ACTIVE },
    redeemedAt: { type: Date, default: null },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },
    redeemedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

// One welcome coupon per customer, even under concurrent claims.
couponSchema.index(
  { customerId: 1, kind: 1 },
  { unique: true, partialFilterExpression: { kind: COUPON_KINDS.WELCOME } }
);
couponSchema.index({ customerId: 1, createdAt: -1 });

export const Coupon = mongoose.model('Coupon', couponSchema);
