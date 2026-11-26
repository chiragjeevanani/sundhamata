import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

// A complete service inquiry
const SCREEN_REPAIR = {
  device: 'mobile',
  brandModel: 'Samsung Galaxy A54',
  problem: 'Screen / Display broken',
  details: 'Fell down, touch not working',
  preference: 'visit_store',
};
// Smallest valid JPEG header (the API checks the image type, not the pixels)
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

let adminAuth;
let customerAuth;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
  await createTestCustomer();
  ({ auth: customerAuth } = await loginAsCustomer(app, '+919876543210'));
});

describe('Inquiries', () => {
  it('a customer sends an inquiry and the admin sees and updates it', async () => {
    const res = await api()
      .post('/api/v1/customer/inquiries')
      .set('Authorization', customerAuth)
      .send({
        category: 'mobile',
        budget: 25000,
        mobile: { brand: 'Samsung', ramRom: '8GB RAM + 128GB ROM', features: ['Camera', '5G'] },
        message: 'Looking for a 5G phone with a good camera',
      })
      .expect(201);
    expect(res.body.data.inquiry).toMatchObject({
      category: 'mobile',
      budget: 25000,
      status: 'new',
      mobile: { brand: 'Samsung', ramRom: '8GB RAM + 128GB ROM', features: ['Camera', '5G'] },
    });

    const mine = await api().get('/api/v1/customer/inquiries').set('Authorization', customerAuth).expect(200);
    expect(mine.body.data.items).toHaveLength(1);

    const list = await api().get('/api/v1/admin/inquiries').set('Authorization', adminAuth).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].customer).toMatchObject({ name: 'Rohit Sharma', mobile: '+919876543210' });
    expect(list.body.data.counts).toEqual({ new: 1, open: 1 });

    const byBrand = await api().get('/api/v1/admin/inquiries?search=samsung').set('Authorization', adminAuth).expect(200);
    expect(byBrand.body.data.items[0].mobile.brand).toBe('Samsung');

    const search = await api().get('/api/v1/admin/inquiries?search=rohit').set('Authorization', adminAuth).expect(200);
    expect(search.body.data.items).toHaveLength(1);

    const id = list.body.data.items[0].id;
    const updated = await api()
      .patch(`/api/v1/admin/inquiries/${id}`)
      .set('Authorization', adminAuth)
      .send({ status: 'contacted', adminNote: 'Called, visiting Sunday' })
      .expect(200);
    expect(updated.body.data.inquiry).toMatchObject({ status: 'contacted', adminNote: 'Called, visiting Sunday' });

    // Leads: "open" = new or contacted; closing moves it to the Closed tab
    const open = async () => (await api().get('/api/v1/admin/inquiries?status=open').set('Authorization', adminAuth).expect(200)).body.data;
    expect((await open()).items).toHaveLength(1);
    await api().patch(`/api/v1/admin/inquiries/${id}`).set('Authorization', adminAuth).send({ status: 'closed' }).expect(200);
    const afterClose = await open();
    expect(afterClose.items).toHaveLength(0);
    expect(afterClose.counts).toEqual({ closed: 1, open: 0 });
    await api().patch(`/api/v1/admin/inquiries/${id}`).set('Authorization', adminAuth).send({ status: 'contacted' }).expect(200);
    expect((await open()).items).toHaveLength(1);

    await api().delete(`/api/v1/admin/inquiries/${id}`).set('Authorization', adminAuth).expect(200);
    const after = await api().get('/api/v1/admin/inquiries').set('Authorization', adminAuth).expect(200);
    expect(after.body.data.items).toHaveLength(0);
  });

  it('budget is optional for service, and the category is validated', async () => {
    await api()
      .post('/api/v1/customer/inquiries')
      .set('Authorization', customerAuth)
      .send({ category: 'service', budget: '', service: SCREEN_REPAIR })
      .expect(201);
    await api()
      .post('/api/v1/customer/inquiries')
      .set('Authorization', customerAuth)
      .send({ category: 'laptop', message: 'Gaming laptop' })
      .expect(422);
    await api()
      .post('/api/v1/customer/inquiries')
      .set('Authorization', customerAuth)
      .send({ category: 'accessories' })
      .expect(422);
  });

  it('a mobile inquiry needs brand, RAM & ROM and budget; additional requirements are optional', async () => {
    const send = (body) => api().post('/api/v1/customer/inquiries').set('Authorization', customerAuth).send(body);
    const mobile = { brand: 'Vivo', ramRom: '8GB RAM + 256GB ROM' };

    const ok = await send({ category: 'mobile', budget: 20000, mobile }).expect(201);
    expect(ok.body.data.inquiry).toMatchObject({ message: null, mobile: { ...mobile, features: [] } });

    await send({ category: 'mobile', budget: 20000 }).expect(422); // no brand / RAM & ROM
    await send({ category: 'mobile', mobile }).expect(422); // no budget
    await send({ category: 'mobile', budget: 20000, mobile: { brand: '', ramRom: '8GB' } }).expect(422);
    await send({ category: 'mobile', budget: 20000, mobile: { ...mobile, features: ['Wings'] } }).expect(422);

    // Mobile answers are ignored on other inquiry types
    const svc = await send({ category: 'service', service: SCREEN_REPAIR, mobile }).expect(201);
    expect(svc.body.data.inquiry.mobile).toBeNull();
  });

  it('an accessories inquiry needs type, item and budget; brand, device and notes are optional', async () => {
    const send = (body) => api().post('/api/v1/customer/inquiries').set('Authorization', customerAuth).send(body);

    const full = await send({
      category: 'accessories',
      budget: 1500,
      accessories: { type: 'mobile', item: 'Earbuds / TWS', brandPreference: 'boAt', device: 'Samsung A54', quantity: '2' },
      message: 'Black colour',
    }).expect(201);
    expect(full.body.data.inquiry).toMatchObject({
      message: 'Black colour',
      mobile: null,
      accessories: { type: 'mobile', item: 'Earbuds / TWS', brandPreference: 'boAt', device: 'Samsung A54', quantity: 2 },
    });

    const minimal = await send({ category: 'accessories', budget: 500, accessories: { type: 'laptop', item: 'Laptop Stand' } }).expect(201);
    expect(minimal.body.data.inquiry.accessories).toEqual({
      type: 'laptop',
      item: 'Laptop Stand',
      brandPreference: null,
      device: null,
      quantity: 1,
    });

    await send({ category: 'accessories', budget: 500 }).expect(422); // no answers
    await send({ category: 'accessories', accessories: { type: 'mobile', item: 'Cable' } }).expect(422); // no budget
    await send({ category: 'accessories', budget: 500, accessories: { type: 'tablet', item: 'Cable' } }).expect(422);
    await send({ category: 'accessories', budget: 500, accessories: { type: 'mobile', item: 'Cable', quantity: 0 } }).expect(422);

    const search = await api().get('/api/v1/admin/inquiries?search=earbuds').set('Authorization', adminAuth).expect(200);
    expect(search.body.data.items).toHaveLength(1);
  });

  it('a service inquiry needs device, brand & model, problem and preference, and can carry a photo', async () => {
    const send = (body) => api().post('/api/v1/customer/inquiries').set('Authorization', customerAuth).send(body);

    const res = await send({ category: 'service', service: SCREEN_REPAIR, message: 'Need it by Friday' }).expect(201);
    const inquiry = res.body.data.inquiry;
    expect(inquiry).toMatchObject({ category: 'service', budget: null, message: 'Need it by Friday', service: SCREEN_REPAIR, photo: null });

    await send({ category: 'service', message: 'Screen cracked' }).expect(422); // no answers
    await send({ category: 'service', service: { ...SCREEN_REPAIR, device: 'tablet' } }).expect(422);
    await send({ category: 'service', service: { ...SCREEN_REPAIR, preference: 'courier' } }).expect(422);
    await send({ category: 'service', service: { ...SCREEN_REPAIR, problem: '' } }).expect(422);

    // Photo: only on the customer's own service inquiry
    const upload = (id, auth, body = JPEG) =>
      api().post(`/api/v1/customer/inquiries/${id}/photo`).set('Authorization', auth).set('Content-Type', 'image/jpeg').send(body);
    const withPhoto = await upload(inquiry.id, customerAuth).expect(200);
    const { path } = withPhoto.body.data.inquiry.photo;
    expect(path).toMatch(/^\/inquiry-photos\/[a-f0-9]{32}$/);
    const img = await api().get(`/api/v1${path}`).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');

    await upload(inquiry.id, customerAuth, Buffer.from('not an image')).expect(422);
    const other = await createTestCustomer({ name: 'Anita Patel', mobile: '+919812345678' });
    const { auth: otherAuth } = await loginAsCustomer(app, other.mobile);
    await upload(inquiry.id, otherAuth).expect(404);
    const accessories = await send({ category: 'accessories', budget: 500, accessories: { type: 'mobile', item: 'Cable' } }).expect(201);
    await upload(accessories.body.data.inquiry.id, customerAuth).expect(404);

    // Admin sees it, finds it by model, and deleting the inquiry removes the photo
    const list = await api().get('/api/v1/admin/inquiries?search=a54').set('Authorization', adminAuth).expect(200);
    expect(list.body.data.items[0]).toMatchObject({ service: SCREEN_REPAIR, photo: { path } });
    await api().delete(`/api/v1/admin/inquiries/${inquiry.id}`).set('Authorization', adminAuth).expect(200);
    await api().get(`/api/v1${path}`).expect(404);
  });

  it('requires sign-in', async () => {
    await api().post('/api/v1/customer/inquiries').send({ category: 'mobile', message: 'Hello there' }).expect(401);
    await api().get('/api/v1/admin/inquiries').set('Authorization', customerAuth).expect(401);
  });
});
