import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Customer } from '../src/models/index.js';
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

describe('Customer self-service', () => {
  let rohit;
  let auth;

  beforeEach(async () => {
    rohit = await createTestCustomer();
    ({ auth } = await loginAsCustomer(app, '9876543210'));
  });

  it('12. returns the current customer', async () => {
    const res = await api().get('/api/v1/customer/me').set('Authorization', auth).expect(200);
    expect(res.body.data.customer).toMatchObject({
      id: rohit.id,
      name: 'Rohit Sharma',
      mobile: '+919876543210',
      loyaltyPoints: 0,
      loyaltyTier: { key: 'bronze', label: 'Bronze Member' },
    });
  });

  it('13. updates the profile', async () => {
    const res = await api()
      .patch('/api/v1/customer/me')
      .set('Authorization', auth)
      .send({ email: 'Rohit@Gmail.com', city: 'Jaipur', pincode: '302019', address: 'B-42, Malviya Nagar' })
      .expect(200);
    expect(res.body.data.customer).toMatchObject({ email: 'rohit@gmail.com', city: 'Jaipur', pincode: '302019' });
    expect((await Customer.findById(rohit._id)).city).toBe('Jaipur');
  });

  it('cannot change loyalty points or mobile through profile update', async () => {
    const res = await api()
      .patch('/api/v1/customer/me')
      .set('Authorization', auth)
      .send({ loyaltyPoints: 99999 })
      .expect(422);
    expect(res.body.errors[0].message).toMatch(/unrecognized key/i);
    await api().patch('/api/v1/customer/me').set('Authorization', auth).send({ mobile: '9000000000' }).expect(422);
    await api().patch('/api/v1/customer/me').set('Authorization', auth).send({ email: 'not-an-email' }).expect(422);
    expect((await Customer.findById(rohit._id)).loyaltyPoints).toBe(0);
  });

  it('14. cannot access another customer\'s data', async () => {
    const priya = await createTestCustomer({ name: 'Priya Mehta', mobile: '+919823456789', interest: 'Accessories' });
    const { auth: adminAuth } = await loginAsAdmin(app);
    const created = await api()
      .post('/api/v1/admin/purchases')
      .set('Authorization', adminAuth)
      .send(samplePurchase(priya._id))
      .expect(201);
    const priyaPurchaseId = created.body.data.purchase.id;

    const list = await api().get('/api/v1/customer/purchases').set('Authorization', auth).expect(200);
    expect(list.body.data.items).toHaveLength(0);

    await api().get(`/api/v1/customer/purchases/${priyaPurchaseId}`).set('Authorization', auth).expect(404);

    const priyaTxns = await request(app)
      .get('/api/v1/admin/loyalty/transactions')
      .query({ customerId: priya.id })
      .set('Authorization', adminAuth)
      .expect(200);
    const priyaTxnId = priyaTxns.body.data.items[0].id;
    await api().get(`/api/v1/customer/loyalty/transactions/${priyaTxnId}`).set('Authorization', auth).expect(404);

    // A customerId filter cannot be used to peek at other customers
    await api()
      .get('/api/v1/customer/loyalty/transactions')
      .query({ customerId: priya.id })
      .set('Authorization', auth)
      .expect(200)
      .then((res) => expect(res.body.data.items).toHaveLength(0));

    // Customer tokens cannot reach admin APIs at all
    await api().get(`/api/v1/admin/customers/${priya.id}`).set('Authorization', auth).expect(401);
  });
});

