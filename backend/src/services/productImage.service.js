import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Purchase } from '../models/index.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';
import { ApiError } from '../utils/ApiError.js';
import { BILL_TYPES } from '../utils/fileType.js';

// Product photos live in GridFS (productImages.files / .chunks), like bills.
// Unlike bills, a product photo is not personal data and has to load inside plain
// <img> tags on another origin, so it is served publicly under an unguessable
// random key that changes whenever the photo is replaced.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);
// Formats every browser can display (HEIC is excluded for that reason).
const IMAGE_TYPES = BILL_TYPES.filter((t) => ['jpeg', 'png', 'webp', 'gif'].includes(t.key));

const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'productImages' });

const deleteFileQuietly = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (err) {
    logger.warn({ err, fileId: String(fileId) }, 'Could not delete product image file');
  }
};

const assertEditable = (purchase) => {
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.status === PURCHASE_STATUSES.CANCELLED) {
    throw ApiError.conflict('The product image cannot be changed on a cancelled purchase');
  }
};

/** Attaches (or replaces) the product photo of a purchase. */
export const attachProductImage = async (purchaseId, buffer, admin) => {
  assertEditable(await Purchase.findById(purchaseId, { status: 1 }).lean());

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.unprocessable('No image received', [{ field: 'file', message: 'Choose an image to upload' }]);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, `Image is too large. Maximum size is ${MAX_IMAGE_MB} MB.`);
  }
  const type = IMAGE_TYPES.find((t) => t.matches(buffer, ''));
  if (!type) {
    throw ApiError.unprocessable('Unsupported image type', [
      { field: 'file', message: 'Upload a JPG, PNG, WebP or GIF image' },
    ]);
  }

  const key = crypto.randomBytes(16).toString('hex');
  const upload = getBucket().openUploadStream(`${key}.${type.exts[0]}`, { contentType: type.mime, metadata: { purchaseId } });
  await pipeline(Readable.from(buffer), upload);
  const fileId = upload.id;

  let previous;
  try {
    previous = await Purchase.findOneAndUpdate(
      { _id: purchaseId, status: PURCHASE_STATUSES.PURCHASED },
      {
        $set: {
          productImage: { key, fileId, contentType: type.mime, size: buffer.length, uploadedAt: new Date(), uploadedBy: admin._id },
        },
      },
      { returnDocument: 'before', projection: { productImage: 1 } }
    ).lean();
    if (!previous) throw ApiError.conflict('The product image cannot be changed on a cancelled purchase');
  } catch (err) {
    await deleteFileQuietly(fileId);
    throw err;
  }

  await deleteFileQuietly(previous.productImage?.fileId);
  logger.info({ purchaseId, adminId: admin.id, contentType: type.mime, size: buffer.length }, 'Product image uploaded');
};

export const removeProductImage = async (purchaseId, admin) => {
  const purchase = await Purchase.findById(purchaseId, { status: 1, productImage: 1 }).lean();
  assertEditable(purchase);
  if (!purchase.productImage?.fileId) throw ApiError.notFound('No product image is attached to this purchase');

  await Purchase.updateOne({ _id: purchaseId, 'productImage.fileId': purchase.productImage.fileId }, { $unset: { productImage: 1 } });
  await deleteFileQuietly(purchase.productImage.fileId);
  logger.info({ purchaseId, adminId: admin.id }, 'Product image removed');
};

/** Public: streams an image by its random key. */
export const sendProductImage = async (res, key) => {
  const purchase = await Purchase.findOne({ 'productImage.key': key }, { productImage: 1 }).lean();
  const image = purchase?.productImage;
  const [file] = image ? await getBucket().find({ _id: image.fileId }).limit(1).toArray() : [];
  if (!file) throw ApiError.notFound('Image not found');

  res.set({
    'Content-Type': image.contentType,
    'Content-Length': String(file.length),
    // The key changes on every replacement, so the content behind a URL never changes.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // Loaded by the frontend on another origin (Vercel)
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  await pipeline(getBucket().openDownloadStream(image.fileId), res);
};
