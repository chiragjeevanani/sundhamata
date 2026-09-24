import { z } from 'zod';
import { optionalEmailSchema, optionalTextSchema } from './common.js';

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
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one setting to update' });
