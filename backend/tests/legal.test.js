import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp, loginAsAdmin, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let auth;
beforeEach(async () => {
  ({ auth } = await loginAsAdmin(app));
});

const save = (key, content) => api().patch(`/api/v1/admin/legal/${key}`).set('Authorization', auth).send({ content });
const publicPage = async (key) => (await api().get(`/api/v1/legal/${key}`).expect(200)).body.data.document;

describe('Terms & Privacy pages', () => {
  it('uses the default text until the admin saves a version', async () => {
    expect(await publicPage('terms')).toEqual({ key: 'terms', content: null, updatedAt: null });
    const list = await api().get('/api/v1/admin/legal').set('Authorization', auth).expect(200);
    expect(list.body.data.documents.map((d) => [d.key, d.content])).toEqual([
      ['terms', null],
      ['privacy', null],
    ]);

    const saved = await save('terms', '  ## 1. Use\r\n- Be nice\r\n\n[contact]  ').expect(200);
    expect(saved.body.data.document.content).toBe('## 1. Use\n- Be nice\n\n[contact]');

    // Public, no sign-in
    const page = await publicPage('terms');
    expect(page.content).toBe('## 1. Use\n- Be nice\n\n[contact]');
    expect(page.updatedAt).toBeTruthy();
    expect((await publicPage('privacy')).content).toBeNull();
  });

  it('resets to the default when saved blank', async () => {
    await save('privacy', 'Custom policy').expect(200);
    const reset = await save('privacy', '   ').expect(200);
    expect(reset.body.data.document.content).toBeNull();
    expect((await publicPage('privacy')).content).toBeNull();
  });

  it('validates the page and needs admin sign-in', async () => {
    await save('refunds', 'x').expect(422);
    await save('terms', 'x'.repeat(50_001)).expect(422);
    await save('terms', 42).expect(422);
    await api().get('/api/v1/legal/refunds').expect(404);
    await api().patch('/api/v1/admin/legal/terms').send({ content: 'x' }).expect(401);
  });
});
