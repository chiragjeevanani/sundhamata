import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTransactionSupportOverride } from '../src/config/db.js';
import { Customer, LoyaltyTransaction, Purchase } from '../src/models/index.js';
import { verifyLedgerConsistency } from '../src/services/loyalty.service.js';
import { buildApp, createTestCustomer, loginAsAdmin, samplePurchase, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

afterEach(() => {
  vi.restoreAllMocks();
  setTransactionSupportOverride(true);
});

const failLoyaltyWrites = () =>
  vi.spyOn(LoyaltyTransaction, 'create').mockRejectedValue(new Error('Simulated ledger write failure'));

const expectNothingWritten = async (customerId, expectedBalance = 0) => {
  expect(await Purchase.countDocuments()).toBe(0);
  expect(await LoyaltyTransaction.countDocuments()).toBe(0);
  expect((await Customer.findById(customerId)).loyaltyPoints).toBe(expectedBalance);
};

// If the ledger write fails, neither the purchase nor the balance change may survive.
describe.each([
  ['MongoDB transaction (replica set)', true],
  ['compensating rollback (standalone, development)', false],
])('Atomicity via %s', (_label, transactionsSupported) => {
  it('does not create the purchase or change the balance when the loyalty transaction fails', async () => {
    setTransactionSupportOverride(transactionsSupported);
    const { auth } = await loginAsAdmin(app);
    const rohit = await createTestCustomer();

    failLoyaltyWrites();
    const res = await api().post('/api/v1/admin/purchases').set('Authorization', auth).send(samplePurchase(rohit._id)).expect(500);
    expect(res.body.success).toBe(false);
    await expectNothingWritten(rohit._id);

    // Recovers once the failure is gone
    vi.restoreAllMocks();
    await api().post('/api/v1/admin/purchases').set('Authorization', auth).send(samplePurchase(rohit._id)).expect(201);
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true, cachedBalance: 1249 });
  });

  it('rolls back a cancellation when the reversal cannot be recorded', async () => {
    setTransactionSupportOverride(transactionsSupported);
    const { auth } = await loginAsAdmin(app);
    const rohit = await createTestCustomer();
    const created = await api().post('/api/v1/admin/purchases').set('Authorization', auth).send(samplePurchase(rohit._id)).expect(201);

    failLoyaltyWrites();
    await api().post(`/api/v1/admin/purchases/${created.body.data.purchase.id}/cancel`).set('Authorization', auth).send({}).expect(500);

    const purchase = await Purchase.findById(created.body.data.purchase.id);
    expect(purchase.status).toBe('Purchased');
    expect(purchase.payment.status).toBe('Paid');
    expect((await Customer.findById(rohit._id)).loyaltyPoints).toBe(1249);
    vi.restoreAllMocks();
    expect(await verifyLedgerConsistency(rohit._id)).toMatchObject({ consistent: true });
  });

  it('rolls back a manual adjustment when the ledger write fails', async () => {
    setTransactionSupportOverride(transactionsSupported);
    const { auth } = await loginAsAdmin(app);
    const rohit = await createTestCustomer();

    failLoyaltyWrites();
    await api()
      .post('/api/v1/admin/loyalty/adjust')
      .set('Authorization', auth)
      .send({ customerId: rohit.id, type: 'add', points: 100, reason: 'Bonus' })
      .expect(500);
    await expectNothingWritten(rohit._id);
  });
});
