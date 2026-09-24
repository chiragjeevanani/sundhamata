import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { LoyaltyTransaction, Purchase } from '../src/models/index.js';
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

describe('Record purchase', () => {
  it('15. admin creates a purchase with server-side pricing, tax and invoice number', async () => {
    const res = await createPurchase(samplePurchase(rohit._id, { pricing: { purchaseAmount: 129999, discount: 5000 } })).expect(201);
    const { purchase, customerLoyaltyBalance } = res.body.data;

    expect(purchase).toMatchObject({
      customerId: rohit.id,
      invoiceNumber: expect.stringMatching(/^SM-\d{4}-\d{6}$/),
      status: 'Purchased',
      category: 'phones',
      product: { name: 'Samsung Galaxy S25 Ultra', brand: 'Samsung', imei: '358921104829104' },
      payment: { method: 'UPI', status: 'Paid' },
      pricing: { purchaseAmount: 129999, discount: 5000, finalAmount: 124999, taxRatePercent: 18 },
      loyalty: { pointsEarned: 1249 },
      customer: { name: 'Rohit Sharma', mobile: '+919876543210' },
      warranty: { status: 'Active' },
    });
    expect(purchase.pricing.baseAmount + purchase.pricing.taxAmount).toBeCloseTo(124999, 2);
    expect(customerLoyaltyBalance).toBe(1249);
  });

  it('generates sequential invoice numbers', async () => {
    const a = await createPurchase(samplePurchase(rohit._id)).expect(201);
    const b = await createPurchase(samplePurchase(rohit._id, { product: { name: 'OnePlus 13' } })).expect(201);
    const seqA = Number(a.body.data.purchase.invoiceNumber.slice(-6));
    const seqB = Number(b.body.data.purchase.invoiceNumber.slice(-6));
    expect(seqB).toBe(seqA + 1);
  });

  it('16. rejects an unknown customer without writing anything', async () => {
    const res = await createPurchase(samplePurchase('64b7f0000000000000000000')).expect(404);
    expect(res.body.message).toMatch(/customer not found/i);
    await createPurchase(samplePurchase('not-an-id')).expect(422);
    expect(await Purchase.countDocuments()).toBe(0);
    expect(await LoyaltyTransaction.countDocuments()).toBe(0);
  });

  it('17. rejects invalid amounts', async () => {
    for (const purchaseAmount of [0, -100, 'abc', 12.345, 100_000_001]) {
      const res = await createPurchase(samplePurchase(rohit._id, { pricing: { purchaseAmount } })).expect(422);
      expect(res.body.errors.some((e) => e.field === 'pricing.purchaseAmount')).toBe(true);
    }
    await createPurchase(samplePurchase(rohit._id, { pricing: { purchaseAmount: 1000, discount: -1 } })).expect(422);
    expect(await Purchase.countDocuments()).toBe(0);
  });

  it('18. rejects a discount greater than the purchase amount', async () => {
    const res = await createPurchase(samplePurchase(rohit._id, { pricing: { purchaseAmount: 1000, discount: 1500 } })).expect(422);
    expect(res.body.errors).toEqual([{ field: 'pricing.discount', message: 'Discount cannot be greater than the purchase amount' }]);
  });

  it('19. rejects a duplicate invoice number (case-insensitive)', async () => {
    await createPurchase(samplePurchase(rohit._id, { invoiceNumber: 'SM-2026-001284' })).expect(201);
    const res = await createPurchase(samplePurchase(rohit._id, { invoiceNumber: 'sm-2026-001284' })).expect(409);
    expect(res.body.message).toMatch(/invoice number already exists/i);
    expect(await Purchase.countDocuments()).toBe(1);
    expect(await LoyaltyTransaction.countDocuments()).toBe(1);
  });

  it('validates product identifiers, payment method and payment status', async () => {
    const cases = [
      { product: { name: 'Phone', imei: '12345' } },
      { product: { name: 'Phone', serialNumber: 'x' } },
      { product: { name: '' } },
      { payment: { method: 'Bitcoin', status: 'Paid' } },
      { payment: { method: 'UPI', status: 'Cancelled' } },
      { purchaseDate: '2999-01-01' },
    ];
    for (const override of cases) {
      await createPurchase(samplePurchase(rohit._id, override)).expect(422);
    }
  });

  it('never accepts loyalty points from the client', async () => {
    const res = await createPurchase({ ...samplePurchase(rohit._id), loyalty: { pointsEarned: 999999 } }).expect(422);
    expect(res.body.errors[0].message).toMatch(/unrecognized key/i);
    await createPurchase({ ...samplePurchase(rohit._id), loyaltyPoints: 999999 }).expect(422);
    expect(await LoyaltyTransaction.countDocuments()).toBe(0);
  });

  it('refuses purchases for inactive customers', async () => {
    const inactive = await createTestCustomer({ mobile: '+919000000003', isActive: false });
    await createPurchase(samplePurchase(inactive._id)).expect(422);
  });
});

