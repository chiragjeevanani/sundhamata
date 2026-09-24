import { z } from 'zod';
import { normalizeIndianMobile } from '../utils/mobile.js';
import { isObjectId } from '../utils/query.js';
import { CUSTOMER_INTERESTS } from '../models/Customer.js';

/** Accepts any common Indian mobile formatting and outputs E.164 ("+91XXXXXXXXXX"). */
export const mobileSchema = z
  .union([z.string(), z.number()], { error: 'Mobile number is required' })
  .transform((value, ctx) => {
    const normalized = normalizeIndianMobile(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' });
      return z.NEVER;
    }
    return normalized;
  });

export const objectIdSchema = z.string().refine(isObjectId, { message: 'Invalid id' });

export const nameSchema = z
  .string({ error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80, 'Name must be at most 80 characters')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u, 'Name can only contain letters, spaces, dots, apostrophes and hyphens');

export const interestSchema = z.enum(CUSTOMER_INTERESTS, {
  error: `Interest must be one of: ${CUSTOMER_INTERESTS.join(', ')}`,
});

// Empty string / null from optional form fields → null.
const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

export const optionalBudgetSchema = z.preprocess(
  emptyToNull,
  z.coerce
    .number({ error: 'Budget must be a number' })
    .nonnegative('Budget cannot be negative')
    .max(10_000_000, 'Budget is too large')
    .nullable()
);

export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' ? emptyToNull(v.trim()) : emptyToNull(v)),
  z.email('Enter a valid email address').max(254).toLowerCase().nullable()
);

export const optionalTextSchema = (max) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? emptyToNull(v.trim()) : emptyToNull(v)),
    z.string().max(max, `Must be at most ${max} characters`).nullable()
  );

export const optionalPincodeSchema = z.preprocess(
  (v) => (typeof v === 'string' ? emptyToNull(v.trim()) : emptyToNull(v)),
  z.string().regex(/^[1-9]\d{5}$/, 'Pincode must be a valid 6-digit code').nullable()
);

export const optionalUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' ? emptyToNull(v.trim()) : emptyToNull(v)),
  z.url({ protocol: /^https?$/, error: 'Must be a valid http(s) URL' }).max(500).nullable()
);

export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export const searchSchema = z.string().trim().max(100).optional();

export const idParamsSchema = z.object({ id: objectIdSchema });
