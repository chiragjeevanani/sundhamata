import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Purchase } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
let rohit;

beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
});

const create = (overrides) => api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(samplePurchase(rohit._id, overrides));
const patch = (id, body) => api().patch(`/api/v1/admin/purchases/${id}`).set('Authorization', adminAuth).send(body);
// Calendar date of a timestamp in the store's timezone (IST)
const istDay = (iso) => new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 10);
const onDay = (day) => `${day}T12:00:00+05:30`;

describe('Manual invoice numbers', () => {
  it.each(['SM/2026-27/0042', 'Bill #45 A', 'inv-001', '2026/Sep/7', 'GST-INV 12.3', 'बिल-12'])(
    'accepts any format and keeps it exactly as typed: %s',
    async (invoiceNumber) => {
      const res = await create({ invoiceNumber }).expect(201);
      expect(res.body.data.purchase.invoiceNumber).toBe(invoiceNumber);
    }
  );

  it('trims surrounding spaces', async () => {
    const res = await create({ invoiceNumber: '  INV 7  ' }).expect(201);
    expect(res.body.data.purchase.invoiceNumber).toBe('INV 7');
  });

  it('rejects duplicates ignoring case, and allows the number once the first is gone', async () => {
    await create({ invoiceNumber: 'Bill #45 A' }).expect(201);
    const res = await create({ invoiceNumber: 'BILL #45 a' }).expect(409);
    expect(res.body.errors[0]).toMatchObject({ field: 'invoiceNumber' });
    expect(await Purchase.countDocuments()).toBe(1);
  });

  it('the database itself enforces case-insensitive uniqueness', async () => {
    const res = await create({ invoiceNumber: 'DB-1' }).expect(201);
    const doc = (await Purchase.findById(res.body.data.purchase.id)).toObject();
    delete doc._id;
    await expect(Purchase.collection.insertOne({ ...doc, invoiceNumber: 'db-1' })).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects over-long or control-character invoice numbers', async () => {
    await create({ invoiceNumber: 'X'.repeat(51) }).expect(422);
    await create({ invoiceNumber: 'INV\u0000 1' }).expect(422);
    await create({ invoiceNumber: 12345 }).expect(422);
  });

  it('admin can correct an invoice number later; duplicates are refused', async () => {
    const a = await create({ invoiceNumber: 'INV-A' }).expect(201);
    await create({ invoiceNumber: 'INV-B' }).expect(201);
    const id = a.body.data.purchase.id;

    const fixed = await patch(id, { invoiceNumber: 'INV-A (corrected)' }).expect(200);
    expect(fixed.body.data.purchase.invoiceNumber).toBe('INV-A (corrected)');
    await patch(id, { invoiceNumber: 'inv-b' }).expect(409);
    // Changing only the case of its own number is fine
    await patch(id, { invoiceNumber: 'inv-a (corrected)' }).expect(200);
  });

  it('is searchable and visible to the customer', async () => {
    await create({ invoiceNumber: 'SM/2026-27/0099' }).expect(201);
    const found = await api().get('/api/v1/admin/purchases').query({ search: '2026-27/0099' }).set('Authorization', adminAuth).expect(200);
    expect(found.body.data.items).toHaveLength(1);
    const { auth } = await loginAsCustomer(app, '9876543210');
    const mine = await api().get('/api/v1/customer/purchases').set('Authorization', auth).expect(200);
    expect(mine.body.data.items[0].invoiceNumber).toBe('SM/2026-27/0099');
  });
});

