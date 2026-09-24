/**
 * Loyalty points for a purchase.
 * Rule: `pointsPerHundredRupees` points for every full ₹100 of the final (post-discount)
 * amount, rounded DOWN to a whole point. Example at 1 pt / ₹100: ₹124,999 → 1,249 points.
 *
 * Integer arithmetic on paise avoids floating point drift (e.g. 0.1 * 3).
 */
export const calculatePurchasePoints = (finalAmount, pointsPerHundredRupees) => {
  if (!Number.isFinite(finalAmount) || finalAmount <= 0) return 0;
  if (!Number.isFinite(pointsPerHundredRupees) || pointsPerHundredRupees <= 0) return 0;

  const paise = Math.round(finalAmount * 100);
  const ratePerHundredth = Math.round(pointsPerHundredRupees * 100);
  // points = floor(paise / 10_000 * rate) = floor(paise * ratePerHundredth / 1_000_000)
  return Math.floor((paise * ratePerHundredth) / 1_000_000);
};

// Tier thresholds on the current points balance. Kept in one place so the
// business can tune them later without touching callers.
export const LOYALTY_TIERS = Object.freeze([
  { key: 'platinum', label: 'Platinum Elite', minPoints: 10000, color: '#1E40AF' },
  { key: 'gold', label: 'Gold Member', minPoints: 2500, color: '#F59E0B' },
  { key: 'silver', label: 'Silver Member', minPoints: 1000, color: '#64748B' },
  { key: 'bronze', label: 'Bronze Member', minPoints: 0, color: '#B45309' },
]);

export const getLoyaltyTier = (points = 0) =>
  LOYALTY_TIERS.find((tier) => points >= tier.minPoints) ?? LOYALTY_TIERS[LOYALTY_TIERS.length - 1];

export const pointsToRupees = (points, rupeeValuePerPoint) =>
  Math.round(Math.max(0, points) * rupeeValuePerPoint * 100) / 100;
