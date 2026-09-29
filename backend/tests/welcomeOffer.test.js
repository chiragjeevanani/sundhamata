import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Coupon, Customer, Purchase } from '../src/models/index.js';
import { buildApp, createTestCustomer, DEV_OTP, loginAsAdmin, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

const FULL_PROFILE = {
  name: 'Neha Joshi',
  email: 'neha@example.com',
  dob: '1996-04-12',
  gender: 'female',
  address: '12, Shivam Society',
  city: 'Ahmedabad',
  pincode: '382405',
};

/** Self-registers a new app user and returns their auth header + id */
const registerNewUser = async (mobile = '9000000031') => {
  await api().post('/api/v1/auth/customer/register').send({ name: 'Neha Joshi', mobile, interest: 'Mobile' }).expect(200);
  const res = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile, otp: DEV_OTP }).expect(200);
  return { auth: `Bearer ${res.body.data.token}`, id: res.body.data.customer.id };
};

const offerOf = (auth) => api().get('/api/v1/customer/offers/welcome').set('Authorization', auth);
const claim = (auth) => api().post('/api/v1/customer/offers/welcome/claim').set('Authorization', auth);
const updateProfile = (auth, body) => api().patch('/api/v1/customer/me').set('Authorization', auth).send(body);

let adminAuth;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
});

