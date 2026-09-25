import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTransactionSupportOverride } from '../src/config/db.js';
import { Customer, LoyaltyTransaction, Purchase } from '../src/models/index.js';
import { verifyLedgerConsistency } from '../src/services/loyalty.service.js';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
let rohit;

beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
  // Opening balance of 2,450 points (through the ledger, like a real adjustment)
  await api()
    .post('/api/v1/admin/loyalty/adjust')
    .set('Authorization', adminAuth)
    .send({ customerId: rohit.id, type: 'add', points: 2450, reason: 'Opening balance' })
    .expect(201);
});

afterEach(() => {
  vi.restoreAllMocks();
  setTransactionSupportOverride(true);
});

const create = (overrides) => api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(samplePurchase(rohit._id, overrides));
const redeem = (points, overrides = {}) => create({ loyaltyRedemption: { points }, ...overrides });
const balance = async () => (await Customer.findById(rohit._id)).loyaltyPoints;
const setLoyaltySettings = (loyalty) => api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ loyalty }).expect(200);

describe('Redeeming points while recording a purchase', () => {
  it('takes the points off the bill, then earns points only on what was paid', async () => {
    const res = await redeem(500).expect(201);
    const { purchase, customerLoyaltyBalance } = res.body.data;

    expect(purchase.pricing).toMatchObject({ purchaseAmount: 124999, discount: 0, loyaltyDiscount: 500, finalAmount: 124499 });
    // earned on ₹1,24,499 → 1,244 (not 1,249)
    expect(purchase.loyalty).toMatchObject({ pointsRedeemed: 500, pointsEarned: 1244 });
    expect(customerLoyaltyBalance).toBe(2450 - 500 + 1244);
    expect(await balance()).toBe(3194);

    const ledger = await LoyaltyTransaction.find({ purchaseId: purchase.id }).sort({ createdAt: 1, _id: 1 }).lean();
    expect(ledger.map((t) => [t.type, t.source, t.points, t.balanceAfter])).toEqual([
      ['redeemed', 'redemption', -500, 1950],
      ['earned', 'purchase', 1244, 3194],
    ]);
    expect(ledger[0]).toMatchObject({ title: 'Points Redeemed', description: 'Samsung Galaxy S25 Ultra — ₹500 off' });
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true });
  });

  it('applies after the discount, and tax is computed on the amount actually paid', async () => {
    const res = await redeem(1000, { pricing: { purchaseAmount: 20000, discount: 2000 } }).expect(201);
    const { pricing } = res.body.data.purchase;
    expect(pricing).toMatchObject({ purchaseAmount: 20000, discount: 2000, loyaltyDiscount: 1000, finalAmount: 17000 });
    expect(pricing.baseAmount + pricing.taxAmount).toBeCloseTo(17000, 2);
  });

  it('uses the configured value per point', async () => {
    await setLoyaltySettings({ rupeeValuePerPoint: 0.5 });
    const res = await redeem(1000, { pricing: { purchaseAmount: 10000 } }).expect(201);
    expect(res.body.data.purchase.pricing).toMatchObject({ loyaltyDiscount: 500, finalAmount: 9500 });
  });

  it('can pay the whole bill with points (then nothing is earned)', async () => {
    const res = await redeem(1500, { pricing: { purchaseAmount: 1500 } }).expect(201);
    expect(res.body.data.purchase.pricing.finalAmount).toBe(0);
    expect(res.body.data.purchase.loyalty).toMatchObject({ pointsRedeemed: 1500, pointsEarned: 0 });
    expect(await balance()).toBe(950);
  });

  it('0 points (or no redemption) records a normal purchase', async () => {
    const res = await redeem(0).expect(201);
    expect(res.body.data.purchase.loyalty).toMatchObject({ pointsRedeemed: 0, pointsEarned: 1249 });
    expect(await LoyaltyTransaction.countDocuments({ source: 'redemption' })).toBe(0);
  });
});

describe('Redemption rules', () => {
  const expectNothingChanged = async () => {
    expect(await Purchase.countDocuments()).toBe(0);
    expect(await balance()).toBe(2450);
    expect(await LoyaltyTransaction.countDocuments({ source: { $ne: 'admin_adjustment' } })).toBe(0);
  };

  it('cannot redeem more than the balance', async () => {
    const res = await redeem(2451).expect(422);
    expect(res.body.errors[0]).toMatchObject({ field: 'loyaltyRedemption.points' });
    expect(res.body.errors[0].message).toMatch(/only 2450 points/);
    await expectNothingChanged();
  });

  it('must meet the minimum per redemption; 0 in settings removes the minimum', async () => {
    const res = await redeem(499).expect(422);
    expect(res.body.message).toMatch(/At least 500 points/);
    await expectNothingChanged();

    await setLoyaltySettings({ minRedeemPoints: 0 });
    await redeem(50).expect(201);
  });

  it('cannot be worth more than the bill', async () => {
    const res = await redeem(1000, { pricing: { purchaseAmount: 900 } }).expect(422);
    expect(res.body.message).toMatch(/worth ₹1000, more than the ₹900 bill/);
    await redeem(1000, { pricing: { purchaseAmount: 1500, discount: 600 } }).expect(422); // bill is ₹900 after discount
    await expectNothingChanged();
  });

  it('rejects fractional, negative and malformed values', async () => {
    await redeem(500.5).expect(422);
    await redeem(-10).expect(422);
    await redeem('lots').expect(422);
    await create({ loyaltyRedemption: { points: 500, value: 9999 } }).expect(422); // the client cannot set the value
    await expectNothingChanged();
  });

  it('is refused when the point value is set to ₹0', async () => {
    await setLoyaltySettings({ rupeeValuePerPoint: 0 });
    const res = await redeem(500).expect(422);
    expect(res.body.message).toMatch(/switched off/);
  });

  it('two simultaneous bills cannot spend the same points', async () => {
    const results = await Promise.all([redeem(2000), redeem(2000)]);
    const created = results.filter((r) => r.status === 201);
    expect(created).toHaveLength(1);
    expect(results.find((r) => r.status !== 201).status).toBe(422);
    expect(await Purchase.countDocuments()).toBe(1);
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true });
  });
});

