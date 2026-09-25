import express from 'express';
import { ApiError } from '../utils/ApiError.js';
import { MAX_BILL_BYTES, MAX_BILL_MB } from '../utils/fileType.js';

// The file is sent as the raw request body (the client passes its name as ?filename=).
// Any Content-Type is accepted here on purpose: the real type is detected from the bytes.
const parseRaw = express.raw({ type: () => true, limit: MAX_BILL_BYTES });

export const rawBillUpload = (req, res, next) =>
  parseRaw(req, res, (err) => {
    if (err?.type === 'entity.too.large') {
      return next(new ApiError(413, `File is too large. Maximum size is ${MAX_BILL_MB} MB.`));
    }
    return next(err);
  });
