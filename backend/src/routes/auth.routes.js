import { Router } from 'express';
import * as adminAuth from '../controllers/adminAuth.controller.js';
import * as customerAuth from '../controllers/customerAuth.controller.js';
import { requireAdminAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  adminLoginSchema,
  mobileBodySchema,
  registerCustomerSchema,
  verifyOtpSchema,
} from '../validators/auth.validators.js';

export const createAuthRouter = (limiters) => {
  const router = Router();

  // Customer: mobile + OTP
  router.post('/customer/check', limiters.customerCheck, validate({ body: mobileBodySchema }), customerAuth.check);
  router.post('/customer/send-otp', limiters.otpSend, validate({ body: mobileBodySchema }), customerAuth.sendOtp);
  router.post('/customer/resend-otp', limiters.otpSend, validate({ body: mobileBodySchema }), customerAuth.resendOtp);
  router.post('/customer/register', limiters.otpSend, validate({ body: registerCustomerSchema }), customerAuth.register);
  router.post('/customer/verify-otp', limiters.otpVerify, validate({ body: verifyOtpSchema }), customerAuth.verifyOtp);

  // Admin: email/mobile + password
  router.post('/admin/login', limiters.adminLogin, validate({ body: adminLoginSchema }), adminAuth.login);
  router.post('/admin/logout', requireAdminAuth, adminAuth.logout);

  return router;
};
