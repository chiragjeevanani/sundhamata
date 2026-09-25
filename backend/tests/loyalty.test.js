import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Customer, LoyaltyTransaction } from '../src/models/index.js';
import { verifyLedgerConsistency } from '../src/services/loyalty.service.js';
import {
  buildApp,
  createTestCustomer,
  loginAsAdmin,
  loginAsCustomer,
  samplePurchase,
  useTestDatabase,
} from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
let rohit;

beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
});

const createPurchase = (body) => api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(body);
const adjust = (body) =>
  api().post('/api/v1/admin/loyalty/adjust').set('Authorization', adminAuth).send({ customerId: rohit.id, reason: 'Store promotion bonus', ...body });
const balanceOf = async (id = rohit._id) => (await Customer.findById(id)).loyaltyPoints;

const expectConsistent = async (id = rohit._id) => {
  const result = await verifyLedgerConsistency(id);
  expect(result).toMatchObject({ consistent: true });
};

describe('Purchase loyalty', () => {
  it('24. a purchase creates a loyalty transaction', async () => {
    const res = await createPurchase(samplePurchase(rohit._id)).expect(201);
    const txns = await LoyaltyTransaction.find({ customerId: rohit._id }).lean();
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({
      type: 'earned',
      source: 'purchase',
      points: 1249,
      title: 'Purchase Reward',
      description: 'Samsung Galaxy S25 Ultra',
      balanceAfter: 1249,
    });
    expect(txns[0].purchaseId.toString()).toBe(res.body.data.purchase.id);
  });

  it('25. a purchase updates the customer balance (2,450 + 1,249 = 3,699)', async () => {
    await adjust({ type: 'add', points: 2450, reason: 'Opening balance' }).expect(201);
    await createPurchase(samplePurchase(rohit._id)).expect(201);
    expect(await balanceOf()).toBe(3699);
    await expectConsistent();
  });

  it('26. calculates points server-side: floor(final / 100 × rate)', async () => {
    const cases = [
      [124999, 0, 1249],
      [99, 0, 0],
      [100, 0, 1],
      [20000, 1000, 190], // on the post-discount amount
      [1999.99, 0, 19],
    ];
    let expected = 0;
    for (const [purchaseAmount, discount, points] of cases) {
      const res = await createPurchase(samplePurchase(rohit._id, { pricing: { purchaseAmount, discount } })).expect(201);
      expect(res.body.data.purchase.loyalty.pointsEarned).toBe(points);
      expected += points;
    }
    expect(await balanceOf()).toBe(expected);
    // Zero-point purchases don't create empty ledger entries
    expect(await LoyaltyTransaction.countDocuments({ points: 0 })).toBe(0);
    await expectConsistent();
  });

  it('uses the configured rate from settings, not a hardcoded one', async () => {
    await api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ loyalty: { pointsPerHundredRupees: 1.5 } }).expect(200);
    const res = await createPurchase(samplePurchase(rohit._id)).expect(201);
    expect(res.body.data.purchase.loyalty.pointsEarned).toBe(1874); // floor(1249.99 × 1.5)
  });
});

describe('Admin adjustments', () => {
  it('27. adds points', async () => {
    const res = await adjust({ type: 'add', points: 500 }).expect(201);
    expect(res.body.data.balance).toBe(500);
    expect(res.body.data.transaction).toMatchObject({ type: 'adjustment', source: 'admin_adjustment', points: 500, direction: 'credit', balanceAfter: 500 });
    expect(await balanceOf()).toBe(500);
  });

  it('28. deducts points', async () => {
    await adjust({ type: 'add', points: 500 }).expect(201);
    const res = await adjust({ type: 'deduct', points: 200, reason: 'Correction' }).expect(201);
    expect(res.body.data.transaction).toMatchObject({ points: -200, direction: 'debit', balanceAfter: 300, reason: 'Correction' });
    expect(await balanceOf()).toBe(300);
  });

  it('29. a deduction can never make the balance negative', async () => {
    await adjust({ type: 'add', points: 100 }).expect(201);
    const res = await adjust({ type: 'deduct', points: 101 }).expect(422);
    expect(res.body.errors[0].message).toMatch(/only 100 points/);
    expect(await balanceOf()).toBe(100);
    expect(await LoyaltyTransaction.countDocuments()).toBe(1);
  });

  it('concurrent deductions cannot overdraw the balance', async () => {
    await adjust({ type: 'add', points: 100 }).expect(201);
    const results = await Promise.all(Array.from({ length: 5 }, () => adjust({ type: 'deduct', points: 60 })));
    const succeeded = results.filter((r) => r.status === 201).length;
    expect(succeeded).toBe(1);
    expect(await balanceOf()).toBe(40);
    await expectConsistent();
  });

  it('30. every adjustment is recorded in the ledger with balanceAfter', async () => {
    await adjust({ type: 'add', points: 1000 }).expect(201);
    await adjust({ type: 'deduct', points: 250 }).expect(201);
    await adjust({ type: 'add', points: 50 }).expect(201);
    const txns = await LoyaltyTransaction.find({ customerId: rohit._id }).sort({ createdAt: 1, _id: 1 }).lean();
    expect(txns.map((t) => [t.points, t.balanceAfter])).toEqual([
      [1000, 1000],
      [-250, 750],
      [50, 800],
    ]);
    expect(txns.every((t) => t.createdBy && t.reason)).toBe(true);
    await expectConsistent();
  });

  it('validates adjustment input', async () => {
    await adjust({ type: 'add', points: 0 }).expect(422);
    await adjust({ type: 'add', points: -5 }).expect(422);
    await adjust({ type: 'add', points: 1.5 }).expect(422);
    await adjust({ type: 'add', points: 10, reason: '' }).expect(422);
    await adjust({ type: 'multiply', points: 10 }).expect(422);
    await adjust({ type: 'add', points: 10, customerId: '64b7f0000000000000000000' }).expect(404);
  });
});

