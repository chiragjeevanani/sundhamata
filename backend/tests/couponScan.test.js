import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Coupon } from '../src/models/index.js';
import { buildApp, DEV_OTP, loginAsAdmin, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
});

const createOffer = (body) => api().post('/api/v1/admin/offers').set('Authorization', adminAuth).send(body);
const listOffers = async () => (await api().get('/api/v1/admin/offers').set('Authorization', adminAuth).expect(200)).body.data.items;
const redeem = (code, amount = 500) =>
  api().post(`/api/v1/admin/coupons/${encodeURIComponent(code)}/redeem`).set('Authorization', adminAuth).send({ amount });
const undo = (id) => api().post(`/api/v1/admin/coupons/by-id/${id}/undo-redeem`).set('Authorization', adminAuth);
const lookup = (code) => api().get(`/api/v1/admin/coupons/${encodeURIComponent(code)}`).set('Authorization', adminAuth);

let mobiles = 0;
/** A customer of the app who claimed a ₹100-off offer: returns their own coupon (the code in the QR) */
const claimedCoupon = async (offerCode = 'SCAN100', terms = {}) => {
  const offer = (await createOffer({ code: offerCode, discount: { type: 'flat', value: 100 }, ...terms }).expect(201)).body.data.offer;
  const mobile = `+9197000${String((mobiles += 1)).padStart(5, '0')}`;
  await api().post('/api/v1/auth/customer/register').send({ name: 'Ritu Shah', mobile, interest: 'Mobile' }).expect(200);
  const login = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile, otp: DEV_OTP }).expect(200);
  const auth = `Bearer ${login.body.data.token}`;
  const coupon = (await api().post(`/api/v1/customer/offers/${offer.id}/claim`).set('Authorization', auth).expect(201)).body.data.coupon;
  return { offer, coupon, auth };
};

describe('Admin → Scan Coupon: redeem a customer coupon without a bill', () => {
  it('redeems a scanned coupon once, counts it on the offer, and the customer sees it used', async () => {
    const { coupon, auth } = await claimedCoupon();

    const res = await redeem(coupon.code.toLowerCase().replace(/-/g, ' ')).expect(200);
    expect(res.body.data).toMatchObject({
      coupon: { id: coupon.id, status: 'redeemed', purchaseId: null, counterSale: { amount: 500, discount: 100 } },
      customer: { name: 'Ritu Shah' },
      usable: false,
      reason: 'This voucher has already been used',
    });
    expect((await listOffers())[0].stats.used).toBe(1);

    // A second scan is refused
    expect((await redeem(coupon.code).expect(422)).body.message).toBe('This voucher has already been used');
    // The customer's app shows it used
    const mine = (await api().get('/api/v1/customer/coupons').set('Authorization', auth).expect(200)).body.data;
    expect((mine.items ?? mine).find((c) => c.id === coupon.id).status).toBe('redeemed');
  });

  it("checks the coupon's conditions against the amount the customer is buying", async () => {
    const { coupon } = await claimedCoupon('ACC10', {
      discount: { type: 'percent', value: 10, maxAmount: 150 },
      appliesTo: ['accessories'],
      minBillAmount: 1000,
    });

    // No amount, or a bad one
    await api().post(`/api/v1/admin/coupons/${coupon.code}/redeem`).set('Authorization', adminAuth).send({}).expect(422);
    await redeem(coupon.code, 0).expect(422);
    await redeem(coupon.code, 'abc').expect(422);
    // Below the minimum: refused and still usable
    expect((await redeem(coupon.code, 999).expect(422)).body.message).toBe(
      'This voucher needs ₹1,000 of accessories on the bill (now ₹999)'
    );
    expect((await lookup(coupon.code).expect(200)).body.data.usable).toBe(true);

    // Enough: 10% of ₹1,200 = ₹120
    expect((await redeem(coupon.code, 1200).expect(200)).body.data.coupon.counterSale).toEqual({ amount: 1200, discount: 120 });
  });

  it('caps the discount and keeps it on the coupon until undone', async () => {
    const { coupon } = await claimedCoupon('BIG10', { discount: { type: 'percent', value: 10, maxAmount: 150 } });
    expect((await redeem(coupon.code, 5000).expect(200)).body.data.coupon.counterSale).toEqual({ amount: 5000, discount: 150 });
    expect((await undo(coupon.id).expect(200)).body.data.coupon.counterSale).toBeNull();
  });

  it('undo gives the coupon back (within a day), then it can be redeemed again', async () => {
    const { coupon } = await claimedCoupon();
    await redeem(coupon.code).expect(200);

    const back = await undo(coupon.id).expect(200);
    expect(back.body.data).toMatchObject({ coupon: { status: 'active', redeemedAt: null }, usable: true });
    expect((await listOffers())[0].stats.used).toBe(0);
    await undo(coupon.id).expect(422);

    await redeem(coupon.code).expect(200);
    await Coupon.updateOne({ _id: coupon.id }, { redeemedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    expect((await undo(coupon.id).expect(422)).body.message).toMatch(/more than a day ago/);
  });

  it('refuses expired coupons, shared codes and unknown codes', async () => {
    const { coupon } = await claimedCoupon();
    await Coupon.updateOne({ _id: coupon.id }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await redeem(coupon.code).expect(422)).body.message).toBe('This voucher has expired');
    expect((await lookup(coupon.code).expect(200)).body.data).toMatchObject({ usable: false, reason: 'This voucher has expired' });

    expect((await redeem('SCAN100').expect(422)).body.message).toMatch(/shared code/);
    await redeem('SM-ZZZZ-ZZZZ').expect(404);
    await api().post('/api/v1/admin/coupons/SM-ZZZZ-ZZZZ/redeem').expect(401);
  });
});
