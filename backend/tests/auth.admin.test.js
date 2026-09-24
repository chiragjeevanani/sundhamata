import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Admin } from '../src/models/index.js';
import {
  ADMIN_PASSWORD,
  buildApp,
  createAdminUser,
  createTestCustomer,
  loginAsAdmin,
  loginAsCustomer,
  useTestDatabase,
} from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);
const login = (body) => api().post('/api/v1/auth/admin/login').send(body);

describe('Admin authentication', () => {
  it('10. logs in with email + password and returns a token and profile', async () => {
    const admin = await createAdminUser({ role: 'manager' });
    const res = await login({ identifier: admin.email.toUpperCase(), password: ADMIN_PASSWORD }).expect(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.expiresAt).toEqual(expect.any(String));
    expect(res.body.data.admin).toMatchObject({ email: admin.email, role: 'manager', roleLabel: 'Store Manager' });
    expect(res.body.data.admin).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('$2'); // no bcrypt hash anywhere
  });

  it('logs in with mobile number in any format', async () => {
    await createAdminUser({ mobile: '+919829012345' });
    await login({ identifier: '98290 12345', password: ADMIN_PASSWORD }).expect(200);
    await login({ mobile: '+919829012345', password: ADMIN_PASSWORD }).expect(200);
  });

  it('11. rejects invalid credentials with a generic message', async () => {
    const admin = await createAdminUser();
    const wrongPassword = await login({ identifier: admin.email, password: 'wrong' }).expect(401);
    const unknownUser = await login({ identifier: 'nobody@example.com', password: ADMIN_PASSWORD }).expect(401);
    expect(wrongPassword.body.message).toBe(unknownUser.body.message);
    await login({ identifier: admin.email }).expect(422);
  });

  it('refuses deactivated admins', async () => {
    const admin = await createAdminUser({ isActive: false });
    await login({ identifier: admin.email, password: ADMIN_PASSWORD }).expect(403);
  });

  it('GET /admin/me returns the current admin', async () => {
    const { auth, admin } = await loginAsAdmin(app);
    const res = await api().get('/api/v1/admin/me').set('Authorization', auth).expect(200);
    expect(res.body.data.admin.id).toBe(admin.id);
  });

  it('protects every admin route and rejects customer tokens', async () => {
    await api().get('/api/v1/admin/customers').expect(401);
    await createTestCustomer();
    const { auth: customerAuth } = await loginAsCustomer(app, '9876543210');
    for (const path of ['/api/v1/admin/me', '/api/v1/admin/customers', '/api/v1/admin/dashboard', '/api/v1/admin/settings']) {
      await api().get(path).set('Authorization', customerAuth).expect(401);
    }
  });

  it('rejects expired and forged admin tokens', async () => {
    const admin = await createAdminUser();
    const expired = jwt.sign({ typ: 'sundhamata:admin' }, process.env.JWT_SECRET, {
      subject: admin.id,
      audience: 'sundhamata:admin',
      issuer: 'sundhamata-api',
      expiresIn: -10,
    });
    const res = await api().get('/api/v1/admin/me').set('Authorization', `Bearer ${expired}`).expect(401);
    expect(res.body.message).toMatch(/expired/i);

    const forged = jwt.sign({ typ: 'sundhamata:admin' }, 'some-other-secret-with-enough-length!!', {
      subject: admin.id,
      audience: 'sundhamata:admin',
      issuer: 'sundhamata-api',
    });
    await api().get('/api/v1/admin/me').set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('a deactivated admin loses access immediately', async () => {
    const { auth, admin } = await loginAsAdmin(app);
    await Admin.updateOne({ _id: admin._id }, { isActive: false });
    await api().get('/api/v1/admin/me').set('Authorization', auth).expect(401);
  });

  it('logout is acknowledged and states that JWTs are not revoked server-side', async () => {
    const { auth } = await loginAsAdmin(app);
    const res = await api().post('/api/v1/auth/admin/logout').set('Authorization', auth).expect(200);
    expect(res.body.data.serverSideInvalidation).toBe(false);
  });
});

describe('CORS', () => {
  it('allows configured origins and rejects others', async () => {
    const ok = await api().get('/api/v1/store').set('Origin', 'http://localhost:5173').expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const admin = await api().options('/api/v1/admin/me').set('Origin', 'http://localhost:5174').set('Access-Control-Request-Method', 'GET');
    expect(admin.headers['access-control-allow-origin']).toBe('http://localhost:5174');
    const evil = await api().get('/api/v1/store').set('Origin', 'https://evil.example.com').expect(403);
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });
});
