// Sundhamata Mobile - coupon wording and discount preview (mirrors backend coupon.service.js;
// the server recalculates and is authoritative when the purchase is recorded).

import { formatINR } from './formatters';

/** "₹200 off" / "10% off (up to ₹500)" */
export const describeDiscount = ({ type, value, maxAmount } = {}) =>
  type === 'percent'
    ? `${value}% off${maxAmount ? ` (up to ${formatINR(maxAmount)})` : ''}`
    : `${formatINR(value)} off`;

/** Offer terms from settings → the same wording as a coupon */
export const describeOffer = (offer) =>
  offer ? describeDiscount({ type: offer.discountType, value: offer.discountValue, maxAmount: offer.maxDiscount }) : '';

/** Discount (₹) a coupon gives on a bill of `amount` (after the store discount) */
export const couponDiscountFor = (coupon, amount) => {
  if (!coupon || !(amount > 0)) return 0;
  const raw = coupon.discount.type === 'percent' ? (amount * coupon.discount.value) / 100 : coupon.discount.value;
  const cap = coupon.discount.maxAmount;
  const capped = cap === null || cap === undefined ? raw : Math.min(raw, cap);
  return Math.round(Math.min(capped, amount) * 100) / 100;
};
