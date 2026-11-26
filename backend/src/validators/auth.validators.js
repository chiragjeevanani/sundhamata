import { z } from 'zod';
import { mobileSchema, nameSchema, optionalBudgetSchema, optionalInterestSchema } from './common.js';

export const mobileBodySchema = z.object({ mobile: mobileSchema });

export const registerCustomerSchema = z.object({
  name: nameSchema,
  mobile: mobileSchema,
  interest: optionalInterestSchema.optional(),
  budget: optionalBudgetSchema.optional(),
});

export const verifyOtpSchema = z.object({
  mobile: mobileSchema,
  otp: z
    .union([z.string(), z.number()], { error: 'OTP is required' })
    .transform((v) => String(v).trim())
    .pipe(z.string().regex(/^\d{6}$/, 'OTP must be 6 digits')),
});

export const adminLoginSchema = z
  .object({
    identifier: z.string().trim().min(1).max(254).optional(),
    email: z.string().trim().min(1).max(254).optional(),
    mobile: z.string().trim().min(1).max(20).optional(),
    password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
  })
  .transform(({ identifier, email, mobile, password }) => ({
    identifier: identifier ?? email ?? mobile,
    password,
  }))
  .refine((v) => Boolean(v.identifier), {
    message: 'Email or mobile number is required',
    path: ['identifier'],
  });

// ---- My Account (signed-in admin) -------------------------------------------

const currentPasswordSchema = z.string({ error: 'Current password is required' }).max(128);

export const updateOwnAdminSchema = z
  .strictObject({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be at most 80 characters').optional(),
    email: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.email('Enter a valid email address').max(254).toLowerCase()).optional(),
    // "" / null = remove the mobile number (then sign in with the email)
    mobile: z.preprocess((v) => (v === '' ? null : v), mobileSchema.nullable()).optional(),
    currentPassword: currentPasswordSchema.optional(),
  })
  .refine((o) => o.name !== undefined || o.email !== undefined || o.mobile !== undefined, {
    message: 'Provide at least one field to update',
  });

export const changeOwnPasswordSchema = z.strictObject({
  currentPassword: currentPasswordSchema.min(1, 'Current password is required'),
  newPassword: z
    .string({ error: 'New password is required' })
    .min(8, 'Use at least 8 characters')
    .max(128, 'Use at most 128 characters')
    .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use letters and at least one number'),
});
