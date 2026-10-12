import mongoose from 'mongoose';

export const SETTINGS_KEY = 'store';

// Welcome vouchers for new app users (the "App Welcome Offers" poster). Settings are read with
// .lean(), so documents created before these existed have no values: always merge with these.
export const VOUCHER_UNLOCKS = Object.freeze(['register', 'profile']);

// The built-in welcome vouchers (terms set below)
export const BUILT_IN_VOUCHERS = Object.freeze(['glass', 'accessories']);

/**
 * What the app gives at each welcome step: "none", a built-in voucher ("glass", "accessories")
 * or an offer from Admin → Coupons ("offer:<id>").
 */
export const WELCOME_CHOICE_PATTERN = /^(none|glass|accessories|offer:[a-f0-9]{24})$/;

/** The offer id in an "offer:<id>" choice, or null */
export const offerIdOfChoice = (choice) => (choice?.startsWith('offer:') ? choice.slice('offer:'.length) : null);

export const WELCOME_VOUCHER_DEFAULTS = Object.freeze({
  enabled: true,
  // Days a voucher stays valid after the customer claims it
  validityDays: 30,
  // Voucher 1: a free item (staff add it to the bill and the voucher takes its price off)
  // unlock: "register" = right after registering, "profile" = once the profile is 100% complete
  glass: Object.freeze({ code: 'WELCOME6D', itemName: '6D Toughened Glass', value: 299 }),
  // Voucher 2: flat discount when the accessories on the bill reach a minimum
  accessories: Object.freeze({ code: 'SAVE200', amount: 200, minBill: 2000 }),
});

/**
 * Before the admin picked a voucher for each step, each built-in voucher had its own on/off
 * switch and "unlocks" setting (defaults: glass on registering, accessories on a complete profile).
 */
const legacyChoice = (stored, unlock) => {
  const fallback = { glass: 'register', accessories: 'profile' };
  const key = BUILT_IN_VOUCHERS.find(
    (k) => (stored?.[k]?.enabled ?? true) && (stored?.[k]?.unlock ?? fallback[k]) === unlock
  );
  return key ?? 'none';
};

const mergeDefaults = (defaults, stored = {}) =>
  Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, stored?.[key] ?? fallback]));

/** Effective welcome-voucher settings (stored values over the defaults) */
export const welcomeVouchersOf = (settings) => {
  const stored = settings?.offers?.welcomeVouchers ?? {};
  return {
    enabled: stored.enabled ?? WELCOME_VOUCHER_DEFAULTS.enabled,
    // Given right after registering / once the profile is 100% complete
    onRegister: stored.onRegister ?? legacyChoice(stored, 'register'),
    onProfile: stored.onProfile ?? legacyChoice(stored, 'profile'),
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
        // See WELCOME_CHOICE_PATTERN; unset = worked out from the older per-voucher settings
        onRegister: { type: String, match: WELCOME_CHOICE_PATTERN },
        onProfile: { type: String, match: WELCOME_CHOICE_PATTERN },
        // Days a built-in voucher stays valid after claiming (offers use their own validity)
        validityDays: { type: Number, min: 1, max: 365, default: WELCOME_VOUCHER_DEFAULTS.validityDays },
        glass: {
          // Older settings, read only until onRegister / onProfile are saved
          enabled: Boolean,
          unlock: { type: String, enum: VOUCHER_UNLOCKS },
          code: { type: String, trim: true, uppercase: true, maxlength: 20, default: WELCOME_VOUCHER_DEFAULTS.glass.code },
          itemName: { type: String, trim: true, maxlength: 60, default: WELCOME_VOUCHER_DEFAULTS.glass.itemName },
          value: { type: Number, min: 0, default: WELCOME_VOUCHER_DEFAULTS.glass.value },
        },
        accessories: {
          enabled: Boolean,
          unlock: { type: String, enum: VOUCHER_UNLOCKS },
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