describe('Admin customer management', () => {
  let adminAuth;

  beforeEach(async () => {
    ({ auth: adminAuth } = await loginAsAdmin(app));
  });

  const create = (body) => api().post('/api/v1/admin/customers').set('Authorization', adminAuth).send(body);

  it('creates customers and rejects duplicates in any mobile format', async () => {
    const res = await create({ name: 'Amit Verma', mobile: '98111 22233', interest: 'Service', email: 'amit@yahoo.com' }).expect(201);
    expect(res.body.data.customer).toMatchObject({
      name: 'Amit Verma',
      mobile: '+919811122233',
      customerCode: expect.stringMatching(/^CUS\d{5}$/),
      registrationSource: 'admin',
      stats: { totalPurchases: 0, totalSpent: 0, lastPurchaseDate: null },
    });
    await create({ name: 'Amit V', mobile: '+91-9811122233', interest: 'Mobile' }).expect(409);
    await create({ name: 'X', mobile: '9811122299', interest: 'Mobile' }).expect(422);
  });

  it('searches by name, mobile and email with pagination and sorting', async () => {
    await createTestCustomer();
    await createTestCustomer({ name: 'Priya Mehta', mobile: '+919823456789', email: 'priya.mehta@gmail.com' });
    await createTestCustomer({ name: 'Karan Singh', mobile: '+919829055443' });

    const byMobile = await api().get('/api/v1/admin/customers').query({ search: '9876543210' }).set('Authorization', adminAuth).expect(200);
    expect(byMobile.body.data.items.map((c) => c.name)).toEqual(['Rohit Sharma']);

    const byFormattedMobile = await api().get('/api/v1/admin/customers').query({ search: '+91 98234' }).set('Authorization', adminAuth);
    expect(byFormattedMobile.body.data.items.map((c) => c.name)).toEqual(['Priya Mehta']);

    const byEmail = await api().get('/api/v1/admin/customers').query({ search: 'PRIYA.MEHTA@' }).set('Authorization', adminAuth);
    expect(byEmail.body.data.items).toHaveLength(1);

    const byName = await api().get('/api/v1/admin/customers').query({ search: 'singh' }).set('Authorization', adminAuth);
    expect(byName.body.data.items[0].name).toBe('Karan Singh');

    const page = await api()
      .get('/api/v1/admin/customers')
      .query({ page: 2, limit: 2, sort: 'name' })
      .set('Authorization', adminAuth)
      .expect(200);
    expect(page.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(page.body.data.items.map((c) => c.name)).toEqual(['Rohit Sharma']);

    await api().get('/api/v1/admin/customers').query({ sort: 'passwordHash' }).set('Authorization', adminAuth).expect(422);
    // Regex metacharacters are treated literally
    await api().get('/api/v1/admin/customers').query({ search: '.*(' }).set('Authorization', adminAuth).expect(200);
  });

  it('gets and updates a customer (loyalty points are not directly editable)', async () => {
    const rohit = await createTestCustomer();
    const got = await api().get(`/api/v1/admin/customers/${rohit.id}`).set('Authorization', adminAuth).expect(200);
    expect(got.body.data.customer.name).toBe('Rohit Sharma');

    const updated = await api()
      .patch(`/api/v1/admin/customers/${rohit.id}`)
      .set('Authorization', adminAuth)
      .send({ city: 'Jaipur', isActive: false })
      .expect(200);
    expect(updated.body.data.customer).toMatchObject({ city: 'Jaipur', isActive: false });

    await api().patch(`/api/v1/admin/customers/${rohit.id}`).set('Authorization', adminAuth).send({ loyaltyPoints: 5 }).expect(422);
    await api().get('/api/v1/admin/customers/64b7f0000000000000000000').set('Authorization', adminAuth).expect(404);
    await api().get('/api/v1/admin/customers/not-an-id').set('Authorization', adminAuth).expect(404);

    const filtered = await api().get('/api/v1/admin/customers').query({ status: 'inactive' }).set('Authorization', adminAuth);
    expect(filtered.body.data.items).toHaveLength(1);
  });

  it('lists a customer\'s purchases and loyalty', async () => {
    const rohit = await createTestCustomer();
    await api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(samplePurchase(rohit._id)).expect(201);

    const purchases = await api().get(`/api/v1/admin/customers/${rohit.id}/purchases`).set('Authorization', adminAuth).expect(200);
    expect(purchases.body.data.items).toHaveLength(1);

    const loyalty = await api().get(`/api/v1/admin/customers/${rohit.id}/loyalty`).set('Authorization', adminAuth).expect(200);
    expect(loyalty.body.data.summary.balance).toBe(1249);
    expect(loyalty.body.data.transactions.items[0]).toMatchObject({ points: 1249, source: 'purchase' });

    const detail = await api().get(`/api/v1/admin/customers/${rohit.id}`).set('Authorization', adminAuth);
    expect(detail.body.data.customer.stats).toMatchObject({ totalPurchases: 1, totalSpent: 124999 });
  });
});
