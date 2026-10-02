import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Coupon, Customer, Offer, Purchase } from '../models/index.js';
import { COUPON_KINDS, COUPON_STATUSES } from '../models/Coupon.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';
import { welcomeVouchersOf } from '../models/StoreSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { serializeCoupon } from '../utils/serializers.js';
import { getSettings } from './settings.service.js';

// ---- welcome vouchers: unlocked when a new customer joins the app, claimed one by one

export const PLACEHOLDER_CUSTOMER_NAME = 'Customer';

/**
 * A "100% complete" profile, for vouchers that unlock on completing it. Only details every
 * customer can give: the anniversary (not everyone is married) and the photo stay optional.
 */
export const REQUIRED_PROFILE_FIELDS = Object.freeze([
  { key: 'name', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'address', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'pincode', label: 'Pincode' },
]);

/** { percent: 0–100, missingFields: [{ field, label }] } */
export const profileCompletion = (customer) => {
  const missing = REQUIRED_PROFILE_FIELDS.filter(({ key }) => {
    const value = customer[key];
    if (key === 'name') return !value || value === PLACEHOLDER_CUSTOMER_NAME;
    return value === null || value === undefined || value === '';
  });
  const done = REQUIRED_PROFILE_FIELDS.length - missing.length;
  return {
    percent: Math.round((done / REQUIRED_PROFILE_FIELDS.length) * 100),
    missingFields: missing.map(({ key, label }) => ({ field: key, label })),
  };
};

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
      unlock: v.glass.unlock,
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
      unlock: v.accessories.unlock,
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
  // "register": unlocked on joining; "profile": unlocked once the profile is 100% complete
  unlock: definition.unlock,
});

/**
 * The customer's welcome vouchers. Each voucher: "ready" (unlocked, scratch to claim), "locked"
 * (unlocks once the profile is 100% complete) or "claimed" (with its coupon: Active / Used / Expired).
 * Overall status: "unavailable" (switched off, or not a new app user), "ready" (something to
 * claim), "locked" (only locked ones left) or "claimed" (all claimed).
 */
export const getWelcomeOfferStatus = async (customer) => {
  const [settings, coupons] = await Promise.all([
    getSettings(),
    Coupon.find({ customerId: customer._id, kind: { $in: [COUPON_KINDS.WELCOME_GLASS, COUPON_KINDS.WELCOME_ACCESSORIES] } }).lean(),
  ]);
  const byKind = new Map(coupons.map((c) => [c.kind, c]));
  const eligible = Boolean(customer.welcomeOffer?.eligible);
  const profile = profileCompletion(customer);
  const vouchers = welcomeVoucherDefinitions(settings)
    .map((definition) => {
      const coupon = byKind.get(definition.kind);
      if (coupon) return { ...publicVoucher(definition), status: 'claimed', coupon: serializeCoupon(coupon) };
      if (!eligible) return null;
      const locked = definition.unlock === 'profile' && profile.percent < 100;
      return { ...publicVoucher(definition), status: locked ? 'locked' : 'ready', coupon: null };
    })
    .filter(Boolean);
  const has = (s) => vouchers.some((v) => v.status === s);
  const status = !vouchers.length ? 'unavailable' : has('ready') ? 'ready' : has('locked') ? 'locked' : 'claimed';
  return { status, vouchers, profile };
};

// Unambiguous characters only (no 0/O, 1/I/L) so codes are easy to read out and type.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const randomBlock = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
export const generateCode = () => `SM-${randomBlock()}-${randomBlock()}`;

/** "sm 7kq2xh4p", "SM7KQ2XH4P", a scanned QR … → "SM-7KQ2-XH4P"; "welcome6d" → "WELCOME6D" */
export const normalizeCouponCode = (input) => {
  const compact = String(input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^SM[A-Z0-9]{8}$/.test(compact)) return `SM-${compact.slice(2, 6)}-${compact.slice(6)}`;
  return compact;
};

export const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

