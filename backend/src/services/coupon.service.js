import { randomInt } from 'node:crypto';
import { logger } from '../config/logger.js';
import { Coupon } from '../models/index.js';
import { COUPON_KINDS, COUPON_STATUSES } from '../models/Coupon.js';
import { welcomeOfferOf } from '../models/StoreSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { serializeCoupon } from '../utils/serializers.js';
import { getSettings } from './settings.service.js';

// ---- welcome offer: complete the profile, get a coupon

export const PLACEHOLDER_CUSTOMER_NAME = 'Customer';

/** Profile fields a customer fills in to unlock the welcome coupon (anniversary is optional). */
export const REQUIRED_PROFILE_FIELDS = Object.freeze([
  { key: 'name', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'pincode', label: 'Pincode' },
]);

export const missingProfileFields = (customer) =>
  REQUIRED_PROFILE_FIELDS.filter(({ key }) => {
    const value = customer[key];
    if (key === 'name') return !value || value === PLACEHOLDER_CUSTOMER_NAME;
    return value === null || value === undefined || value === '';
  });

/** Offer terms for the app ("₹200 off on a bill of ₹1,000 or more, valid 90 days") */
const publicOfferTerms = (offer) => ({
  discountType: offer.discountType,
  discountValue: offer.discountValue,
  maxDiscount: offer.maxDiscount ?? null,
  minBillAmount: offer.minBillAmount ?? 0,
  validityDays: offer.validityDays,
});

const welcomeCouponOf = (customerId) =>
  Coupon.findOne({ customerId, kind: COUPON_KINDS.WELCOME }).lean();

/**
 * Where the customer stands with the welcome offer:
 * - "unavailable"      offer switched off, or the account is not a new app user
 * - "complete_profile" eligible; `missingFields` lists what is still needed
 * - "ready"            profile complete; the coupon can be claimed
 * - "claimed"          coupon already issued (included)
 */
export const getWelcomeOfferStatus = async (customer) => {
  const [settings, coupon] = await Promise.all([getSettings(), welcomeCouponOf(customer._id)]);
  const offer = welcomeOfferOf(settings);
  const terms = publicOfferTerms(offer);

  if (coupon) return { status: 'claimed', offer: terms, missingFields: [], coupon: serializeCoupon(coupon) };
  if (!offer.enabled || !customer.welcomeOffer?.eligible || !(offer.discountValue > 0)) {
    return { status: 'unavailable', offer: null, missingFields: [], coupon: null };
  }
  const missing = missingProfileFields(customer);
  return {
    status: missing.length ? 'complete_profile' : 'ready',
    offer: terms,
    missingFields: missing.map(({ key, label }) => ({ field: key, label })),
    coupon: null,
  };
};

// Unambiguous characters only (no 0/O, 1/I/L) so codes are easy to read out and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomBlock = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const generateCode = () => `SM-${randomBlock()}-${randomBlock()}`;

/** "sm 7kq2xh4p", "SM7KQ2XH4P", a scanned QR … → "SM-7KQ2-XH4P" */
export const normalizeCouponCode = (input) => {
  const compact = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^SM[A-Z0-9]{8}$/.test(compact)) return `SM-${compact.slice(2, 6)}-${compact.slice(6)}`;
  return compact;
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/** Issues the welcome coupon once the profile is complete. Claiming again returns the same coupon. */
export const claimWelcomeCoupon = async (customer) => {
  const status = await getWelcomeOfferStatus(customer);
  if (status.status === 'claimed') return { coupon: status.coupon, created: false };
  if (status.status === 'unavailable') {
    throw ApiError.forbidden('This offer is not available for your account.');
  }
  if (status.status === 'complete_profile') {
    throw ApiError.unprocessable(
      'Complete your profile to get the coupon',
      status.missingFields.map(({ field, label }) => ({ field, message: `${label} is required` }))
    );
  }

  const offer = welcomeOfferOf(await getSettings());
  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const coupon = await Coupon.create({
        code: generateCode(),
        customerId: customer._id,
        kind: COUPON_KINDS.WELCOME,
        discount: {
          type: offer.discountType,
          value: offer.discountValue,
          maxAmount: offer.discountType === 'percent' ? offer.maxDiscount : null,
        },
        minBillAmount: offer.minBillAmount,
        expiresAt: addDays(now, offer.validityDays),
      });
      logger.info({ customerId: customer.id, couponId: coupon.id }, 'Welcome coupon issued');
      return { coupon: serializeCoupon(coupon.toObject()), created: true };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Claimed at the same moment from another device → return that coupon
      const existing = await welcomeCouponOf(customer._id);
      if (existing) return { coupon: serializeCoupon(existing), created: false };
      // Otherwise the random code collided: try another one
    }
  }
  throw new ApiError(500, 'Could not generate a coupon, please try again');
};

/** Marks the first sign-in of a new app user as eligible for the welcome offer. */
export const markWelcomeOfferEligible = (customer) => {
  if (customer.welcomeOffer?.eligible) return;
  customer.set('welcomeOffer', { eligible: true, eligibleSince: new Date() });
};

