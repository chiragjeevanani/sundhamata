import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { OtpChallenge, OTP_PURPOSES } from '../models/OtpChallenge.js';
import { ApiError } from '../utils/ApiError.js';
import { maskMobile } from '../utils/mobile.js';
import { smsProvider } from './sms/index.js';

const SEND_WINDOW_MS = 60 * 60 * 1000;

const generateCode = () =>
  env.isProduction ? crypto.randomInt(0, 1_000_000).toString().padStart(6, '0') : env.DEV_OTP_CODE;

const hashCode = (mobile, code) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`otp:${mobile}:${code}`).digest('hex');

const codesMatch = (mobile, code, expectedHash) => {
  const actual = Buffer.from(hashCode(mobile, code), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const secondsUntil = (date, now) => Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 1000));

const tooSoon = (retryAfterSeconds) =>
  ApiError.tooManyRequests(`Please wait ${retryAfterSeconds}s before requesting another OTP.`, {
    reason: 'otp_cooldown',
    retryAfterSeconds,
  });

/**
 * Issues a new OTP for `mobile`, replacing any previous challenge.
 * Enforces the resend cooldown and the hourly send cap.
 *
 * @param {string} mobile normalized E.164 mobile
 * @param {{ purpose: 'login'|'register', registration?: object }} options
 */
export const sendOtp = async (mobile, { purpose, registration = undefined }) => {
  const now = new Date();
  const existing = await OtpChallenge.findOne({ mobile }).lean();

  let sendCount = 1;
  let windowStartedAt = now;

  if (existing) {
    const cooldownEndsAt = new Date(existing.lastSentAt.getTime() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000);
    if (now < cooldownEndsAt) throw tooSoon(secondsUntil(cooldownEndsAt, now));

    const windowEndsAt = new Date(existing.windowStartedAt.getTime() + SEND_WINDOW_MS);
    if (now < windowEndsAt) {
      if (existing.sendCount >= env.OTP_MAX_SENDS_PER_HOUR) {
        const retryAfterSeconds = secondsUntil(windowEndsAt, now);
        logger.warn({ mobile: maskMobile(mobile) }, 'OTP hourly send limit reached');
        throw ApiError.tooManyRequests('Too many OTP requests for this number. Please try again later.', {
          reason: 'otp_send_limit',
          retryAfterSeconds,
        });
      }
      sendCount = existing.sendCount + 1;
      windowStartedAt = existing.windowStartedAt;
    }
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + env.OTP_EXPIRY_SECONDS * 1000);
  const update = {
    mobile,
    purpose,
    codeHash: hashCode(mobile, code),
    expiresAt,
    attempts: 0,
    lastSentAt: now,
    windowStartedAt,
    sendCount,
    registration: purpose === OTP_PURPOSES.REGISTER ? registration : undefined,
    purgeAt: new Date(Math.max(expiresAt.getTime(), windowStartedAt.getTime() + SEND_WINDOW_MS)),
  };

  // Optimistic concurrency: two parallel requests cannot both pass the cooldown check.
  try {
    if (existing) {
      const result = await OtpChallenge.replaceOne({ _id: existing._id, lastSentAt: existing.lastSentAt }, update);
      if (result.matchedCount === 0) throw tooSoon(env.OTP_RESEND_COOLDOWN_SECONDS);
    } else {
      await OtpChallenge.create(update);
    }
  } catch (err) {
    if (err?.code === 11000) throw tooSoon(env.OTP_RESEND_COOLDOWN_SECONDS);
    throw err;
  }

  await smsProvider.sendOtp(mobile, code, { expiresInSeconds: env.OTP_EXPIRY_SECONDS });
  logger.info({ mobile: maskMobile(mobile), purpose, sendCount }, 'Customer OTP requested');

  return {
    expiresInSeconds: env.OTP_EXPIRY_SECONDS,
    resendAvailableInSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  };
};

/** The in-progress challenge for a mobile (used to resend with the same purpose). */
export const findActiveChallenge = (mobile) => OtpChallenge.findOne({ mobile }).lean();

/**
 * Verifies and consumes an OTP. Returns the challenge (purpose + pending registration).
 * Every attempt is counted atomically before comparing, so parallel guesses cannot
 * exceed the attempt limit.
 */
export const verifyOtp = async (mobile, code) => {
  const now = new Date();
  const challenge = await OtpChallenge.findOne({ mobile }).lean();

  if (!challenge) {
    throw ApiError.badRequest('No active OTP for this number. Please request a new one.');
  }
  if (challenge.expiresAt <= now) {
    throw new ApiError(400, 'This OTP has expired. Please request a new one.', [], { reason: 'otp_expired' });
  }

  const counted = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, codeHash: challenge.codeHash, attempts: { $lt: env.OTP_MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  ).lean();

  if (!counted) {
    logger.warn({ mobile: maskMobile(mobile) }, 'OTP attempt limit reached');
    throw ApiError.tooManyRequests('Too many incorrect attempts. Please request a new OTP.', {
      reason: 'otp_attempts_exceeded',
    });
  }

  if (!codesMatch(mobile, code, counted.codeHash)) {
    const attemptsRemaining = env.OTP_MAX_ATTEMPTS - counted.attempts;
    logger.info({ mobile: maskMobile(mobile), attemptsRemaining }, 'Incorrect OTP entered');
    if (attemptsRemaining <= 0) {
      throw ApiError.tooManyRequests('Too many incorrect attempts. Please request a new OTP.', {
        reason: 'otp_attempts_exceeded',
      });
    }
    throw new ApiError(400, 'Incorrect OTP. Please check the code and try again.', [], {
      reason: 'otp_invalid',
      attemptsRemaining,
    });
  }

  // Single use: whoever deletes it first wins; a replayed code finds nothing.
  const consumed = await OtpChallenge.deleteOne({ _id: counted._id, codeHash: counted.codeHash });
  if (consumed.deletedCount === 0) {
    throw ApiError.badRequest('This OTP has already been used. Please request a new one.');
  }

  return counted;
};
