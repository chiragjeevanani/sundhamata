import { Router } from 'express';
import mongoose from 'mongoose';
import { getStore } from '../controllers/customer.controller.js';
import { sendCustomerPhoto } from '../services/customerPhoto.service.js';
import { sendInquiryPhoto } from '../services/inquiryPhoto.service.js';
import { getPublicAd, sendPoster } from '../services/startupAd.service.js';
import { sendProductImage } from '../services/productImage.service.js';
import { ApiError } from '../utils/ApiError.js';
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
  // public: advertisement shown when the customer app opens (null = none), and its poster image
  router.get('/startup-ad', async (_req, res) => sendSuccess(res, { data: { ad: await getPublicAd() } }));
  router.get('/startup-ad/posters/:key', (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.key)) throw ApiError.notFound('Poster not found');
    return sendPoster(res, req.params.key);
  });
  // public: product photos by unguessable key (see services/productImage.service.js)
  router.get('/product-images/:key', (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.key)) throw ApiError.notFound('Image not found');
    return sendProductImage(res, req.params.key);
  });
  // customer photos by unguessable key (see services/customerPhoto.service.js)
  router.get('/customer-photos/:key', (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.key)) throw ApiError.notFound('Photo not found');
    return sendCustomerPhoto(res, req.params.key);
  });
  // service inquiry photos by unguessable key (see services/inquiryPhoto.service.js)
  router.get('/inquiry-photos/:key', (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.key)) throw ApiError.notFound('Photo not found');
    return sendInquiryPhoto(res, req.params.key);
  });
  router.use('/customer', createCustomerRouter());
  router.use('/admin', createAdminRouter());

  router.get('/', (_req, res) => sendSuccess(res, { data: { name: 'Sundhamata Mobile API', version: 'v1' } }));

  return router;
};
