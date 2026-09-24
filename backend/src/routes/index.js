import { Router } from 'express';
import mongoose from 'mongoose';
import { getStore } from '../controllers/customer.controller.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { createAdminRouter } from './admin.routes.js';
import { createAuthRouter } from './auth.routes.js';
import { createCustomerRouter } from './customer.routes.js';

export const createApiRouter = (limiters) => {
  const router = Router();

  router.get('/health', (_req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.status(dbUp ? 200 : 503).json({
      success: dbUp,
      data: { status: dbUp ? 'ok' : 'degraded', database: dbUp ? 'connected' : 'disconnected' },
      message: dbUp ? 'OK' : 'Database unavailable',
    });
  });

  router.use('/auth', createAuthRouter(limiters));
  router.get('/store', getStore); // public: store contact details + loyalty rules
  router.use('/customer', createCustomerRouter());
  router.use('/admin', createAdminRouter());

  router.get('/', (_req, res) => sendSuccess(res, { data: { name: 'Sundhamata Mobile API', version: 'v1' } }));

  return router;
};
