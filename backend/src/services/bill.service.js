import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Purchase } from '../models/index.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';
import { ApiError } from '../utils/ApiError.js';
import {
  ALLOWED_BILL_EXTENSIONS,
  attachmentDisposition,
  buildBillFilename,
  detectBillType,
  MAX_BILL_BYTES,
  MAX_BILL_MB,
} from '../utils/fileType.js';

// Bill files live in MongoDB GridFS (collections bills.files / bills.chunks), so they
// persist across deploys on hosts with ephemeral disks and need no extra service.
const getBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'bills' });

const deleteFileQuietly = async (fileId) => {
  if (!fileId) return;
  try {
    await getBucket().delete(fileId);
  } catch (err) {
    // Already gone, or a transient error — an orphaned file is harmless, so never fail the request.
    logger.warn({ err, fileId: String(fileId) }, 'Could not delete bill file');
  }
};

/** Deletes a bill file once no purchase line refers to it any more (a bill is shared by its lines). */
const deleteIfUnused = async (fileId) => {
  if (!fileId) return;
  if (await Purchase.exists({ 'bill.fileId': fileId })) return;
  await deleteFileQuietly(fileId);
};

/** Active lines of the bill this purchase is on (a purchase without `order` is a bill of its own). */
const activeLinesFilter = (purchase) =>
  purchase.order?.id
    ? { 'order.id': purchase.order.id, status: PURCHASE_STATUSES.PURCHASED }
    : { _id: purchase._id, status: PURCHASE_STATUSES.PURCHASED };

const storeFile = async (buffer, filename, contentType, purchaseId) => {
  const upload = getBucket().openUploadStream(filename, { contentType, metadata: { purchaseId } });
  await pipeline(Readable.from(buffer), upload);
  return upload.id;
};

/**
 * Attaches (or replaces) the bill of a purchase — for every product on the same bill.
 * @param {string} purchaseId
 * @param {Buffer|undefined} buffer raw file bytes
 * @param {string|undefined} rawName client-supplied file name
 * @param {object} admin authenticated admin
 */
export const attachBill = async (purchaseId, buffer, rawName, admin) => {
  const purchase = await Purchase.findById(purchaseId, { status: 1, order: 1 }).lean();
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.status === PURCHASE_STATUSES.CANCELLED) {
    throw ApiError.conflict('Bills cannot be changed on a cancelled purchase');
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw ApiError.unprocessable('No file received', [{ field: 'file', message: 'Choose a file to upload' }]);
  }
  if (buffer.length > MAX_BILL_BYTES) {
    throw new ApiError(413, `File is too large. Maximum size is ${MAX_BILL_MB} MB.`);
  }

  const type = detectBillType(buffer, rawName);
  if (!type) {
    throw ApiError.unprocessable('Unsupported file type', [
      {
        field: 'file',
        message: `Upload a PDF, image (JPG, PNG, WebP, GIF, HEIC), Word or Excel file (${ALLOWED_BILL_EXTENSIONS.join(', ')})`,
      },
    ]);
  }

  const filename = buildBillFilename(rawName, type);
  const fileId = await storeFile(buffer, filename, type.mime, purchaseId);

  let previousFileIds;
  try {
    // Only lines that are still active receive the bill (guards against a concurrent cancel).
    const filter = activeLinesFilter(purchase);
    previousFileIds = (await Purchase.find(filter, { 'bill.fileId': 1 }).lean())
      .map((line) => line.bill?.fileId)
      .filter(Boolean);
    const { modifiedCount } = await Purchase.updateMany(filter, {
      $set: {
        bill: {
          fileId,
          filename,
          contentType: type.mime,
          size: buffer.length,
          uploadedAt: new Date(),
          uploadedBy: admin._id,
        },
      },
    });
    if (!modifiedCount) throw ApiError.conflict('Bills cannot be changed on a cancelled purchase');
  } catch (err) {
    await deleteFileQuietly(fileId);
    throw err;
  }

  for (const oldId of new Set(previousFileIds.map(String))) {
    await deleteIfUnused(previousFileIds.find((id) => String(id) === oldId));
  }
  logger.info(
    { purchaseId, adminId: admin.id, contentType: type.mime, size: buffer.length, replaced: previousFileIds.length > 0 },
    'Purchase bill uploaded'
  );
};

export const removeBill = async (purchaseId, admin) => {
  const purchase = await Purchase.findById(purchaseId, { status: 1, bill: 1, order: 1 }).lean();
  if (!purchase) throw ApiError.notFound('Purchase not found');
  if (purchase.status === PURCHASE_STATUSES.CANCELLED) {
    throw ApiError.conflict('Bills cannot be changed on a cancelled purchase');
  }
  if (!purchase.bill?.fileId) throw ApiError.notFound('No bill is attached to this purchase');

  // Removed from every active product of the bill
  await Purchase.updateMany(
    { ...activeLinesFilter(purchase), 'bill.fileId': purchase.bill.fileId },
    { $unset: { bill: 1 } }
  );
  await deleteIfUnused(purchase.bill.fileId);
  logger.info({ purchaseId, adminId: admin.id }, 'Purchase bill removed');
};

/**
 * Streams a purchase's bill as a download. With `customerId` the purchase must belong to
 * that customer; someone else's purchase is a 404, exactly like a purchase that doesn't exist.
 */
export const sendBill = async (res, { purchaseId, customerId }) => {
  const filter = customerId ? { _id: purchaseId, customerId } : { _id: purchaseId };
  const purchase = await Purchase.findOne(filter, { bill: 1 }).lean();
  if (!purchase) throw ApiError.notFound('Purchase not found');

  const bill = purchase.bill;
  if (!bill?.fileId) throw ApiError.notFound('No bill has been uploaded for this purchase');

  const bucket = getBucket();
  const [file] = await bucket.find({ _id: bill.fileId }).limit(1).toArray();
  if (!file) throw ApiError.notFound('The bill file is no longer available');

  res.set({
    'Content-Type': bill.contentType,
    'Content-Length': String(file.length),
    'Content-Disposition': attachmentDisposition(bill.filename),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  await pipeline(bucket.openDownloadStream(bill.fileId), res);
};
