import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Customer, OtpChallenge } from '../src/models/index.js';
import {
  buildApp,
  createTestCustomer,
  DEV_OTP,
  loginAsAdmin,
  loginAsCustomer,
  useTestDatabase,
} from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

const register = (body) =>
  api().post('/api/v1/auth/customer/register').send({ name: 'Rohit Sharma', mobile: '9876543210', interest: 'Mobile', budget: 50000, ...body });

const verify = (mobile, otp = DEV_OTP) => api().post('/api/v1/auth/customer/verify-otp').send({ mobile, otp });

/** Moves the OTP challenge back in time instead of sleeping. */
const ageChallenge = (mobile, seconds) =>
  OtpChallenge.updateOne(
    { mobile },
    [
      {
        $set: {
          lastSentAt: { $subtract: ['$lastSentAt', seconds * 1000] },
          expiresAt: { $subtract: ['$expiresAt', seconds * 1000] },
        },
      },
    ],
    { updatePipeline: true }
  );

describe('Customer registration', () => {
  it('1. registers a new customer only after OTP verification', async () => {
    const res = await register().expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.otpSent).toBe(true);
    expect(res.body.data).not.toHaveProperty('otp'); // OTP never exposed in responses

    // Not a customer until verified
    expect(await Customer.countDocuments()).toBe(0);

    const verified = await verify('9876543210').expect(200);
    expect(verified.body.data.isNewUser).toBe(true);
    expect(verified.body.data.token).toEqual(expect.any(String));
    expect(verified.body.data.customer).toMatchObject({
      name: 'Rohit Sharma',
      mobile: '+919876543210',
      interest: 'Mobile',
      budget: 50000,
      loyaltyPoints: 0,
    });

    const stored = await Customer.findOne({ mobile: '+919876543210' });
    expect(stored.mobileVerifiedAt).toBeInstanceOf(Date);
    expect(stored.registrationSource).toBe('self');
  });

  it('requires name, valid mobile and interest; budget is optional', async () => {
    const res = await api().post('/api/v1/auth/customer/register').send({ mobile: '12345' }).expect(422);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'mobile', 'interest']));
    expect(res.body.success).toBe(false);

    await register({ mobile: '9123456780', budget: undefined }).expect(200);
    await register({ mobile: '9123456781', budget: -5 }).expect(422);
    await register({ mobile: '9123456782', interest: 'Laptops' }).expect(422);
  });

  it('2. rejects duplicate registration, regardless of mobile formatting', async () => {
    await createTestCustomer({ mobile: '+919876543210' });
    const res = await register({ mobile: '+91 98765-43210' }).expect(409);
    expect(res.body.message).toMatch(/already registered/i);
    expect(await Customer.countDocuments()).toBe(1);
  });

  it('normalizes 9876543210 and +919876543210 to the same customer', async () => {
    await register({ mobile: '9876543210' }).expect(200);
    await verify('+919876543210').expect(200);
    await register({ mobile: '919876543210' }).expect(409);
    expect(await Customer.countDocuments({ mobile: '+919876543210' })).toBe(1);
  });
});

describe('Customer existence check', () => {
  it('3. reports whether a customer exists without leaking personal data', async () => {
    await createTestCustomer();
    const found = await api().post('/api/v1/auth/customer/check').send({ mobile: '+91 98765 43210' }).expect(200);
    expect(found.body.data).toEqual({ exists: true, isRegistered: true });

    const missing = await api().post('/api/v1/auth/customer/check').send({ mobile: '9000000001' }).expect(200);
    expect(missing.body.data.exists).toBe(false);

    await api().post('/api/v1/auth/customer/check').send({ mobile: '12345' }).expect(422);
  });
});