/** Claims one welcome voucher (once per customer; claiming again returns the same voucher). */
export const claimWelcomeVoucher = async (customer, key) => {
  const definition = welcomeVoucherDefinitions(await getSettings()).find((d) => d.key === key);
  if (!definition) throw ApiError.notFound('This voucher is not available');
  const existing = await Coupon.findOne({ customerId: customer._id, kind: definition.kind }).lean();
  if (existing) return { coupon: serializeCoupon(existing), created: false };
  if (!customer.welcomeOffer?.eligible) throw ApiError.forbidden('Welcome vouchers are for new app users.');
  if (definition.unlock === 'profile') {
    const { percent, missingFields } = profileCompletion(customer);
    if (percent < 100) {
      throw ApiError.unprocessable(
        'Complete your profile to unlock this voucher',
        missingFields.map(({ field, label }) => ({ field, message: `${label} is required` }))
      );
    }
  }

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

// ---- offers created by the staff (Admin → Coupons)

const formatDay = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Why nobody can claim or use this offer right now (paused, not started, ended, used up), or null. */
export const offerClosedReason = (offer, now = new Date()) => {
  if (!offer.isActive) return `The ${offer.code} offer is paused`;
  if (offer.startsAt > now) return `The ${offer.code} offer starts on ${formatDay(offer.startsAt)}`;
  if (offer.endsAt && offer.endsAt <= now) return `The ${offer.code} offer has ended`;
  if (offer.totalUses && offer.redeemedCount >= offer.totalUses) return `The ${offer.code} offer has been fully used`;
  return null;
};

/**
 * Whether the offer is for this customer: null when it is, otherwise { reason }, plus
 * `locked` + `profile` when completing the app profile would unlock it.
 */
export const offerAudienceCheck = async (offer, customer, session = null) => {
  switch (offer.audience) {
    case 'first_purchase': {
      const bought = await Purchase.exists({ customerId: customer._id, status: PURCHASE_STATUSES.PURCHASED }).session(session);
      return bought ? { reason: `${offer.code} is only for a customer's first purchase` } : null;
    }
    case 'new_app_users':
      return customer.welcomeOffer?.eligible ? null : { reason: `${offer.code} is only for new app users` };
    case 'profile_complete': {
      const profile = profileCompletion(customer);
      return profile.percent === 100
        ? null
        : { reason: `${offer.code} needs a 100% complete profile in the app`, locked: true, profile };
    }
    default:
      return null;
  }
};

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
const OFFER_CATEGORY_NAMES = { phones: 'Mobiles', accessories: 'Accessories', service: 'Services' };

/** The offer's name: the staff's title, or one made from the discount ("₹500 off Mobiles"). */
export const offerTitle = (offer) => {
  if (offer.title) return offer.title;
  const d = offer.discount;
  if (d.type === 'free_item') return `Free ${d.itemName}`;
  const off = d.type === 'percent' ? `${d.value}% off` : `${rupees(d.value)} off`;
  const on = offer.appliesTo?.length ? ` ${offer.appliesTo.map((c) => OFFER_CATEGORY_NAMES[c] ?? c).join(' & ')}` : '';
  return `${off}${on}`;
};

/** The offer's terms in a sentence, unless the staff wrote their own description. */
export const offerDescription = (offer) => {
  if (offer.description) return offer.description;
  const d = offer.discount;
  const scope = offer.appliesTo?.length ? offer.appliesTo.map((c) => OFFER_CATEGORY_NAMES[c]?.toLowerCase() ?? c).join(' or ') : null;
  const parts = [];
  if (offer.minBillAmount > 0) parts.push(`Shop for ${rupees(offer.minBillAmount)} or more${scope ? ` of ${scope}` : ''}`);
  else if (scope) parts.push(`On ${scope}`);
  if (d.type === 'percent' && d.maxAmount) parts.push(`up to ${rupees(d.maxAmount)} off`);
  if (d.type === 'free_item') parts.push(`worth up to ${rupees(d.value)}`);
  const sentence = parts.join(', ');
  return sentence ? `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}` : 'Show at the store to use it on your bill';
};

/** A coupon claimed now expires when the offer ends, or `validityDays` later (whichever is first). */
const offerCouponExpiry = (offer, now) => {
  const ends = [offer.endsAt, offer.validityDays ? addDays(now, offer.validityDays) : null].filter(Boolean);
  return ends.length ? new Date(Math.min(...ends.map((d) => new Date(d).getTime()))) : addDays(now, 5 * 365);
};

/** The customer's n-th coupon from this offer, with the offer's terms copied in (not saved yet). */
export const newOfferCoupon = (offer, customerId, useNumber, now = new Date()) => ({
  _id: new mongoose.Types.ObjectId(),
  code: generateCode(),
  campaignCode: offer.code,
  title: offerTitle(offer),
  customerId,
  kind: COUPON_KINDS.OFFER,
  offerId: offer._id,
  onceKey: `offer:${offer._id}:${useNumber}`,
  discount: {
    type: offer.discount.type,
    value: offer.discount.value,
    maxAmount: offer.discount.maxAmount ?? null,
    itemName: offer.discount.itemName ?? null,
  },
  appliesTo: offer.appliesTo ?? [],
  minBillAmount: offer.minBillAmount ?? 0,
  expiresAt: offerCouponExpiry(offer, now),
  status: COUPON_STATUSES.ACTIVE,
});

/**
 * The customer's coupon for this offer: their unused one (claimed in the app, or given back by
 * a cancelled bill), otherwise a new one (`pendingIssue`: saved only when used on a bill or
 * claimed). Throws when they cannot have it (offer closed, uses used up, not for them).
 */
export const offerCouponFor = async (offer, customerId, { session = null, byCustomer = false } = {}) => {
  const now = new Date();
  const closed = offerClosedReason(offer, now);
  if (closed) throw couponProblem(closed);

  const coupons = await Coupon.find({ offerId: offer._id, customerId }).session(session).lean();
  const unused = coupons.find((c) => c.status === COUPON_STATUSES.ACTIVE && c.expiresAt > now);
  if (unused) return unused;
  if (coupons.length >= offer.usesPerCustomer) {
    const expired = coupons.some((c) => c.status === COUPON_STATUSES.ACTIVE);
    const who = byCustomer ? 'You have' : 'This customer has';
    throw couponProblem(
      expired
        ? `${byCustomer ? 'Your' : "This customer's"} ${offer.code} coupon has expired`
        : offer.usesPerCustomer === 1
          ? `${who} already used ${offer.code}`
          : `${who} already used ${offer.code} ${offer.usesPerCustomer} times`
    );
  }

  const customer = await Customer.findById(customerId).session(session).lean();
  if (!customer) throw ApiError.notFound('Customer not found');
  const audience = await offerAudienceCheck(offer, customer, session);
  if (audience) throw couponProblem(audience.reason);
  return { ...newOfferCoupon(offer, customer._id, coupons.length + 1, now), pendingIssue: true };
};

/** Counts one more use of the offer (or one less, for a cancelled bill), within its total limit. */
const countOfferUse = async (offerId, step, { session, onRollback }) => {
  const filter =
    step > 0
      ? { _id: offerId, isActive: true, $or: [{ totalUses: null }, { $expr: { $lt: ['$redeemedCount', '$totalUses'] } }] }
      : { _id: offerId, redeemedCount: { $gt: 0 } };
  const { modifiedCount } = await Offer.updateOne(filter, { $inc: { redeemedCount: step } }, { session });
  if (!modifiedCount) {
    if (step > 0) throw couponProblem('This offer has just been fully used');
    return;
  }
  onRollback(() => Offer.updateOne({ _id: offerId }, { $inc: { redeemedCount: -step } }));
};

// ---- finding and using a coupon on a bill

/**
 * Finds the coupon for a typed or scanned code. A personal code (inside the QR) identifies the
 * customer by itself; a voucher code from the poster ("WELCOME6D") or an offer code
 * ("DIWALI500") needs the customer (registered mobile) and finds that customer's coupon.
 */
const findCoupon = async (rawCode, customerId, session = null) => {
  const code = normalizeCouponCode(rawCode);
  const personal = await Coupon.findOne({ code }).session(session).lean();
  if (personal) {
    if (personal.offerId && personal.status === COUPON_STATUSES.ACTIVE) {
      const offer = await Offer.findById(personal.offerId).session(session).lean();
      const closed = offer && offerClosedReason(offer);
      if (closed) throw couponProblem(closed);
    }
    return personal;
  }

  const offer = await Offer.findOne({ code }).session(session).lean();
  if (offer) {
    if (!customerId) throw couponProblem(`Select the customer first: ${code} is checked against their mobile number`);
    return offerCouponFor(offer, customerId, { session });
  }

  const campaignExists = await Coupon.exists({ campaignCode: code }).session(session);
  if (!campaignExists) return null;
  if (!customerId) {
    throw couponProblem(`Select the customer first: ${code} works with their registered mobile number`);
  }
  const own = await Coupon.findOne({ campaignCode: code, customerId }).sort({ createdAt: -1 }).session(session).lean();
  if (!own) throw couponProblem(`This customer has not claimed the ${code} voucher in the app`);
  return own;
};

const adminCustomerSummary = (c) => ({
  id: c._id.toString(),
  name: c.name,
  mobile: c.mobile,
  customerCode: c.customerCode,
  loyaltyPoints: c.loyaltyPoints,
  isActive: c.isActive,
  isVerified: Boolean(c.verifiedAt),
  photo: c.photo?.key ? { path: `/customer-photos/${c.photo.key}` } : null,
});

/**
 * Admin lookup before billing: the coupon, its owner, and whether it can be used.
 * For an offer the customer has not claimed yet, `coupon` is a preview (its `code` is the offer
 * code, `issuedOnBill: true`); the customer's own coupon is created when the bill is saved.
 * An offer for everyone can be checked before choosing the customer (`customer: null`).
 */
export const lookupCouponForAdmin = async (rawCode, { customerId } = {}) => {
  const code = normalizeCouponCode(rawCode);
  if (!customerId && !(await Coupon.exists({ code }))) {
    const offer = await Offer.findOne({ code }).lean();
    if (offer && ['all', 'first_purchase'].includes(offer.audience)) {
      const reason = offerClosedReason(offer);
      const preview = newOfferCoupon(offer, null, 0);
      return { coupon: { ...serializeCoupon(preview), code: offer.code, issuedOnBill: true }, customer: null, usable: !reason, reason };
    }
  }

  const found = await findCoupon(code, customerId);
  if (!found) throw ApiError.notFound('No voucher found with this code');
  const customer = await Customer.findById(found.customerId).lean();
  if (!customer) throw ApiError.notFound('Customer not found');
  const reason = unusableReason(found);
  return {
    coupon: found.pendingIssue
      ? { ...serializeCoupon(found), code: found.campaignCode, issuedOnBill: true }
      : { ...serializeCoupon(found), issuedOnBill: false },
    customer: adminCustomerSummary(customer),
    usable: !reason,
    reason,
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

/**
 * Atomically marks the coupon used by this purchase; fails if someone used it a moment earlier.
 * An offer coupon issued at the counter (`pendingIssue`) is created here, already used.
 */
export const markCouponRedeemed = async ({ coupon, purchaseId, admin }, ctx) => {
  const { session, onRollback } = ctx;
  const now = new Date();
  const used = { status: COUPON_STATUSES.REDEEMED, redeemedAt: now, purchaseId, redeemedBy: admin._id };
  if (coupon.offerId) await countOfferUse(coupon.offerId, 1, ctx);

  if (coupon.pendingIssue) {
    const { pendingIssue: _pending, ...fields } = coupon;
    try {
      const [created] = await Coupon.create([{ ...fields, ...used }], { session });
      onRollback(() => Coupon.deleteOne({ _id: created._id }));
      return created.toObject();
    } catch (err) {
      if (err?.code === 11000) throw couponProblem(`${coupon.campaignCode} has just been used for this customer on another bill`);
      throw err;
    }
  }

  const updated = await Coupon.findOneAndUpdate(
    { _id: coupon._id, status: COUPON_STATUSES.ACTIVE, expiresAt: { $gt: now } },
    { $set: used },
    { session, returnDocument: 'after' }
  ).lean();
  if (!updated) throw couponProblem('This coupon has just been used on another bill');
  onRollback(() =>
    Coupon.updateOne(
      { _id: coupon._id },
      { $set: { status: COUPON_STATUSES.ACTIVE, redeemedAt: null, purchaseId: null, redeemedBy: null } }
    )
  );
  return updated;
};

/** Cancelling a bill gives its coupon back to the customer (if it has not expired meanwhile). */
export const restoreCouponOfPurchase = async (purchase, ctx) => {
  const { session, onRollback } = ctx;
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
    // The offer's total limit counts bills, so a cancelled bill frees its use
    if (restored.offerId) await countOfferUse(restored.offerId, -1, ctx);
  }
  return restored;
};
