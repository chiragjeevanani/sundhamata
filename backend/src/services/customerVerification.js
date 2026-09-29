import { logger } from '../config/logger.js';
import { Customer, Purchase } from '../models/index.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';

// A customer is "verified" (blue tick) once they both use the app — signed in with an OTP,
// so the number is really theirs — and have bought something at the store (e.g. redeemed
// their welcome coupon at the counter). Registering alone is not enough. Once verified,
// they stay verified (cancelling a purchase later does not remove the tick).

const hasStorePurchase = (customerId, session = null) =>
  Purchase.exists({ customerId, status: PURCHASE_STATUSES.PURCHASED }).session(session);

/** After a purchase is recorded (inside its transaction). */
export const verifyAfterPurchase = async (customer, { session, onRollback }) => {
  if (customer.verifiedAt || !customer.mobileVerifiedAt) return false;
  const { modifiedCount } = await Customer.updateOne(
    { _id: customer._id, verifiedAt: null },
    { $set: { verifiedAt: new Date() } },
    { session }
  );
  if (modifiedCount) onRollback(() => Customer.updateOne({ _id: customer._id }, { $set: { verifiedAt: null } }));
  return modifiedCount > 0;
};

/** On sign-in: covers customers whose purchases were billed before they joined the app. */
export const verifyOnSignIn = async (customerDoc) => {
  if (customerDoc.verifiedAt) return;
  if (await hasStorePurchase(customerDoc._id)) customerDoc.verifiedAt = new Date();
};

/** One-off: verifies existing customers who already qualify (idempotent). */
export const backfillVerifiedCustomers = async () => {
  const buyers = await Purchase.distinct('customerId', { status: PURCHASE_STATUSES.PURCHASED });
  if (!buyers.length) return 0;
  const { modifiedCount } = await Customer.updateMany(
    { _id: { $in: buyers }, mobileVerifiedAt: { $ne: null }, verifiedAt: null },
    { $set: { verifiedAt: new Date() } }
  );
  if (modifiedCount) logger.info({ customers: modifiedCount }, 'Migration: verified existing customers who use the app and have bought');
  return modifiedCount;
};
