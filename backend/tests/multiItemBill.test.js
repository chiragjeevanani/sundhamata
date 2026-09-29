import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/config/migrations.js';
import { Customer, LoyaltyTransaction, Product, Purchase } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
let rohit;

beforeEach(async () => {
  await mongoose.connection.db.collection('bills.files').deleteMany({});
  await mongoose.connection.db.collection('bills.chunks').deleteMany({});
  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
});

const PHONE = {
  category: 'phones',
  product: { name: 'Samsung Galaxy S25 Ultra', variant: '12GB + 256GB', color: 'Titanium Black', imei: '358921104829104' },
  price: 124999,
  warranty: { duration: 1, unit: 'years' },
};
const CASE = { category: 'accessories', product: { name: 'Spigen Tough Armor Case' }, price: 1499, warranty: { duration: 6, unit: 'months' } };
const CHARGER = { category: 'accessories', product: { name: 'Samsung 45W Charger' }, price: 3299.5, warranty: { duration: 0, unit: 'years' } };

const bill = (overrides = {}) => ({
  customerId: String(rohit._id),
  invoiceNumber: 'SM/2026-27/0100',
  items: [PHONE, CASE, CHARGER],
  payment: { method: 'UPI', status: 'Paid' },
  pricing: { discount: 1000 },
  ...overrides,
});
const record = (body) => api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(body);
const sum = (lines, pick) => Math.round(lines.reduce((s, l) => s + pick(l), 0) * 100) / 100;

