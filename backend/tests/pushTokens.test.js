import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Customer } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

const WEB_TOKEN = 'web-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const APP_TOKEN = 'app-token-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let customer;
let auth;
beforeEach(async () => {
  customer = await createTestCustomer();
  ({ auth } = await loginAsCustomer(app, customer.mobile));
});

const tokensOf = async (id) => (await Customer.findById(id, { fcmTokens: 1 }).lean()).fcmTokens;

describe('Push notification tokens', () => {
  it('keeps separate lists for web and app, without duplicates', async () => {
    for (const body of [
      { token: WEB_TOKEN, platform: 'web' },
      { token: APP_TOKEN, platform: 'app' },
      { token: WEB_TOKEN, platform: 'web' },
    ]) {
      await api().post('/api/v1/customer/me/fcm-tokens').set('Authorization', auth).send(body).expect(200);
    }
    expect(await tokensOf(customer._id)).toEqual({ web: [WEB_TOKEN], app: [APP_TOKEN] });

    // Never exposed to the client
    const me = await api().get('/api/v1/customer/me').set('Authorization', auth).expect(200);
    expect(me.body.data.customer).not.toHaveProperty('fcmTokens');

    await api()
      .delete('/api/v1/customer/me/fcm-tokens')
      .set('Authorization', auth)
      .send({ token: WEB_TOKEN, platform: 'web' })
      .expect(200);
    expect(await tokensOf(customer._id)).toEqual({ web: [], app: [APP_TOKEN] });
  });

  it('moves a device to the account that signed in on it last', async () => {
    await api()
      .post('/api/v1/customer/me/fcm-tokens')
      .set('Authorization', auth)
      .send({ token: APP_TOKEN, platform: 'app' })
      .expect(200);

    const other = await createTestCustomer({ name: 'Priya Patel', mobile: '+919812345678' });
    const { auth: otherAuth } = await loginAsCustomer(app, other.mobile);
    await api()
      .post('/api/v1/customer/me/fcm-tokens')
      .set('Authorization', otherAuth)
      .send({ token: APP_TOKEN, platform: 'app' })
      .expect(200);

    expect((await tokensOf(customer._id)).app).toEqual([]);
    expect((await tokensOf(other._id)).app).toEqual([APP_TOKEN]);
  });

  it('rejects an unknown platform and requires sign-in', async () => {
    await api()
      .post('/api/v1/customer/me/fcm-tokens')
      .set('Authorization', auth)
      .send({ token: WEB_TOKEN, platform: 'ios' })
      .expect(422);
    await api().post('/api/v1/customer/me/fcm-tokens').send({ token: WEB_TOKEN, platform: 'web' }).expect(401);
  });
});
