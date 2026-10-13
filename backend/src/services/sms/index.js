import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { maskMobile } from '../../utils/mobile.js';

/**
 * SMS provider contract:
 *   sendOtp(mobileE164: string, code: string, { expiresInSeconds }) => Promise<void>
 *
 * To go live, add e.g. `msg91.provider.js` / `twilio.provider.js` implementing
 * this contract, register it below and set SMS_PROVIDER. The OTP service and
 * auth controllers never depend on a specific provider.
 */

const consoleProvider = {
  name: 'console',
  async sendOtp(mobile, code, { expiresInSeconds }) {
    if (env.isProduction) {
      // Never print codes in production; a real provider must be configured.
      logger.error({ mobile: maskMobile(mobile) }, 'OTP not delivered: no SMS provider configured');
      throw new ApiError(503, 'OTP delivery is temporarily unavailable. Please try again later.');
    }
    // Development only (guarded above): print the code so it can be entered in the app.
    logger.info({ expiresInSeconds }, `[DEV SMS] OTP for ${mobile} is ${code}`);
  },
};

// Demo mode until a real provider is set up: nothing is sent and the code is always
// DEV_OTP_CODE (see env.useFixedOtp), so the code is never logged here.
const mockProvider = {
  name: 'mock',
  async sendOtp(mobile) {
    logger.warn({ mobile: maskMobile(mobile) }, 'OTP not sent: mock SMS provider (fixed code)');
  },
};

const providers = { console: consoleProvider, mock: mockProvider };

export const smsProvider = providers[env.SMS_PROVIDER];
