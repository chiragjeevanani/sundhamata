import { z } from 'zod';
import { interestSchema, mobileSchema, nameSchema, optionalBudgetSchema } from './common.js';

export const mobileBodySchema = z.object({ mobile: mobileSchema });

export const registerCustomerSchema = z.object({
  name: nameSchema,
  mobile: mobileSchema,
  interest: interestSchema,
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