describe('A bill with several products', () => {
  it('saves one line per product under one invoice, and the lines add up exactly to the bill', async () => {
    await Customer.updateOne({ _id: rohit._id }, { $set: { loyaltyPoints: 1000 } });
    await LoyaltyTransaction.create({
      customerId: rohit._id, type: 'adjustment', source: 'admin_adjustment', points: 1000, balanceAfter: 1000, title: 'Opening balance',
    });

    const res = await record(bill({ loyaltyRedemption: { points: 700 } })).expect(201);
    const { purchases, order } = res.body.data;

    expect(purchases).toHaveLength(3);
    expect(new Set(purchases.map((p) => p.invoiceNumber))).toEqual(new Set(['SM/2026-27/0100']));
    expect(purchases.map((p) => p.order)).toEqual([1, 2, 3].map((lineNo) => ({ id: order.id, lineNo, lineCount: 3 })));
    expect(purchases.map((p) => p.product.name)).toEqual(['Samsung Galaxy S25 Ultra', 'Spigen Tough Armor Case', 'Samsung 45W Charger']);

    // Bill: 129,797.50 − 1,000 discount − 700 points = 128,097.50
    expect(order.totals).toEqual({ subtotal: 129797.5, discount: 1000, couponDiscount: 0, loyaltyDiscount: 700, finalAmount: 128097.5 });
    expect(sum(purchases, (p) => p.pricing.purchaseAmount)).toBe(129797.5);
    expect(sum(purchases, (p) => p.pricing.discount)).toBe(1000);
    expect(sum(purchases, (p) => p.pricing.loyaltyDiscount)).toBe(700);
    expect(sum(purchases, (p) => p.pricing.finalAmount)).toBe(128097.5);
    // The biggest item carries most of the discount
    expect(purchases[0].pricing.discount).toBeGreaterThan(purchases[1].pricing.discount);

    // Each product keeps its own warranty
    expect(purchases.map((p) => p.warranty?.months ?? 0)).toEqual([12, 6, 0]);

    // Loyalty on the bill total: 1 point per ₹100 of 128,097.50 = 1,280; split across lines
    expect(order.pointsEarned).toBe(1280);
    expect(purchases.reduce((s, p) => s + p.loyalty.pointsEarned, 0)).toBe(1280);
    expect(purchases.reduce((s, p) => s + p.loyalty.pointsRedeemed, 0)).toBe(700);
    expect(res.body.data.customerLoyaltyBalance).toBe(1000 - 700 + 1280);

    // One ledger entry per bill for spending and one for earning
    const ledger = await LoyaltyTransaction.find({ customerId: rohit._id, source: { $in: ['purchase', 'redemption'] } }).lean();
    expect(ledger.map((t) => [t.source, t.points, t.description])).toEqual(
      expect.arrayContaining([
        ['redemption', -700, 'Samsung Galaxy S25 Ultra + 2 more — ₹700 off'],
        ['purchase', 1280, 'Samsung Galaxy S25 Ultra + 2 more'],
      ])
    );
  });

  it('still accepts a single product sent the older way', async () => {
    const res = await record({
      customerId: String(rohit._id),
      invoiceNumber: 'OLD/1',
      category: 'phones',
      product: { name: 'OnePlus 13' },
      payment: { method: 'Cash' },
      pricing: { purchaseAmount: 69999, discount: 0 },
    }).expect(201);
    expect(res.body.data.purchases).toHaveLength(1);
    expect(res.body.data.purchase.order).toMatchObject({ lineNo: 1, lineCount: 1 });
  });

  it.each([
    ['no products', { items: [] }],
    ['both items and a single product', { product: { name: 'X Phone' } }],
    ['a discount bigger than the bill', { pricing: { discount: 200000 } }],
    ['a product without a price', { items: [{ ...CASE, price: 0 }] }],
    ['more than 20 products', { items: Array.from({ length: 21 }, () => CASE) }],
  ])('rejects %s', async (_label, overrides) => {
    await record(bill(overrides)).expect(422);
    expect(await Purchase.countDocuments()).toBe(0);
  });

  it('an invoice number cannot be reused by another bill (ignoring case)', async () => {
    await record(bill()).expect(201);
    await record(bill({ invoiceNumber: 'sm/2026-27/0100', items: [CASE] })).expect(409);
    expect(await Purchase.countDocuments()).toBe(3);
  });

  it('cancelling one product reverses only its share; the coupon returns when the whole bill is cancelled', async () => {
    const res = await record(bill()).expect(201);
    const [phone, caseLine, charger] = res.body.data.purchases;
    const cancel = (id) =>
      api().post(`/api/v1/admin/purchases/${id}/cancel`).set('Authorization', adminAuth).send({ reason: 'Returned' }).expect(200);

    await cancel(caseLine.id);
    const after = await Customer.findById(rohit._id).lean();
    expect(after.loyaltyPoints).toBe(res.body.data.order.pointsEarned - caseLine.loyalty.pointsEarned);
    const statuses = (await Purchase.find({}).sort({ 'order.lineNo': 1 }).lean()).map((p) => p.status);
    expect(statuses).toEqual(['Purchased', 'Cancelled', 'Purchased']);

    await cancel(phone.id);
    await cancel(charger.id);
    expect((await Customer.findById(rohit._id).lean()).loyaltyPoints).toBe(0);
  });

  it('editing the invoice number or date updates the whole bill; product details stay per line', async () => {
    const res = await record(bill()).expect(201);
    const [phone, caseLine] = res.body.data.purchases;

    await api()
      .patch(`/api/v1/admin/purchases/${caseLine.id}`)
      .set('Authorization', adminAuth)
      .send({ invoiceNumber: 'SM/2026-27/0200', purchaseDate: '2026-01-15T10:00:00.000Z', product: { color: 'Clear' } })
      .expect(200);

    const lines = await Purchase.find({}).sort({ 'order.lineNo': 1 }).lean();
    expect(lines.map((l) => l.invoiceNumber)).toEqual(['SM/2026-27/0200', 'SM/2026-27/0200', 'SM/2026-27/0200']);
    expect(lines.map((l) => l.purchaseDate.toISOString().slice(0, 10))).toEqual(['2026-01-15', '2026-01-15', '2026-01-15']);
    // Warranties follow the new date with each product's own length
    expect(lines[0].warranty.validUntil.toISOString().slice(0, 10)).toBe('2027-01-15');
    expect(lines[1].warranty.validUntil.toISOString().slice(0, 10)).toBe('2026-07-15');
    expect(lines.map((l) => l.product.color)).toEqual(['Titanium Black', 'Clear', null]);
    expect(phone.id).toBe(lines[0]._id.toString());

    // Another bill cannot take that number
    await record(bill({ invoiceNumber: 'SM/2026-27/0200' })).expect(409);
  });

  it('an uploaded bill file belongs to every product on the bill', async () => {
    const res = await record(bill()).expect(201);
    const [phone, caseLine, charger] = res.body.data.purchases;
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');

    await api()
      .post(`/api/v1/admin/purchases/${caseLine.id}/bill`)
      .query({ filename: 'bill.pdf' })
      .set('Authorization', adminAuth)
      .set('Content-Type', 'application/octet-stream')
      .send(pdf)
      .expect(200);
    const lines = await Purchase.find({}).lean();
    expect(new Set(lines.map((l) => String(l.bill?.fileId)))).toHaveProperty('size', 1);

    const { auth } = await loginAsCustomer(app, '9876543210');
    await api().get(`/api/v1/customer/purchases/${charger.id}/bill`).set('Authorization', auth).expect(200);

    await api().delete(`/api/v1/admin/purchases/${phone.id}/bill`).set('Authorization', adminAuth).expect(200);
    expect(await Purchase.countDocuments({ 'bill.fileId': { $exists: true } })).toBe(0);
    expect(await mongoose.connection.db.collection('bills.files').countDocuments()).toBe(0);
  });

  it('purchase details list every product on the bill (for the invoice)', async () => {
    const res = await record(bill()).expect(201);
    const { auth } = await loginAsCustomer(app, '9876543210');
    const detail = await api().get(`/api/v1/customer/purchases/${res.body.data.purchases[1].id}`).set('Authorization', auth).expect(200);
    expect(detail.body.data.purchase.billItems.map((i) => i.product.name)).toEqual([
      'Samsung Galaxy S25 Ultra',
      'Spigen Tough Armor Case',
      'Samsung 45W Charger',
    ]);
    const admin = await api().get(`/api/v1/admin/purchases/${res.body.data.purchases[0].id}`).set('Authorization', adminAuth).expect(200);
    expect(admin.body.data.purchase.billItems).toHaveLength(3);
  });

  it('dashboard and reports count a bill once, however many products it has', async () => {
    await record(bill()).expect(201);
    const dash = await api().get('/api/v1/admin/dashboard').set('Authorization', adminAuth).expect(200);
    expect(dash.body.data.purchases.total).toBe(1);
    const report = await api().get('/api/v1/admin/reports/summary').set('Authorization', adminAuth).expect(200);
    expect(report.body.data.totals).toMatchObject({ totalOrders: 1, totalSales: 128797.5 });
  });
});

