import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/setup/globalSetup.js'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      // Real URI is provided by globalSetup (in-memory replica set); each test file uses its own database.
      MONGODB_URI: 'mongodb://placeholder',
      JWT_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      JWT_EXPIRES_IN: '1h',
      ADMIN_JWT_EXPIRES_IN: '1h',
      BCRYPT_ROUNDS: '4',
      RATE_LIMIT_ENABLED: 'false',
      OTP_EXPIRY_SECONDS: '300',
      OTP_MAX_ATTEMPTS: '5',
      OTP_RESEND_COOLDOWN_SECONDS: '30',
      OTP_MAX_SENDS_PER_HOUR: '5',
      DEV_OTP_CODE: '123456',
      LOYALTY_POINTS_PER_100: '1',
      CUSTOMER_FRONTEND_URL: 'http://localhost:5173',
      ADMIN_FRONTEND_URL: 'http://localhost:5174',
    },
  },
});
