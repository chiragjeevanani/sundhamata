import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const DEFAULT_LIMITS = {
  api: { windowMs: 15 * 60 * 1000, limit: 1000 },
  otpSend: { windowMs: 15 * 60 * 1000, limit: 10 }, // send / resend / register
  otpVerify: { windowMs: 15 * 60 * 1000, limit: 20 },
  customerCheck: { windowMs: 15 * 60 * 1000, limit: 30 },
  adminLogin: { windowMs: 15 * 60 * 1000, limit: 10 },
};

const buildLimiter = ({ windowMs, limit }, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      const retryAfterSeconds = Math.ceil(windowMs / 1000);
      req.log?.warn({ path: req.path }, 'Rate limit exceeded');
      res.status(429).json({ success: false, message, errors: [], meta: { retryAfterSeconds } });
    },
    ...extra,
  });

const passThrough = (_req, _res, next) => next();

/**
 * @param {Partial<typeof DEFAULT_LIMITS>} [overrides] per-limiter overrides (used by tests)
 */
export const createRateLimiters = (overrides = {}) => {
  const limits = Object.fromEntries(
    Object.entries(DEFAULT_LIMITS).map(([key, value]) => [key, { ...value, ...overrides[key] }])
  );
  const enabled = overrides.enabled ?? env.RATE_LIMIT_ENABLED;
  if (!enabled) {
    return Object.fromEntries(Object.keys(DEFAULT_LIMITS).map((key) => [key, passThrough]));
  }

  return {
    api: buildLimiter(limits.api, 'Too many requests. Please slow down.'),
    otpSend: buildLimiter(limits.otpSend, 'Too many OTP requests. Please try again later.'),
    otpVerify: buildLimiter(limits.otpVerify, 'Too many verification attempts. Please try again later.'),
    customerCheck: buildLimiter(limits.customerCheck, 'Too many requests. Please try again later.'),
    adminLogin: buildLimiter(limits.adminLogin, 'Too many login attempts. Please try again later.', {
      skipSuccessfulRequests: true,
    }),
  };
};
