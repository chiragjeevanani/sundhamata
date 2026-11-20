import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Inquiry } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_MB } from './productImage.service.js';

// Photo of the problem on a service inquiry (GridFS "inquiryPhotos"). Like customer photos, it is
// served under an unguessable random key (so it works in <img> tags) and kept out of shared caches.

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'inquiryPhotos' });

export const deleteInquiryPhotoFile = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (err) {
    logger.warn({ err, fileId: String(fileId) }, 'Could not delete inquiry photo file');
  }
};

/**
 * Attaches (or replaces) the photo on the customer's own service inquiry.
 * @returns {Promise<object>} the updated inquiry (lean)
 */
export const setInquiryPhoto = async (customerId, inquiryId, buffer) => {
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
  const owned = { _id: inquiryId, customerId, category: 'service' };
  if (!(await Inquiry.exists(owned))) throw ApiError.notFound('Inquiry not found');

  const key = crypto.randomBytes(16).toString('hex');
  const upload = getBucket().openUploadStream(`${key}.${type.exts[0]}`, {
    contentType: type.mime,
    metadata: { inquiryId: String(inquiryId), customerId: String(customerId) },
  });
  await pipeline(Readable.from(buffer), upload);

  const before = await Inquiry.findOneAndUpdate(
    owned,
    { $set: { photo: { key, fileId: upload.id, contentType: type.mime, size: buffer.length, uploadedAt: new Date() } } },
    { returnDocument: 'before', projection: { photo: 1 } }
  ).lean();
  if (!before) {
    await deleteInquiryPhotoFile(upload.id);
    throw ApiError.notFound('Inquiry not found');
  }
  await deleteInquiryPhotoFile(before.photo?.fileId);
  logger.info({ inquiryId: String(inquiryId), size: buffer.length }, 'Inquiry photo added');
  return Inquiry.findById(inquiryId).lean();
};

/** Streams a photo by its random key (no login needed, so it works in <img> tags). */
export const sendInquiryPhoto = async (res, key) => {
  const inquiry = await Inquiry.findOne({ 'photo.key': key }, { photo: 1 }).lean();
  const photo = inquiry?.photo;
  const [file] = photo ? await getBucket().find({ _id: photo.fileId }).limit(1).toArray() : [];
  if (!file) throw ApiError.notFound('Photo not found');

  res.set({
    'Content-Type': photo.contentType,
    'Content-Length': String(file.length),
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  await pipeline(getBucket().openDownloadStream(photo.fileId), res);
};
