import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createRateLimiters } from './middleware/rateLimiters.js';
import { createApiRouter } from './routes/index.js';
import { ApiError } from './utils/ApiError.js';

/**
 * @param {{ rateLimits?: object, corsOrigins?: string[] }} [options] overrides for tests
 */
export const createApp = (options = {}) => {
  const app = express();
  const allowedOrigins = options.corsOrigins ?? env.corsOrigins;
  const limiters = createRateLimiters(options.rateLimits);

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(
    cors({
      // Explicit allow-list (never "*"). Requests without an Origin header
      // (curl, server-to-server, health checks) are not subject to CORS.
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new ApiError(403, `Origin ${origin} is not allowed`));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    })
  );

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url.endsWith('/health') },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    })
  );

  app.use(express.json({ limit: '100kb' }));
  app.use('/api', limiters.api);
  app.use('/api/v1', createApiRouter(limiters));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
