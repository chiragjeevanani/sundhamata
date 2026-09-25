import { Router } from 'express';
import * as customer from '../controllers/customer.controller.js';
import { requireCustomerAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema } from '../validators/common.js';
import { updateMyProfileSchema } from '../validators/customer.validators.js';
import { listTransactionsQuerySchema } from '../validators/loyalty.validators.js';
import { customerPurchasesQuerySchema } from '../validators/purchase.validators.js';

// Customers may not filter by another customerId: the controller always scopes to req.customer.
const ownTransactionsQuerySchema = listTransactionsQuerySchema.omit({ customerId: true });

export const createCustomerRouter = () => {
  const router = Router();
  router.use(requireCustomerAuth);

  router.get('/me', customer.getMe);
  router.patch('/me', validate({ body: updateMyProfileSchema }), customer.updateMe);

  router.get('/purchases', validate({ query: customerPurchasesQuerySchema }), customer.listMyPurchases);
  router.get('/purchases/:id', validate({ params: idParamsSchema }), customer.getMyPurchase);
  router.get('/purchases/:id/bill', validate({ params: idParamsSchema }), customer.downloadMyPurchaseBill);

  router.get('/loyalty', customer.getMyLoyalty);
  router.get('/loyalty/summary', customer.getMyLoyaltySummary);
  router.get('/loyalty/transactions', validate({ query: ownTransactionsQuerySchema }), customer.listMyLoyaltyTransactions);
  router.get('/loyalty/transactions/:id', validate({ params: idParamsSchema }), customer.getMyLoyaltyTransaction);

  return router;
};
