import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Coupon, Offer } from '../src/models/index.js';
import { buildApp, createTestCustomer, DEV_OTP, loginAsAdmin, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

/** IST calendar day, `offset` days from today, as "YYYY-MM-DD" */
const istDay = (offset = 0) => new Date(Date.now() + 330 * 60000 + offset * 86400000).toISOString().slice(0, 10);

const PHONE = { category: 'phones', product: { name: 'Vivo V40', imei: '358921104829104' }, price: 20000 };
const CASE = { category: 'accessories', product: { name: 'Back Cover' }, price: 500 };
const DIWALI = {
  code: 'diwali500',
  discount: { type: 'flat', value: 500 },
  appliesTo: ['phones'],
  minBillAmount: 15000,
};

let adminAuth;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
});

const createOffer = (body) => api().post('/api/v1/admin/offers').set('Authorization', adminAuth).send(body);
const updateOffer = (id, body) => api().patch(`/api/v1/admin/offers/${id}`).set('Authorization', adminAuth).send(body);
const listOffers = async () => (await api().get('/api/v1/admin/offers').set('Authorization', adminAuth).expect(200)).body.data.items;

let invoice = 0;
const bill = (customer, items, couponCode) =>
  api()
    .post('/api/v1/admin/purchases')
    .set('Authorization', adminAuth)
    .send({
      ...(typeof customer === 'string' ? { customerId: customer } : { newCustomer: customer }),
      invoiceNumber: `OF/${(invoice += 1)}`,
      items,
      payment: { method: 'Cash' },
      pricing: { discount: 0 },
      ...(couponCode ? { couponCode } : {}),
    });
const lookup = (code, customerId) =>
  api()
    .get(`/api/v1/admin/coupons/${encodeURIComponent(code)}`)
    .query(customerId ? { customerId } : {})
    .set('Authorization', adminAuth);
const cancel = (purchaseId) =>
  api().post(`/api/v1/admin/purchases/${purchaseId}/cancel`).set('Authorization', adminAuth).send({ reason: 'Returned' }).expect(200);

let mobiles = 0;
const newCustomerId = async () => String((await createTestCustomer({ mobile: `+9198000${String((mobiles += 1)).padStart(5, '0')}` }))._id);

const registerAppUser = async (mobile) => {
  await api().post('/api/v1/auth/customer/register').send({ name: 'Ritu Shah', mobile, interest: 'Mobile' }).expect(200);
  const res = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile, otp: DEV_OTP }).expect(200);
  return { auth: `Bearer ${res.body.data.token}`, id: res.body.data.customer.id };
};
const myOffers = async (auth) => (await api().get('/api/v1/customer/offers').set('Authorization', auth).expect(200)).body.data;
const claim = (auth, id) => api().post(`/api/v1/customer/offers/${id}/claim`).set('Authorization', auth);

describe('Admin → Coupons: staff create their own offers', () => {
  it('creates an offer with sensible defaults and an automatic name', async () => {
    const res = await createOffer(DIWALI).expect(201);
    expect(res.body.data.offer).toMatchObject({
      code: 'DIWALI500',
      title: null,
      displayTitle: '₹500 off Mobiles',
      displayDescription: 'Shop for ₹15,000 or more of mobiles',
      discount: { type: 'flat', value: 500, maxAmount: null, itemName: null },
      audience: 'all',
      usesPerCustomer: 1,
      totalUses: null,
      isActive: true,
      showInApp: true,
      status: 'active',
      stats: { used: 0, customers: 0 },
    });
    expect((await listOffers()).map((o) => o.code)).toEqual(['DIWALI500']);
  });

  it('checks the terms', async () => {
    const tooMuch = await createOffer({ code: 'HALF', discount: { type: 'percent', value: 150 } }).expect(422);
    expect(tooMuch.body.errors[0]).toMatchObject({ field: 'discount.value' });
    const noItem = await createOffer({ code: 'FREEBIE', discount: { type: 'free_item', value: 299 } }).expect(422);
    expect(noItem.body.errors[0]).toMatchObject({ field: 'discount.itemName' });
    const backwards = await createOffer({ ...DIWALI, startsAt: istDay(5), endsAt: istDay(2) }).expect(422);
    expect(backwards.body.errors[0]).toMatchObject({ field: 'endsAt' });
    await createOffer({ ...DIWALI, code: 'SM7KQ2XH4P' }).expect(422); // looks like a personal QR code
  });

  it('codes are unique, and never the same as a welcome voucher code', async () => {
    await createOffer(DIWALI).expect(201);
    await createOffer({ ...DIWALI, code: 'Diwali500' }).expect(409);
    const welcome = await createOffer({ ...DIWALI, code: 'WELCOME6D' }).expect(409);
    expect(welcome.body.errors[0].message).toBe('Used by a welcome voucher');
    // …and the other way round
    const settings = await api()
      .patch('/api/v1/admin/settings')
      .set('Authorization', adminAuth)
      .send({ offers: { welcomeVouchers: { glass: { code: 'DIWALI500' } } } })
      .expect(409);
    expect(settings.body.message).toMatch(/already used by an offer/);
  });

  it('only offers nobody has used can be deleted', async () => {
    const unused = (await createOffer({ ...DIWALI, code: 'UNUSED1' }).expect(201)).body.data.offer;
    await api().delete(`/api/v1/admin/offers/${unused.id}`).set('Authorization', adminAuth).expect(200);

    const used = (await createOffer(DIWALI).expect(201)).body.data.offer;
    await bill(await newCustomerId(), [PHONE], 'DIWALI500').expect(201);
    const refused = await api().delete(`/api/v1/admin/offers/${used.id}`).set('Authorization', adminAuth).expect(409);
    expect(refused.body.message).toMatch(/Pause it instead/);
  });
});

