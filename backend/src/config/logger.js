import pino from 'pino';
import { env } from './env.js';

const usePretty = env.NODE_ENV === 'development' && process.stdout.isTTY;

export const logger = pino({
  level: env.logLevel,
  base: { service: 'sundhamata-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'otp',
      '*.otp',
      'token',
      '*.token',
    ],
    censor: '[redacted]',
  },
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } } }
    : {}),
});
