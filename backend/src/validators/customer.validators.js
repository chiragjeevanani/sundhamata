import { z } from 'zod';
import {
  interestSchema,
  mobileSchema,
  nameSchema,
  optionalBudgetSchema,
  optionalEmailSchema,
  optionalPincodeSchema,
  optionalTextSchema,
  optionalUrlSchema,
  paginationSchema,
  searchSchema,
} from './common.js';

const profileFields = {
  email: optionalEmailSchema.optional(),
  address: optionalTextSchema(250).optional(),
  city: optionalTextSchema(80).optional(),
  pincode: optionalPincodeSchema.optional(),
  budget: optionalBudgetSchema.optional(),
};

const requireAtLeastOneField = (obj) => Object.keys(obj).length > 0;

// Customer self-service. Mobile (needs OTP re-verification) and loyalty points
// (ledger-controlled) are deliberately not updatable here — unknown keys are rejected.
export const updateMyProfileSchema = z
  .strictObject({
    name: nameSchema.optional(),
    interest: interestSchema.optional(),
    profileImage: optionalUrlSchema.optional(),
    ...profileFields,
  })
  .refine(requireAtLeastOneField, { message: 'Provide at least one field to update' });

export const adminCreateCustomerSchema = z.strictObject({
  name: nameSchema,
  mobile: mobileSchema,
  interest: interestSchema,
  ...profileFields,
});

export const adminUpdateCustomerSchema = z
  .strictObject({
    name: nameSchema.optional(),
    mobile: mobileSchema.optional(),
    interest: interestSchema.optional(),
    isActive: z.boolean().optional(),
    ...profileFields,
  })
  .refine(requireAtLeastOneField, { message: 'Provide at least one field to update' });

export const CUSTOMER_SORT_FIELDS = ['createdAt', 'name', 'loyaltyPoints'];

export const listCustomersQuerySchema = z.object({
  ...paginationSchema,
  search: searchSchema,
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  sort: z
    .enum(CUSTOMER_SORT_FIELDS.flatMap((f) => [f, `-${f}`]))
    .default('-createdAt'),
});
