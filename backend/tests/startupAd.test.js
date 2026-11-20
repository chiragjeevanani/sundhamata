import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, loginAsAdmin, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

// Smallest valid PNG / JPEG headers (the API checks the image type, not the pixels)
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

let auth;
beforeEach(async () => {
  ({ auth } = await loginAsAdmin(app));
});

const upload = (body = PNG) =>
  api().post('/api/v1/admin/startup-ad/poster').set('Authorization', auth).set('Content-Type', 'image/png').send(body);
const update = (body) => api().patch('/api/v1/admin/startup-ad').set('Authorization', auth).send(body);
const publicAd = async () => (await api().get('/api/v1/startup-ad').expect(200)).body.data.ad;

describe('Startup advertisement', () => {
  it('shows nothing until a poster is uploaded and switched on', async () => {
    expect(await publicAd()).toBeNull();
    const admin = await api().get('/api/v1/admin/startup-ad').set('Authorization', auth).expect(200);
    expect(admin.body.data.ad).toMatchObject({ enabled: false, skipAfterSeconds: 5, autoCloseSeconds: null, poster: null, live: false });

    // Cannot switch on without a poster
    await update({ enabled: true }).expect(422);

    const uploaded = await upload().expect(200);
    expect(uploaded.body.data.ad.poster.path).toMatch(/^\/startup-ad\/posters\/[a-f0-9]{32}$/);
    expect(await publicAd()).toBeNull(); // uploaded but still off

    const on = await update({ enabled: true, skipAfterSeconds: 8 }).expect(200);
    expect(on.body.data.ad.live).toBe(true);
    const ad = await publicAd();
    expect(ad).toMatchObject({ skipAfterSeconds: 8, autoCloseSeconds: null, posterPath: uploaded.body.data.ad.poster.path });

    // The poster loads without signing in
    const img = await api().get(`/api/v1${ad.posterPath}`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
  });

  it('validates the timings', async () => {
    await upload().expect(200);
    await update({ skipAfterSeconds: -1 }).expect(422);
    await update({ skipAfterSeconds: 61 }).expect(422);
    await update({ skipAfterSeconds: 2.5 }).expect(422);
    await update({ skipAfterSeconds: 10, autoCloseSeconds: 5 }).expect(422); // closes before Skip appears
    const ok = await update({ skipAfterSeconds: 5, autoCloseSeconds: 15 }).expect(200);
    expect(ok.body.data.ad).toMatchObject({ skipAfterSeconds: 5, autoCloseSeconds: 15 });
    const cleared = await update({ autoCloseSeconds: '' }).expect(200);
    expect(cleared.body.data.ad.autoCloseSeconds).toBeNull();
  });

  it('replacing or removing the poster takes the old image down', async () => {
    const first = (await upload().expect(200)).body.data.ad.poster.path;
    await update({ enabled: true }).expect(200);

    const second = (await upload(JPEG).expect(200)).body.data.ad.poster.path;
    expect(second).not.toBe(first);
    await api().get(`/api/v1${first}`).expect(404);
    expect((await publicAd()).posterPath).toBe(second);

    await upload(Buffer.from('not an image')).expect(422);

    const removed = await api().delete('/api/v1/admin/startup-ad/poster').set('Authorization', auth).expect(200);
    expect(removed.body.data.ad).toMatchObject({ enabled: false, poster: null, live: false });
    expect(await publicAd()).toBeNull();
    await api().get(`/api/v1${second}`).expect(404);
  });

  it('only admins can change it', async () => {
    await api().patch('/api/v1/admin/startup-ad').send({ enabled: false }).expect(401);
    await api().post('/api/v1/admin/startup-ad/poster').set('Content-Type', 'image/png').send(PNG).expect(401);
  });
});