describe('Cancellation reversal', () => {
  it('31. cancelling a purchase reverses the awarded points', async () => {
    await adjust({ type: 'add', points: 2450 }).expect(201);
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201);
    expect(await balanceOf()).toBe(3699);

    const res = await api()
      .post(`/api/v1/admin/purchases/${created.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Returned' })
      .expect(200);
    expect(res.body.data.loyalty).toEqual({ pointsReversed: 1249, reversalShortfall: 0, pointsRefunded: 0 });
    expect(await balanceOf()).toBe(2450);

    const reversal = await LoyaltyTransaction.findOne({ source: 'purchase_cancellation' }).lean();
    expect(reversal).toMatchObject({ type: 'adjustment', points: -1249, title: 'Purchase Cancelled', balanceAfter: 2450 });
    // Original reward stays in the ledger
    expect(await LoyaltyTransaction.countDocuments({ source: 'purchase', points: 1249 })).toBe(1);
    await expectConsistent();
  });

  it('reverses only what is left when points were already spent (never negative)', async () => {
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201); // +1249
    await adjust({ type: 'deduct', points: 1000, reason: 'Redeemed at counter' }).expect(201); // 249 left

    const res = await api()
      .post(`/api/v1/admin/purchases/${created.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Returned' })
      .expect(200);
    expect(res.body.data.loyalty).toEqual({ pointsReversed: 249, reversalShortfall: 1000, pointsRefunded: 0 });
    expect(res.body.message).toMatch(/1000 points had already been used/);
    expect(res.body.data.purchase.loyalty).toMatchObject({ pointsEarned: 1249, pointsReversed: 249, reversalShortfall: 1000 });
    expect(await balanceOf()).toBe(0);
    await expectConsistent();
  });

  it('customer sees the reward then the reversal', async () => {
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201);
    await api().post(`/api/v1/admin/purchases/${created.body.data.purchase.id}/cancel`).set('Authorization', adminAuth).send({}).expect(200);
    const { auth } = await loginAsCustomer(app, '9876543210');
    const res = await api().get('/api/v1/customer/loyalty/transactions').set('Authorization', auth).expect(200);
    expect(res.body.data.items.map((t) => [t.title, t.points])).toEqual([
      ['Purchase Cancelled', -1249],
      ['Purchase Reward', 1249],
    ]);
    expect(res.body.data.items[1].invoiceNumber).toBe(created.body.data.purchase.invoiceNumber);

    const credits = await api().get('/api/v1/customer/loyalty/transactions').query({ direction: 'credit' }).set('Authorization', auth);
    expect(credits.body.data.items).toHaveLength(1);
  });
});

describe('Loyalty summaries', () => {
  it('customer loyalty overview and summary', async () => {
    await adjust({ type: 'add', points: 2450 }).expect(201);
    await createPurchase(samplePurchase(rohit._id)).expect(201);
    await adjust({ type: 'deduct', points: 199 }).expect(201);
    const { auth } = await loginAsCustomer(app, '9876543210');

    const overview = await api().get('/api/v1/customer/loyalty').set('Authorization', auth).expect(200);
    expect(overview.body.data).toMatchObject({
      balance: 3500,
      tier: { key: 'gold' },
      estimatedValue: 3500,
      pointsPerHundredRupees: 1,
      thisMonth: { earned: 3699, redeemed: 199, net: 3500 },
    });
    expect(overview.body.data.recentTransactions).toHaveLength(3);

    const summary = await api().get('/api/v1/customer/loyalty/summary').set('Authorization', auth).expect(200);
    expect(summary.body.data.lifetime).toEqual({ earned: 3699, redeemed: 199 });

    const txn = overview.body.data.recentTransactions[0];
    const single = await api().get(`/api/v1/customer/loyalty/transactions/${txn.id}`).set('Authorization', auth).expect(200);
    expect(single.body.data.transaction.id).toBe(txn.id);
  });

  it('admin loyalty summary', async () => {
    const priya = await createTestCustomer({ name: 'Priya Mehta', mobile: '+919823456789' });
    await createPurchase(samplePurchase(rohit._id)).expect(201); // +1249
    await createPurchase(samplePurchase(priya._id, { pricing: { purchaseAmount: 300000 } })).expect(201); // +3000
    await adjust({ type: 'deduct', points: 49 }).expect(201);

    const res = await api().get('/api/v1/admin/loyalty/summary').set('Authorization', adminAuth).expect(200);
    expect(res.body.data).toMatchObject({
      totalPointsIssued: 4249,
      totalPointsDebited: 49,
      pointsOutstanding: 4200,
      customersWithPoints: 2,
      totalCustomers: 2,
    });
    const tiers = Object.fromEntries(res.body.data.tierDistribution.map((t) => [t.key, t.customers]));
    expect(tiers).toEqual({ bronze: 0, silver: 1, gold: 1, platinum: 0 });
    expect(res.body.data.recentActivity).toHaveLength(3);
    expect(Object.keys(res.body.data.issuedTrend)).toEqual(['30d', '6m', '1y']);
    expect(res.body.data.issuedTrend['6m'].at(-1).value).toBe(4249);
    expect(res.body.data.issuedTrend['30d'].at(-1).value).toBe(4249);

    const list = await api().get('/api/v1/admin/loyalty/transactions').query({ direction: 'debit' }).set('Authorization', adminAuth).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].customer.name).toBe('Rohit Sharma');
  });
});
