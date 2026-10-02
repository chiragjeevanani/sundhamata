import { z } from 'zod';
import { optionalEmailSchema, optionalTextSchema } from './common.js';
import { THEME_COLOR_KEYS, VOUCHER_UNLOCKS } from '../models/StoreSettings.js';

// "#rrggbb" → "#RRGGBB"; "" or null resets the colour to the built-in default.
// Voucher code from the poster, e.g. "WELCOME6D": letters and digits (stored in capitals)
export const voucherCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, 'Use 4–20 letters or digits, e.g. WELCOME6D')
  .refine((v) => !/^SM[A-Z0-9]{8}$/.test(v), 'This looks like a personal coupon code; choose another');

const themeColor = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() || null : v ?? null),
  z
    .string()
    .regex(/^#[0-9A-F]{6}$/, 'Colour must be a hex value like #B55B1F')
    .nullable()
);

const themeSectionSchema = (keys) =>
  z.strictObject(Object.fromEntries(keys.map((k) => [k, themeColor.optional()]))).optional();

const phoneText = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() || null : v ?? null),
  z
    .string()
    .regex(/^\+?[\d\s-]{8,20}$/, 'Enter a valid phone number')
    .nullable()
);

export const updateSettingsSchema = z
  .strictObject({
    storeName: z.string().trim().min(2, 'Store name is required').max(80).optional(),
    tagline: optionalTextSchema(120).optional(),
    legalName: optionalTextSchema(120).optional(),
    gstin: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.trim().toUpperCase() || null : v ?? null),
        z
          .string()
          .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
          .nullable()
      )
      .optional(),
    address: optionalTextSchema(250).optional(),
    city: optionalTextSchema(80).optional(),
    state: optionalTextSchema(80).optional(),
    pincode: z
      .preprocess(
        (v) => (typeof v === 'string' ? v.trim() || null : v ?? null),
        z.string().regex(/^[1-9]\d{5}$/, 'Pincode must be 6 digits').nullable()
      )
      .optional(),
    contactNumber: phoneText.optional(),
    supportNumber: phoneText.optional(),
    whatsappNumber: phoneText.optional(),
    email: optionalEmailSchema.optional(),
    workingHours: optionalTextSchema(80).optional(),
    loyalty: z
      .strictObject({
        pointsPerHundredRupees: z.coerce
          .number({ error: 'Points per ₹100 must be a number' })
          .min(0.01, 'Points per ₹100 must be greater than zero')
          .max(100, 'Points per ₹100 is too large')
          .optional(),
        rupeeValuePerPoint: z.coerce.number().min(0).max(100).optional(),
        minRedeemPoints: z.coerce.number().int().min(0).max(1_000_000).optional(),
        expiryMonths: z.coerce.number().int().min(0).max(120).optional(),
      })
      .optional(),
    offers: z
      .strictObject({
        // Welcome vouchers new app users unlock on registering
        welcomeVouchers: z
          .strictObject({
            enabled: z.boolean().optional(),
            validityDays: z.coerce.number().int().min(1, 'Validity must be at least 1 day').max(365).optional(),
            glass: z
              .strictObject({
                enabled: z.boolean().optional(),
                unlock: z.enum(VOUCHER_UNLOCKS).optional(),
                code: voucherCodeSchema.optional(),
                itemName: z.string().trim().min(2, 'Item name is required').max(60).optional(),
                value: z.coerce.number().min(0, 'Value cannot be negative').max(100_000).optional(),
              })
              .optional(),
            accessories: z
              .strictObject({
                enabled: z.boolean().optional(),
                unlock: z.enum(VOUCHER_UNLOCKS).optional(),
                code: voucherCodeSchema.optional(),
                amount: z.coerce.number().min(0, 'Discount cannot be negative').max(100_000).optional(),
                minBill: z.coerce.number().min(0, 'Minimum cannot be negative').max(10_000_000).optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
    theme: z
      .strictObject({
        customer: themeSectionSchema(THEME_COLOR_KEYS.customer),
        admin: themeSectionSchema(THEME_COLOR_KEYS.admin),
      })
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one setting to update' })
  .refine(
    (obj) => {
      const v = obj.offers?.welcomeVouchers;
      return !(v?.glass?.code && v?.accessories?.code && v.glass.code === v.accessories.code);
    },
    { message: 'The two vouchers need different codes', path: ['offers', 'welcomeVouchers', 'accessories', 'code'] }
  );
