import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { verifyLedgerConsistency } from '../src/services/loyalty.service.js';
import { ADMIN_PASSWORD, buildApp, createAdminUser, DEV_OTP, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

describe('End-to-end: ADMIN → PURCHASE → LOYALTY → CUSTOMER APP', () => {
  it('records a purchase that the customer immediately sees with updated loyalty', async () => {
    // 1. Create / log in admin
    const adminUser = await createAdminUser({ email: 'admin@sundhamatamobile.com' });
    const adminLogin = await api()
      .post('/api/v1/auth/admin/login')
      .send({ identifier: 'admin@sundhamatamobile.com', password: ADMIN_PASSWORD })
      .expect(200);
    const adminAuth = `Bearer ${adminLogin.body.data.token}`;
    expect(adminLogin.body.data.admin.id).toBe(adminUser.id);

    // 2. Create customer: Rohit Sharma, 9876543210, Mobile, ₹50,000 (self-registration)
    await api()
      .post('/api/v1/auth/customer/check')
      .send({ mobile: '9876543210' })
      .expect(200)
      .then((res) => expect(res.body.data.exists).toBe(false));
    await api()
      .post('/api/v1/auth/customer/register')
      .send({ name: 'Rohit Sharma', mobile: '9876543210', interest: 'Mobile', budget: 50000 })
      .expect(200);

    // 3. Authenticate customer through the development OTP
    const verified = await api()
      .post('/api/v1/auth/customer/verify-otp')
      .send({ mobile: '9876543210', otp: DEV_OTP })
      .expect(200);
    expect(verified.body.data.isNewUser).toBe(true);
    const customerId = verified.body.data.customer.id;
    let customerAuth = `Bearer ${verified.body.data.token}`;

    // 4. Initial loyalty balance is 0
    const initial = await api().get('/api/v1/customer/loyalty').set('Authorization', customerAuth).expect(200);
    expect(initial.body.data.balance).toBe(0);

    // The admin finds the customer by mobile
    const search = await api().get('/api/v1/admin/customers').query({ search: '9876543210' }).set('Authorization', adminAuth).expect(200);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].id).toBe(customerId);

    // 5. Admin records Samsung Galaxy S25 Ultra, ₹124,999, UPI, Paid
    const created = await api()
      .post('/api/v1/admin/purchases')
      .set('Authorization', adminAuth)
      .send({
        customerId,
        invoiceNumber: 'SM/2026-27/0001',
        category: 'phones',
        product: { name: 'Samsung Galaxy S25 Ultra', variant: '12GB + 256GB', color: 'Titanium Black' },
        payment: { method: 'UPI', status: 'Paid' },
        pricing: { purchaseAmount: 124999, discount: 0 },
      })
      .expect(201);
    const purchase = created.body.data.purchase;

    // 6. Backend calculated loyalty: floor(124999 / 100) = 1,249
    expect(purchase.loyalty.pointsEarned).toBe(1249);
    expect(created.body.data.customerLoyaltyBalance).toBe(1249);

    // 7. Purchase exists
    const adminView = await api().get(`/api/v1/admin/purchases/${purchase.id}`).set('Authorization', adminAuth).expect(200);
    expect(adminView.body.data.purchase).toMatchObject({
      invoiceNumber: purchase.invoiceNumber,
      status: 'Purchased',
      payment: { method: 'UPI', status: 'Paid' },
      pricing: { finalAmount: 124999 },
      customer: { id: customerId, name: 'Rohit Sharma' },
    });

    // 8. Loyalty transaction exists
    const adminLedger = await api()
      .get('/api/v1/admin/loyalty/transactions')
      .query({ customerId })
      .set('Authorization', adminAuth)
      .expect(200);
    expect(adminLedger.body.data.items).toHaveLength(1);
    expect(adminLedger.body.data.items[0]).toMatchObject({ points: 1249, purchaseId: purchase.id, balanceAfter: 1249 });

    // 9. Customer balance increased
    const customerDetail = await api().get(`/api/v1/admin/customers/${customerId}`).set('Authorization', adminAuth).expect(200);
    expect(customerDetail.body.data.customer.loyaltyPoints).toBe(1249);

    // 10. Authenticate as customer again (fresh OTP login)
    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '+91 98765 43210' }).expect(200);
    const relogin = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9876543210', otp: DEV_OTP }).expect(200);
    expect(relogin.body.data.isNewUser).toBe(false);
    customerAuth = `Bearer ${relogin.body.data.token}`;

    // 11. Samsung purchase appears in the customer's history and detail
    const history = await api().get('/api/v1/customer/purchases').set('Authorization', customerAuth).expect(200);
    expect(history.body.data.items).toHaveLength(1);
    expect(history.body.data.items[0]).toMatchObject({
      id: purchase.id,
      product: { name: 'Samsung Galaxy S25 Ultra' },
      pricing: { finalAmount: 124999 },
    });
    await api().get(`/api/v1/customer/purchases/${purchase.id}`).set('Authorization', customerAuth).expect(200);

    // 12. Updated balance
    const loyalty = await api().get('/api/v1/customer/loyalty').set('Authorization', customerAuth).expect(200);
    expect(loyalty.body.data.balance).toBe(1249);

    // 13. Purchase reward in the customer's ledger
    const txns = await api().get('/api/v1/customer/loyalty/transactions').set('Authorization', customerAuth).expect(200);
    expect(txns.body.data.items[0]).toMatchObject({
      type: 'earned',
      direction: 'credit',
      points: 1249,
      title: 'Purchase Reward',
      description: 'Samsung Galaxy S25 Ultra',
      invoiceNumber: purchase.invoiceNumber,
      balanceAfter: 1249,
    });

    expect(await verifyLedgerConsistency(customerId)).toMatchObject({ consistent: true, cachedBalance: 1249 });
  });

  it('matches the documented example: 2,450 + 1,249 = 3,699', async () => {
    await createAdminUser({ email: 'admin@sundhamatamobile.com' });
    const adminLogin = await api()
      .post('/api/v1/auth/admin/login')
      .send({ identifier: 'admin@sundhamatamobile.com', password: ADMIN_PASSWORD });
    const adminAuth = `Bearer ${adminLogin.body.data.token}`;

    const created = await api()
      .post('/api/v1/admin/customers')
      .set('Authorization', adminAuth)
      .send({ name: 'Rohit Sharma', mobile: '9876543210', interest: 'Mobile' })
      .expect(201);
    const customerId = created.body.data.customer.id;
    await api()
      .post('/api/v1/admin/loyalty/adjust')
      .set('Authorization', adminAuth)
      .send({ customerId, type: 'add', points: 2450, reason: 'Opening balance' })
      .expect(201);

    await api()
      .post('/api/v1/admin/purchases')
      .set('Authorization', adminAuth)
      .send({
        customerId,
        invoiceNumber: 'SM/2026-27/0002',
        product: { name: 'Samsung Galaxy S25 Ultra' },
        payment: { method: 'UPI', status: 'Paid' },
        pricing: { purchaseAmount: 124999 },
      })
      .expect(201);

    await api().post('/api/v1/auth/customer/send-otp').send({ mobile: '9876543210' }).expect(200);
    const login = await api().post('/api/v1/auth/customer/verify-otp').send({ mobile: '9876543210', otp: DEV_OTP });
    const loyalty = await api().get('/api/v1/customer/loyalty').set('Authorization', `Bearer ${login.body.data.token}`).expect(200);
    expect(loyalty.body.data.balance).toBe(3699);
    expect(loyalty.body.data.recentTransactions[0]).toMatchObject({ points: 1249, title: 'Purchase Reward', description: 'Samsung Galaxy S25 Ultra' });
  });
});
