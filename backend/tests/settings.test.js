import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { StoreSettings } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

describe('Store settings', () => {
  it('32. admin retrieves settings (defaults are created on first read)', async () => {
    const { auth } = await loginAsAdmin(app);
    const res = await api().get('/api/v1/admin/settings').set('Authorization', auth).expect(200);
    expect(res.body.data.settings).toMatchObject({
      storeName: 'Sundhamata Mobile',
      tagline: 'Smart Phones Smart People',
      loyalty: { pointsPerHundredRupees: 1, rupeeValuePerPoint: 1 },
      tax: { gstRatePercent: 18 },
    });
    expect(await StoreSettings.countDocuments()).toBe(1);
  });

  it('33. admin updates settings; partial loyalty updates keep other loyalty values', async () => {
    const { auth } = await loginAsAdmin(app);
    const res = await api()
      .patch('/api/v1/admin/settings')
      .set('Authorization', auth)
      .send({
        storeName: 'Sundhamata Mobile Ahmedabad',
        tagline: 'Smart Phones Smart People',
        address: '70, Chandannagar, Near Aryamanflat, Bharatmata Chok, Bhamriyakuwa, Narol',
        city: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '382405',
        contactNumber: '+91 98290 12345',
        loyalty: { pointsPerHundredRupees: 2 },
      })
      .expect(200);
    expect(res.body.data.settings).toMatchObject({
      storeName: 'Sundhamata Mobile Ahmedabad',
      contactNumber: '+91 98290 12345',
      city: 'Ahmedabad',
      state: 'Gujarat',
      pincode: '382405',
      loyalty: { pointsPerHundredRupees: 2, rupeeValuePerPoint: 1, minRedeemPoints: 500 },
    });

    await api().patch('/api/v1/admin/settings').set('Authorization', auth).send({ loyalty: { pointsPerHundredRupees: 0 } }).expect(422);
    await api().patch('/api/v1/admin/settings').set('Authorization', auth).send({ storeName: '' }).expect(422);
    await api().patch('/api/v1/admin/settings').set('Authorization', auth).send({ gstin: 'INVALID' }).expect(422);
    await api().patch('/api/v1/admin/settings').set('Authorization', auth).send({ unknownField: 1 }).expect(422);
    expect(await StoreSettings.countDocuments()).toBe(1);
  });

  it('customers cannot read or change admin settings', async () => {
    await createTestCustomer();
    const { auth } = await loginAsCustomer(app, '9876543210');
    await api().get('/api/v1/admin/settings').set('Authorization', auth).expect(401);
    await api().patch('/api/v1/admin/settings').set('Authorization', auth).send({ storeName: 'Hacked' }).expect(401);
  });

  it('34. public store information is available (to customers and anonymously)', async () => {
    const { auth: adminAuth } = await loginAsAdmin(app);
    await api().patch('/api/v1/admin/settings').set('Authorization', adminAuth).send({ contactNumber: '+91 98290 12345' }).expect(200);

    const res = await api().get('/api/v1/store').expect(200);
    expect(res.body.data.store).toMatchObject({
      storeName: 'Sundhamata Mobile',
      tagline: 'Smart Phones Smart People',
      contactNumber: '+91 98290 12345',
      loyalty: { pointsPerHundredRupees: 1 },
    });
    expect(res.body.data.store).not.toHaveProperty('updatedBy');
    expect(res.body.data.store).not.toHaveProperty('tax');
  });
});
