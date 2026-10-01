import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Coupon, Customer, Purchase, StoreSettings } from '../src/models/index.js';
import { buildApp, createTestCustomer, DEV_OTP, loginAsAdmin, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

/** Self-registers a new app user and returns their auth header + id */
const registerNewUser = async (mobile = '9000000031') => {
  await api().post('/api/v1/auth/customer/register').send({ name: 'Neha Joshi', mobile, interest: 'Mobile' }).expect(200);
  const res = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile, otp: DEV_OTP }).expect(200);
  return { auth: `Bearer ${res.body.data.token}`, id: res.body.data.customer.id };
};

const offerOf = (auth) => api().get('/api/v1/customer/offers/welcome').set('Authorization', auth);
const claim = (auth, key) => api().post(`/api/v1/customer/offers/welcome/${key}/claim`).set('Authorization', auth);

let adminAuth;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
});

const patchVouchers = (welcomeVouchers) =>
  api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ offers: { welcomeVouchers } });

describe('Welcome vouchers: unlocked on joining the app', () => {
  it('a new customer gets both vouchers straight away and claims them one by one', async () => {
    const { auth } = await registerNewUser();

    const before = await offerOf(auth).expect(200);
    expect(before.body.data.status).toBe('ready');
    expect(before.body.data.vouchers).toMatchObject([
      {
        key: 'glass',
        title: 'Free 6D Toughened Glass',
        campaignCode: 'WELCOME6D',
        status: 'ready',
        discount: { type: 'free_item', value: 299, itemName: '6D Toughened Glass' },
        validityDays: 30,
      },
      {
        key: 'accessories',
        title: '₹200 off Mobile Accessories',
        campaignCode: 'SAVE200',
        status: 'ready',
        discount: { type: 'flat', value: 200 },
        minBillAmount: 2000,
        appliesTo: ['accessories'],
      },
    ]);

    const glass = (await claim(auth, 'glass').expect(201)).body.data.coupon;
    expect(glass).toMatchObject({ campaignCode: 'WELCOME6D', status: 'active', appliesTo: ['accessories'] });
    expect(glass.code).toMatch(/^SM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const days = (new Date(glass.expiresAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);

    // Claiming again returns the same voucher; the other one is still waiting
    expect((await claim(auth, 'glass').expect(200)).body.data.coupon.code).toBe(glass.code);
    const middle = (await offerOf(auth)).body.data;
    expect(middle.status).toBe('ready');
    expect(middle.vouchers.map((v) => v.status)).toEqual(['claimed', 'ready']);

    await claim(auth, 'accessories').expect(201);
    const after = (await offerOf(auth)).body.data;
    expect(after.status).toBe('claimed');
    expect(after.vouchers.every((v) => v.coupon?.status === 'active')).toBe(true);

    const mine = await api().get('/api/v1/customer/coupons').set('Authorization', auth).expect(200);
    expect(mine.body.data.items.map((c) => c.campaignCode).sort()).toEqual(['SAVE200', 'WELCOME6D']);
    await claim(auth, 'unknown').expect(422);
  });

  it('simultaneous claims still create one voucher', async () => {
    const { auth } = await registerNewUser('9000000032');
    const results = await Promise.all([claim(auth, 'accessories'), claim(auth, 'accessories'), claim(auth, 'accessories')]);
    expect(new Set(results.map((r) => r.body.data.coupon.code)).size).toBe(1);
    expect(await Coupon.countDocuments()).toBe(1);
  });

  it('customers who joined before the offer do not get vouchers', async () => {
    await createTestCustomer();
    await Customer.updateOne({ mobile: '+919876543210' }, { $set: { mobileVerifiedAt: new Date('2025-01-01') } });
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    const login = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9876543210', otp: DEV_OTP }).expect(200);
    const auth = `Bearer ${login.body.data.token}`;
    expect((await offerOf(auth)).body.data).toEqual({ status: 'unavailable', vouchers: [] });
    await claim(auth, 'glass').expect(403);
  });

  it('the admin can change the terms, switch a voucher off, or switch both off', async () => {
    const { auth } = await registerNewUser('9000000034');
    const res = await patchVouchers({ validityDays: 15, glass: { value: 399, itemName: '9D Glass' }, accessories: { enabled: false } }).expect(200);
    expect(res.body.data.settings.offers.welcomeVouchers).toMatchObject({
      enabled: true,
      validityDays: 15,
      glass: { code: 'WELCOME6D', itemName: '9D Glass', value: 399 },
      accessories: { enabled: false, code: 'SAVE200' },
    });
    const offer = (await offerOf(auth)).body.data;
    expect(offer.vouchers.map((v) => [v.key, v.title])).toEqual([['glass', 'Free 9D Glass']]);
    await claim(auth, 'accessories').expect(404);

    await patchVouchers({ enabled: false }).expect(200);
    expect((await offerOf(auth)).body.data.status).toBe('unavailable');

    await patchVouchers({ accessories: { code: 'welcome6d' } }).expect(422); // same as the other voucher
    await patchVouchers({ glass: { code: 'SM7KQ2XH4P' } }).expect(422); // looks like a personal code
    await patchVouchers({ glass: { code: 'no spaces' } }).expect(422);
  });

  it('stores whose settings predate the vouchers use the defaults', async () => {
    await api().get('/api/v1/admin/settings').set('Authorization', adminAuth).expect(200);
    await StoreSettings.collection.updateOne({}, { $unset: { offers: '' } });
    const { auth } = await registerNewUser('9000000035');
    const offer = (await offerOf(auth)).body.data;
    expect(offer.vouchers.map((v) => v.campaignCode)).toEqual(['WELCOME6D', 'SAVE200']);
  });
});

describe('Redeeming welcome vouchers at the counter', () => {
  const PHONE = { category: 'phones', product: { name: 'Redmi Note 14', imei: '358921104829104' }, price: 18000 };
  const GLASS = { category: 'accessories', product: { name: '6D Toughened Glass' }, price: 299 };
  const accessory = (price, name = 'boAt Airdopes 141') => ({ category: 'accessories', product: { name }, price });

  const setup = async (mobile) => {
    const { auth, id } = await registerNewUser(mobile);
    const glass = (await claim(auth, 'glass').expect(201)).body.data.coupon;
    const save = (await claim(auth, 'accessories').expect(201)).body.data.coupon;
    return { auth, customerId: id, glass, save };
  };
  let invoice = 0;
  const bill = (customerId, items, extra = {}) =>
    api()
      .post('/api/v1/admin/purchases')
      .set('Authorization', adminAuth)
      .send({
        customerId,
        invoiceNumber: `WV/${(invoice += 1)}`,
        items,
        payment: { method: 'Cash' },
        pricing: { discount: 0 },
        ...extra,
      });
  const lookup = (code, customerId) =>
    api()
      .get(`/api/v1/admin/coupons/${encodeURIComponent(code)}`)
      .query(customerId ? { customerId } : {})
      .set('Authorization', adminAuth);

  it('WELCOME6D makes the toughened glass free; the rest of the bill is unchanged', async () => {
    const { customerId } = await setup('9000000041');
    const res = await bill(customerId, [PHONE, GLASS], { couponCode: 'welcome6d' }).expect(201);
    const [phone, glassLine] = res.body.data.purchases;
    expect(glassLine.pricing).toMatchObject({ couponDiscount: 299, finalAmount: 0 });
    expect(phone.pricing).toMatchObject({ couponDiscount: 0, finalAmount: 18000 });
    expect(res.body.data.order.totals).toMatchObject({ couponDiscount: 299, finalAmount: 18000 });
  });

  it('the free glass is worth up to the voucher value, and needs an accessory on the bill', async () => {
    const { customerId } = await setup('9000000042');
    const noAccessory = await bill(customerId, [PHONE], { couponCode: 'WELCOME6D' }).expect(422);
    expect(noAccessory.body.errors[0].message).toMatch(/add the 6D Toughened Glass/);

    const pricier = await bill(customerId, [{ ...GLASS, price: 499 }], { couponCode: 'WELCOME6D' }).expect(201);
    expect(pricier.body.data.purchase.pricing).toMatchObject({ couponDiscount: 299, finalAmount: 200 });
  });

  it('SAVE200 needs ₹2,000 of accessories (phones do not count) and is taken off the accessories', async () => {
    const { customerId } = await setup('9000000043');
    const short = await bill(customerId, [PHONE, accessory(1500)], { couponCode: 'SAVE200' }).expect(422);
    expect(short.body.errors[0].message).toMatch(/needs ₹2,000 of accessories on the bill \(now ₹1,500\)/);

    const ok = await bill(customerId, [PHONE, accessory(1500), accessory(600, 'Type-C Cable')], { couponCode: 'SAVE200' }).expect(201);
    const lines = ok.body.data.purchases;
    expect(lines.map((l) => l.pricing.couponDiscount)).toEqual([0, 142.86, 57.14]);
    expect(ok.body.data.order.totals).toMatchObject({ couponDiscount: 200, finalAmount: 19900 });
  });

  it('a voucher code needs the customer; the QR code identifies them by itself', async () => {
    const { customerId, save } = await setup('9000000044');
    const noCustomer = await lookup('SAVE200').expect(422);
    expect(noCustomer.body.errors[0].message).toMatch(/Select the customer first/);

    const typed = await lookup('save200', customerId).expect(200);
    expect(typed.body.data).toMatchObject({ usable: true, coupon: { code: save.code }, customer: { id: customerId } });

    const scanned = await lookup(save.code).expect(200);
    expect(scanned.body.data.customer.id).toBe(customerId);

    // Another customer who has not claimed it
    const other = await createTestCustomer();
    const notClaimed = await lookup('SAVE200', String(other._id)).expect(422);
    expect(notClaimed.body.errors[0].message).toMatch(/has not claimed the SAVE200 voucher/);
    await bill(String(other._id), [accessory(2500)], { couponCode: save.code }).expect(422); // someone else's QR
  });

  it('each voucher works once; cancelling the bill gives it back; expired vouchers are refused', async () => {
    const { customerId, glass } = await setup('9000000045');
    const first = await bill(customerId, [GLASS], { couponCode: 'WELCOME6D' }).expect(201);
    const again = await bill(customerId, [GLASS], { couponCode: 'WELCOME6D' }).expect(422);
    expect(again.body.errors[0].message).toBe('This voucher has already been used');

    await api()
      .post(`/api/v1/admin/purchases/${first.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Returned' })
      .expect(200);
    expect((await Coupon.findOne({ code: glass.code }).lean()).status).toBe('active');

    await Coupon.updateOne({ code: glass.code }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await bill(customerId, [GLASS], { couponCode: 'WELCOME6D' }).expect(422);
    expect(expired.body.errors[0].message).toBe('This voucher has expired');
    expect(await Purchase.countDocuments({ status: 'Purchased' })).toBe(0);
  });

  it('the customer sees each voucher as Active, Used or Expired', async () => {
    const { auth, customerId, save } = await setup('9000000046');
    await bill(customerId, [GLASS], { couponCode: 'WELCOME6D' }).expect(201);
    await Coupon.updateOne({ code: save.code }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const mine = (await api().get('/api/v1/customer/coupons').set('Authorization', auth).expect(200)).body.data.items;
    const byCode = Object.fromEntries(mine.map((c) => [c.campaignCode, c.status]));
    expect(byCode).toEqual({ WELCOME6D: 'redeemed', SAVE200: 'expired' });
  });

  it('a coupon issued by the earlier profile offer can still be used', async () => {
    const rohit = await createTestCustomer();
    await Coupon.create({
      code: 'SM-AAAA-BBBB',
      customerId: rohit._id,
      kind: 'welcome',
      discount: { type: 'flat', value: 200 },
      minBillAmount: 1000,
      expiresAt: new Date(Date.now() + 86400000),
    });
    const res = await bill(String(rohit._id), [PHONE], { couponCode: 'SM-AAAA-BBBB' }).expect(201);
    expect(res.body.data.order.totals.couponDiscount).toBe(200);
  });
});
