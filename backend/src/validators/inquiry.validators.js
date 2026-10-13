import { z } from 'zod';
import { INQUIRY_CATEGORIES, INQUIRY_STATUSES } from '../models/Inquiry.js';
import { optionalBudgetSchema, optionalTextSchema, paginationSchema, searchSchema } from './common.js';

export const createInquirySchema = z.strictObject({
  category: z.enum(INQUIRY_CATEGORIES, { error: `Choose one of: ${INQUIRY_CATEGORIES.join(', ')}` }),
  budget: optionalBudgetSchema.optional(),
  message: z
    .string({ error: 'Please tell us what you are looking for' })
    .trim()
    .min(3, 'Please tell us what you are looking for (min 3 characters)')
    .max(1000, 'Must be at most 1000 characters'),
});

export const updateInquirySchema = z
  .strictObject({
    status: z.enum(INQUIRY_STATUSES).optional(),
    adminNote: optionalTextSchema(500).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const listInquiriesQuerySchema = z.object({
  ...paginationSchema,
  search: searchSchema,
  status: z.enum(['all', ...INQUIRY_STATUSES]).default('all'),
  category: z.enum(['all', ...INQUIRY_CATEGORIES]).default('all'),
});
