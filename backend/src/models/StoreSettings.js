import mongoose from 'mongoose';

export const SETTINGS_KEY = 'store';

// Welcome vouchers for new app users (the "App Welcome Offers" poster). Settings are read with
// .lean(), so documents created before these existed have no values: always merge with these.
export const WELCOME_VOUCHER_DEFAULTS = Object.freeze({
  enabled: true,
  // Days a voucher stays valid after the customer claims it
  validityDays: 30,
  // Voucher 1: a free item (staff add it to the bill and the voucher takes its price off)
  glass: Object.freeze({ enabled: true, code: 'WELCOME6D', itemName: '6D Toughened Glass', value: 299 }),
  // Voucher 2: flat discount when the accessories on the bill reach a minimum
  accessories: Object.freeze({ enabled: true, code: 'SAVE200', amount: 200, minBill: 2000 }),
});

const mergeDefaults = (defaults, stored = {}) =>
  Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, stored?.[key] ?? fallback]));

/** Effective welcome-voucher settings (stored values over the defaults) */
export const welcomeVouchersOf = (settings) => {
  const stored = settings?.offers?.welcomeVouchers ?? {};
  return {
    enabled: stored.enabled ?? WELCOME_VOUCHER_DEFAULTS.enabled,
    validityDays: stored.validityDays ?? WELCOME_VOUCHER_DEFAULTS.validityDays,
    glass: mergeDefaults(WELCOME_VOUCHER_DEFAULTS.glass, stored.glass),
    accessories: mergeDefaults(WELCOME_VOUCHER_DEFAULTS.accessories, stored.accessories),
  };
};

// Colours the admin can customise per app, as "#RRGGBB". null = the built-in logo colours.
export const THEME_COLOR_KEYS = Object.freeze({
  customer: ['primary', 'background', 'dark'],
  admin: ['primary', 'background', 'sidebar'],
});

const colorField = { type: String, match: /^#[0-9A-F]{6}$/, default: null };
const themeSection = (keys) => Object.fromEntries(keys.map((k) => [k, colorField]));

// Singleton document (key = "store").
const storeSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: SETTINGS_KEY, immutable: true },
    storeName: { type: String, required: true, trim: true, maxlength: 80, default: 'Sundhamata Mobile' },
    tagline: { type: String, trim: true, maxlength: 120, default: 'Smart Phones Smart People' },
    legalName: { type: String, trim: true, maxlength: 120, default: null },
    gstin: { type: String, trim: true, uppercase: true, maxlength: 15, default: null },
    address: { type: String, trim: true, maxlength: 250, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
    state: { type: String, trim: true, maxlength: 80, default: null },
    pincode: { type: String, trim: true, maxlength: 6, default: null },
    contactNumber: { type: String, trim: true, maxlength: 20, default: null },
    supportNumber: { type: String, trim: true, maxlength: 20, default: null },
    whatsappNumber: { type: String, trim: true, maxlength: 20, default: null },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    workingHours: { type: String, trim: true, maxlength: 80, default: null },
    googleMapsUrl: { type: String, trim: true, maxlength: 500, default: null },

    loyalty: {
      pointsPerHundredRupees: { type: Number, required: true, min: 0.01, max: 100, default: 1 },
      rupeeValuePerPoint: { type: Number, min: 0, max: 100, default: 1 },
      minRedeemPoints: { type: Number, min: 0, default: 500 },
      expiryMonths: { type: Number, min: 0, default: 12 },
    },

    tax: {
      gstRatePercent: { type: Number, min: 0, max: 100, default: 18 },
    },

    offers: {
      // Welcome vouchers new app users unlock on registering (see services/coupon.service.js)
      welcomeVouchers: {
        enabled: { type: Boolean, default: WELCOME_VOUCHER_DEFAULTS.enabled },
        validityDays: { type: Number, min: 1, max: 365, default: WELCOME_VOUCHER_DEFAULTS.validityDays },
        glass: {
          enabled: { type: Boolean, default: WELCOME_VOUCHER_DEFAULTS.glass.enabled },
          code: { type: String, trim: true, uppercase: true, maxlength: 20, default: WELCOME_VOUCHER_DEFAULTS.glass.code },
          itemName: { type: String, trim: true, maxlength: 60, default: WELCOME_VOUCHER_DEFAULTS.glass.itemName },
          value: { type: Number, min: 0, default: WELCOME_VOUCHER_DEFAULTS.glass.value },
        },
        accessories: {
          enabled: { type: Boolean, default: WELCOME_VOUCHER_DEFAULTS.accessories.enabled },
          code: { type: String, trim: true, uppercase: true, maxlength: 20, default: WELCOME_VOUCHER_DEFAULTS.accessories.code },
          amount: { type: Number, min: 0, default: WELCOME_VOUCHER_DEFAULTS.accessories.amount },
          minBill: { type: Number, min: 0, default: WELCOME_VOUCHER_DEFAULTS.accessories.minBill },
        },
      },
    },

    theme: {
      customer: themeSection(THEME_COLOR_KEYS.customer),
      admin: themeSection(THEME_COLOR_KEYS.admin),
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

export const StoreSettings = mongoose.model('StoreSettings', storeSettingsSchema);
