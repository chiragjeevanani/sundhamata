import { z } from 'zod';
import { BANNER_PLACEMENTS, MAX_BANNER_LINK, MAX_BANNER_TITLE } from '../models/Banner.js';
import { objectIdSchema } from './common.js';

const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

const placement = z.enum(BANNER_PLACEMENTS, { error: 'Slot must be "top" or "middle"' });

const title = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(MAX_BANNER_TITLE, `Title can be at most ${MAX_BANNER_TITLE} characters`).nullable()
);

// An app screen ("/coupons", "/inquiry?type=mobile") or a website (http / https only)
const link = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v),
  z
    .string()
    .max(MAX_BANNER_LINK, `Link can be at most ${MAX_BANNER_LINK} characters`)
    .refine((v) => {
      if (/^\/(?![/\\])\S*$/.test(v)) return true;
      try {
        const url = new URL(v);
        return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
        return false;
      }
    }, 'Link must be an app screen like /coupons, or a website starting with https://')
    .nullable()
);

const date = (label) =>
  z.preprocess(
    emptyToNull,
    z.coerce.date({ error: `${label} is not a valid date` }).nullable()
  );

const boolString = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());

const dimension = z.coerce.number().int().min(1).max(20_000).optional();

/** Query string of POST /admin/banners (the body is the image) */
export const createBannerQuerySchema = z.strictObject({
  placement,
  width: dimension,
  height: dimension,
  title: title.optional(),
  link: link.optional(),
  active: boolString.optional(),
  startsAt: date('Start date').optional(),
  endsAt: date('End date').optional(),
});

/** Query string of POST /admin/banners/:id/image */
export const bannerImageQuerySchema = z.strictObject({ width: dimension, height: dimension });

export const updateBannerSchema = z
  .strictObject({
    placement: placement.optional(),
    title: title.optional(),
    link: link.optional(),
    active: z.boolean().optional(),
    startsAt: date('Start date').optional(),
    endsAt: date('End date').optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Provide at least one field to update' });

export const reorderBannersSchema = z.strictObject({
  placement,
  ids: z.array(objectIdSchema).min(1).max(50),
});