describe('Product catalog', () => {
  const listProducts = (query = {}) => api().get('/api/v1/admin/products').query(query).set('Authorization', adminAuth);

  it('remembers every product sold, with its latest price, variants and colours', async () => {
    await record(bill()).expect(201);
    await record(
      bill({
        invoiceNumber: 'SM/2026-27/0101',
        items: [{ ...PHONE, product: { name: '  samsung  galaxy s25 ULTRA ', variant: '12GB + 512GB', color: 'Titanium Blue' }, price: 134999 }],
        pricing: { discount: 0 },
      })
    ).expect(201);

    const res = await listProducts({ search: 'galaxy s25' }).expect(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0]).toMatchObject({
      name: 'Samsung Galaxy S25 Ultra',
      category: 'phones',
      brand: 'Samsung',
      lastPrice: 134999,
      warrantyMonths: 12,
      timesSold: 2,
      variants: ['12GB + 512GB', '12GB + 256GB'],
      colors: ['Titanium Blue', 'Titanium Black'],
    });
    // Most sold first
    const all = await listProducts().expect(200);
    expect(all.body.data.items[0].name).toBe('Samsung Galaxy S25 Ultra');
    expect(all.body.data.items).toHaveLength(3);
  });

  it('builds the catalog from past purchases the first time it is opened', async () => {
    await record(bill()).expect(201);
    await Product.deleteMany({});
    const res = await listProducts().expect(200);
    expect(res.body.data.items.map((p) => p.name).sort()).toEqual([
      'Samsung 45W Charger',
      'Samsung Galaxy S25 Ultra',
      'Spigen Tough Armor Case',
    ]);
  });

  it('admin can add, edit and remove products', async () => {
    const created = await api()
      .post('/api/v1/admin/products')
      .set('Authorization', adminAuth)
      .send({ name: 'iPhone 17 Pro', category: 'phones', brand: 'Apple', lastPrice: 134900, warrantyMonths: 12 })
      .expect(201);
    const id = created.body.data.product.id;
    await api().post('/api/v1/admin/products').set('Authorization', adminAuth).send({ name: 'iphone 17 pro' }).expect(409);

    const edited = await api().patch(`/api/v1/admin/products/${id}`).set('Authorization', adminAuth).send({ lastPrice: 129900 }).expect(200);
    expect(edited.body.data.product.lastPrice).toBe(129900);

    await api().delete(`/api/v1/admin/products/${id}`).set('Authorization', adminAuth).expect(200);
    expect(await Product.countDocuments()).toBe(0);
  });

  it('customers cannot use the catalog endpoints', async () => {
    const { auth } = await loginAsCustomer(app, '9876543210');
    await api().get('/api/v1/admin/products').set('Authorization', auth).expect(401);
  });
});

describe('Migration', () => {
  it('drops the old one-purchase-per-invoice index so bills can have several products', async () => {
    await Purchase.collection.dropIndex('invoiceNumber_line_ci').catch(() => {});
    await Purchase.collection.createIndex(
      { invoiceNumber: 1 },
      { unique: true, name: 'invoiceNumber_ci', collation: { locale: 'en', strength: 2 } }
    );
    // An even older plain unique index from the first schema version
    await Purchase.collection.createIndex({ invoiceNumber: 1 }, { unique: true, name: 'invoiceNumber_1' });
    await runMigrations();
    const names = (await Purchase.collection.indexes()).map((i) => i.name);
    expect(names).not.toContain('invoiceNumber_ci');
    expect(names).not.toContain('invoiceNumber_1');
    expect(names).toContain('invoiceNumber_line_ci');
    await record(bill()).expect(201);
  });
});