describe('Welcome offer: complete your profile, get a coupon', () => {
  it('asks a new customer to complete the profile, then issues one coupon', async () => {
    const { auth } = await registerNewUser();

    const before = await offerOf(auth).expect(200);
    expect(before.body.data).toMatchObject({
      status: 'complete_profile',
      offer: { discountType: 'flat', discountValue: 200, minBillAmount: 1000, validityDays: 90 },
    });
    expect(before.body.data.missingFields.map((f) => f.field)).toEqual(['email', 'dob', 'gender', 'address', 'city', 'pincode']);

    // Claiming too early is refused and says what is missing
    const early = await claim(auth).expect(422);
    expect(early.body.errors.map((e) => e.field)).toContain('email');

    await updateProfile(auth, FULL_PROFILE).expect(200);
    expect((await offerOf(auth)).body.data.status).toBe('ready');

    const first = await claim(auth).expect(201);
    const coupon = first.body.data.coupon;
    expect(coupon.code).toMatch(/^SM-[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(coupon).toMatchObject({ status: 'active', discount: { type: 'flat', value: 200 }, minBillAmount: 1000 });
    const days = (new Date(coupon.expiresAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(89.9);
    expect(days).toBeLessThanOrEqual(90);

    // Claiming again returns the same coupon, never a second one
    const again = await claim(auth).expect(200);
    expect(again.body.data.coupon.code).toBe(coupon.code);
    expect(await Coupon.countDocuments()).toBe(1);

    const status = await offerOf(auth).expect(200);
    expect(status.body.data).toMatchObject({ status: 'claimed', coupon: { code: coupon.code } });

    const mine = await api().get('/api/v1/customer/coupons').set('Authorization', auth).expect(200);
    expect(mine.body.data.items.map((c) => c.code)).toEqual([coupon.code]);
  });

  it('concurrent claims still produce a single coupon', async () => {
    const { auth } = await registerNewUser('9000000032');
    await updateProfile(auth, FULL_PROFILE).expect(200);
    const results = await Promise.all([claim(auth), claim(auth), claim(auth)]);
    const codes = new Set(results.map((r) => r.body.data.coupon.code));
    expect(codes.size).toBe(1);
    expect(await Coupon.countDocuments()).toBe(1);
  });

  it('a placeholder name from the store does not count as complete', async () => {
    // Store bills a purchase to a new number without a name, customer signs in later
    await api()
      .post('/api/v1/admin/purchases')
      .set('Authorization', adminAuth)
      .send({ ...samplePurchase('000000000000000000000000'), customerId: undefined, newCustomer: { mobile: '9000000033' } })
      .expect(201);
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9000000033' }).expect(200);
    const login = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9000000033', otp: DEV_OTP }).expect(200);
    const auth = `Bearer ${login.body.data.token}`;

    const { name: _n, ...withoutName } = FULL_PROFILE;
    await updateProfile(auth, withoutName).expect(200);
    const res = await offerOf(auth).expect(200);
    expect(res.body.data).toMatchObject({ status: 'complete_profile', missingFields: [{ field: 'name' }] });
  });

  it('existing customers (before the offer) are not eligible', async () => {
    await createTestCustomer();
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    // createTestCustomer is store-created → first sign-in makes them a new app user; simulate an old one:
    await Customer.updateOne({ mobile: '+919876543210' }, { $set: { mobileVerifiedAt: new Date('2025-01-01') } });
    const login = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9876543210', otp: DEV_OTP }).expect(200);
    const auth = `Bearer ${login.body.data.token}`;
    expect((await offerOf(auth)).body.data.status).toBe('unavailable');
    await claim(auth).expect(403);
  });

  it('the admin can switch the offer off and change its terms (new coupons only)', async () => {
    const { auth } = await registerNewUser('9000000034');
    await updateProfile(auth, FULL_PROFILE).expect(200);

    const patch = (welcome) =>
      api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ offers: { welcome } });
    await patch({ enabled: false }).expect(200);
    expect((await offerOf(auth)).body.data.status).toBe('unavailable');

    const res = await patch({ enabled: true, discountType: 'percent', discountValue: 10, maxDiscount: 500, validityDays: 30 }).expect(200);
    expect(res.body.data.settings.offers.welcome).toMatchObject({ discountType: 'percent', discountValue: 10, maxDiscount: 500, minBillAmount: 1000 });
    const coupon = (await claim(auth).expect(201)).body.data.coupon;
    expect(coupon.discount).toEqual({ type: 'percent', value: 10, maxAmount: 500 });

    await patch({ discountType: 'percent', discountValue: 150 }).expect(422);
    await patch({ validityDays: 0 }).expect(422);
  });
});

describe('Redeeming a coupon at the counter', () => {
  const issueCoupon = async (mobile, welcome) => {
    if (welcome) {
      await api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ offers: { welcome } }).expect(200);
    }
    const { auth, id } = await registerNewUser(mobile);
    await updateProfile(auth, FULL_PROFILE).expect(200);
    const coupon = (await claim(auth).expect(201)).body.data.coupon;
    return { coupon, customerId: id, auth };
  };
  const bill = (customerId, overrides) =>
    api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(samplePurchase(customerId, overrides));

  it('admin looks up the code (typed any way, or scanned) and sees the owner', async () => {
    const { coupon, customerId } = await issueCoupon('9000000041');
    const messy = coupon.code.toLowerCase().replace(/-/g, ' ');
    const res = await api().get(`/api/v1/admin/coupons/${encodeURIComponent(messy)}`).set('Authorization', adminAuth).expect(200);
    expect(res.body.data).toMatchObject({ usable: true, coupon: { code: coupon.code }, customer: { id: customerId, name: 'Neha Joshi' } });
    await api().get('/api/v1/admin/coupons/SM-XXXX-YYYY').set('Authorization', adminAuth).expect(404);
  });

  it('takes the discount off the bill, before loyalty points, and can be used only once', async () => {
    const { coupon, customerId, auth } = await issueCoupon('9000000042');
    const res = await bill(customerId, { couponCode: coupon.code, pricing: { purchaseAmount: 25000, discount: 1000 } }).expect(201);
    expect(res.body.data.purchase.pricing).toMatchObject({ purchaseAmount: 25000, discount: 1000, couponDiscount: 200, finalAmount: 23800 });
    expect(res.body.data.purchase.coupon).toEqual({ code: coupon.code });
    // Points are earned on what was actually paid
    expect(res.body.data.purchase.loyalty.pointsEarned).toBe(238);

    const again = await bill(customerId, { couponCode: coupon.code }).expect(422);
    expect(again.body.errors[0]).toMatchObject({ field: 'couponCode', message: 'This coupon has already been used' });

    const mine = await api().get('/api/v1/customer/coupons').set('Authorization', auth).expect(200);
    expect(mine.body.data.items[0]).toMatchObject({ status: 'redeemed', purchaseId: res.body.data.purchase.id });
  });

  it('percentage coupons respect their cap', async () => {
    const { coupon, customerId } = await issueCoupon('9000000043', { discountType: 'percent', discountValue: 10, maxDiscount: 500 });
    const res = await bill(customerId, { couponCode: coupon.code, pricing: { purchaseAmount: 20000, discount: 0 } }).expect(201);
    expect(res.body.data.purchase.pricing).toMatchObject({ couponDiscount: 500, finalAmount: 19500 });
  });

  it.each([
    ['another customer', async () => (await createTestCustomer())._id, /belongs to another customer/],
    ['a bill below the minimum', async (ctx) => ctx.customerId, /at least ₹1,000/, { pricing: { purchaseAmount: 999, discount: 0 } }],
    ['an unknown code', async (ctx) => ctx.customerId, /No coupon found/, { couponCode: 'SM-AAAA-BBBB' }],
  ])('rejects %s and leaves the coupon unused', async (_label, customerFor, message, overrides = {}) => {
    const ctx = await issueCoupon('9000000044');
    const res = await bill(await customerFor(ctx), { couponCode: ctx.coupon.code, ...overrides }).expect(422);
    expect(res.body.errors[0].message).toMatch(message);
    expect((await Coupon.findOne({ code: ctx.coupon.code }).lean()).status).toBe('active');
    expect(await Purchase.countDocuments()).toBe(0);
  });

  it('rejects an expired coupon', async () => {
    const { coupon, customerId } = await issueCoupon('9000000045');
    await Coupon.updateOne({ code: coupon.code }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await bill(customerId, { couponCode: coupon.code }).expect(422);
    expect(res.body.errors[0].message).toBe('This coupon has expired');
  });

  it('a failed purchase does not use up the coupon', async () => {
    const { coupon, customerId } = await issueCoupon('9000000046');
    // Redeeming loyalty points the customer does not have fails the whole purchase
    await bill(customerId, { couponCode: coupon.code, loyaltyRedemption: { points: 1000 } }).expect(422);
    expect((await Coupon.findOne({ code: coupon.code }).lean()).status).toBe('active');
  });

  it('two counters using the same coupon at once: only one bill gets it', async () => {
    const { coupon, customerId } = await issueCoupon('9000000047');
    const results = await Promise.all([bill(customerId, { couponCode: coupon.code }), bill(customerId, { couponCode: coupon.code })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(await Purchase.countDocuments({ 'coupon.code': coupon.code })).toBe(1);
  });

  it('cancelling the purchase gives the coupon back', async () => {
    const { coupon, customerId } = await issueCoupon('9000000048');
    const res = await bill(customerId, { couponCode: coupon.code }).expect(201);
    await api()
      .post(`/api/v1/admin/purchases/${res.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Customer returned the phone' })
      .expect(200);
    expect(await Coupon.findOne({ code: coupon.code }).lean()).toMatchObject({ status: 'active', purchaseId: null });
    await bill(customerId, { couponCode: coupon.code }).expect(201);
  });

  it('admin sees the customer coupons', async () => {
    const { coupon, customerId } = await issueCoupon('9000000049');
    const res = await api().get(`/api/v1/admin/customers/${customerId}/coupons`).set('Authorization', adminAuth).expect(200);
    expect(res.body.data.items.map((c) => c.code)).toEqual([coupon.code]);
  });
});

describe('Stores whose settings were saved before the offer existed', () => {
  it('still run the offer with the default terms', async () => {
    const { StoreSettings } = await import('../src/models/index.js');
    await api().get('/api/v1/admin/settings').set('Authorization', adminAuth).expect(200);
    await StoreSettings.collection.updateOne({}, { $unset: { offers: '' } });

    const settings = await api().get('/api/v1/admin/settings').set('Authorization', adminAuth).expect(200);
    expect(settings.body.data.settings.offers.welcome).toMatchObject({ enabled: true, discountValue: 200, minBillAmount: 1000 });

    const { auth } = await registerNewUser('9000000051');
    expect((await offerOf(auth)).body.data).toMatchObject({ status: 'complete_profile', offer: { discountValue: 200 } });
    await updateProfile(auth, FULL_PROFILE).expect(200);
    const coupon = (await claim(auth).expect(201)).body.data.coupon;
    expect(coupon).toMatchObject({ discount: { type: 'flat', value: 200 }, minBillAmount: 1000 });

    // Saving just one field later keeps the others at their defaults
    await api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ offers: { welcome: { validityDays: 30 } } }).expect(200);
    const after = await api().get('/api/v1/admin/settings').set('Authorization', adminAuth).expect(200);
    expect(after.body.data.settings.offers.welcome).toMatchObject({ enabled: true, discountValue: 200, validityDays: 30 });
  });
});
