import { z } from 'zod';
import { MAX_AUTO_CLOSE_SECONDS, MAX_SKIP_AFTER_SECONDS } from '../models/StartupAd.js';

const seconds = (label, min, max) =>
  z.coerce
    .number({ error: `${label} must be a number` })
    .int(`${label} must be whole seconds`)
    .min(min, `${label} must be at least ${min} seconds`)
    .max(max, `${label} can be at most ${max} seconds`);

export const updateStartupAdSchema = z
  .strictObject({
    enabled: z.boolean().optional(),
    skipAfterSeconds: seconds('Skip time', 0, MAX_SKIP_AFTER_SECONDS).optional(),
    // "" / null = stays until the customer taps Skip
    autoCloseSeconds: z
      .preprocess((v) => (v === '' ? null : v), seconds('Auto-close time', 1, MAX_AUTO_CLOSE_SECONDS).nullable())
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });
