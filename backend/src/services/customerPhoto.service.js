import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Customer } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from './productImage.service.js';

// Customer profile photos (GridFS "customerPhotos"), used by the store to recognise customers.
// They load in plain <img> tags on another origin, so — like product photos — they are served
// under an unguessable random key that changes on every replacement. Unlike product photos
// they are personal data: marked private so shared caches / CDNs never keep a copy.

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'customerPhotos' });

const deleteFileQuietly = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (err) {
    logger.warn({ err, fileId: String(fileId) }, 'Could not delete customer photo file');
  }
};

/**
 * Sets (or replaces) a customer's photo.
 * @param {string} customerId
 * @param {Buffer} buffer raw image bytes
 * @param {{ by: 'customer'|'admin', actorId: string }} actor who uploaded it (for the log)
 * @returns {Promise<object>} the updated customer document
 */
export const setCustomerPhoto = async (customerId, buffer, actor) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.unprocessable('No image received', [{ field: 'file', message: 'Choose a photo to upload' }]);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, `Photo is too large. Maximum size is ${MAX_IMAGE_MB} MB.`);
  }
  const type = IMAGE_TYPES.find((t) => t.matches(buffer, ''));
  if (!type) {
    throw ApiError.unprocessable('Unsupported image type', [{ field: 'file', message: 'Upload a JPG, PNG, WebP or GIF photo' }]);
  }
  if (!(await Customer.exists({ _id: customerId }))) throw ApiError.notFound('Customer not found');

  const key = crypto.randomBytes(16).toString('hex');
  const upload = getBucket().openUploadStream(`${key}.${type.exts[0]}`, { contentType: type.mime, metadata: { customerId } });
  await pipeline(Readable.from(buffer), upload);

  const before = await Customer.findOneAndUpdate(
    { _id: customerId },
    {
      $set: {
        photo: { key, fileId: upload.id, contentType: type.mime, size: buffer.length, uploadedAt: new Date(), uploadedBy: actor.by },
      },
    },
    { returnDocument: 'before', projection: { photo: 1 } }
  ).lean();
  if (!before) {
    await deleteFileQuietly(upload.id);
    throw ApiError.notFound('Customer not found');
  }
  await deleteFileQuietly(before.photo?.fileId);
  logger.info({ customerId, by: actor.by, actorId: actor.actorId, size: buffer.length }, 'Customer photo updated');
  return Customer.findById(customerId);
};

export const removeCustomerPhoto = async (customerId, actor) => {
  const customer = await Customer.findById(customerId, { photo: 1 }).lean();
  if (!customer) throw ApiError.notFound('Customer not found');
  if (!customer.photo?.fileId) throw ApiError.notFound('No photo to remove');
  await Customer.updateOne({ _id: customerId, 'photo.fileId': customer.photo.fileId }, { $unset: { photo: 1 } });
  await deleteFileQuietly(customer.photo.fileId);
  logger.info({ customerId, by: actor.by, actorId: actor.actorId }, 'Customer photo removed');
  return Customer.findById(customerId);
};

/** Streams a photo by its random key (no login needed, so it works in <img> tags). */
export const sendCustomerPhoto = async (res, key) => {
  const customer = await Customer.findOne({ 'photo.key': key }, { photo: 1 }).lean();
  const photo = customer?.photo;
  const [file] = photo ? await getBucket().find({ _id: photo.fileId }).limit(1).toArray() : [];
  if (!file) throw ApiError.notFound('Photo not found');

  res.set({
    'Content-Type': photo.contentType,
    'Content-Length': String(file.length),
    // The key changes on every replacement; "private" keeps it out of shared caches
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  await pipeline(getBucket().openDownloadStream(photo.fileId), res);
};
