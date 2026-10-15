import { Router } from 'express';
import { z } from 'zod';
import * as customer from '../controllers/customer.controller.js';
import { requireCustomerAuth } from '../middleware/auth.js';
import { rawImageUpload } from '../middleware/uploads.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validators/common.js';
import { fcmTokenSchema, updateMyProfileSchema } from '../validators/customer.validators.js';
import { createInquirySchema } from '../validators/inquiry.validators.js';
import { listTransactionsQuerySchema } from '../validators/loyalty.validators.js';
import { customerPurchasesQuerySchema } from '../validators/purchase.validators.js';

// Customers may not filter by another customerId: the controller always scopes to req.customer.
const ownTransactionsQuerySchema = listTransactionsQuerySchema.omit({ customerId: true });

export const createCustomerRouter = () => {
  const router = Router();
  router.use(requireCustomerAuth);

  router.get('/me', customer.getMe);
  router.patch('/me', validate({ body: updateMyProfileSchema }), customer.updateMe);
  // Profile photo: raw image body (the app sends a resized JPEG)
  router.post('/me/photo', rawImageUpload, customer.uploadMyPhoto);
  router.delete('/me/photo', customer.deleteMyPhoto);
  // Push notifications: this device's Firebase token (separate lists for web and app)
  router.post('/me/fcm-tokens', validate({ body: fcmTokenSchema }), customer.registerMyFcmToken);
  router.delete('/me/fcm-tokens', validate({ body: fcmTokenSchema }), customer.removeMyFcmToken);

  router.get('/purchases', validate({ query: customerPurchasesQuerySchema }), customer.listMyPurchases);
  router.get('/purchases/:id', validate({ params: idParamsSchema }), customer.getMyPurchase);
  router.get('/purchases/:id/bill', validate({ params: idParamsSchema }), customer.downloadMyPurchaseBill);

  router.get('/loyalty', customer.getMyLoyalty);
  router.get('/loyalty/summary', customer.getMyLoyaltySummary);
  router.get('/loyalty/transactions', validate({ query: ownTransactionsQuerySchema }), customer.listMyLoyaltyTransactions);
  router.get('/loyalty/transactions/:id', validate({ params: idParamsSchema }), customer.getMyLoyaltyTransaction);

  // Welcome vouchers for new app users: claim each one (QR + code), redeem at the store
  router.get('/offers/welcome', customer.getMyWelcomeOffer);
  router.post(
    '/offers/welcome/:key/claim',
    // A built-in voucher, or the id of an offer given as a welcome voucher
    validate({ params: z.object({ key: z.string().regex(/^(glass|accessories|[a-f0-9]{24})$/, 'Unknown voucher') }) }),
    customer.claimMyWelcomeVoucher
  );
  // Offers created by the store: scratch to claim (the customer's own QR + code)
  router.get('/offers', customer.listMyOffers);
  router.post('/offers/:id/claim', validate({ params: idParamsSchema }), customer.claimMyOffer);
  router.get('/coupons', customer.listMyCoupons);

  // Inquiries (mobile / accessories / service) sent to the store
  router.get('/inquiries', customer.listMyInquiries);
  router.post('/inquiries', validate({ body: createInquirySchema }), customer.createMyInquiry);

  return router;
};
