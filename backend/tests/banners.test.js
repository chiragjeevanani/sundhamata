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

const create = (query, body = PNG) =>
  api().post('/api/v1/admin/banners').query(query).set('Authorization', auth).set('Content-Type', 'image/png').send(body);
const update = (id, body) => api().patch(`/api/v1/admin/banners/${id}`).set('Authorization', auth).send(body);
const live = async () => (await api().get('/api/v1/banners').expect(200)).body.data.banners;

describe('Home banners', () => {
  it('adds banners to a slot and shows the live ones to customers in order', async () => {
    expect(await live()).toEqual([]);

    const a = (await create({ placement: 'top', width: 1200, height: 430, title: 'Free 6D glass', link: '/coupons' }).expect(201)).body.data.banner;
    expect(a).toMatchObject({ placement: 'top', title: 'Free 6D glass', link: '/coupons', active: true, sortOrder: 0 });
    expect(a.image).toMatchObject({ width: 1200, height: 430 });
    expect(a.image.path).toMatch(/^\/banners\/images\/[a-f0-9]{32}$/);

    const b = (await create({ placement: 'top', link: 'https://example.com/diwali' }).expect(201)).body.data.banner;
    expect(b.sortOrder).toBe(1);
    await create({ placement: 'middle', active: 'false' }).expect(201);

    let banners = await live();
    expect(banners.map((x) => x.id)).toEqual([a.id, b.id]); // the inactive middle one is hidden
    expect(banners[0]).toMatchObject({ placement: 'top', link: '/coupons', width: 1200, height: 430 });

    // Images load without signing in
    const img = await api().get(`/api/v1${banners[0].imagePath}`).expect(200);
    expect(img.headers['content-type']).toBe('image/png');

    // Reorder and switch off
    await api().post('/api/v1/admin/banners/reorder').set('Authorization', auth).send({ placement: 'top', ids: [b.id, a.id] }).expect(200);
    banners = await live();
    expect(banners.map((x) => x.id)).toEqual([b.id, a.id]);
    await update(b.id, { active: false }).expect(200);
    expect((await live()).map((x) => x.id)).toEqual([a.id]);
  });

  it('respects the schedule', async () => {
    const day = 24 * 60 * 60 * 1000;
    const future = new Date(Date.now() + day).toISOString();
    const past = new Date(Date.now() - day).toISOString();
    const later = (await create({ placement: 'middle', startsAt: future }).expect(201)).body.data.banner;
    const ended = (await create({ placement: 'middle', endsAt: past }).expect(201)).body.data.banner;
    expect(await live()).toEqual([]);

    await update(later.id, { startsAt: null }).expect(200);
    await update(ended.id, { endsAt: '' }).expect(200);
    expect((await live()).length).toBe(2);

    await update(later.id, { startsAt: future, endsAt: past }).expect(422); // ends before it starts
  });

  it('validates input', async () => {
    await create({ placement: 'bottom' }).expect(422);
    await create({ placement: 'top', link: 'javascript:alert(1)' }).expect(422);
    await create({ placement: 'top', link: '//evil.example' }).expect(422);
    await create({ placement: 'top' }, Buffer.from('not an image')).expect(422);
    const { id } = (await create({ placement: 'top' }).expect(201)).body.data.banner;
    await update(id, { title: 'x'.repeat(81) }).expect(422);
    await update(id, {}).expect(422);
    await api().post('/api/v1/admin/banners/reorder').set('Authorization', auth).send({ placement: 'top', ids: [] }).expect(422);
    await api().get('/api/v1/banners/images/nope').expect(404);
    await api().get('/api/v1/admin/banners').expect(401);
  });

  it('replacing or deleting a banner takes the old image down', async () => {
    const banner = (await create({ placement: 'top' }).expect(201)).body.data.banner;
    const replaced = await api()
      .post(`/api/v1/admin/banners/${banner.id}/image`)
      .query({ width: 800, height: 300 })
      .set('Authorization', auth)
      .set('Content-Type', 'image/jpeg')
      .send(JPEG)
      .expect(200);
    expect(replaced.body.data.banner.image).toMatchObject({ width: 800, height: 300 });
    await api().get(`/api/v1${banner.image.path}`).expect(404);
    const img = await api().get(`/api/v1${replaced.body.data.banner.image.path}`).expect(200);
    expect(img.headers['content-type']).toBe('image/jpeg');

    await api().delete(`/api/v1/admin/banners/${banner.id}`).set('Authorization', auth).expect(200);
    await api().get(`/api/v1${replaced.body.data.banner.image.path}`).expect(404);
    await api().delete(`/api/v1/admin/banners/${banner.id}`).set('Authorization', auth).expect(404);
  });
});
