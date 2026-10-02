import { logger } from '../config/logger.js';
import { Coupon, Offer } from '../models/index.js';
import { COUPON_KINDS, COUPON_STATUSES } from '../models/Coupon.js';
import { welcomeVouchersOf } from '../models/StoreSettings.js';
import { ApiError } from '../utils/ApiError.js';
import { serializeCoupon } from '../utils/serializers.js';
import {
  offerAudienceCheck,
  offerClosedReason,
  offerCouponFor,
  offerDescription,
  offerTitle,
  profileCompletion,
} from './coupon.service.js';
import { getSettings } from './settings.service.js';

// Offers (coupon campaigns) created by the staff on Admin → Coupons, and how the app shows them.
// Using an offer always goes through the customer's own Coupon (see coupon.service.js).

/** "active" | "scheduled" | "ended" | "paused" | "used_up" */
export const offerStatus = (offer, now = new Date()) => {
  if (!offer.isActive) return 'paused';
  if (offer.endsAt && offer.endsAt <= now) return 'ended';
  if (offer.startsAt > now) return 'scheduled';
  if (offer.totalUses && offer.redeemedCount >= offer.totalUses) return 'used_up';
  return 'active';
};

const serializeOffer = (offer, stats = {}) => ({
  id: offer._id.toString(),
  code: offer.code,
  // title: what the staff typed (null = automatic); displayTitle: what customers see
  title: offer.title ?? null,
  displayTitle: offerTitle(offer),
  description: offer.description ?? null,
  displayDescription: offerDescription(offer),
  discount: {
    type: offer.discount.type,
    value: offer.discount.value,
    maxAmount: offer.discount.maxAmount ?? null,
    itemName: offer.discount.itemName ?? null,
  },
  appliesTo: offer.appliesTo ?? [],
  minBillAmount: offer.minBillAmount ?? 0,
  audience: offer.audience,
  startsAt: offer.startsAt,
  endsAt: offer.endsAt ?? null,
  validityDays: offer.validityDays ?? null,
  usesPerCustomer: offer.usesPerCustomer,
  totalUses: offer.totalUses ?? null,
  isActive: offer.isActive,
  showInApp: offer.showInApp,
  status: offerStatus(offer),
  stats: {
    // Bills it was used on (cancelled bills not counted)
    used: offer.redeemedCount ?? 0,
    // Customers who claimed it in the app or used it at the counter
    customers: stats.customers ?? 0,
  },
  createdAt: offer.createdAt,
  updatedAt: offer.updatedAt,
});

