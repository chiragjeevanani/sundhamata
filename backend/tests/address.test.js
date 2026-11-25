import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAddressCache } from '../src/services/address.service.js';
import { buildApp, createTestCustomer, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let auth;
beforeEach(async () => {
  clearAddressCache();
  await createTestCustomer();
  ({ auth } = await loginAsCustomer(app, '+919876543210'));
});
afterEach(() => vi.unstubAllGlobals());

const reply = (status, body) => vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });

const INDIA_POST_382405 = [
  {
    Status: 'Success',
    PostOffice: [
      { Name: 'Gyaspur', District: 'Ahmedabad', State: 'Gujarat' },
      { Name: 'Lambha', District: 'Ahmedabad', State: 'Gujarat' },
    ],
  },
];

describe('Address auto-fill', () => {
  it('looks up a pincode and caches the answer', async () => {
    const fetch = reply(200, INDIA_POST_382405);
    vi.stubGlobal('fetch', fetch);

    const res = await api().get('/api/v1/customer/address/pincode/382405').set('Authorization', auth).expect(200);
    expect(res.body.data).toEqual({ pincode: '382405', city: 'Ahmedabad', state: 'Gujarat', areas: ['Gyaspur', 'Lambha'] });

    await api().get('/api/v1/customer/address/pincode/382405').set('Authorization', auth).expect(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.postalpincode.in/pincode/382405');
  });

  it('reports unknown pincodes, bad input and an unavailable service', async () => {
    vi.stubGlobal('fetch', reply(200, [{ Status: 'Error', PostOffice: null }]));
    await api().get('/api/v1/customer/address/pincode/999999').set('Authorization', auth).expect(404);
    await api().get('/api/v1/customer/address/pincode/12345').set('Authorization', auth).expect(422);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));
    await api().get('/api/v1/customer/address/pincode/380001').set('Authorization', auth).expect(503);
  });

  it('turns a location into address, city and pincode', async () => {
    const fetch = reply(200, {
      address: {
        house_number: '70',
        road: 'Bharatmata Chowk',
        suburb: 'Narol',
        state_district: 'Ahmedabad',
        state: 'Gujarat',
        postcode: '382405',
      },
    });
    vi.stubGlobal('fetch', fetch);

    const res = await api().get('/api/v1/customer/address/reverse?lat=22.9637&lng=72.5826').set('Authorization', auth).expect(200);
    expect(res.body.data).toEqual({ address: '70, Bharatmata Chowk, Narol', city: 'Ahmedabad', state: 'Gujarat', pincode: '382405' });

    const url = fetch.mock.calls[0][0];
    expect(url.hostname).toBe('nominatim.openstreetmap.org');
    expect(url.searchParams.get('lat')).toBe('22.9637');
    expect(fetch.mock.calls[0][1].headers['User-Agent']).toMatch(/^SundhamataMobile/);

    await api().get('/api/v1/customer/address/reverse?lat=200&lng=72').set('Authorization', auth).expect(422);
  });

  it('uses the district as the city when the place is a village', async () => {
    vi.stubGlobal('fetch', reply(200, { address: { village: 'Lambha', county: 'Vatva Taluka', state_district: 'Ahmedabad', state: 'Gujarat', postcode: '382405' } }));
    const res = await api().get('/api/v1/customer/address/reverse?lat=22.948&lng=72.576').set('Authorization', auth).expect(200);
    expect(res.body.data).toEqual({ address: 'Lambha', city: 'Ahmedabad', state: 'Gujarat', pincode: '382405' });

    vi.stubGlobal('fetch', reply(200, { address: { county: 'Maninagar Taluka', state_district: 'Ahmedabad', state: 'Gujarat', postcode: '382405' } }));
    const sparse = await api().get('/api/v1/customer/address/reverse?lat=22.9606&lng=72.5853').set('Authorization', auth).expect(200);
    expect(sparse.body.data).toEqual({ address: null, city: 'Ahmedabad', state: 'Gujarat', pincode: '382405' });
  });

  it('requires sign-in', async () => {
    await api().get('/api/v1/customer/address/pincode/382405').expect(401);
    await api().get('/api/v1/customer/address/reverse?lat=22.9&lng=72.5').expect(401);
  });
});
