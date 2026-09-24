import dotenv from 'dotenv';
import { z } from 'zod';

// Tests get their environment from vitest.config.js only, never from a local .env.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config({ quiet: true });
}

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ADMIN_JWT_EXPIRES_IN: z.string().default('12h'),

  CUSTOMER_FRONTEND_URL: z.string().default(''),
  ADMIN_FRONTEND_URL: z.string().default(''),

  // Default used only when the StoreSettings document is first created.
  // After that, the database value (editable from admin settings) is authoritative.
  LOYALTY_POINTS_PER_100: z.coerce.number().positive().default(1),

  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(30),
  OTP_MAX_SENDS_PER_HOUR: z.coerce.number().int().positive().default(5),
  // Fixed code used only outside production. Ignored when NODE_ENV=production.
  DEV_OTP_CODE: z
    .string()
    .regex(/^\d{6}$/, 'DEV_OTP_CODE must be 6 digits')
    .default('123456'),
  SMS_PROVIDER: z.enum(['console']).default('console'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  RATE_LIMIT_ENABLED: booleanFromString.default(true),
  // Number of reverse proxies in front of the API (for correct client IPs in rate limiting).
  TRUST_PROXY: z.coerce.number().int().nonnegative().default(0),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Logger depends on env, so fail loudly on stderr before anything else starts.
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

const raw = parsed.data;

const splitOrigins = (...values) =>
  [
    ...new Set(
      values
        .flatMap((v) => v.split(','))
        .map((v) => v.trim().replace(/\/$/, ''))
        .filter(Boolean)
    ),
  ];

export const env = Object.freeze({
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: splitOrigins(raw.CUSTOMER_FRONTEND_URL, raw.ADMIN_FRONTEND_URL),
  logLevel: raw.LOG_LEVEL ?? (raw.NODE_ENV === 'test' ? 'silent' : raw.NODE_ENV === 'production' ? 'info' : 'debug'),
});