const statsByOffer = async (offerIds) => {
  const rows = await Coupon.aggregate([
    { $match: { offerId: { $in: offerIds } } },
    { $group: { _id: '$offerId', customers: { $addToSet: '$customerId' } } },
    { $project: { customers: { $size: '$customers' } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
};

/** The checks the request schema cannot make alone (they depend on several fields). */
const checkTerms = (offer) => {
  const d = offer.discount;
  const problems = [];
  if (d.type === 'percent' && d.value > 100) problems.push({ field: 'discount.value', message: 'A percentage cannot be more than 100' });
  if (d.type === 'free_item' && !d.itemName) problems.push({ field: 'discount.itemName', message: 'Enter the free item' });
  if (offer.endsAt && offer.endsAt <= offer.startsAt) problems.push({ field: 'endsAt', message: 'The end date must be after the start date' });
  if (problems.length) throw ApiError.unprocessable(problems[0].message, problems);
};

/** Only the fields that mean something for the discount type */
const cleanDiscount = (d) => ({
  type: d.type,
  value: d.value,
  maxAmount: d.type === 'percent' ? d.maxAmount ?? null : null,
  itemName: d.type === 'free_item' ? d.itemName ?? null : null,
});

/** Offer codes must not clash with the welcome voucher codes, old or current. */
const assertCodeFree = async (code, exceptOfferId = null) => {
  const welcome = welcomeVouchersOf(await getSettings());
  const welcomeCodes = [welcome.glass.code, welcome.accessories.code];
  const takenByVoucher =
    welcomeCodes.includes(code) || (await Coupon.exists({ campaignCode: code, kind: { $ne: COUPON_KINDS.OFFER } }));
  const takenByOffer = await Offer.exists({ code, ...(exceptOfferId ? { _id: { $ne: exceptOfferId } } : {}) });
  if (takenByVoucher || takenByOffer) {
    throw ApiError.conflict(`The code ${code} is already in use`, [
      { field: 'code', message: takenByVoucher ? 'Used by a welcome voucher' : 'Used by another offer' },
    ]);
  }
};

const duplicateCode = (err, code) =>
  err?.code === 11000
    ? ApiError.conflict(`The code ${code} is already in use`, [{ field: 'code', message: 'Used by another offer' }])
    : err;

export const listOffers = async () => {
  const offers = await Offer.find().sort({ createdAt: -1 }).limit(500).lean();
  const stats = await statsByOffer(offers.map((o) => o._id));
  return offers.map((o) => serializeOffer(o, stats.get(o._id.toString())));
};

export const createOffer = async (input, admin) => {
  const fields = {
    ...input,
    discount: cleanDiscount(input.discount),
    minBillAmount: input.minBillAmount ?? 0,
    startsAt: input.startsAt ?? new Date(),
    createdBy: admin._id,
    updatedBy: admin._id,
  };
  checkTerms(fields);
  await assertCodeFree(fields.code);
  let offer;
  try {
    offer = await Offer.create(fields);
  } catch (err) {
    throw duplicateCode(err, fields.code);
  }
  logger.info({ adminId: admin._id.toString(), offerId: offer.id, code: offer.code }, 'Offer created');
  return serializeOffer(offer.toObject());
};

/**
 * Changes apply to coupons claimed from now on; coupons customers already hold keep their terms.
 * A new code is also used for those coupons, so the old one stops working at the counter.
 */
export const updateOffer = async (id, patch, admin) => {
  const offer = await Offer.findById(id);
  if (!offer) throw ApiError.notFound('Offer not found');
  const { discount, minBillAmount, ...rest } = patch;
  offer.set(rest);
  if (discount) offer.discount = cleanDiscount(discount);
  if (minBillAmount !== undefined) offer.minBillAmount = minBillAmount ?? 0;
  offer.updatedBy = admin._id;
  checkTerms(offer);

  const codeChanged = offer.isModified('code');
  if (codeChanged) await assertCodeFree(offer.code, offer._id);
  try {
    await offer.save();
  } catch (err) {
    throw duplicateCode(err, offer.code);
  }
  if (codeChanged) await Coupon.updateMany({ offerId: offer._id }, { $set: { campaignCode: offer.code } });
  logger.info({ adminId: admin._id.toString(), offerId: offer.id, fields: Object.keys(patch) }, 'Offer updated');
  const stats = await statsByOffer([offer._id]);
  return serializeOffer(offer.toObject(), stats.get(offer.id));
};

/** Only offers nobody has claimed or used can be deleted; pause the others. */
export const deleteOffer = async (id, admin) => {
  const offer = await Offer.findById(id).lean();
  if (!offer) throw ApiError.notFound('Offer not found');
  if (await Coupon.exists({ offerId: offer._id })) {
    throw ApiError.conflict('Customers have already claimed or used this offer. Pause it instead, so their history stays.');
  }
  await Offer.deleteOne({ _id: offer._id });
  logger.info({ adminId: admin._id.toString(), offerId: id, code: offer.code }, 'Offer deleted');
};

// ---- in the customer app

const publicOffer = (offer) => ({
  id: offer._id.toString(),
  key: offer._id.toString(),
  // The staff's own name for it ("Diwali Dhamaka"), or null when it is named after the discount
  customTitle: offer.title ?? null,
  title: offerTitle(offer),
  description: offerDescription(offer),
  campaignCode: offer.code,
  discount: {
    type: offer.discount.type,
    value: offer.discount.value,
    maxAmount: offer.discount.maxAmount ?? null,
    itemName: offer.discount.itemName ?? null,
  },
  minBillAmount: offer.minBillAmount ?? 0,
  appliesTo: offer.appliesTo ?? [],
  validityDays: offer.validityDays ?? null,
  endsAt: offer.endsAt ?? null,
  // "profile": unlocks once the profile is 100% complete
  unlock: offer.audience === 'profile_complete' ? 'profile' : 'register',
});

/**
 * Offers shown in the app for this customer, newest first: "ready" (scratch to claim),
 * "locked" (complete the profile first) or "claimed" (with the customer's coupon).
 * Offers they cannot have, or have used up, are left out.
 */
export const listOffersForCustomer = async (customer) => {
  const now = new Date();
  const profile = profileCompletion(customer);
  const offers = await Offer.find({
    isActive: true,
    showInApp: true,
    startsAt: { $lte: now },
    $or: [{ endsAt: null }, { endsAt: { $gt: now } }],
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!offers.length) return { offers: [], profile };

  const coupons = await Coupon.find({ customerId: customer._id, offerId: { $in: offers.map((o) => o._id) } }).lean();
  const items = [];
  for (const offer of offers) {
    if (offerClosedReason(offer, now)) continue; // used up
    const mine = coupons.filter((c) => c.offerId.equals(offer._id));
    const unused = mine.find((c) => c.status === COUPON_STATUSES.ACTIVE && c.expiresAt > now);
    if (unused) {
      items.push({ ...publicOffer(offer), status: 'claimed', coupon: serializeCoupon(unused) });
      continue;
    }
    if (mine.length >= offer.usesPerCustomer) continue;
    const audience = await offerAudienceCheck(offer, customer);
    if (audience && !audience.locked) continue;
    items.push({ ...publicOffer(offer), status: audience ? 'locked' : 'ready', coupon: null });
  }
  return { offers: items, profile };
};

/** Claims an offer in the app: the customer's own coupon (QR + code). Claiming again returns it. */
export const claimOffer = async (customer, offerId) => {
  const offer = await Offer.findById(offerId).lean();
  if (!offer || !offer.showInApp) throw ApiError.notFound('This offer is not available');
  const coupon = await offerCouponFor(offer, customer._id, { byCustomer: true });
  if (!coupon.pendingIssue) return { coupon: serializeCoupon(coupon), created: false };

  const { pendingIssue: _pending, ...fields } = coupon;
  try {
    const created = await Coupon.create(fields);
    logger.info({ customerId: customer._id.toString(), couponId: created.id, offerId }, 'Offer claimed');
    return { coupon: serializeCoupon(created.toObject()), created: true };
  } catch (err) {
    if (err?.code !== 11000) throw err;
    // Claimed at the same moment from another device → return that coupon
    const raced = await Coupon.findOne({ offerId: offer._id, customerId: customer._id, status: COUPON_STATUSES.ACTIVE })
      .sort({ createdAt: -1 })
      .lean();
    if (raced) return { coupon: serializeCoupon(raced), created: false };
    throw new ApiError(500, 'Could not claim the offer, please try again');
  }
};
