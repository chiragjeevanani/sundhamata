import { z } from 'zod';
import { DISCOUNT_TYPES } from '../models/Coupon.js';
import { OFFER_AUDIENCES } from '../models/Offer.js';
import { PURCHASE_CATEGORIES } from '../models/Purchase.js';
import { optionalTextSchema } from './common.js';
import { voucherCodeSchema } from './settings.validators.js';

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

/**
 * Calendar day "YYYY-MM-DD" in store time (IST). `end` makes it the last moment of that day,
 * so an offer "till 31 Oct" works all of 31 October.
 */
const daySchema = (label, { end = false } = {}) =>
  z
    .string({ error: `${label} must be a date (YYYY-MM-DD)` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date (YYYY-MM-DD)`)
    .transform((v, ctx) => {
      const date = new Date(`${v}T${end ? '23:59:59.999' : '00:00:00.000'}+05:30`);
      if (Number.isNaN(date.getTime()) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) {
        ctx.addIssue({ code: 'custom', message: `${label} is not a valid date` });
        return z.NEVER;
      }
      return date;
    });

const offerFields = {
  code: voucherCodeSchema,
  title: optionalTextSchema(60),
  description: optionalTextSchema(200),
  discount: z.strictObject({
    type: z.enum(DISCOUNT_TYPES),
    value: z.coerce.number().positive('Enter the discount').max(1_000_000),
    maxAmount: z.preprocess(emptyToNull, z.coerce.number().positive('Enter the maximum discount').max(1_000_000).nullable()).optional(),
    itemName: optionalTextSchema(60).optional(),
  }),
  appliesTo: z.array(z.enum(PURCHASE_CATEGORIES)).max(PURCHASE_CATEGORIES.length),
  minBillAmount: z.preprocess(emptyToNull, z.coerce.number().min(0, 'Minimum cannot be negative').max(10_000_000).nullable()),
  audience: z.enum(OFFER_AUDIENCES),
  startsAt: daySchema('Start date'),
  endsAt: z.preprocess(emptyToNull, daySchema('End date', { end: true }).nullable()),
  validityDays: z.preprocess(emptyToNull, z.coerce.number().int().min(1, 'At least 1 day').max(3650).nullable()),
  usesPerCustomer: z.coerce.number().int().min(1, 'At least once').max(100),
  totalUses: z.preprocess(emptyToNull, z.coerce.number().int().min(1, 'At least 1').max(1_000_000).nullable()),
  isActive: z.boolean(),
  showInApp: z.boolean(),
};

export const createOfferSchema = z.strictObject({
  code: offerFields.code,
  title: offerFields.title.optional(),
  description: offerFields.description.optional(),
  discount: offerFields.discount,
  appliesTo: offerFields.appliesTo.default([]),
  minBillAmount: offerFields.minBillAmount.optional(),
  audience: offerFields.audience.default('all'),
  startsAt: offerFields.startsAt.optional(),
  endsAt: offerFields.endsAt.optional(),
  validityDays: offerFields.validityDays.optional(),
  usesPerCustomer: offerFields.usesPerCustomer.default(1),
  totalUses: offerFields.totalUses.optional(),
  isActive: offerFields.isActive.default(true),
  showInApp: offerFields.showInApp.default(true),
});

export const updateOfferSchema = z
  .strictObject(Object.fromEntries(Object.entries(offerFields).map(([key, schema]) => [key, schema.optional()])))
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });
