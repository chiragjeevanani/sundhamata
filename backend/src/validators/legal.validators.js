import { z } from 'zod';
import { LEGAL_KEYS, MAX_LEGAL_LENGTH } from '../models/LegalDocument.js';

export const legalKeyParamsSchema = z.strictObject({
  key: z.enum(LEGAL_KEYS, { error: 'Page must be "terms" or "privacy"' }),
});

export const updateLegalSchema = z.strictObject({
  // null or blank = go back to the built-in default text
  content: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .string({ error: 'Content must be text' })
      .max(MAX_LEGAL_LENGTH, `Keep the page under ${MAX_LEGAL_LENGTH.toLocaleString('en-IN')} characters`)
      .transform((v) => v.replace(/\r\n?/g, '\n').trim())
      .nullable()
  ),
});
