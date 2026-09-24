import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { createApp } from '../src/app.js';
import { connectDatabase, disconnectDatabase } from '../src/config/db.js';
import { Admin } from '../src/models/index.js';
import { hashPassword } from '../src/services/adminAuth.service.js';
import { createCustomer } from '../src/services/customer.service.js';

export const DEV_OTP = '123456';
export const ADMIN_PASSWORD = 'Admin@123';

/**
 * Connects this test file to its own database on the shared in-memory replica set
 * and wipes all collections before each test (indexes are kept).
 */
export const useTestDatabase = (testFileUrl) => {
  beforeAll(async () => {
    const dbName = `test_${path.basename(new URL(testFileUrl).pathname).replace(/\W/g, '_')}`;
    await connectDatabase(inject('mongoUri'), { dbName });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  });

  beforeEach(async () => {
    await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDatabase();
  });
};

export const buildApp = (options = {}) => createApp({ rateLimits: { enabled: false }, ...options });

let adminCounter = 0;

export const createAdminUser = async ({ role = 'admin', isActive = true, email, mobile } = {}) => {
  adminCounter += 1;
  return Admin.create({
    name: role === 'manager' ? 'Ramesh Patel' : 'Store Admin',
    email: email ?? `admin${adminCounter}@sundhamatamobile.com`,
    mobile: mobile ?? `+9198290${String(10000 + adminCounter).slice(-5)}`,
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role,
    isActive,
  });
};

/** Creates an admin and returns { admin, token, auth } where auth is the header value. */
export const loginAsAdmin = async (app, overrides = {}) => {
  const admin = await createAdminUser(overrides);
  const res = await request(app)
    .post('/api/v1/auth/admin/login')
    .send({ identifier: admin.email, password: ADMIN_PASSWORD })
    .expect(200);
  return { admin, token: res.body.data.token, auth: `Bearer ${res.body.data.token}` };
};

export const createTestCustomer = (overrides = {}) =>
  createCustomer(
    { name: 'Rohit Sharma', mobile: '+919876543210', interest: 'Mobile', budget: 50000, ...overrides },
    { source: 'admin' }
  );

/** Signs a customer in through the real OTP endpoints (dev OTP). */
export const loginAsCustomer = async (app, mobile) => {
  await request(app).post('/api/v1/auth/customer/send-otp').send({ mobile }).expect(200);
  const res = await request(app)
    .post('/api/v1/auth/customer/verify-otp')
    .send({ mobile, otp: DEV_OTP })
    .expect(200);
  return { token: res.body.data.token, auth: `Bearer ${res.body.data.token}`, customer: res.body.data.customer };
};

export const samplePurchase = (customerId, overrides = {}) => ({
  customerId: String(customerId),
  category: 'phones',
  product: { name: 'Samsung Galaxy S25 Ultra', variant: '12GB + 256GB', color: 'Titanium Black', imei: '358921104829104' },
  payment: { method: 'UPI', status: 'Paid' },
  pricing: { purchaseAmount: 124999, discount: 0 },
  ...overrides,
});