describe('Retrieve purchases', () => {
  it('20. customer retrieves their own purchases', async () => {
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201);
    const { auth } = await loginAsCustomer(app, '9876543210');

    const list = await api().get('/api/v1/customer/purchases').set('Authorization', auth).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.pagination.total).toBe(1);

    const detail = await api().get(`/api/v1/customer/purchases/${created.body.data.purchase.id}`).set('Authorization', auth).expect(200);
    expect(detail.body.data.purchase).toMatchObject({ product: { name: 'Samsung Galaxy S25 Ultra' }, billedBy: 'Store Admin' });
    // Admin-only fields are not exposed to customers
    expect(detail.body.data.purchase).not.toHaveProperty('createdBy');
    expect(detail.body.data.purchase).not.toHaveProperty('customer');

    const search = await api().get('/api/v1/customer/purchases').query({ search: 'galaxy', category: 'phones' }).set('Authorization', auth);
    expect(search.body.data.items).toHaveLength(1);
    const none = await api().get('/api/v1/customer/purchases').query({ category: 'accessories' }).set('Authorization', auth);
    expect(none.body.data.items).toHaveLength(0);
  });

  it('21. customer cannot retrieve another customer\'s purchase (404, no existence leak)', async () => {
    const priya = await createTestCustomer({ name: 'Priya Mehta', mobile: '+919823456789' });
    const priyaPurchase = await createPurchase(samplePurchase(priya._id)).expect(201);
    const { auth } = await loginAsCustomer(app, '9876543210');

    const otherRes = await api().get(`/api/v1/customer/purchases/${priyaPurchase.body.data.purchase.id}`).set('Authorization', auth).expect(404);
    const missingRes = await api().get('/api/v1/customer/purchases/64b7f0000000000000000000').set('Authorization', auth).expect(404);
    expect(otherRes.body).toEqual(missingRes.body);
  });

  it('22. admin retrieves, filters and searches purchases', async () => {
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201);
    await createPurchase(
      samplePurchase(rohit._id, {
        category: 'accessories',
        product: { name: 'Galaxy Buds3 Pro' },
        payment: { method: 'Cash', status: 'Pending' },
        pricing: { purchaseAmount: 19999 },
        purchaseDate: '2026-01-15T10:00:00Z',
      })
    ).expect(201);

    const detail = await api().get(`/api/v1/admin/purchases/${created.body.data.purchase.id}`).set('Authorization', adminAuth).expect(200);
    expect(detail.body.data.purchase.createdBy.name).toBe('Store Admin');

    const q = (query) => api().get('/api/v1/admin/purchases').query(query).set('Authorization', adminAuth).expect(200);
    expect((await q({})).body.data.items).toHaveLength(2);
    expect((await q({ paymentStatus: 'Pending' })).body.data.items[0].product.name).toBe('Galaxy Buds3 Pro');
    expect((await q({ search: 'rohit' })).body.data.items).toHaveLength(2); // by customer name
    expect((await q({ search: '98765' })).body.data.items).toHaveLength(2); // by customer mobile
    expect((await q({ search: created.body.data.purchase.invoiceNumber })).body.data.items).toHaveLength(1);
    expect((await q({ search: '358921104829104' })).body.data.items).toHaveLength(1); // IMEI
    expect((await q({ from: '2026-01-01', to: '2026-01-31' })).body.data.items).toHaveLength(1);
    await api().get('/api/v1/admin/purchases').query({ from: '2026-02-01', to: '2026-01-01' }).set('Authorization', adminAuth).expect(422);
  });

  it('admin updates non-financial purchase details only', async () => {
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201);
    const id = created.body.data.purchase.id;
    const res = await api()
      .patch(`/api/v1/admin/purchases/${id}`)
      .set('Authorization', adminAuth)
      .send({ payment: { status: 'Partially Paid', method: 'Credit Card' }, notes: 'Screen guard applied', product: { color: 'Titanium Gray' } })
      .expect(200);
    expect(res.body.data.purchase).toMatchObject({
      payment: { status: 'Partially Paid', method: 'Credit Card' },
      notes: 'Screen guard applied',
      product: { color: 'Titanium Gray', name: 'Samsung Galaxy S25 Ultra' },
    });
    await api().patch(`/api/v1/admin/purchases/${id}`).set('Authorization', adminAuth).send({ pricing: { purchaseAmount: 1 } }).expect(422);
  });
});

describe('Cancel purchase', () => {
  it('23. admin cancels a purchase: record kept, status changed, cannot cancel twice or edit', async () => {
    const created = await createPurchase(samplePurchase(rohit._id)).expect(201);
    const id = created.body.data.purchase.id;

    const res = await api()
      .post(`/api/v1/admin/purchases/${id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Customer returned device' })
      .expect(200);
    expect(res.body.data.purchase).toMatchObject({
      status: 'Cancelled',
      cancelReason: 'Customer returned device',
      payment: { status: 'Cancelled' },
      warranty: { status: 'Void' },
    });
    expect(await Purchase.countDocuments()).toBe(1);

    await api().post(`/api/v1/admin/purchases/${id}/cancel`).set('Authorization', adminAuth).send({}).expect(409);
    await api().patch(`/api/v1/admin/purchases/${id}`).set('Authorization', adminAuth).send({ notes: 'x' }).expect(409);
    await api().post('/api/v1/admin/purchases/64b7f0000000000000000000/cancel').set('Authorization', adminAuth).send({}).expect(404);
  });
});