describe('Using an offer code at the counter', () => {
  it('typing the code for the selected customer takes the discount and records their coupon', async () => {
    await createOffer(DIWALI).expect(201);
    const customerId = await newCustomerId();

    const preview = (await lookup('diwali500', customerId).expect(200)).body.data;
    expect(preview).toMatchObject({ usable: true, customer: { id: customerId }, coupon: { code: 'DIWALI500', issuedOnBill: true } });

    const res = await bill(customerId, [PHONE, CASE], 'DIWALI500').expect(201);
    expect(res.body.data.order.totals).toMatchObject({ couponDiscount: 500, finalAmount: 20000 });
    expect(res.body.data.purchases.map((l) => l.pricing.couponDiscount)).toEqual([500, 0]); // mobiles only

    const coupon = await Coupon.findOne({ customerId }).lean();
    expect(coupon).toMatchObject({ kind: 'offer', campaignCode: 'DIWALI500', status: 'redeemed', title: '₹500 off Mobiles' });
    expect((await Offer.findOne({ code: 'DIWALI500' }).lean()).redeemedCount).toBe(1);
    expect((await listOffers())[0].stats).toEqual({ used: 1, customers: 1 });

    const again = await bill(customerId, [PHONE], 'DIWALI500').expect(422);
    expect(again.body.errors[0].message).toBe('This customer has already used DIWALI500');
  });

  it('the minimum and categories still apply', async () => {
    await createOffer(DIWALI).expect(201);
    const customerId = await newCustomerId();
    const short = await bill(customerId, [{ ...PHONE, price: 12000 }, { ...CASE, price: 5000 }], 'DIWALI500').expect(422);
    expect(short.body.errors[0].message).toMatch(/needs ₹15,000 of mobiles on the bill \(now ₹12,000\)/);
    expect(await Coupon.countDocuments()).toBe(0); // nothing issued for a refused bill
  });

  it('works for a walk-in recorded with just a mobile number', async () => {
    await createOffer({ code: 'FLAT10', discount: { type: 'percent', value: 10, maxAmount: 1000 } }).expect(201);
    const preview = (await lookup('FLAT10').expect(200)).body.data;
    expect(preview).toMatchObject({ customer: null, usable: true, coupon: { code: 'FLAT10' } });

    const res = await bill({ mobile: '9876500011' }, [PHONE], 'FLAT10').expect(201);
    expect(res.body.data.order.totals).toMatchObject({ couponDiscount: 1000, finalAmount: 19000 }); // 10%, capped at ₹1,000
  });

  it('several uses per customer, and cancelling a bill gives the use back', async () => {
    await createOffer({ code: 'TWICE', discount: { type: 'flat', value: 100 }, usesPerCustomer: 2 }).expect(201);
    const customerId = await newCustomerId();
    const first = await bill(customerId, [CASE], 'TWICE').expect(201);
    await bill(customerId, [CASE], 'TWICE').expect(201);
    const third = await bill(customerId, [CASE], 'TWICE').expect(422);
    expect(third.body.errors[0].message).toBe('This customer has already used TWICE 2 times');

    await cancel(first.body.data.purchase.id);
    expect((await Offer.findOne({ code: 'TWICE' }).lean()).redeemedCount).toBe(1);
    await bill(customerId, [CASE], 'TWICE').expect(201); // the coupon given back
    expect(await Coupon.countDocuments({ customerId })).toBe(2);
  });

  it('a total limit across all customers', async () => {
    await createOffer({ code: 'FIRST1', discount: { type: 'flat', value: 100 }, totalUses: 1 }).expect(201);
    await bill(await newCustomerId(), [CASE], 'FIRST1').expect(201);
    const late = await bill(await newCustomerId(), [CASE], 'FIRST1').expect(422);
    expect(late.body.errors[0].message).toBe('The FIRST1 offer has been fully used');
    expect((await listOffers())[0].status).toBe('used_up');
  });

  it('paused, not yet started and ended offers cannot be used', async () => {
    const offer = (await createOffer(DIWALI).expect(201)).body.data.offer;
    const customerId = await newCustomerId();

    await updateOffer(offer.id, { isActive: false }).expect(200);
    expect((await lookup('DIWALI500', customerId).expect(422)).body.errors[0].message).toBe('The DIWALI500 offer is paused');

    await updateOffer(offer.id, { isActive: true, startsAt: istDay(3) }).expect(200);
    expect((await lookup('DIWALI500', customerId).expect(422)).body.errors[0].message).toMatch(/starts on/);
    expect((await listOffers())[0].status).toBe('scheduled');

    await Offer.updateOne({ _id: offer.id }, { $set: { startsAt: new Date(Date.now() - 2 * 86400000), endsAt: new Date(Date.now() - 1000) } });
    expect((await lookup('DIWALI500', customerId).expect(422)).body.errors[0].message).toBe('The DIWALI500 offer has ended');
  });

  it('first-purchase offers are refused for returning customers', async () => {
    await createOffer({ code: 'FIRSTBUY', discount: { type: 'flat', value: 300 }, audience: 'first_purchase' }).expect(201);
    const customerId = await newCustomerId();
    await bill(customerId, [CASE]).expect(201);
    const refused = await bill(customerId, [PHONE], 'FIRSTBUY').expect(422);
    expect(refused.body.errors[0].message).toBe("FIRSTBUY is only for a customer's first purchase");
    await bill(await newCustomerId(), [PHONE], 'FIRSTBUY').expect(201);
  });

  it('a new code replaces the old one, also for coupons already claimed', async () => {
    const offer = (await createOffer({ ...DIWALI, usesPerCustomer: 2 }).expect(201)).body.data.offer;
    const customerId = await newCustomerId();
    await bill(customerId, [PHONE], 'DIWALI500').expect(201);
    await updateOffer(offer.id, { code: 'DEEPAVALI' }).expect(200);
    expect((await Coupon.findOne({ customerId }).lean()).campaignCode).toBe('DEEPAVALI');
    await lookup('DIWALI500', customerId).expect(404);
    await bill(customerId, [PHONE], 'deepavali').expect(201);
  });
});

