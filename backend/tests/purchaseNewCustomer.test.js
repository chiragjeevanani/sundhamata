import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Customer, LoyaltyTransaction, Purchase } from '../src/models/index.js';
import { buildApp, createTestCustomer, DEV_OTP, loginAsAdmin, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
});

/** A purchase billed to a mobile number instead of an existing customer */
const forNumber = (newCustomer, overrides = {}) => {
  const { customerId: _ignored, ...rest } = samplePurchase('000000000000000000000000', overrides);
  return { ...rest, newCustomer };
};
const record = (body) => api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(body);

describe('Recording a purchase for someone who has not signed up', () => {
  it('saves the purchase under the mobile number without registering first', async () => {
    const res = await record(forNumber({ mobile: '90000 00011' })).expect(201);
    expect(res.body.data.customerCreated).toBe(true);

    const customer = await Customer.findOne({ mobile: '+919000000011' }).lean();
    expect(customer).toMatchObject({ name: 'Customer', interest: 'Mobile', registrationSource: 'admin', mobileVerifiedAt: null });
    expect(res.body.data.purchase.customerId).toBe(customer._id.toString());

    // Loyalty points are credited straight away and kept consistent with the ledger
    expect(customer.loyaltyPoints).toBe(res.body.data.purchase.loyalty.pointsEarned);
    expect(await LoyaltyTransaction.countDocuments({ customerId: customer._id })).toBe(1);
  });

  it('uses the name when the store enters one, and picks the interest from the category', async () => {
    await record(forNumber({ mobile: '9000000012', name: 'Priya Patel' }, { category: 'accessories' })).expect(201);
    expect(await Customer.findOne({ mobile: '+919000000012' }).lean()).toMatchObject({
      name: 'Priya Patel',
      interest: 'Accessories',
    });
  });

  it('adds the purchase to the existing customer when the number is already known', async () => {
    const rohit = await createTestCustomer();
    const res = await record(forNumber({ mobile: '9876543210', name: 'Someone Else' })).expect(201);
    expect(res.body.data.customerCreated).toBe(false);
    expect(await Customer.countDocuments()).toBe(1);
    const fresh = await Customer.findById(rohit._id).lean();
    expect(fresh.name).toBe('Rohit Sharma'); // never overwritten
    expect(await Purchase.countDocuments({ customerId: rohit._id })).toBe(1);
  });

  it('a second purchase for the same new number goes to the same customer', async () => {
    await record(forNumber({ mobile: '9000000013' })).expect(201);
    const second = await record(forNumber({ mobile: '9000000013' })).expect(201);
    expect(second.body.data.customerCreated).toBe(false);
    expect(await Customer.countDocuments({ mobile: '+919000000013' })).toBe(1);
    expect(await Purchase.countDocuments()).toBe(2);
  });

  it('does not leave a customer behind when the purchase fails', async () => {
    const first = await record(forNumber({ mobile: '9000000014' })).expect(201);
    // Duplicate invoice number → purchase rejected → the new customer must not be created
    await record(forNumber({ mobile: '9000000015' }, { invoiceNumber: first.body.data.purchase.invoiceNumber })).expect(409);
    // Redeeming points a brand-new customer does not have
    await record(forNumber({ mobile: '9000000016' }, { loyaltyRedemption: { points: 100 } })).expect(422);
    expect(await Customer.exists({ mobile: '+919000000015' })).toBeNull();
    expect(await Customer.exists({ mobile: '+919000000016' })).toBeNull();
  });

  it.each([
    ['neither a customer nor a number', (b) => { delete b.newCustomer; return b; }],
    ['both a customer and a number', (b) => ({ ...b, customerId: '000000000000000000000001' })],
    ['an invalid mobile number', (b) => ({ ...b, newCustomer: { mobile: '12345' } })],
    ['an invalid name', (b) => ({ ...b, newCustomer: { mobile: '9000000017', name: '1234' } })],
    ['unknown fields', (b) => ({ ...b, newCustomer: { mobile: '9000000017', loyaltyPoints: 500 } })],
  ])('rejects %s', async (_label, mutate) => {
    await record(mutate(forNumber({ mobile: '9000000017' }))).expect(422);
    expect(await Customer.exists({ mobile: '+919000000017' })).toBeNull();
  });

  it('refuses a number that belongs to a deactivated customer', async () => {
    await createTestCustomer({ mobile: '+919000000018', isActive: false });
    await record(forNumber({ mobile: '9000000018' })).expect(422);
  });
});

describe('Customer signs up later with that number', () => {
  it('sees the purchases and is asked once to confirm their details', async () => {
    const recorded = await record(forNumber({ mobile: '9000000021' })).expect(201);

    // The app treats the number as an existing account: sign in with OTP
    const check = await api().post('/api/v1/auth/customer/check').send({ mobile: '9000000021' }).expect(200);
    expect(check.body.data.exists).toBe(true);

    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9000000021' }).expect(200);
    const first = await api()
      .post('/api/v1/auth/customer/verify-otp')
      .send({ mobile: '9000000021', otp: DEV_OTP })
      .expect(200);
    expect(first.body.data).toMatchObject({ isNewUser: false, needsProfileReview: true });
    expect(first.body.data.customer.loyaltyPoints).toBe(recorded.body.data.purchase.loyalty.pointsEarned);

    const auth = `Bearer ${first.body.data.token}`;
    const list = await api().get('/api/v1/customer/purchases').set('Authorization', auth).expect(200);
    expect(list.body.data.items.map((p) => p.invoiceNumber)).toEqual([recorded.body.data.purchase.invoiceNumber]);

    // They fix the placeholder name
    const me = await api().patch('/api/v1/customer/me').set('Authorization', auth).send({ name: 'Amit Verma' }).expect(200);
    expect(me.body.data.customer.name).toBe('Amit Verma');

    // Only the first sign-in asks
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9000000021' }).expect(200);
    const second = await api()
      .post('/api/v1/auth/customer/verify-otp')
      .send({ mobile: '9000000021', otp: DEV_OTP })
      .expect(200);
    expect(second.body.data).toMatchObject({ needsProfileReview: false, customer: { name: 'Amit Verma' } });
  });

  it('self-registered customers are not asked to review', async () => {
    await api().post('/api/v1/auth/customer/register').send({ name: 'Neha Joshi', mobile: '9000000022', interest: 'Mobile' }).expect(200);
    const res = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9000000022', otp: DEV_OTP }).expect(200);
    expect(res.body.data).toMatchObject({ isNewUser: true, needsProfileReview: false });
  });
});
