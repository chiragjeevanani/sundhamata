// Sundhamata Mobile - coupon wording and discount preview (mirrors backend coupon.service.js;
// the server recalculates and is authoritative when the purchase is recorded).

import { formatINR } from './formatters';

/** "₹200 off" / "10% off (up to ₹500)" / "Free 6D Toughened Glass" */
export const describeDiscount = ({ type, value, maxAmount, itemName } = {}) => {
  if (type === 'free_item') return `Free ${itemName || 'item'}`;
  return type === 'percent'
    ? `${value}% off${maxAmount ? ` (up to ${formatINR(maxAmount)})` : ''}`
    : `${formatINR(value)} off`;
};

const CATEGORY_WORDS = { phones: 'mobiles', accessories: 'accessories', service: 'services' };

/** "on ₹2,000 of accessories" / "on a bill of ₹1,000 or more" / "" */
export const describeMinimum = (coupon) => {
  const scope = coupon?.appliesTo?.length ? coupon.appliesTo.map((c) => CATEGORY_WORDS[c] ?? c).join(' / ') : null;
  if (coupon?.minBillAmount > 0) {
    return scope ? `when you buy ${formatINR(coupon.minBillAmount)} of ${scope}` : `on a bill of ${formatINR(coupon.minBillAmount)} or more`;
  }
  return scope && coupon?.discount?.type !== 'free_item' ? `on ${scope}` : '';
};

/** Part of a bill a coupon applies to (some vouchers only count accessories) */
export const eligibleAmountFor = (coupon, items) =>
  items.reduce(
    (sum, item) => sum + (!coupon?.appliesTo?.length || coupon.appliesTo.includes(item.category) ? Number(item.price) || 0 : 0),
    0
  );

/** Discount (₹) a coupon gives on a bill of `amount` (after the store discount) */
export const couponDiscountFor = (coupon, amount) => {
  if (!coupon || !(amount > 0)) return 0;
  const raw = coupon.discount.type === 'percent' ? (amount * coupon.discount.value) / 100 : coupon.discount.value;
  const cap = coupon.discount.maxAmount;
  const capped = cap === null || cap === undefined ? raw : Math.min(raw, cap);
  return Math.round(Math.min(capped, amount) * 100) / 100;
};