describe('OTP', () => {
  it('4. sends an OTP to an existing customer and stores only a hash', async () => {
    await createTestCustomer();
    const res = await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    expect(res.body.data).toEqual({ expiresInSeconds: 300, resendAvailableInSeconds: 30 });

    const challenge = await OtpChallenge.findOne({ mobile: '+919876543210' }).lean();
    expect(challenge.purpose).toBe('login');
    expect(challenge.codeHash).not.toContain(DEV_OTP);
    expect(JSON.stringify(challenge)).not.toContain(DEV_OTP);
  });

  it('refuses login OTP for unknown numbers', async () => {
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9000000002' }).expect(404);
  });

  it('5. valid OTP returns a token and customer profile', async () => {
    await createTestCustomer();
    const { token, customer } = await loginAsCustomer(app, '9876543210');
    expect(token.split('.')).toHaveLength(3);
    expect(customer.name).toBe('Rohit Sharma');
    expect(customer).not.toHaveProperty('passwordHash');
  });

  it('6. rejects an invalid OTP', async () => {
    await createTestCustomer();
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    const res = await verify('9876543210', '000000').expect(400);
    expect(res.body.message).toMatch(/incorrect otp/i);
    expect(res.body.meta.attemptsRemaining).toBe(4);
    await verify('9876543210', '12ab56').expect(422);
  });

  it('7. rejects an expired OTP', async () => {
    await createTestCustomer();
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    await ageChallenge('+919876543210', 301);
    const res = await verify('9876543210').expect(400);
    expect(res.body.meta.reason).toBe('otp_expired');
  });

  it('8. locks the OTP after the maximum number of attempts', async () => {
    await createTestCustomer();
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    for (let i = 0; i < 4; i += 1) await verify('9876543210', '999999').expect(400);
    await verify('9876543210', '999999').expect(429);
    // Even the correct code is refused once locked
    const locked = await verify('9876543210', DEV_OTP).expect(429);
    expect(locked.body.meta.reason).toBe('otp_attempts_exceeded');
  });

  it('invalidates the OTP after successful verification (single use)', async () => {
    await createTestCustomer();
    await loginAsCustomer(app, '9876543210');
    await verify('9876543210').expect(400);
  });

  it('enforces the resend cooldown and allows resend after it', async () => {
    await createTestCustomer();
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    const tooSoon = await api().post('/api/v1/auth/customer/resend-otp').send({ mobile: '9876543210' }).expect(429);
    expect(tooSoon.body.meta.retryAfterSeconds).toBeGreaterThan(0);
    expect(tooSoon.headers['retry-after']).toBeDefined();

    await ageChallenge('+919876543210', 31);
    await api().post('/api/v1/auth/customer/resend-otp').send({ mobile: '9876543210' }).expect(200);
  });

  it('caps OTP sends per hour', async () => {
    await createTestCustomer();
    for (let i = 0; i < 5; i += 1) {
      await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
      await ageChallenge('+919876543210', 31);
    }
    const res = await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(429);
    expect(res.body.meta.reason).toBe('otp_send_limit');
  });

  it('resend during registration keeps the pending registration details', async () => {
    await register({ name: 'Priya Mehta', mobile: '9823456789', interest: 'Accessories' }).expect(200);
    await ageChallenge('+919823456789', 31);
    await api().post('/api/v1/auth/customer/resend-otp').send({ mobile: '9823456789' }).expect(200);
    const res = await verify('9823456789').expect(200);
    expect(res.body.data.customer).toMatchObject({ name: 'Priya Mehta', interest: 'Accessories' });
  });

  it('rate limits OTP endpoints per client', async () => {
    const limitedApp = buildApp({ rateLimits: { enabled: true, customerCheck: { limit: 2 } } });
    await request(limitedApp).post('/api/v1/auth/customer/check').send({ mobile: '9000000011' }).expect(200);
    await request(limitedApp).post('/api/v1/auth/customer/check').send({ mobile: '9000000012' }).expect(200);
    const res = await request(limitedApp).post('/api/v1/auth/customer/check').send({ mobile: '9000000013' }).expect(429);
    expect(res.body.success).toBe(false);
  });
});

describe('Customer JWT', () => {
  it('9. authenticates customer routes with the customer token', async () => {
    await createTestCustomer();
    const { auth } = await loginAsCustomer(app, '9876543210');
    const res = await api().get('/api/v1/customer/me').set('Authorization', auth).expect(200);
    expect(res.body.data.customer.mobile).toBe('+919876543210');
  });

  it('rejects missing, malformed and admin tokens on customer routes', async () => {
    await api().get('/api/v1/customer/me').expect(401);
    await api().get('/api/v1/customer/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
    const { auth: adminAuth } = await loginAsAdmin(app);
    const res = await api().get('/api/v1/customer/me').set('Authorization', adminAuth).expect(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects the token of a deactivated customer', async () => {
    const customer = await createTestCustomer();
    const { auth } = await loginAsCustomer(app, '9876543210');
    await Customer.updateOne({ _id: customer._id }, { isActive: false });
    await api().get('/api/v1/customer/me').set('Authorization', auth).expect(401);
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(403);
  });
});