describe('Purchase date and warranty', () => {
  it('2 years warranty expires exactly 2 years after the purchase date', async () => {
    const res = await create({ purchaseDate: onDay('2026-09-25'), warranty: { duration: 2, unit: 'years' } }).expect(201);
    const { purchase } = res.body.data;
    expect(istDay(purchase.purchaseDate)).toBe('2026-09-25');
    expect(purchase.warranty).toMatchObject({ months: 24, type: '2 Years Warranty', status: 'Active' });
    expect(istDay(purchase.warranty.validUntil)).toBe('2028-09-25');
  });

  it.each([
    [{ duration: 6, unit: 'months' }, '6 Months Warranty', '2027-01-15'],
    [{ duration: 1, unit: 'years' }, '1 Year Warranty', '2027-07-15'],
    [{ duration: 1, unit: 'months' }, '1 Month Warranty', '2026-08-15'],
    [{ duration: 18, unit: 'months' }, '18 Months Warranty', '2028-01-15'],
    [{ duration: 24, unit: 'months' }, '2 Years Warranty', '2028-07-15'],
  ])('%o → %s until %s', async (warranty, label, until) => {
    const res = await create({ purchaseDate: onDay('2026-07-15'), warranty }).expect(201);
    expect(res.body.data.purchase.warranty.type).toBe(label);
    expect(istDay(res.body.data.purchase.warranty.validUntil)).toBe(until);
  });

  it('0 means no warranty', async () => {
    const res = await create({ warranty: { duration: 0, unit: 'years' } }).expect(201);
    expect(res.body.data.purchase.warranty).toBeNull();
  });

  it('a past warranty shows as expired', async () => {
    const res = await create({ purchaseDate: onDay('2024-01-10'), warranty: { duration: 1, unit: 'years' } }).expect(201);
    expect(res.body.data.purchase.warranty.status).toBe('Expired');
  });

  it('keeps the old default when no warranty is sent (12 months; none for service)', async () => {
    const phone = await create({ purchaseDate: onDay('2026-03-01') }).expect(201);
    expect(phone.body.data.purchase.warranty).toMatchObject({ months: 12, type: '1 Year Warranty' });
    expect(istDay(phone.body.data.purchase.warranty.validUntil)).toBe('2027-03-01');
    const service = await create({ category: 'service', product: { name: 'Screen repair' } }).expect(201);
    expect(service.body.data.purchase.warranty).toBeNull();
  });

  it('rejects invalid warranty input', async () => {
    await create({ warranty: { duration: -1, unit: 'years' } }).expect(422);
    await create({ warranty: { duration: 1.5, unit: 'years' } }).expect(422);
    await create({ warranty: { duration: 2, unit: 'weeks' } }).expect(422);
    await create({ warranty: { duration: 11, unit: 'years' } }).expect(422); // max 10 years
    await create({ warranty: { duration: 2 } }).expect(422);
    await create({ purchaseDate: '2999-01-01' }).expect(422);
    expect(await Purchase.countDocuments()).toBe(0);
  });

  it('customer sees the same warranty expiry', async () => {
    const res = await create({ purchaseDate: onDay('2026-09-25'), warranty: { duration: 2, unit: 'years' } }).expect(201);
    const { auth } = await loginAsCustomer(app, '9876543210');
    const mine = await api().get(`/api/v1/customer/purchases/${res.body.data.purchase.id}`).set('Authorization', auth).expect(200);
    expect(mine.body.data.purchase.warranty).toMatchObject({ type: '2 Years Warranty', months: 24 });
    expect(istDay(mine.body.data.purchase.warranty.validUntil)).toBe('2028-09-25');
  });

  it('editing the warranty or purchase date recomputes the expiry', async () => {
    const res = await create({ purchaseDate: onDay('2026-09-25'), warranty: { duration: 2, unit: 'years' } }).expect(201);
    const id = res.body.data.purchase.id;

    const longer = await patch(id, { warranty: { duration: 3, unit: 'years' } }).expect(200);
    expect(istDay(longer.body.data.purchase.warranty.validUntil)).toBe('2029-09-25');

    const moved = await patch(id, { purchaseDate: onDay('2026-09-20') }).expect(200);
    expect(istDay(moved.body.data.purchase.purchaseDate)).toBe('2026-09-20');
    expect(istDay(moved.body.data.purchase.warranty.validUntil)).toBe('2029-09-20'); // still 3 years

    const none = await patch(id, { warranty: { duration: 0, unit: 'months' } }).expect(200);
    expect(none.body.data.purchase.warranty).toBeNull();

    const back = await patch(id, { warranty: { duration: 6, unit: 'months' } }).expect(200);
    expect(istDay(back.body.data.purchase.warranty.validUntil)).toBe('2027-03-20');
  });

  it('purchases created before warranty.months existed keep their length when the date changes', async () => {
    const res = await create({ purchaseDate: onDay('2026-01-10') }).expect(201);
    const id = res.body.data.purchase.id;
    await Purchase.collection.updateOne({ _id: Purchase.castObject({ _id: id })._id }, { $unset: { 'warranty.months': 1 } });

    const moved = await patch(id, { purchaseDate: onDay('2026-02-10') }).expect(200);
    expect(istDay(moved.body.data.purchase.warranty.validUntil)).toBe('2027-02-10');
  });
});
