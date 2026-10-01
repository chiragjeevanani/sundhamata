import { randomInt } from 'node:crypto';
import { logger } from '../config/logger.js';
import { Coupon } from '../models/index.js';
import { COUPON_KINDS, COUPON_STATUSES } from '../models/Coupon.js';
import { welcomeVouchersOf } from '../models/StoreSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { serializeCoupon } from '../utils/serializers.js';
import { getSettings } from './settings.service.js';

// ---- welcome vouchers: unlocked when a new customer joins the app, claimed one by one

export const PLACEHOLDER_CUSTOMER_NAME = 'Customer';

/**
 * The welcome vouchers on offer (from settings), in display order. The terms are copied onto
 * each coupon when it is claimed, so later changes only affect vouchers claimed afterwards.
 */
export const welcomeVoucherDefinitions = (settings) => {
  const v = welcomeVouchersOf(settings);
  if (!v.enabled) return [];
  const accessoriesOnly = ['accessories'];
  return [
    {
      key: 'glass',
      kind: COUPON_KINDS.WELCOME_GLASS,
      enabled: v.glass.enabled && v.glass.value > 0,
      campaignCode: v.glass.code,
      title: `Free ${v.glass.itemName}`,
      description: `Join the Sundhamata Mobile app and get 1 ${v.glass.itemName} free`,
      discount: { type: 'free_item', value: v.glass.value, itemName: v.glass.itemName, maxAmount: null },
      minBillAmount: 0,
      appliesTo: accessoriesOnly,
    },
    {
      key: 'accessories',
      kind: COUPON_KINDS.WELCOME_ACCESSORIES,
      enabled: v.accessories.enabled && v.accessories.amount > 0,
      campaignCode: v.accessories.code,
      title: `₹${v.accessories.amount.toLocaleString('en-IN')} off Mobile Accessories`,
      description: `Buy ₹${v.accessories.minBill.toLocaleString('en-IN')} of mobile accessories and get ₹${v.accessories.amount.toLocaleString('en-IN')} off`,
      discount: { type: 'flat', value: v.accessories.amount, itemName: null, maxAmount: null },
      minBillAmount: v.accessories.minBill,
      appliesTo: accessoriesOnly,
    },
  ]
    .filter((d) => d.enabled)
    .map(({ enabled: _enabled, ...d }) => ({ ...d, validityDays: v.validityDays }));
};

const publicVoucher = (definition) => ({
  key: definition.key,
  title: definition.title,
  description: definition.description,
  campaignCode: definition.campaignCode,
  discount: definition.discount,
  minBillAmount: definition.minBillAmount,
  appliesTo: definition.appliesTo,
  validityDays: definition.validityDays,
});

/**
 * The customer's welcome vouchers:
 * - status "unavailable": vouchers switched off, or not a new app user (joined before the offer)
 * - status "ready": at least one voucher still to claim
 * - status "claimed": all claimed (each voucher then carries its coupon: Active / Used / Expired)
 */
export const getWelcomeOfferStatus = async (customer) => {
  const [settings, coupons] = await Promise.all([
    getSettings(),
    Coupon.find({ customerId: customer._id, kind: { $in: [COUPON_KINDS.WELCOME_GLASS, COUPON_KINDS.WELCOME_ACCESSORIES] } }).lean(),
  ]);
  const byKind = new Map(coupons.map((c) => [c.kind, c]));
  const eligible = Boolean(customer.welcomeOffer?.eligible);
  const vouchers = welcomeVoucherDefinitions(settings)
    .map((definition) => {
      const coupon = byKind.get(definition.kind);
      if (coupon) return { ...publicVoucher(definition), status: 'claimed', coupon: serializeCoupon(coupon) };
      return eligible ? { ...publicVoucher(definition), status: 'ready', coupon: null } : null;
    })
    .filter(Boolean);
  const status = !vouchers.length ? 'unavailable' : vouchers.some((v) => v.status === 'ready') ? 'ready' : 'claimed';
  return { status, vouchers };
};

// Unambiguous characters only (no 0/O, 1/I/L) so codes are easy to read out and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomBlock = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
const generateCode = () => `SM-${randomBlock()}-${randomBlock()}`;

/** "sm 7kq2xh4p", "SM7KQ2XH4P", a scanned QR … → "SM-7KQ2-XH4P"; "welcome6d" → "WELCOME6D" */
export const normalizeCouponCode = (input) => {
  const compact = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^SM[A-Z0-9]{8}$/.test(compact)) return `SM-${compact.slice(2, 6)}-${compact.slice(6)}`;
  return compact;
};

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/** Claims one welcome voucher (once per customer; claiming again returns the same voucher). */
export const claimWelcomeVoucher = async (customer, key) => {
  const definition = welcomeVoucherDefinitions(await getSettings()).find((d) => d.key === key);
  if (!definition) throw ApiError.notFound('This voucher is not available');
  const existing = await Coupon.findOne({ customerId: customer._id, kind: definition.kind }).lean();
  if (existing) return { coupon: serializeCoupon(existing), created: false };
  if (!customer.welcomeOffer?.eligible) throw ApiError.forbidden('Welcome vouchers are for new app users.');

  const now = new Date();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const coupon = await Coupon.create({
        code: generateCode(),
        campaignCode: definition.campaignCode,
        title: definition.title,
        customerId: customer._id,
        kind: definition.kind,
        onceKey: definition.kind,
        discount: definition.discount,
        appliesTo: definition.appliesTo,
        minBillAmount: definition.minBillAmount,
        expiresAt: addDays(now, definition.validityDays),
      });
      logger.info({ customerId: customer.id, couponId: coupon.id, kind: definition.kind }, 'Welcome voucher claimed');
      return { coupon: serializeCoupon(coupon.toObject()), created: true };
    } catch (err) {
      if (err?.code !== 11000) throw err;
      // Claimed at the same moment from another device → return that voucher
      const raced = await Coupon.findOne({ customerId: customer._id, kind: definition.kind }).lean();
      if (raced) return { coupon: serializeCoupon(raced), created: false };
      // Otherwise the random code collided: try another one
    }
  }
  throw new ApiError(500, 'Could not create the voucher, please try again');
};

