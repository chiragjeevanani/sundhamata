import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase, supportsTransactions } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { getSettings } from './services/settings.service.js';

const start = async () => {
  await connectDatabase(env.MONGODB_URI);

  if (!supportsTransactions()) {
    if (env.isProduction) {
      logger.fatal(
        'MongoDB does not support transactions (standalone server). Production requires a replica set ' +
          'or MongoDB Atlas so purchases and loyalty updates are atomic.'
      );
      process.exit(1);
    }
    logger.warn(
      'MongoDB is a standalone server: multi-document transactions are unavailable. ' +
        'Using compensating rollbacks (development only). Run `npm run db:dev` for a local replica set.'
    );
  }
  if (env.isProduction && env.SMS_PROVIDER === 'console') {
    logger.error('No SMS provider configured: customer OTPs cannot be delivered in production.');
  }

  await getSettings(); // create default store settings on first boot

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, corsOrigins: env.corsOrigins }, 'Sundhamata API listening');
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
});

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
