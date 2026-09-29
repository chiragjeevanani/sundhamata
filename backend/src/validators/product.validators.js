import { z } from 'zod';
import { PURCHASE_CATEGORIES } from '../models/Purchase.js';
import { optionalTextSchema, paginationSchema, searchSchema } from './common.js';

const nameSchema = z.string({ error: 'Product name is required' }).trim().min(2, 'Product name is required').max(120);
const optionalMoney = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number().min(0, 'Price cannot be negative').max(10_000_000).nullable()
);

const productFields = {
  category: z.enum(PURCHASE_CATEGORIES),
  brand: optionalTextSchema(40),
  model: optionalTextSchema(80),
  lastPrice: optionalMoney,
  warrantyMonths: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(120).nullable()
  ),
};

export const listProductsQuerySchema = z.object({
  ...paginationSchema,
  search: searchSchema,
  category: z.enum(['all', ...PURCHASE_CATEGORIES]).default('all'),
});

export const createProductSchema = z.strictObject({
  name: nameSchema,
  category: productFields.category.default('phones'),
  brand: productFields.brand.optional(),
  model: productFields.model.optional(),
  lastPrice: productFields.lastPrice.optional(),
  warrantyMonths: productFields.warrantyMonths.optional(),
});

export const updateProductSchema = z
  .strictObject({
    name: nameSchema.optional(),
    category: productFields.category.optional(),
    brand: productFields.brand.optional(),
    model: productFields.model.optional(),
    lastPrice: productFields.lastPrice.optional(),
    warrantyMonths: productFields.warrantyMonths.optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });
