import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Customer } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsAdmin, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

const seedStore = async (auth) => {
  const rohit = await createTestCustomer();
  const priya = await createTestCustomer({ name: 'Priya Mehta', mobile: '+919823456789' });
  // An old customer, created before this month
  await createTestCustomer({ name: 'Old Customer', mobile: '+919811122233' });
  // (raw driver call: Mongoose treats createdAt as immutable)
  await Customer.collection.updateOne({ mobile: '+919811122233' }, { $set: { createdAt: new Date('2025-01-01') } });

  const post = (body) => api().post('/api/v1/admin/purchases').set('Authorization', auth).send(body).expect(201);
  const s25 = await post(samplePurchase(rohit._id)); // 124,999 → 1,249 pts
  await post(samplePurchase(priya._id, { category: 'accessories', product: { name: 'Galaxy Buds3 Pro' }, pricing: { purchaseAmount: 19999 } })); // 199 pts
  const iphone = await post(samplePurchase(rohit._id, { product: { name: 'Apple iPhone 16 Pro' }, pricing: { purchaseAmount: 119999 } })); // 1,199 pts
  await api().post(`/api/v1/admin/purchases/${iphone.body.data.purchase.id}/cancel`).set('Authorization', auth).send({ reason: 'Returned' }).expect(200);
  await api()
    .post('/api/v1/admin/loyalty/adjust')
    .set('Authorization', auth)
    .send({ customerId: priya.id, type: 'add', points: 500, reason: 'Festive bonus' })
    .expect(201);
  return { s25 };
};

describe('Dashboard', () => {
  it('35. returns correct aggregate data', async () => {
    const { auth } = await loginAsAdmin(app);
    const { s25 } = await seedStore(auth);

    const res = await api().get('/api/v1/admin/dashboard').set('Authorization', auth).expect(200);
    const d = res.body.data;

    expect(d.customers).toEqual({ total: 3, newThisMonth: 2 });
    // Cancelled purchases are excluded from totals and sales
    expect(d.purchases).toEqual({ total: 2, thisMonth: 2, cancelled: 1 });
    expect(d.sales).toEqual({ total: 144998, thisMonth: 144998 });
    // Issued = all credits (1,249 + 199 + 1,199 + 500); outstanding reflects the reversal
    expect(d.loyaltyPointsIssued).toEqual({ total: 3147, thisMonth: 3147, outstanding: 1948 });

    expect(Object.keys(d.revenueTrend)).toEqual(['30d', '6m', '1y']);
    expect(d.revenueTrend['6m']).toHaveLength(6);
    expect(d.revenueTrend['6m'].at(-1)).toMatchObject({ value: 144998, count: 2 });
    expect(d.revenueTrend['30d'].at(-1).value).toBe(144998);

    const categories = Object.fromEntries(d.categoryDistribution.map((c) => [c.key, c.value]));
    expect(categories).toEqual({ phones: 124999, accessories: 19999 });

    expect(d.sparklines.customers.at(-1)).toBe(3);
    expect(d.sparklines.sales.at(-1)).toBe(144998);

    expect(d.recentPurchases).toHaveLength(3);
    expect(d.recentPurchases.map((p) => p.id)).toContain(s25.body.data.purchase.id);
    expect(d.recentActivity.length).toBeGreaterThan(0);
    expect(d.recentActivity[0].type).toBe('loyalty'); // most recent event
    expect(d.recentActivity.map((a) => a.type)).toEqual(expect.arrayContaining(['purchase', 'warning', 'customer', 'loyalty']));
  });

  it('works on an empty store', async () => {
    const { auth } = await loginAsAdmin(app);
    const res = await api().get('/api/v1/admin/dashboard').set('Authorization', auth).expect(200);
    expect(res.body.data.sales.total).toBe(0);
    expect(res.body.data.recentPurchases).toEqual([]);
  });

  it('report summary and activity feed', async () => {
    const { auth } = await loginAsAdmin(app);
    await seedStore(auth);

    const res = await api().get('/api/v1/admin/reports/summary').set('Authorization', auth).expect(200);
    expect(res.body.data.totals).toMatchObject({
      totalSales: 144998,
      totalOrders: 2,
      cancelledOrders: 1,
      totalCustomers: 3,
      pointsIssued: 3147,
      averageOrderValue: 72499,
    });
    expect(res.body.data.brandShare.map((b) => [b.label, b.value])).toEqual([['Samsung', 144998]]);
    expect(res.body.data.paymentMethodShare[0]).toMatchObject({ label: 'UPI', count: 2 });
    expect(res.body.data.hourlySales.reduce((sum, h) => sum + h.value, 0)).toBe(144998);

    const activity = await api().get('/api/v1/admin/activity').query({ limit: 3 }).set('Authorization', auth).expect(200);
    expect(activity.body.data.items).toHaveLength(3);
  });
});
