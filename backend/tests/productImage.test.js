import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

const PNG = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPG = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 2)]);
const WEBP = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(16)]);
const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

let adminAuth;
let rohit;
let purchaseId;

beforeEach(async () => {
  await mongoose.connection.db.collection('productImages.files').deleteMany({});
  await mongoose.connection.db.collection('productImages.chunks').deleteMany({});
  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
  const res = await api().post('/api/v1/admin/purchases').set('Authorization', adminAuth).send(samplePurchase(rohit._id)).expect(201);
  purchaseId = res.body.data.purchase.id;
});

const upload = (body, auth = adminAuth) => {
  let req = api().post(`/api/v1/admin/purchases/${purchaseId}/image`);
  if (auth) req = req.set('Authorization', auth);
  return req.set('Content-Type', 'application/octet-stream').send(body);
};
const imageFiles = () => mongoose.connection.db.collection('productImages.files').countDocuments();
const fetchImage = (path) => api().get(`/api/v1${path}`).buffer(true).parse(binary);

describe('Product image', () => {
  it('uploads a photo that anyone with the link can load, identical bytes, cross-origin allowed', async () => {
    const file = PNG();
    const res = await upload(file).expect(200);
    const image = res.body.data.purchase.productImage;
    expect(image).toMatchObject({ path: expect.stringMatching(/^\/product-images\/[a-f0-9]{32}$/), contentType: 'image/png', size: file.length });
    expect(image).not.toHaveProperty('fileId');

    // Public (no token) — an <img> tag on the Vercel site cannot send one
    const img = await fetchImage(image.path).expect(200);
    expect(Buffer.compare(img.body, file)).toBe(0);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    expect(img.headers['cache-control']).toMatch(/immutable/);
  });

  it('accepts JPG and WebP; rejects other formats and oversized images', async () => {
    await upload(JPG()).expect(200);
    await upload(WEBP()).expect(200);
    const pdf = await upload(Buffer.from('%PDF-1.4 not an image')).expect(422);
    expect(pdf.body.errors[0].message).toMatch(/JPG, PNG, WebP or GIF/);
    await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).expect(422);
    await upload(Buffer.concat([Buffer.from('ftypheic'), Buffer.alloc(16)])).expect(422); // HEIC is not browser-displayable
    await upload(Buffer.concat([PNG(), Buffer.alloc(5 * 1024 * 1024)])).expect(413);
    await upload(Buffer.alloc(0)).expect(422);
  });

  it('replacing changes the link and deletes the old file; removing clears it', async () => {
    const first = (await upload(PNG()).expect(200)).body.data.purchase.productImage.path;
    const second = (await upload(JPG()).expect(200)).body.data.purchase.productImage.path;
    expect(second).not.toBe(first);
    expect(await imageFiles()).toBe(1);
    await fetchImage(first).expect(404);
    await fetchImage(second).expect(200);

    const removed = await api().delete(`/api/v1/admin/purchases/${purchaseId}/image`).set('Authorization', adminAuth).expect(200);
    expect(removed.body.data.purchase.productImage).toBeNull();
    expect(await imageFiles()).toBe(0);
    await fetchImage(second).expect(404);
  });

  it('customer purchase data carries the image path', async () => {
    const path = (await upload(PNG()).expect(200)).body.data.purchase.productImage.path;
    const { auth } = await loginAsCustomer(app, '9876543210');
    const mine = await api().get(`/api/v1/customer/purchases/${purchaseId}`).set('Authorization', auth).expect(200);
    expect(mine.body.data.purchase.productImage.path).toBe(path);
  });

  it('only admins can upload; unknown or malformed keys are 404', async () => {
    await upload(PNG(), null).expect(401);
    const { auth: customerAuth } = await loginAsCustomer(app, '9876543210');
    await upload(PNG(), customerAuth).expect(401);
    await fetchImage('/product-images/0123456789abcdef0123456789abcdef').expect(404);
    await fetchImage('/product-images/../../admin').expect(404);
    await fetchImage('/product-images/not-a-key').expect(404);
  });

  it('cannot be changed on a cancelled purchase, but still loads', async () => {
    const path = (await upload(PNG()).expect(200)).body.data.purchase.productImage.path;
    await api().post(`/api/v1/admin/purchases/${purchaseId}/cancel`).set('Authorization', adminAuth).send({}).expect(200);
    await upload(JPG()).expect(409);
    await api().delete(`/api/v1/admin/purchases/${purchaseId}/image`).set('Authorization', adminAuth).expect(409);
    await fetchImage(path).expect(200);
  });
});

describe('Product details', () => {
  it('records brand, model, variant, colour and IMEI as entered', async () => {
    const res = await api()
      .post('/api/v1/admin/purchases')
      .set('Authorization', adminAuth)
      .send(
        samplePurchase(rohit._id, {
          product: { name: 'Galaxy S25 Ultra', brand: 'Samsung', model: 'SM-S938B', variant: '12GB + 256GB', color: 'Titanium Black', imei: '358921104829104' },
        })
      )
      .expect(201);
    expect(res.body.data.purchase.product).toMatchObject({
      brand: 'Samsung', model: 'SM-S938B', variant: '12GB + 256GB', color: 'Titanium Black', imei: '358921104829104',
    });
  });

  it('admin can correct brand, model, variant and colour later', async () => {
    const res = await api()
      .patch(`/api/v1/admin/purchases/${purchaseId}`)
      .set('Authorization', adminAuth)
      .send({ product: { brand: 'Apple', model: 'A3293', variant: '256GB', color: 'Natural Titanium' } })
      .expect(200);
    expect(res.body.data.purchase.product).toMatchObject({ brand: 'Apple', model: 'A3293', variant: '256GB', color: 'Natural Titanium' });
  });
});