describe.each([
  ['MongoDB transaction', true],
  ['compensating rollback', false],
])('Atomicity (%s)', (_label, transactionsSupported) => {
  it('if earning fails after the redemption, nothing is kept: no purchase, no spent points', async () => {
    setTransactionSupportOverride(transactionsSupported);
    const realCreate = LoyaltyTransaction.create.bind(LoyaltyTransaction);
    let calls = 0;
    vi.spyOn(LoyaltyTransaction, 'create').mockImplementation((...args) => {
      calls += 1;
      if (calls === 2) return Promise.reject(new Error('Simulated failure while crediting earned points'));
      return realCreate(...args);
    });

    await redeem(500).expect(500);
    vi.restoreAllMocks();

    expect(await Purchase.countDocuments()).toBe(0);
    expect(await balance()).toBe(2450);
    expect(await LoyaltyTransaction.countDocuments({ source: 'redemption' })).toBe(0);
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true, cachedBalance: 2450 });
  });
});

describe('Cancelling a purchase paid partly with points', () => {
  it('returns the redeemed points and reverses the earned ones', async () => {
    const created = await redeem(500).expect(201);
    expect(await balance()).toBe(3194);

    const res = await api()
      .post(`/api/v1/admin/purchases/${created.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Returned' })
      .expect(200);

    expect(res.body.data.loyalty).toEqual({ pointsReversed: 1244, reversalShortfall: 0, pointsRefunded: 500 });
    expect(res.body.message).toMatch(/500 redeemed points returned/);
    expect(res.body.data.purchase.loyalty).toMatchObject({ pointsRedeemed: 500, pointsRefunded: 500, pointsReversed: 1244 });
    expect(await balance()).toBe(2450); // exactly where the customer started

    const ledger = await LoyaltyTransaction.find({ purchaseId: created.body.data.purchase.id }).sort({ createdAt: 1, _id: 1 }).lean();
    expect(ledger.map((t) => [t.source, t.points])).toEqual([
      ['redemption', -500],
      ['purchase', 1244],
      ['redemption_refund', 500],
      ['purchase_cancellation', -1244],
    ]);
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true });
  });

  it('returns redeemed points before reversing, so less is lost when points were spent since', async () => {
    const created = await redeem(500).expect(201); // 2450 - 500 + 1244 = 3194
    await api()
      .post('/api/v1/admin/loyalty/adjust')
      .set('Authorization', adminAuth)
      .send({ customerId: rohit.id, type: 'deduct', points: 3000, reason: 'Redeemed on another bill' })
      .expect(201); // 194 left

    const res = await api()
      .post(`/api/v1/admin/purchases/${created.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({})
      .expect(200);

    // +500 returned first (694), then 694 of the 1,244 earned points can be reversed
    expect(res.body.data.loyalty).toEqual({ pointsReversed: 694, reversalShortfall: 550, pointsRefunded: 500 });
    expect(await balance()).toBe(0);
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true });
  });
});

describe('Customer view', () => {
  it('shows points redeemed on the purchase and the redemption in their ledger', async () => {
    const created = await redeem(500).expect(201);
    const { auth } = await loginAsCustomer(app, '9876543210');

    const mine = await api().get(`/api/v1/customer/purchases/${created.body.data.purchase.id}`).set('Authorization', auth).expect(200);
    expect(mine.body.data.purchase.pricing.loyaltyDiscount).toBe(500);
    expect(mine.body.data.purchase.loyalty.pointsRedeemed).toBe(500);

    const debits = await api().get('/api/v1/customer/loyalty/transactions').query({ direction: 'debit' }).set('Authorization', auth).expect(200);
    expect(debits.body.data.items[0]).toMatchObject({ type: 'redeemed', title: 'Points Redeemed', points: -500 });

    const summary = await api().get('/api/v1/customer/loyalty/summary').set('Authorization', auth).expect(200);
    expect(summary.body.data.thisMonth.redeemed).toBe(500);
  });

  it('admin loyalty summary counts point redemptions', async () => {
    await redeem(500).expect(201);
    const res = await api().get('/api/v1/admin/loyalty/summary').set('Authorization', adminAuth).expect(200);
    expect(res.body.data.pointsRedeemed).toBe(500);
  });
});
