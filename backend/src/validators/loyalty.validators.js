import { z } from 'zod';
import { objectIdSchema, paginationSchema } from './common.js';
import { LOYALTY_SOURCES, LOYALTY_TYPES } from '../models/LoyaltyTransaction.js';

export const adjustPointsSchema = z.strictObject({
  customerId: objectIdSchema,
  type: z.enum(['add', 'deduct'], { error: 'Type must be "add" or "deduct"' }),
  points: z.coerce
    .number({ error: 'Points must be a number' })
    .int('Points must be a whole number')
    .positive('Points must be greater than zero')
    .max(1_000_000, 'Points value is too large'),
  reason: z.string({ error: 'Reason is required' }).trim().min(3, 'Please provide a reason (min 3 characters)').max(250),
});

export const listTransactionsQuerySchema = z.object({
  ...paginationSchema,
  type: z.enum(['all', ...Object.values(LOYALTY_TYPES)]).default('all'),
  source: z.enum(['all', ...Object.values(LOYALTY_SOURCES)]).default('all'),
  // credit = points added, debit = points removed (independent of type)
  direction: z.enum(['all', 'credit', 'debit']).default('all'),
  customerId: objectIdSchema.optional(),
});
