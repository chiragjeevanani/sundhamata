import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { maskMobile } from '../../utils/mobile.js';

// MSG91 SendOTP (https://docs.msg91.com/otp): we pass our own code in `otp`, so generating,
// expiry, attempts and rate limits stay in otp.service.js and MSG91 only delivers the SMS.
// The OTP template (MSG91 → OTP section, DLT-approved) contains ##OTP## and ##minutes##.
const SEND_OTP_URL = 'https://control.msg91.com/api/v5/otp';
const TIMEOUT_MS = 10_000;

const unavailable = () => new ApiError(503, 'Could not send the OTP right now. Please try again in a minute.');

export const msg91Provider = {
  name: 'msg91',
  async sendOtp(mobile, code, { expiresInSeconds }) {
    const url = new URL(SEND_OTP_URL);
    url.searchParams.set('template_id', env.MSG91_OTP_TEMPLATE_ID);
    // "+919876543210" → "919876543210" (country code, no plus)
    url.searchParams.set('mobile', mobile.replace(/^\+/, ''));
    url.searchParams.set('otp', code);
    url.searchParams.set('otp_length', String(code.length));
    const minutes = String(Math.max(1, Math.ceil(expiresInSeconds / 60)));
    url.searchParams.set('otp_expiry', minutes);

    let res;
    let body;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { authkey: env.MSG91_AUTH_KEY, 'content-type': 'application/json', accept: 'application/json' },
        // Other template variables, by name (case sensitive): "Valid for ##minutes## minutes"
        body: JSON.stringify({ minutes }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      body = await res.json().catch(() => null);
    } catch (err) {
      logger.error({ err, mobile: maskMobile(mobile) }, 'MSG91 request failed');
      throw unavailable();
    }

    // MSG91 also answers some errors with HTTP 200 and { type: "error" }
    if (!res.ok || body?.type !== 'success') {
      logger.error({ status: res.status, msg91: body?.message ?? null, mobile: maskMobile(mobile) }, 'MSG91 did not send the OTP');
      throw unavailable();
    }
    logger.info({ mobile: maskMobile(mobile), requestId: body.request_id ?? null }, 'OTP sent via MSG91');
  },
};