/** Marks the first sign-in of a new app user as eligible for the welcome vouchers. */
export const markWelcomeOfferEligible = (customer) => {
  if (customer.welcomeOffer?.eligible) return;
  customer.set('welcomeOffer', { eligible: true, eligibleSince: new Date() });
};

export const listCustomerCoupons = async (customerId) => {
  const coupons = await Coupon.find({ customerId }).sort({ createdAt: -1 }).lean();
  return coupons.map((c) => serializeCoupon(c));
};

// ---- redemption at the counter

/** Discount (₹) this coupon gives on `amount` (the part of the bill it applies to, after the store discount). */
export const couponDiscountFor = (coupon, amount) => {
  const raw =
    coupon.discount.type === 'percent'
      ? (amount * coupon.discount.value) / 100
      : coupon.discount.value; // flat, or free_item (its value)
  const cap = coupon.discount.maxAmount;
  const capped = cap === null || cap === undefined ? raw : Math.min(raw, cap);
  return Math.round(Math.min(capped, amount) * 100) / 100;
};

const couponProblem = (message) => ApiError.unprocessable(message, [{ field: 'couponCode', message }]);

/** Why this coupon cannot be used right now, or null when it can. */
const unusableReason = (coupon, now = new Date()) => {
  if (coupon.status === COUPON_STATUSES.REDEEMED) return 'This voucher has already been used';
  if (coupon.expiresAt <= now) return 'This voucher has expired';
  return null;
};

const CATEGORY_LABELS = { phones: 'mobiles', accessories: 'accessories', service: 'services' };
const appliesToLabel = (coupon) =>
  coupon.appliesTo?.length ? coupon.appliesTo.map((c) => CATEGORY_LABELS[c] ?? c).join(' / ') : null;

/**
 * Finds the coupon for a typed or scanned code. A personal code (inside the QR) identifies the
 * customer by itself; a voucher code from the poster ("WELCOME6D") needs the customer
 * (registered mobile) and finds that customer's voucher.
 */
const findCoupon = async (rawCode, customerId, session = null) => {
  const code = normalizeCouponCode(rawCode);
  const personal = await Coupon.findOne({ code }).session(session).lean();
  if (personal) return personal;
  const campaignExists = await Coupon.exists({ campaignCode: code }).session(session);
  if (!campaignExists) return null;
  if (!customerId) {
    throw couponProblem(`Select the customer first: ${code} works with their registered mobile number`);
  }
  const own = await Coupon.findOne({ campaignCode: code, customerId }).sort({ createdAt: -1 }).session(session).lean();
  if (!own) throw couponProblem(`This customer has not claimed the ${code} voucher in the app`);
  return own;
};

/** Admin lookup before billing: the coupon, its owner, and whether it can be used. */
export const lookupCouponForAdmin = async (code, { customerId } = {}) => {
  const found = await findCoupon(code, customerId);
  if (!found) throw ApiError.notFound('No voucher found with this code');
  const coupon = await Coupon.findById(found._id)
    .populate('customerId', 'name mobile customerCode loyaltyPoints isActive verifiedAt photo')
    .lean();
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
 * @param {{ code, customerId, lines: Array<{ category: string, amount: number }> }} input
 *   lines: each product's amount after the store discount
 * @returns {{ coupon: object, discount: number, eligible: boolean[] }} eligible: which lines it applies to
 */
export const prepareCouponForPurchase = async ({ code, customerId, lines }, { session }) => {
  const coupon = await findCoupon(code, customerId, session);
  if (!coupon) throw couponProblem('No voucher found with this code');
  if (coupon.customerId.toString() !== customerId.toString()) {
    throw couponProblem('This voucher belongs to another customer');
  }
  const reason = unusableReason(coupon);
  if (reason) throw couponProblem(reason);

  const eligible = lines.map((line) => !coupon.appliesTo?.length || coupon.appliesTo.includes(line.category));
  const amount = Math.round(lines.reduce((sum, line, i) => sum + (eligible[i] ? line.amount : 0), 0) * 100) / 100;
  const scope = appliesToLabel(coupon);
  if (!(amount > 0)) {
    throw couponProblem(`This voucher is for ${scope}: add ${coupon.discount.itemName ? `the ${coupon.discount.itemName}` : scope} to the bill`);
  }
  if (amount < (coupon.minBillAmount ?? 0)) {
    throw couponProblem(
      `This voucher needs ₹${coupon.minBillAmount.toLocaleString('en-IN')} of ${scope ?? 'shopping'} on the bill (now ₹${amount.toLocaleString('en-IN')})`
    );
  }
  const discount = couponDiscountFor(coupon, amount);
  if (!(discount > 0)) throw couponProblem('This voucher gives no discount on this bill');
  return { coupon, discount, eligible };
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
