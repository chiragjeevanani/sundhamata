import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/config/migrations.js';
import { Customer } from '../src/models/index.js';
import { buildApp, createTestCustomer, DEV_OTP, loginAsAdmin, loginAsCustomer, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const PDF = () => Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF\n');
const photoFiles = () => mongoose.connection.db.collection('customerPhotos.files').countDocuments();

let adminAuth;
beforeEach(async () => {
  await mongoose.connection.db.collection('customerPhotos.files').deleteMany({});
  await mongoose.connection.db.collection('customerPhotos.chunks').deleteMany({});
  ({ auth: adminAuth } = await loginAsAdmin(app));
});

const register = async (mobile, name = 'Neha Joshi') => {
  await api().post('/api/v1/auth/customer/register').send({ name, mobile, interest: 'Mobile' }).expect(200);
  const res = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile, otp: DEV_OTP }).expect(200);
  return { auth: `Bearer ${res.body.data.token}`, id: res.body.data.customer.id, customer: res.body.data.customer };
};
const me = (auth) => api().get('/api/v1/customer/me').set('Authorization', auth).expect(200).then((r) => r.body.data.customer);
const bill = (body) => api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(body);

describe('Verified customers (blue tick)', () => {
  it('registering alone is not enough; the first purchase at the store verifies', async () => {
    const { auth, id, customer } = await register('9000000061');
    expect(customer.isVerified).toBe(false);
    expect((await me(auth)).isVerified).toBe(false);

    await bill(samplePurchase(id)).expect(201);
    const after = await me(auth);
    expect(after.isVerified).toBe(true);
    expect(after.verifiedAt).toBeTruthy();

    const admin = await api().get(`/api/v1/admin/customers/${id}`).set('Authorization', adminAuth).expect(200);
    expect(admin.body.data.customer.isVerified).toBe(true);
  });

  it('a customer the store added (never signed in) is not verified until they join the app', async () => {
    const res = await bill({ ...samplePurchase('000000000000000000000000'), customerId: undefined, newCustomer: { mobile: '9000000062' } }).expect(201);
    const stored = await Customer.findById(res.body.data.purchase.customerId).lean();
    expect(stored.verifiedAt).toBeNull();

    // They sign in later: number confirmed + already bought → verified
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9000000062' }).expect(200);
    const login = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9000000062', otp: DEV_OTP }).expect(200);
    expect(login.body.data.customer.isVerified).toBe(true);
  });

  it('a failed purchase does not verify, and cancelling later keeps the tick', async () => {
    const { auth, id } = await register('9000000063');
    const first = await bill(samplePurchase(id, { invoiceNumber: 'VER/1' })).expect(201);
    const { auth: auth2, id: id2 } = await register('9000000064');
    await bill(samplePurchase(id2, { invoiceNumber: 'VER/1' })).expect(409); // duplicate invoice → nothing saved
    expect((await me(auth2)).isVerified).toBe(false);

    await api()
      .post(`/api/v1/admin/purchases/${first.body.data.purchase.id}/cancel`)
      .set('Authorization', adminAuth)
      .send({ reason: 'Returned' })
      .expect(200);
    expect((await me(auth)).isVerified).toBe(true);
  });

  it('existing customers who already qualify are verified by the start-up migration', async () => {
    const rohit = await createTestCustomer();
    const other = await createTestCustomer({ mobile: '+919000000065', name: 'Store Only' });
    await bill(samplePurchase(rohit._id)).expect(201);
    await bill(samplePurchase(other._id)).expect(201);
    // Rohit uses the app (from before this feature); "Store Only" never signed in
    await Customer.updateOne({ _id: rohit._id }, { $set: { mobileVerifiedAt: new Date('2026-01-01'), verifiedAt: null } });

    await runMigrations();
    expect((await Customer.findById(rohit._id).lean()).verifiedAt).toBeInstanceOf(Date);
    expect((await Customer.findById(other._id).lean()).verifiedAt).toBeNull();
  });
});

describe('Customer profile photo', () => {
  it('customer uploads, replaces and removes their photo; it is served by a private random link', async () => {
    const { auth } = await register('9000000071');
    const up = await api().post('/api/v1/customer/me/photo').set('Authorization', auth).set('Content-Type', 'application/octet-stream').send(PNG()).expect(200);
    const firstPath = up.body.data.customer.photo.path;
    expect(firstPath).toMatch(/^\/customer-photos\/[a-f0-9]{32}$/);

    const img = await api().get(`/api/v1${firstPath}`).buffer(true).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toContain('private');

    const replaced = await api().post('/api/v1/customer/me/photo').set('Authorization', auth).set('Content-Type', 'application/octet-stream').send(JPG()).expect(200);
    expect(replaced.body.data.customer.photo.path).not.toBe(firstPath);
    await api().get(`/api/v1${firstPath}`).expect(404);
    expect(await photoFiles()).toBe(1);

    const removed = await api().delete('/api/v1/customer/me/photo').set('Authorization', auth).expect(200);
    expect(removed.body.data.customer.photo).toBeNull();
    expect(await photoFiles()).toBe(0);
  });

  it('rejects files that are not photos, empty uploads and signed-out requests', async () => {
    const { auth } = await register('9000000072');
    const send = (body) => api().post('/api/v1/customer/me/photo').set('Authorization', auth).set('Content-Type', 'application/octet-stream').send(body);
    await send(PDF()).expect(422);
    await send(Buffer.alloc(0)).expect(422);
    await send(Buffer.concat([PNG(), Buffer.alloc(6 * 1024 * 1024)])).expect(413);
    await api().post('/api/v1/customer/me/photo').set('Content-Type', 'application/octet-stream').send(PNG()).expect(401);
    await api().get('/api/v1/customer-photos/not-a-key').expect(404);
    expect(await photoFiles()).toBe(0);
  });

  it('staff can take or remove a customer photo at the counter', async () => {
    const rohit = await createTestCustomer();
    const up = await api()
      .post(`/api/v1/admin/customers/${rohit._id}/photo`)
      .set('Authorization', adminAuth)
      .set('Content-Type', 'application/octet-stream')
      .send(JPG())
      .expect(200);
    expect(up.body.data.customer.photo.path).toMatch(/^\/customer-photos\//);

    const { auth } = await loginAsCustomer(app, '9876543210');
    expect((await me(auth)).photo.path).toBe(up.body.data.customer.photo.path);

    await api().delete(`/api/v1/admin/customers/${rohit._id}/photo`).set('Authorization', adminAuth).expect(200);
    expect((await me(auth)).photo).toBeNull();
    await api().delete(`/api/v1/admin/customers/${rohit._id}/photo`).set('Authorization', adminAuth).expect(404);
  });
});
