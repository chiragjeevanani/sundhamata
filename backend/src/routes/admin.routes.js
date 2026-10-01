import { Router } from 'express';
import { z } from 'zod';
import * as admin from '../controllers/admin.controller.js';
import * as adminAuth from '../controllers/adminAuth.controller.js';
import { PERMISSIONS as P } from '../config/permissions.js';
import { requireAdminAuth, requirePermission as can } from '../middleware/auth.js';
import { rawBillUpload, rawImageUpload } from '../middleware/uploads.js';
import { validate } from '../middleware/validate.js';
import { idParamsSchema, objectIdSchema } from '../validators/common.js';
import {
  adminCreateCustomerSchema,
  adminUpdateCustomerSchema,
  listCustomersQuerySchema,
} from '../validators/customer.validators.js';
import { adjustPointsSchema, listTransactionsQuerySchema } from '../validators/loyalty.validators.js';
import {
  cancelPurchaseSchema,
  createPurchaseSchema,
  listPurchasesQuerySchema,
  updatePurchaseSchema,
} from '../validators/purchase.validators.js';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from '../validators/product.validators.js';
import { updateSettingsSchema } from '../validators/settings.validators.js';

const activityQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const billUploadQuerySchema = z.object({ filename: z.string().trim().max(255).optional() });
const couponCodeParamsSchema = z.object({ code: z.string().trim().min(1).max(40) });

export const createAdminRouter = () => {
  const router = Router();
  router.use(requireAdminAuth);

  router.get('/me', adminAuth.me);

  router.get('/dashboard', can(P.DASHBOARD_READ), admin.getDashboard);
  router.get('/activity', can(P.DASHBOARD_READ), validate({ query: activityQuerySchema }), admin.getActivity);
  router.get('/reports/summary', can(P.REPORTS_READ), admin.getReportSummary);

  router.get('/customers', can(P.CUSTOMERS_READ), validate({ query: listCustomersQuerySchema }), admin.listCustomers);
  router.post('/customers', can(P.CUSTOMERS_WRITE), validate({ body: adminCreateCustomerSchema }), admin.createCustomer);
  router.get('/customers/:id', can(P.CUSTOMERS_READ), validate({ params: idParamsSchema }), admin.getCustomer);
  router.patch(
    '/customers/:id',
    can(P.CUSTOMERS_WRITE),
    validate({ params: idParamsSchema, body: adminUpdateCustomerSchema }),
    admin.updateCustomer
  );
  // Customer photo taken / changed at the counter (raw image body)
  router.post('/customers/:id/photo', can(P.CUSTOMERS_WRITE), validate({ params: idParamsSchema }), rawImageUpload, admin.uploadCustomerPhoto);
  router.delete('/customers/:id/photo', can(P.CUSTOMERS_WRITE), validate({ params: idParamsSchema }), admin.deleteCustomerPhoto);
  router.get(
    '/customers/:id/purchases',
    can(P.PURCHASES_READ),
    validate({ params: idParamsSchema, query: listPurchasesQuerySchema }),
    admin.listCustomerPurchases
  );
  router.get(
    '/customers/:id/loyalty',
    can(P.LOYALTY_READ),
    validate({ params: idParamsSchema, query: listTransactionsQuerySchema }),
    admin.getCustomerLoyalty
  );

  // Product catalog: learned from purchases, editable on the Products page
  router.get('/products', can(P.PURCHASES_READ), validate({ query: listProductsQuerySchema }), admin.listProducts);
  router.post('/products', can(P.PURCHASES_WRITE), validate({ body: createProductSchema }), admin.createProduct);
  router.patch(
    '/products/:id',
    can(P.PURCHASES_WRITE),
    validate({ params: idParamsSchema, body: updateProductSchema }),
    admin.updateProduct
  );
  router.delete('/products/:id', can(P.PURCHASES_WRITE), validate({ params: idParamsSchema }), admin.deleteProduct);

  // Coupon lookup before billing (the coupon itself is redeemed with `couponCode` on POST /purchases)
  // A voucher code like WELCOME6D needs ?customerId= (the selected customer); a scanned QR does not
  router.get(
    '/coupons/:code',
    can(P.PURCHASES_WRITE),
    validate({ params: couponCodeParamsSchema, query: z.object({ customerId: objectIdSchema.optional() }) }),
    admin.lookupCoupon
  );
  router.get(
    '/customers/:id/coupons',
    can(P.CUSTOMERS_READ),
    validate({ params: idParamsSchema }),
    admin.listCustomerCoupons
  );

  router.get('/purchases', can(P.PURCHASES_READ), validate({ query: listPurchasesQuerySchema }), admin.listPurchases);
  router.post('/purchases', can(P.PURCHASES_WRITE), validate({ body: createPurchaseSchema }), admin.createPurchase);
  router.get('/purchases/:id', can(P.PURCHASES_READ), validate({ params: idParamsSchema }), admin.getPurchase);
  router.patch(
    '/purchases/:id',
    can(P.PURCHASES_WRITE),
    validate({ params: idParamsSchema, body: updatePurchaseSchema }),
    admin.updatePurchase
  );
  router.get('/purchases/:id/bill', can(P.PURCHASES_READ), validate({ params: idParamsSchema }), admin.downloadPurchaseBill);
  // Upload = raw file body + ?filename=; POST both attaches and replaces.
  router.post(
    '/purchases/:id/bill',
    can(P.PURCHASES_WRITE),
    validate({ params: idParamsSchema, query: billUploadQuerySchema }),
    rawBillUpload,
    admin.uploadPurchaseBill
  );
  router.delete('/purchases/:id/bill', can(P.PURCHASES_WRITE), validate({ params: idParamsSchema }), admin.deletePurchaseBill);
  // Product photo = raw image body; POST attaches or replaces.
  router.post('/purchases/:id/image', can(P.PURCHASES_WRITE), validate({ params: idParamsSchema }), rawImageUpload, admin.uploadProductImage);
  router.delete('/purchases/:id/image', can(P.PURCHASES_WRITE), validate({ params: idParamsSchema }), admin.deleteProductImage);
  router.post(
    '/purchases/:id/cancel',
    can(P.PURCHASES_CANCEL),
    validate({ params: idParamsSchema, body: cancelPurchaseSchema }),
    admin.cancelPurchase
  );

  router.get(
    '/loyalty/transactions',
    can(P.LOYALTY_READ),
    validate({ query: listTransactionsQuerySchema }),
    admin.listLoyaltyTransactions
  );
  router.get('/loyalty/summary', can(P.LOYALTY_READ), admin.getLoyaltySummary);
  router.post('/loyalty/adjust', can(P.LOYALTY_ADJUST), validate({ body: adjustPointsSchema }), admin.adjustLoyalty);

  router.get('/settings', can(P.SETTINGS_READ), admin.getSettings);
  router.patch('/settings', can(P.SETTINGS_WRITE), validate({ body: updateSettingsSchema }), admin.updateSettings);

  return router;
};
