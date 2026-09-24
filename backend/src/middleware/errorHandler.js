import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

const DUPLICATE_KEY_MESSAGES = {
  mobile: 'A customer with this mobile number already exists',
  invoiceNumber: 'A purchase with this invoice number already exists',
  email: 'This email is already in use',
  customerCode: 'Customer code collision, please retry',
};

const toApiError = (err) => {
  if (err instanceof ApiError) return err;

  if (err instanceof jwt.TokenExpiredError) {
    return ApiError.unauthorized('Your session has expired. Please sign in again.');
  }
  if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.NotBeforeError) {
    return ApiError.unauthorized('Invalid authentication token');
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Validation failed', errors);
  }
  if (err instanceof mongoose.Error.CastError) {
    return err.kind === 'ObjectId' ? ApiError.notFound() : ApiError.badRequest(`Invalid value for ${err.path}`);
  }
  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? err.keyValue ?? {})[0];
    return ApiError.conflict(DUPLICATE_KEY_MESSAGES[field] ?? 'Duplicate value', field ? [{ field, message: 'Already exists' }] : []);
  }

  // body-parser errors (malformed JSON, payload too large)
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON in request body');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'Request body is too large');

  return null;
};

export const notFoundHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
};

// Express identifies error handlers by their 4-argument signature.
export const errorHandler = (err, req, res, _next) => {
  const apiError = toApiError(err);

  if (!apiError) {
    const isDbError = err instanceof mongoose.Error || err?.name?.startsWith('Mongo');
    (req.log ?? logger).error({ err }, isDbError ? 'Database error' : 'Unhandled error');
    return res.status(500).json({
      success: false,
      message: env.isProduction ? 'Something went wrong. Please try again.' : err.message || 'Internal server error',
      errors: [],
      ...(env.isProduction ? {} : { stack: err.stack }),
    });
  }

  if (apiError.statusCode >= 500) {
    (req.log ?? logger).error({ err }, apiError.message);
  }

  if (apiError.meta?.retryAfterSeconds) {
    res.set('Retry-After', String(apiError.meta.retryAfterSeconds));
  }

  return res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    errors: apiError.errors ?? [],
    ...(apiError.meta ? { meta: apiError.meta } : {}),
  });
};
