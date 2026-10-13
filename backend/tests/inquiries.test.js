import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

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
      .send({ category: 'mobile', budget: 25000, message: 'Looking for a 5G phone with a good camera' })
      .expect(201);
    expect(res.body.data.inquiry).toMatchObject({ category: 'mobile', budget: 25000, status: 'new' });

    const mine = await api().get('/api/v1/customer/inquiries').set('Authorization', customerAuth).expect(200);
    expect(mine.body.data.items).toHaveLength(1);

    const list = await api().get('/api/v1/admin/inquiries').set('Authorization', adminAuth).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].customer).toMatchObject({ name: 'Rohit Sharma', mobile: '+919876543210' });
    expect(list.body.data.counts).toEqual({ new: 1 });

    const search = await api().get('/api/v1/admin/inquiries?search=rohit').set('Authorization', adminAuth).expect(200);
    expect(search.body.data.items).toHaveLength(1);

    const id = list.body.data.items[0].id;
    const updated = await api()
      .patch(`/api/v1/admin/inquiries/${id}`)
      .set('Authorization', adminAuth)
      .send({ status: 'contacted', adminNote: 'Called, visiting Sunday' })
      .expect(200);
    expect(updated.body.data.inquiry).toMatchObject({ status: 'contacted', adminNote: 'Called, visiting Sunday' });

    await api().delete(`/api/v1/admin/inquiries/${id}`).set('Authorization', adminAuth).expect(200);
    const after = await api().get('/api/v1/admin/inquiries').set('Authorization', adminAuth).expect(200);
    expect(after.body.data.items).toHaveLength(0);
  });

  it('budget is optional and the category and reason are validated', async () => {
    await api()
      .post('/api/v1/customer/inquiries')
      .set('Authorization', customerAuth)
      .send({ category: 'service', budget: '', message: 'Screen replacement' })
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

  it('requires sign-in', async () => {
    await api().post('/api/v1/customer/inquiries').send({ category: 'mobile', message: 'Hello there' }).expect(401);
    await api().get('/api/v1/admin/inquiries').set('Authorization', customerAuth).expect(401);
  });
});
