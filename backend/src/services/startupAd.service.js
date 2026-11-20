import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { STARTUP_AD_KEY, StartupAd } from '../models/StartupAd.js';
import { ApiError } from '../utils/ApiError.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from './productImage.service.js';

// The advertisement poster shown when the customer app opens. It is public (shown before
// sign-in), so the image is served without login under a random key, and can be cached.

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'adPosters' });

const deleteFileQuietly = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (err) {
    logger.warn({ err, fileId: String(fileId) }, 'Could not delete advertisement poster file');
  }
};

const getAd = async () =>
  StartupAd.findOneAndUpdate(
    { key: STARTUP_AD_KEY },
    { $setOnInsert: { key: STARTUP_AD_KEY } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();

const posterPath = (ad) => (ad.poster?.key ? `/startup-ad/posters/${ad.poster.key}` : null);

const serializeForAdmin = (ad) => ({
  enabled: ad.enabled,
  skipAfterSeconds: ad.skipAfterSeconds,
  autoCloseSeconds: ad.autoCloseSeconds ?? null,
  poster: ad.poster?.key ? { path: posterPath(ad), size: ad.poster.size, uploadedAt: ad.poster.uploadedAt } : null,
  // Shown to customers only when switched on and a poster is uploaded
  live: Boolean(ad.enabled && ad.poster?.key),
  updatedAt: ad.updatedAt,
});

/** What the customer app needs at start-up; null when there is nothing to show */
export const getPublicAd = async () => {
  const ad = await getAd();
  if (!ad.enabled || !ad.poster?.key) return null;
  return {
    // Changes with every new poster, so the app can tell posters apart
    id: ad.poster.key,
    posterPath: posterPath(ad),
    skipAfterSeconds: ad.skipAfterSeconds,
    autoCloseSeconds: ad.autoCloseSeconds ?? null,
  };
};

export const getAdminAd = async () => serializeForAdmin(await getAd());

/** @param {{ enabled?, skipAfterSeconds?, autoCloseSeconds? }} patch */
export const updateAd = async (patch, admin) => {
  const current = await getAd();
  const skipAfter = patch.skipAfterSeconds ?? current.skipAfterSeconds;
  const autoClose = patch.autoCloseSeconds === undefined ? current.autoCloseSeconds : patch.autoCloseSeconds;
  if (autoClose !== null && autoClose !== undefined && autoClose < skipAfter) {
    throw ApiError.unprocessable('Validation failed', [
      { field: 'autoCloseSeconds', message: 'Close it automatically no earlier than the Skip button appears' },
    ]);
  }
  if (patch.enabled && !current.poster?.key) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'enabled', message: 'Upload a poster first' }]);
  }
  const ad = await StartupAd.findOneAndUpdate(
    { key: STARTUP_AD_KEY },
    { $set: { ...patch, updatedBy: admin?._id ?? null } },
    { returnDocument: 'after', runValidators: true }
  ).lean();
  logger.info({ adminId: admin?.id, ...patch }, 'Startup advertisement updated');
  return serializeForAdmin(ad);
};

export const setPoster = async (buffer, admin) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.unprocessable('No image received', [{ field: 'file', message: 'Choose a poster to upload' }]);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, `Poster is too large. Maximum size is ${MAX_IMAGE_MB} MB.`);
  }
  const type = IMAGE_TYPES.find((t) => t.matches(buffer, ''));
  if (!type) {
    throw ApiError.unprocessable('Unsupported image type', [{ field: 'file', message: 'Upload a JPG, PNG, WebP or GIF poster' }]);
  }
  await getAd();

  const key = crypto.randomBytes(16).toString('hex');
  const upload = getBucket().openUploadStream(`${key}.${type.exts[0]}`, { contentType: type.mime });
  await pipeline(Readable.from(buffer), upload);

  const before = await StartupAd.findOneAndUpdate(
    { key: STARTUP_AD_KEY },
    {
      $set: {
        poster: { key, fileId: upload.id, contentType: type.mime, size: buffer.length, uploadedAt: new Date() },
        updatedBy: admin?._id ?? null,
      },
    },
    { returnDocument: 'before', projection: { poster: 1 } }
  ).lean();
  await deleteFileQuietly(before?.poster?.fileId);
  logger.info({ adminId: admin?.id, size: buffer.length }, 'Startup advertisement poster uploaded');
  return getAdminAd();
};

/** Removes the poster, which also stops showing the advertisement */
export const removePoster = async (admin) => {
  const ad = await getAd();
  if (!ad.poster?.fileId) throw ApiError.notFound('No poster to remove');
  await StartupAd.updateOne(
    { key: STARTUP_AD_KEY, 'poster.fileId': ad.poster.fileId },
    { $unset: { poster: 1 }, $set: { enabled: false, updatedBy: admin?._id ?? null } }
  );
  await deleteFileQuietly(ad.poster.fileId);
  logger.info({ adminId: admin?.id }, 'Startup advertisement poster removed');
  return getAdminAd();
};

/** Streams the poster by its random key (no login: it shows before sign-in). */
export const sendPoster = async (res, key) => {
  const ad = await StartupAd.findOne({ 'poster.key': key }, { poster: 1 }).lean();
  const poster = ad?.poster;
  const [file] = poster ? await getBucket().find({ _id: poster.fileId }).limit(1).toArray() : [];
  if (!file) throw ApiError.notFound('Poster not found');

  res.set({
    'Content-Type': poster.contentType,
    'Content-Length': String(file.length),
    // Public marketing image; the key changes whenever the poster is replaced
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  await pipeline(getBucket().openDownloadStream(poster.fileId), res);
};
