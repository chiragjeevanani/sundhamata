import mongoose from 'mongoose';

export const SETTINGS_KEY = 'store';

// New-customer offer terms used until the admin changes them. Settings are read with .lean(),
// so documents created before the offer existed have no `offers`: always merge with these.
export const WELCOME_OFFER_DEFAULTS = Object.freeze({
  enabled: true,
  discountType: 'flat',
  discountValue: 200,
  maxDiscount: null,
  minBillAmount: 1000,
  validityDays: 90,
});

/** Effective welcome-offer terms (stored values over the defaults) */
export const welcomeOfferOf = (settings) => {
  const stored = settings?.offers?.welcome ?? {};
  return Object.fromEntries(
    Object.entries(WELCOME_OFFER_DEFAULTS).map(([key, fallback]) => [key, stored[key] ?? fallback])
  );
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
      // New customers who complete their profile in the app get one coupon with these terms
      welcome: {
        enabled: { type: Boolean, default: WELCOME_OFFER_DEFAULTS.enabled },
        discountType: { type: String, enum: ['flat', 'percent'], default: WELCOME_OFFER_DEFAULTS.discountType },
        discountValue: { type: Number, min: 0, default: WELCOME_OFFER_DEFAULTS.discountValue },
        maxDiscount: { type: Number, min: 0, default: WELCOME_OFFER_DEFAULTS.maxDiscount },
        minBillAmount: { type: Number, min: 0, default: WELCOME_OFFER_DEFAULTS.minBillAmount },
        validityDays: { type: Number, min: 1, default: WELCOME_OFFER_DEFAULTS.validityDays },
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
