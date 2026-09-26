import mongoose from 'mongoose';

export const SETTINGS_KEY = 'store';

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

    theme: {
      customer: themeSection(THEME_COLOR_KEYS.customer),
      admin: themeSection(THEME_COLOR_KEYS.admin),
    },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

export const StoreSettings = mongoose.model('StoreSettings', storeSettingsSchema);
