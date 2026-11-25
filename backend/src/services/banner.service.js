import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { BANNER_PLACEMENTS, Banner, MAX_BANNERS_PER_PLACEMENT } from '../models/Banner.js';
import { ApiError } from '../utils/ApiError.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from './productImage.service.js';

// Home screen banners. They are marketing images, so they are served without login under a
// random key (like the startup advertisement poster) and can be cached.

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'banners' });

const deleteFileQuietly = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (err) {
    logger.warn({ err, fileId: String(fileId) }, 'Could not delete banner image file');
  }
};

const imagePath = (banner) => `/banners/images/${banner.image.key}`;

const serializeForAdmin = (banner) => ({
  id: String(banner._id),
  placement: banner.placement,
  title: banner.title ?? null,
  link: banner.link ?? null,
  active: banner.active,
  sortOrder: banner.sortOrder,
  startsAt: banner.startsAt ?? null,
  endsAt: banner.endsAt ?? null,
  image: {
    path: imagePath(banner),
    size: banner.image.size ?? null,
    width: banner.image.width ?? null,
    height: banner.image.height ?? null,
  },
  createdAt: banner.createdAt,
  updatedAt: banner.updatedAt,
});

const byOrder = { placement: 1, sortOrder: 1, createdAt: 1 };

/** Customer app: banners showing right now, in order */
export const listLiveBanners = async (now = new Date()) => {
  const banners = await Banner.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gt: now } }] },
    ],
  })
    .sort(byOrder)
    .lean();
  return banners.map((b) => ({
    id: String(b._id),
    placement: b.placement,
    title: b.title ?? null,
    link: b.link ?? null,
    imagePath: imagePath(b),
    width: b.image.width ?? null,
    height: b.image.height ?? null,
  }));
};

export const listAdminBanners = async () => (await Banner.find().sort(byOrder).lean()).map(serializeForAdmin);

const findOrFail = async (id) => {
  const banner = await Banner.findById(id).lean();
  if (!banner) throw ApiError.notFound('Banner not found');
  return banner;
};

const checkImage = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.unprocessable('No image received', [{ field: 'file', message: 'Choose a banner image to upload' }]);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, `Banner is too large. Maximum size is ${MAX_IMAGE_MB} MB.`);
  }
  const type = IMAGE_TYPES.find((t) => t.matches(buffer, ''));
  if (!type) {
    throw ApiError.unprocessable('Unsupported image type', [{ field: 'file', message: 'Upload a JPG, PNG, WebP or GIF banner' }]);
  }
  return type;
};

const storeImage = async (buffer, type, { width, height }) => {
  const key = crypto.randomBytes(16).toString('hex');
  const upload = getBucket().openUploadStream(`${key}.${type.exts[0]}`, { contentType: type.mime });
  await pipeline(Readable.from(buffer), upload);
  return { key, fileId: upload.id, contentType: type.mime, size: buffer.length, width, height };
};

const checkSchedule = (startsAt, endsAt) => {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'endsAt', message: 'End date must be after the start date' }]);
  }
};

/**
 * New banner from an uploaded image; it goes to the end of its placement.
 * @param {{ placement, width?, height?, title?, link?, active?, startsAt?, endsAt? }} fields
 */
export const createBanner = async (buffer, fields, admin) => {
  const type = checkImage(buffer);
  checkSchedule(fields.startsAt, fields.endsAt);
  const count = await Banner.countDocuments({ placement: fields.placement });
  if (count >= MAX_BANNERS_PER_PLACEMENT) {
    throw ApiError.unprocessable('Too many banners', [
      { field: 'placement', message: `A slot can hold up to ${MAX_BANNERS_PER_PLACEMENT} banners. Delete one first.` },
    ]);
  }
  const last = await Banner.findOne({ placement: fields.placement }).sort({ sortOrder: -1 }).select('sortOrder').lean();
  const image = await storeImage(buffer, type, fields);
  try {
    const banner = await Banner.create({
      placement: fields.placement,
      title: fields.title ?? null,
      link: fields.link ?? null,
      active: fields.active ?? true,
      startsAt: fields.startsAt ?? null,
      endsAt: fields.endsAt ?? null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      image,
      createdBy: admin?._id ?? null,
      updatedBy: admin?._id ?? null,
    });
    logger.info({ adminId: admin?.id, bannerId: banner.id, placement: banner.placement }, 'Banner created');
    return serializeForAdmin(banner.toObject());
  } catch (err) {
    await deleteFileQuietly(image.fileId);
    throw err;
  }
};