export const listCustomerCoupons = async (customerId) => {
  const coupons = await Coupon.find({ customerId }).sort({ createdAt: -1 }).lean();
  return coupons.map(serializeCoupon);
};

// ---- redemption at the counter

/** Discount (₹) this coupon gives on a bill of `amount` (after the store discount). */
export const couponDiscountFor = (coupon, amount) => {
  const raw =
    coupon.discount.type === 'percent'
      ? (amount * coupon.discount.value) / 100
      : coupon.discount.value;
  const cap = coupon.discount.maxAmount;
  const capped = cap === null || cap === undefined ? raw : Math.min(raw, cap);
  return Math.round(Math.min(capped, amount) * 100) / 100;
};

const couponProblem = (message) => ApiError.unprocessable(message, [{ field: 'couponCode', message }]);

/** Why this coupon cannot be used right now, or null when it can. */
const unusableReason = (coupon, now = new Date()) => {
  if (coupon.status === COUPON_STATUSES.REDEEMED) return 'This coupon has already been used';
  if (coupon.expiresAt <= now) return 'This coupon has expired';
  return null;
};

/** Admin lookup before billing: the coupon, its owner, and whether it can be used. */
export const lookupCouponForAdmin = async (code) => {
  const coupon = await Coupon.findOne({ code: normalizeCouponCode(code) })
    .populate('customerId', 'name mobile customerCode loyaltyPoints isActive verifiedAt photo')
    .lean();
  if (!coupon) throw ApiError.notFound('No coupon found with this code');
  return {
    coupon: serializeCoupon(coupon),
    customer: {
      id: coupon.customerId._id.toString(),
      name: coupon.customerId.name,
      mobile: coupon.customerId.mobile,
      customerCode: coupon.customerId.customerCode,
      loyaltyPoints: coupon.customerId.loyaltyPoints,
      isActive: coupon.customerId.isActive,
      isVerified: Boolean(coupon.customerId.verifiedAt),
      photo: coupon.customerId.photo?.key ? { path: `/customer-photos/${coupon.customerId.photo.key}` } : null,
    },
    usable: !unusableReason(coupon),
    reason: unusableReason(coupon),
  };
};

/**
 * Checks a coupon for a bill and works out its discount (inside the purchase transaction).
 * @returns {{ coupon: object, discount: number }}
 */
export const prepareCouponForPurchase = async ({ code, customerId, amount }, { session }) => {
  const coupon = await Coupon.findOne({ code: normalizeCouponCode(code) }).session(session).lean();
  if (!coupon) throw couponProblem('No coupon found with this code');
  if (coupon.customerId.toString() !== customerId.toString()) {
    throw couponProblem('This coupon belongs to another customer');
  }
  const reason = unusableReason(coupon);
  if (reason) throw couponProblem(reason);
  if (amount < (coupon.minBillAmount ?? 0)) {
    throw couponProblem(`This coupon needs a bill of at least ₹${coupon.minBillAmount.toLocaleString('en-IN')}`);
  }
  const discount = couponDiscountFor(coupon, amount);
  if (!(discount > 0)) throw couponProblem('This coupon gives no discount on this bill');
  return { coupon, discount };
};

/** Atomically marks the coupon used by this purchase; fails if someone used it a moment earlier. */
export const markCouponRedeemed = async ({ couponId, purchaseId, admin }, { session, onRollback }) => {
  const now = new Date();
  const updated = await Coupon.findOneAndUpdate(
    { _id: couponId, status: COUPON_STATUSES.ACTIVE, expiresAt: { $gt: now } },
    { $set: { status: COUPON_STATUSES.REDEEMED, redeemedAt: now, purchaseId, redeemedBy: admin._id } },
    { session, returnDocument: 'after' }
  ).lean();
  if (!updated) throw couponProblem('This coupon has just been used on another bill');
  onRollback(() =>
    Coupon.updateOne(
      { _id: couponId },
      { $set: { status: COUPON_STATUSES.ACTIVE, redeemedAt: null, purchaseId: null, redeemedBy: null } }
    )
  );
  return updated;
};

/** Cancelling a bill gives its coupon back to the customer (if it has not expired meanwhile). */
export const restoreCouponOfPurchase = async (purchase, { session, onRollback }) => {
  if (!purchase.coupon?.couponId) return null;
  const restored = await Coupon.findOneAndUpdate(
    { _id: purchase.coupon.couponId, status: COUPON_STATUSES.REDEEMED },
    { $set: { status: COUPON_STATUSES.ACTIVE, redeemedAt: null, purchaseId: null, redeemedBy: null } },
    { session, returnDocument: 'before' }
  ).lean();
  if (restored) {
    onRollback(() =>
      Coupon.updateOne(
        { _id: restored._id },
        {
          $set: {
            status: COUPON_STATUSES.REDEEMED,
            redeemedAt: restored.redeemedAt,
            purchaseId: restored.purchaseId,
            redeemedBy: restored.redeemedBy,
          },
        }
      )
    );
  }
  return restored;
};
