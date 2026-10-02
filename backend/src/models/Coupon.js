import mongoose from 'mongoose';

export const COUPON_KINDS = Object.freeze({
  // Earlier single welcome coupon (complete the profile); still redeemable if issued
  WELCOME: 'welcome',
  // Welcome vouchers: free 6D toughened glass, and ₹200 off ₹2,000 of accessories
  WELCOME_GLASS: 'welcome_glass',
  WELCOME_ACCESSORIES: 'welcome_accessories',
  // From an offer created by the staff (Admin → Coupons)
  OFFER: 'offer',
});
export const COUPON_STATUSES = Object.freeze({ ACTIVE: 'active', REDEEMED: 'redeemed' });
// free_item: takes the item's value (up to `value`) off the bill, e.g. a free toughened glass
export const DISCOUNT_TYPES = Object.freeze(['flat', 'percent', 'free_item']);

// Personal discount coupon (e.g. the welcome offer for completing the profile).
// The offer terms are copied in when the coupon is issued, so later changes to the
// offer settings never change a coupon the customer already holds.
const couponSchema = new mongoose.Schema(
  {
    // "SM-7KQ2-XH4P": personal code inside the QR (scanning it also identifies the customer)
    code: { type: String, required: true, unique: true, immutable: true },
    // Shared voucher code from the poster ("WELCOME6D"); typed at the counter for the selected customer
    campaignCode: { type: String, default: null },
    title: { type: String, default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    kind: { type: String, enum: Object.values(COUPON_KINDS), required: true, immutable: true },
    // kind "offer": the offer it was issued from
    offerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', default: null, immutable: true },

    discount: {
      type: { type: String, enum: DISCOUNT_TYPES, required: true },
      // ₹ for flat, % for percent
      value: { type: Number, required: true, min: 0 },
      // Cap for percentage coupons (₹); null = no cap
      maxAmount: { type: Number, min: 0, default: null },
      // free_item: what the customer gets (its value is `value`)
      itemName: { type: String, default: null },
    },
    // Only these product categories count towards the minimum and get the discount (empty = all)
    appliesTo: { type: [String], default: [] },
    // Set for one-per-customer vouchers (= kind), and "offer:<id>:<n>" for a customer's n-th
    // use of an offer: enforced by a unique index
    onceKey: { type: String },
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
couponSchema.index(
  { customerId: 1, onceKey: 1 },
  { unique: true, name: 'one_per_customer', partialFilterExpression: { onceKey: { $exists: true } } }
);
couponSchema.index({ customerId: 1, campaignCode: 1 });
couponSchema.index({ offerId: 1, customerId: 1 }, { partialFilterExpression: { offerId: { $type: 'objectId' } } });
couponSchema.index({ customerId: 1, createdAt: -1 });

export const Coupon = mongoose.model('Coupon', couponSchema);
