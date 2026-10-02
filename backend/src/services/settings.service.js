import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Offer } from '../models/Offer.js';
import { SETTINGS_KEY, StoreSettings, welcomeVouchersOf } from '../models/StoreSettings.js';
import { ApiError } from '../utils/ApiError.js';

const INITIAL_SETTINGS = {
  storeName: 'Sundhamata Mobile',
  tagline: 'Smart Phones Smart People',
  'loyalty.pointsPerHundredRupees': env.LOYALTY_POINTS_PER_100,
};

/**
 * Returns the store settings, creating the singleton with defaults on first use.
 * Pass the transaction session when reading inside an atomic workflow.
 */
export const getSettings = async (session = null) => {
  const existing = await StoreSettings.findOne({ key: SETTINGS_KEY }).session(session).lean();
  if (existing) return existing;

  // Upsert makes concurrent first reads safe; schema defaults fill everything else.
  await StoreSettings.updateOne(
    { key: SETTINGS_KEY },
    { $setOnInsert: { key: SETTINGS_KEY, ...INITIAL_SETTINGS } },
    { upsert: true, session, setDefaultsOnInsert: true }
  );
  return StoreSettings.findOne({ key: SETTINGS_KEY }).session(session).lean();
};

/** Flattens `{ loyalty: { a: 1 } }` into `{ 'loyalty.a': 1 }` so partial updates don't wipe siblings. */
const toSetPaths = (patch, prefix = '') =>
  Object.entries(patch).reduce((acc, [key, value]) => {
    if (value === undefined) return acc;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(acc, toSetPaths(value, path));
    } else {
      acc[path] = value;
    }
    return acc;
  }, {});

export const updateSettings = async (patch, admin) => {
  const current = await getSettings(); // ensure the singleton exists

  // The two welcome vouchers are told apart by their codes at the counter
  const vouchers = patch.offers?.welcomeVouchers;
  if (vouchers?.glass?.code || vouchers?.accessories?.code) {
    const now = welcomeVouchersOf(current);
    const glassCode = vouchers.glass?.code ?? now.glass.code;
    const accessoriesCode = vouchers.accessories?.code ?? now.accessories.code;
    if (glassCode === accessoriesCode) {
      throw ApiError.unprocessable('The two vouchers need different codes', [
        { field: 'offers.welcomeVouchers.accessories.code', message: 'Same code as the other voucher' },
      ]);
    }
    // …and from the offers on Admin → Coupons
    for (const [key, code] of [['glass', vouchers.glass?.code], ['accessories', vouchers.accessories?.code]]) {
      if (code && (await Offer.exists({ code }))) {
        throw ApiError.conflict(`The code ${code} is already used by an offer on the Coupons page`, [
          { field: `offers.welcomeVouchers.${key}.code`, message: 'Used by an offer on the Coupons page' },
        ]);
      }
    }
  }
  const $set = { ...toSetPaths(patch), updatedBy: admin._id };
  const updated = await StoreSettings.findOneAndUpdate(
    { key: SETTINGS_KEY },
    { $set },
    { returnDocument: 'after', runValidators: true }
  ).lean();
  logger.info({ adminId: admin._id.toString(), fields: Object.keys($set) }, 'Store settings updated');
  return updated;
};
