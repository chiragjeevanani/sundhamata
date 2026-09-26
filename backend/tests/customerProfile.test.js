import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Customer } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let auth;
let rohit;

beforeEach(async () => {
  rohit = await createTestCustomer();
  ({ auth } = await loginAsCustomer(app, '9876543210'));
});

const update = (body) => api().patch('/api/v1/customer/me').set('Authorization', auth).send(body);

describe('Customer edits their profile', () => {
  it('saves email, date of birth, gender, anniversary and address', async () => {
    const res = await update({
      name: 'Rohit K. Sharma',
      email: 'Rohit@Example.com',
      dob: '1994-08-17',
      gender: 'male',
      anniversaryDate: '2020-02-29',
      address: 'B-42, Malviya Nagar',
      city: 'Ahmedabad',
      pincode: '382405',
    }).expect(200);

    expect(res.body.data.customer).toMatchObject({
      name: 'Rohit K. Sharma',
      email: 'rohit@example.com',
      dob: '1994-08-17',
      gender: 'male',
      anniversaryDate: '2020-02-29',
      address: 'B-42, Malviya Nagar',
      city: 'Ahmedabad',
      pincode: '382405',
    });

    // Stored as a calendar day at 00:00 UTC, so it never shifts with time zones
    const stored = await Customer.findById(rohit._id).lean();
    expect(stored.dob.toISOString()).toBe('1994-08-17T00:00:00.000Z');

    const me = await api().get('/api/v1/customer/me').set('Authorization', auth).expect(200);
    expect(me.body.data.customer).toMatchObject({ dob: '1994-08-17', anniversaryDate: '2020-02-29', gender: 'male' });
  });

  it('clears optional fields with empty values', async () => {
    await update({ dob: '1994-08-17', gender: 'female', email: 'a@b.co' }).expect(200);
    const res = await update({ dob: '', gender: '', email: '' }).expect(200);
    expect(res.body.data.customer).toMatchObject({ dob: null, gender: null, email: null });
  });

  it.each([
    [{ dob: '2999-01-01' }, /cannot be in the future/],
    [{ dob: '1850-01-01' }, /too far in the past/],
    [{ dob: '2023-02-30' }, /not a valid date/],
    [{ dob: '17/08/1994' }, /YYYY-MM-DD/],
    [{ anniversaryDate: '2999-05-01' }, /cannot be in the future/],
    [{ gender: 'robot' }, /Gender must be one of/],
    [{ email: 'not-an-email' }, /valid email/],
    [{ pincode: '12' }, /6-digit/],
  ])('rejects %o', async (body, message) => {
    const res = await update(body).expect(422);
    expect(res.body.errors[0].message).toMatch(message);
  });

  it('still cannot change mobile number or loyalty points', async () => {
    await update({ mobile: '9000000000' }).expect(422);
    await update({ loyaltyPoints: 999 }).expect(422);
  });

  it('admin sees and can edit the same details', async () => {
    await update({ dob: '1994-08-17', gender: 'male', anniversaryDate: '2020-02-29' }).expect(200);
    const { auth: adminAuth } = await loginAsAdmin(app);
    const got = await api().get(`/api/v1/admin/customers/${rohit.id}`).set('Authorization', adminAuth).expect(200);
    expect(got.body.data.customer).toMatchObject({ dob: '1994-08-17', gender: 'male', anniversaryDate: '2020-02-29' });

    const edited = await api()
      .patch(`/api/v1/admin/customers/${rohit.id}`)
      .set('Authorization', adminAuth)
      .send({ anniversaryDate: '2021-03-01' })
      .expect(200);
    expect(edited.body.data.customer.anniversaryDate).toBe('2021-03-01');
  });
});