describe('Offers in the customer app', () => {
  it('scratch to claim: the customer gets their own QR coupon, which works at the counter', async () => {
    await createOffer({ ...DIWALI, endsAt: istDay(10), validityDays: 30 }).expect(201);
    const { auth, id } = await registerAppUser('9000000071');

    const { offers } = await myOffers(auth);
    expect(offers).toMatchObject([{ campaignCode: 'DIWALI500', title: '₹500 off Mobiles', status: 'ready', unlock: 'register' }]);

    const coupon = (await claim(auth, offers[0].id).expect(201)).body.data.coupon;
    expect(coupon).toMatchObject({ kind: 'offer', campaignCode: 'DIWALI500', status: 'active' });
    // Valid until the offer ends (sooner than 30 days)
    const days = (new Date(coupon.expiresAt) - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(9);
    expect(days).toBeLessThan(11.1);

    expect((await claim(auth, offers[0].id).expect(200)).body.data.coupon.code).toBe(coupon.code);
    expect((await myOffers(auth)).offers[0]).toMatchObject({ status: 'claimed', coupon: { code: coupon.code } });

    // Scanned QR at the counter
    const res = await bill(id, [PHONE], coupon.code).expect(201);
    expect(res.body.data.order.totals.couponDiscount).toBe(500);
    // Used up → no longer offered; it shows under My Coupons as Used
    expect((await myOffers(auth)).offers).toEqual([]);
    const mine = (await api().get('/api/v1/customer/coupons').set('Authorization', auth).expect(200)).body.data.items;
    expect(mine.find((c) => c.campaignCode === 'DIWALI500').status).toBe('redeemed');
  });

  it('a claimed coupon stops working while the offer is paused', async () => {
    const offer = (await createOffer(DIWALI).expect(201)).body.data.offer;
    const { auth, id } = await registerAppUser('9000000072');
    const coupon = (await claim(auth, offer.id).expect(201)).body.data.coupon;
    await updateOffer(offer.id, { isActive: false }).expect(200);
    expect((await bill(id, [PHONE], coupon.code).expect(422)).body.errors[0].message).toBe('The DIWALI500 offer is paused');
    expect((await myOffers(auth)).offers).toEqual([]);
  });

  it('counter-only offers are not listed in the app', async () => {
    const offer = (await createOffer({ ...DIWALI, showInApp: false }).expect(201)).body.data.offer;
    const { auth } = await registerAppUser('9000000073');
    expect((await myOffers(auth)).offers).toEqual([]);
    await claim(auth, offer.id).expect(404);
  });

  it('profile-complete offers show locked until the profile is 100% complete', async () => {
    const offer = (await createOffer({ code: 'PROFILE100', discount: { type: 'flat', value: 100 }, audience: 'profile_complete' }).expect(201)).body.data.offer;
    const { auth } = await registerAppUser('9000000074');

    const before = await myOffers(auth);
    expect(before.offers[0]).toMatchObject({ status: 'locked', unlock: 'profile' });
    expect(before.profile.percent).toBe(14);
    expect((await claim(auth, offer.id).expect(422)).body.message).toBe('PROFILE100 needs a 100% complete profile in the app');

    await api()
      .patch('/api/v1/customer/me')
      .set('Authorization', auth)
      .send({ email: 'ritu@example.com', dob: '1995-02-01', gender: 'female', address: '4, Laxmi Nagar', city: 'Surat', pincode: '395007' })
      .expect(200);
    expect((await myOffers(auth)).offers[0].status).toBe('ready');
    await claim(auth, offer.id).expect(201);
  });

  it('staff cannot give a profile-complete offer at the counter while the profile is incomplete', async () => {
    await createOffer({ code: 'PROFILE100', discount: { type: 'flat', value: 100 }, audience: 'profile_complete' }).expect(201);
    const { auth, id } = await registerAppUser('9000000077');

    // Typed at the counter: refused, nothing issued, no discount
    const looked = await lookup('PROFILE100', id).expect(422);
    expect(looked.body.errors[0].message).toBe('PROFILE100 needs a 100% complete profile in the app');
    const refused = await bill(id, [CASE], 'PROFILE100').expect(422);
    expect(refused.body.errors[0].message).toBe('PROFILE100 needs a 100% complete profile in the app');
    // A walk-in recorded with just a mobile number cannot use it either
    await lookup('PROFILE100').expect(422);
    await bill({ mobile: '9876500077' }, [CASE], 'PROFILE100').expect(422);
    expect(await Coupon.countDocuments({ kind: 'offer' })).toBe(0);
    expect((await Offer.findOne({ code: 'PROFILE100' }).lean()).redeemedCount).toBe(0);

    // Once the profile is complete, the same code works at the counter
    await api()
      .patch('/api/v1/customer/me')
      .set('Authorization', auth)
      .send({ email: 'kiran@example.com', dob: '1993-08-21', gender: 'male', address: '9, Ram Nagar', city: 'Vadodara', pincode: '390001' })
      .expect(200);
    const ok = await bill(id, [CASE], 'PROFILE100').expect(201);
    expect(ok.body.data.order.totals.couponDiscount).toBe(100);
  });

  it('new-app-user offers are only for customers who joined through the app', async () => {
    await createOffer({ code: 'APPNEW', discount: { type: 'flat', value: 100 }, audience: 'new_app_users' }).expect(201);
    const { auth } = await registerAppUser('9000000075');
    expect((await myOffers(auth)).offers).toHaveLength(1);
    const walkIn = await bill(await newCustomerId(), [CASE], 'APPNEW').expect(422);
    expect(walkIn.body.errors[0].message).toBe('APPNEW is only for new app users');
  });

  it('a used-up offer tells the customer they already used it', async () => {
    const offer = (await createOffer(DIWALI).expect(201)).body.data.offer;
    const { auth, id } = await registerAppUser('9000000076');
    await bill(id, [PHONE], 'DIWALI500').expect(201);
    expect((await claim(auth, offer.id).expect(422)).body.message).toBe('You have already used DIWALI500');
  });
});
