import express from 'express';
import { ApiError } from '../utils/ApiError.js';
import { MAX_BILL_BYTES, MAX_BILL_MB } from '../utils/fileType.js';
import { MAX_IMAGE_BYTES, MAX_IMAGE_MB } from '../services/productImage.service.js';

// The file is sent as the raw request body (the client passes its name as ?filename=).
// Any Content-Type is accepted here on purpose: the real type is detected from the bytes.
const rawUpload = (limit, tooLargeMessage) => {
  const parseRaw = express.raw({ type: () => true, limit });
  return (req, res, next) =>
    parseRaw(req, res, (err) => {
      if (err?.type === 'entity.too.large') return next(new ApiError(413, tooLargeMessage));
      return next(err);
    });
};

export const rawBillUpload = rawUpload(MAX_BILL_BYTES, `File is too large. Maximum size is ${MAX_BILL_MB} MB.`);
export const rawImageUpload = rawUpload(MAX_IMAGE_BYTES, `Image is too large. Maximum size is ${MAX_IMAGE_MB} MB.`);