/** @param {{ title?, link?, active?, placement?, startsAt?, endsAt? }} patch */
export const updateBanner = async (id, patch, admin) => {
  const current = await findOrFail(id);
  const startsAt = patch.startsAt === undefined ? current.startsAt : patch.startsAt;
  const endsAt = patch.endsAt === undefined ? current.endsAt : patch.endsAt;
  checkSchedule(startsAt, endsAt);

  const set = { ...patch, updatedBy: admin?._id ?? null };
  if (patch.placement && patch.placement !== current.placement) {
    const count = await Banner.countDocuments({ placement: patch.placement });
    if (count >= MAX_BANNERS_PER_PLACEMENT) {
      throw ApiError.unprocessable('Too many banners', [
        { field: 'placement', message: `That slot already has ${MAX_BANNERS_PER_PLACEMENT} banners.` },
      ]);
    }
    const last = await Banner.findOne({ placement: patch.placement }).sort({ sortOrder: -1 }).select('sortOrder').lean();
    set.sortOrder = (last?.sortOrder ?? -1) + 1;
  }
  const banner = await Banner.findByIdAndUpdate(id, { $set: set }, { returnDocument: 'after', runValidators: true }).lean();
  logger.info({ adminId: admin?.id, bannerId: id, ...patch }, 'Banner updated');
  return serializeForAdmin(banner);
};

/** Swaps the image, keeping the banner's settings */
export const replaceBannerImage = async (id, buffer, size, admin) => {
  const type = checkImage(buffer);
  await findOrFail(id);
  const image = await storeImage(buffer, type, size);
  const before = await Banner.findByIdAndUpdate(
    id,
    { $set: { image, updatedBy: admin?._id ?? null } },
    { returnDocument: 'before', projection: { image: 1 } }
  ).lean();
  if (!before) {
    await deleteFileQuietly(image.fileId);
    throw ApiError.notFound('Banner not found');
  }
  await deleteFileQuietly(before.image?.fileId);
  logger.info({ adminId: admin?.id, bannerId: id }, 'Banner image replaced');
  return serializeForAdmin(await findOrFail(id));
};

export const deleteBanner = async (id, admin) => {
  const banner = await Banner.findByIdAndDelete(id).lean();
  if (!banner) throw ApiError.notFound('Banner not found');
  await deleteFileQuietly(banner.image?.fileId);
  logger.info({ adminId: admin?.id, bannerId: id }, 'Banner deleted');
};

/** Sets the order of a placement's banners: ids first to last (must be exactly that placement's banners) */
export const reorderBanners = async (placement, ids, admin) => {
  const existing = await Banner.find({ placement }).select('_id').lean();
  const known = new Set(existing.map((b) => String(b._id)));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'ids', message: 'The list has changed. Reload the page and try again.' },
    ]);
  }
  await Banner.bulkWrite(
    ids.map((id, index) => ({ updateOne: { filter: { _id: id }, update: { $set: { sortOrder: index, updatedBy: admin?._id ?? null } } } }))
  );
  logger.info({ adminId: admin?.id, placement }, 'Banners reordered');
  return listAdminBanners();
};

/** Streams a banner image by its random key (no login: marketing image) */
export const sendBannerImage = async (res, key) => {
  const banner = await Banner.findOne({ 'image.key': key }, { image: 1 }).lean();
  const image = banner?.image;
  const [file] = image ? await getBucket().find({ _id: image.fileId }).limit(1).toArray() : [];
  if (!file) throw ApiError.notFound('Banner not found');

  res.set({
    'Content-Type': image.contentType,
    'Content-Length': String(file.length),
    // The key changes whenever the image is replaced
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  await pipeline(getBucket().openDownloadStream(image.fileId), res);
};

export { BANNER_PLACEMENTS };
