import { z } from 'zod';
import { objectIdSchema, optionalTextSchema, paginationSchema, searchSchema } from './common.js';
import { PAYMENT_METHODS, PAYMENT_STATUSES, PURCHASE_CATEGORIES } from '../models/Purchase.js';

const MAX_AMOUNT = 10_000_000; // ₹1 crore per invoice — guards against typos

const rupees = (label) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .refine(Number.isFinite, `${label} must be a number`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, `${label} can have at most 2 decimal places`)
    .max(MAX_AMOUNT, `${label} is too large`);

const imeiSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') || null : v ?? null),
  z.string().regex(/^\d{15}$/, 'IMEI must be exactly 15 digits').nullable()
);

const serialNumberSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim() || null : v ?? null),
  z
    .string()
    .regex(/^[A-Za-z0-9-]{4,30}$/, 'Serial number must be 4-30 letters, digits or hyphens')
    .nullable()
);

const productSchema = z.strictObject({
  name: z.string({ error: 'Product name is required' }).trim().min(2, 'Product name is required').max(120),
  brand: optionalTextSchema(40).optional(),
  model: optionalTextSchema(80).optional(),
  variant: optionalTextSchema(80).optional(),
  color: optionalTextSchema(40).optional(),
  imei: imeiSchema.optional(),
  serialNumber: serialNumberSchema.optional(),
  quantity: z.coerce.number().int().min(1).max(100).default(1),
});

const paymentMethodSchema = z.enum(PAYMENT_METHODS, {
  error: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}`,
});

const editablePaymentStatuses = PAYMENT_STATUSES.filter((s) => s !== 'Cancelled');
const paymentStatusSchema = z.enum(editablePaymentStatuses, {
  error: `Payment status must be one of: ${editablePaymentStatuses.join(', ')} (use the cancel endpoint to cancel)`,
});

const purchaseDateSchema = z.coerce
  .date({ error: 'Purchase date must be a valid date' })
  .refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, 'Purchase date cannot be in the future')
  .refine((d) => d.getFullYear() >= 2000, 'Purchase date is too far in the past');

export const invoiceNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9/-]{2,29}$/, 'Invoice number must be 3-30 letters, digits, "-" or "/"');

// NOTE: loyalty points are intentionally NOT accepted — the server calculates them.
// Unknown keys (e.g. "pointsEarned", "loyalty") are rejected rather than silently ignored.
export const createPurchaseSchema = z
  .strictObject({
    customerId: objectIdSchema,
    category: z.enum(PURCHASE_CATEGORIES).default('phones'),
    product: productSchema,
    purchaseDate: purchaseDateSchema.optional(),
    invoiceNumber: z.preprocess((v) => (v === '' ? undefined : v), invoiceNumberSchema.optional()),
    payment: z.strictObject({
      method: paymentMethodSchema,
      status: paymentStatusSchema.default('Paid'),
    }),
    pricing: z.strictObject({
      purchaseAmount: rupees('Purchase amount').refine((v) => v > 0, 'Purchase amount must be greater than zero'),
      discount: rupees('Discount').refine((v) => v >= 0, 'Discount cannot be negative').default(0),
    }),
    notes: optionalTextSchema(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.pricing.discount > data.pricing.purchaseAmount) {
      ctx.addIssue({
        code: 'custom',
        path: ['pricing', 'discount'],
        message: 'Discount cannot be greater than the purchase amount',
      });
    }
  });

// Pricing is immutable after billing (loyalty was awarded on it). To correct
// a price, cancel the purchase (which reverses the points) and record it again.
export const updatePurchaseSchema = z
  .strictObject({
    category: z.enum(PURCHASE_CATEGORIES).optional(),
    product: productSchema.partial().omit({ quantity: true }).optional(),
    payment: z
      .strictObject({ method: paymentMethodSchema.optional(), status: paymentStatusSchema.optional() })
      .optional(),
    notes: optionalTextSchema(500).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const cancelPurchaseSchema = z.object({
  reason: z.string().trim().min(3, 'Please provide a cancellation reason').max(250).default('Cancelled by store administrator'),
});

const statusFilter = z.enum(['all', 'Purchased', 'Cancelled']).default('all');
const paymentStatusFilter = z.enum(['all', ...PAYMENT_STATUSES]).default('all');
const categoryFilter = z.enum(['all', ...PURCHASE_CATEGORIES]).default('all');

export const listPurchasesQuerySchema = z
  .object({
    ...paginationSchema,
    search: searchSchema,
    status: statusFilter,
    paymentStatus: paymentStatusFilter,
    category: categoryFilter,
    customerId: objectIdSchema.optional(),
    from: z.coerce.date({ error: '"from" must be a valid date' }).optional(),
    to: z.coerce.date({ error: '"to" must be a valid date' }).optional(),
    sort: z.enum(['purchaseDate', '-purchaseDate', 'createdAt', '-createdAt']).default('-purchaseDate'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: '"from" must be before "to"', path: ['from'] });

export const customerPurchasesQuerySchema = z.object({
  ...paginationSchema,
  search: searchSchema,
  category: categoryFilter,
});
