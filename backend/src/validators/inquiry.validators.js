import { z } from 'zod';
import {
  ACCESSORY_TYPES,
  INQUIRY_CATEGORIES,
  INQUIRY_STATUSES,
  MOBILE_FEATURES,
  SERVICE_DEVICES,
  SERVICE_PREFERENCES,
} from '../models/Inquiry.js';
import { optionalBudgetSchema, optionalTextSchema, paginationSchema, searchSchema } from './common.js';

const answer = (label) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(60, `${label} is too long`);

export const createInquirySchema = z
  .strictObject({
    category: z.enum(INQUIRY_CATEGORIES, { error: `Choose one of: ${INQUIRY_CATEGORIES.join(', ')}` }),
    budget: optionalBudgetSchema.optional(),
    message: z.string().trim().max(1000, 'Must be at most 1000 characters').optional(),
    // Mobile inquiries: brand, RAM & ROM, and the additional-requirement picks
    mobile: z
      .strictObject({
        brand: answer('Brand'),
        ramRom: answer('RAM & ROM'),
        features: z.array(z.enum(MOBILE_FEATURES)).max(MOBILE_FEATURES.length).default([]),
      })
      .optional(),
    // Accessories inquiries: type, item, optional brand / device, quantity
    accessories: z
      .strictObject({
        type: z.enum(ACCESSORY_TYPES, { error: 'Choose the accessories type' }),
        item: answer('What you need'),
        brandPreference: optionalTextSchema(60).optional(),
        device: optionalTextSchema(80).optional(),
        quantity: z.coerce
          .number({ error: 'Quantity must be a number' })
          .int('Quantity must be a whole number')
          .min(1, 'Quantity must be at least 1')
          .max(1000, 'Quantity is too large')
          .default(1),
      })
      .optional(),
    // Service inquiries: device, brand & model, problem, details, service preference
    service: z
      .strictObject({
        device: z.enum(SERVICE_DEVICES, { error: 'Choose mobile or computer' }),
        brandModel: answer('Brand & model'),
        problem: answer('Problem'),
        details: optionalTextSchema(1000).optional(),
        preference: z.enum(SERVICE_PREFERENCES, { error: 'Choose how you want it serviced' }),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    const needBudget = () => {
      if (v.budget === null || v.budget === undefined) {
        ctx.addIssue({ code: 'custom', path: ['budget'], message: 'Please enter your budget' });
      }
    };
    if (v.category === 'mobile') {
      if (!v.mobile) ctx.addIssue({ code: 'custom', path: ['mobile'], message: 'Tell us the brand and RAM & ROM you need' });
      needBudget();
    } else if (v.category === 'accessories') {
      if (!v.accessories) {
        ctx.addIssue({ code: 'custom', path: ['accessories'], message: 'Tell us the accessories type and what you need' });
      }
      needBudget();
    } else if (v.category === 'service' && !v.service) {
      ctx.addIssue({ code: 'custom', path: ['service'], message: 'Tell us the device, problem and service preference' });
    }
  })
  // Each inquiry keeps only the answers for its own type
  .transform((v) => ({
    ...v,
    mobile: v.category === 'mobile' ? v.mobile : undefined,
    accessories: v.category === 'accessories' ? v.accessories : undefined,
    service: v.category === 'service' ? v.service : undefined,
    message: v.message || null,
  }));

export const updateInquirySchema = z
  .strictObject({
    status: z.enum(INQUIRY_STATUSES).optional(),
    adminNote: optionalTextSchema(500).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const listInquiriesQuerySchema = z.object({
  ...paginationSchema,
  search: searchSchema,
  // "open" = new or contacted (Admin → Leads)
  status: z.enum(['all', 'open', ...INQUIRY_STATUSES]).default('all'),
  category: z.enum(['all', ...INQUIRY_CATEGORIES]).default('all'),
});
