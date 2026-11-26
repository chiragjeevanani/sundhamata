import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_PASSWORD, buildApp, loginAsAdmin, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let admin;
let auth;
beforeEach(async () => {
  ({ admin, auth } = await loginAsAdmin(app, { role: 'manager' }));
});

const updateMe = (body, token = auth) => api().patch('/api/v1/admin/me').set('Authorization', token).send(body);
const changePassword = (body, token = auth) => api().post('/api/v1/admin/me/password').set('Authorization', token).send(body);
const login = (identifier, password) => api().post('/api/v1/auth/admin/login').send({ identifier, password });

describe('My Account (admin changes their own details)', () => {
  it('changes the name without a password, and email / mobile only with the current password', async () => {
    const named = await updateMe({ name: '  Bharat Patel ' }).expect(200);
    expect(named.body.data.admin).toMatchObject({ name: 'Bharat Patel', avatarInitials: 'BP' });

    await updateMe({ email: 'owner@sundhamata.in' }).expect(422); // no current password
    await updateMe({ email: 'owner@sundhamata.in', currentPassword: 'wrong-one' }).expect(422);
    const moved = await updateMe({ email: ' Owner@Sundhamata.in ', mobile: '84013 41508', currentPassword: ADMIN_PASSWORD }).expect(200);
    expect(moved.body.data.admin).toMatchObject({ email: 'owner@sundhamata.in', mobile: '+918401341508' });

    // Signs in with the new email and mobile, not the old email
    await login('owner@sundhamata.in', ADMIN_PASSWORD).expect(200);
    await login('8401341508', ADMIN_PASSWORD).expect(200);
    await login(admin.email, ADMIN_PASSWORD).expect(401);

    // Mobile can be removed
    const noMobile = await updateMe({ mobile: '', currentPassword: ADMIN_PASSWORD }).expect(200);
    expect(noMobile.body.data.admin.mobile).toBeNull();
  });

  it('does not take another admin’s email or mobile, and validates input', async () => {
    const { admin: other } = await loginAsAdmin(app);
    const clash = await updateMe({ email: other.email, mobile: other.mobile, currentPassword: ADMIN_PASSWORD }).expect(409);
    expect(clash.body.errors.map((e) => e.field).sort()).toEqual(['email', 'mobile']);
    await updateMe({ email: 'not-an-email', currentPassword: ADMIN_PASSWORD }).expect(422);
    await updateMe({ name: 'A' }).expect(422);
    await updateMe({}).expect(422);
    await updateMe({ role: 'admin' }).expect(422); // cannot promote themselves
    await updateMe({ name: 'X Y' }, 'Bearer nope').expect(401);
  });

  it('changes the password, keeps this device signed in and signs out the others', async () => {
    const { body: other } = await login(admin.email, ADMIN_PASSWORD).expect(200);
    const otherDevice = `Bearer ${other.data.token}`;
    await new Promise((r) => setTimeout(r, 1100)); // tokens carry whole seconds

    await changePassword({ currentPassword: 'wrong-one', newPassword: 'NewPass123' }).expect(422);
    await changePassword({ currentPassword: ADMIN_PASSWORD, newPassword: 'short1' }).expect(422);
    await changePassword({ currentPassword: ADMIN_PASSWORD, newPassword: 'onlyletters' }).expect(422);
    await changePassword({ currentPassword: ADMIN_PASSWORD, newPassword: ADMIN_PASSWORD }).expect(422); // same as now

    const changed = await changePassword({ currentPassword: ADMIN_PASSWORD, newPassword: 'NewPass123' }).expect(200);
    const thisDevice = `Bearer ${changed.body.data.token}`;

    await api().get('/api/v1/admin/me').set('Authorization', thisDevice).expect(200);
    const kicked = await api().get('/api/v1/admin/me').set('Authorization', otherDevice).expect(401);
    expect(kicked.body.message).toMatch(/password was changed/i);
    await api().get('/api/v1/admin/me').set('Authorization', auth).expect(401); // the old token of this device too

    await login(admin.email, ADMIN_PASSWORD).expect(401);
    await login(admin.email, 'NewPass123').expect(200);
  });
});
