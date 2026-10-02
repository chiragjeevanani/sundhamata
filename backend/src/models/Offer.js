import mongoose from 'mongoose';
import { DISCOUNT_TYPES } from './Coupon.js';
import { PURCHASE_CATEGORIES } from './Purchase.js';

/**
 * Who can use an offer:
 * - all: every customer (also walk-ins recorded with just their mobile number)
 * - first_purchase: customers with no earlier bill at the store
 * - new_app_users: customers who joined through the app (same group as the welcome vouchers)
 * - profile_complete: customers whose app profile is 100% complete
 */
export const OFFER_AUDIENCES = Object.freeze(['all', 'first_purchase', 'new_app_users', 'profile_complete']);

// Coupon campaign created by the store staff (Admin → Coupons), e.g. "DIWALI500: ₹500 off
// phones above ₹15,000". Each time a customer claims it in the app, or staff use the code on a
// bill, the customer gets a personal Coupon (kind "offer") with these terms copied in.
const offerSchema = new mongoose.Schema(
  {
    // Typed at the counter for the selected customer ("DIWALI500")
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    // null = named after the discount ("₹500 off Mobiles")
    title: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },

    discount: {
      type: { type: String, enum: DISCOUNT_TYPES, required: true },
      // ₹ for flat, % for percent, the item's value for free_item
      value: { type: Number, required: true, min: 0 },
      // Cap for percentage offers (₹); null = no cap
      maxAmount: { type: Number, min: 0, default: null },
      itemName: { type: String, default: null },
    },
    // Only these product categories count towards the minimum and get the discount (empty = all)
    appliesTo: { type: [{ type: String, enum: PURCHASE_CATEGORIES }], default: [] },
    minBillAmount: { type: Number, min: 0, default: 0 },

    audience: { type: String, enum: OFFER_AUDIENCES, default: 'all' },
    startsAt: { type: Date, required: true },
    // null = no end date
    endsAt: { type: Date, default: null },
    // A claimed coupon stays valid this many days (and never past endsAt); null = until endsAt
    validityDays: { type: Number, min: 1, default: null },

    // How many bills one customer may use it on
    usesPerCustomer: { type: Number, min: 1, default: 1 },
    // Across all customers; null = unlimited. redeemedCount is kept in step with each bill.
    totalUses: { type: Number, min: 1, default: null },
    redeemedCount: { type: Number, min: 0, default: 0 },

    // Paused offers cannot be claimed or used, even by customers who already claimed them
    isActive: { type: Boolean, default: true },
    // Listed in the app ("Offers for you", scratch to claim); otherwise a counter-only code
    showInApp: { type: Boolean, default: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

offerSchema.index({ isActive: 1, showInApp: 1, startsAt: 1 });
offerSchema.index({ createdAt: -1 });

export const Offer = mongoose.model('Offer', offerSchema);
