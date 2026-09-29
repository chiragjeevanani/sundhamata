import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { Purchase } from '../src/models/index.js';
import { buildApp, createTestCustomer, loginAsAdmin, loginAsCustomer, useTestDatabase } from './helpers.js';

useTestDatabase(import.meta.url);
const app = buildApp();
const api = () => request(app);

let adminAuth;
let rohit;
beforeEach(async () => {
  ({ auth: adminAuth } = await loginAsAdmin(app));
  rohit = await createTestCustomer();
});

const FINANCE = {
  company: 'Bajaj Finserv',
  downPayment: 25000,
  emiAmount: 8350,
  tenureMonths: 12,
  firstEmiDate: '2026-11-05',
  loanNumber: 'BFL-778812',
};
const PHONE = {
  category: 'phones',
  product: { name: 'Samsung Galaxy S25 Ultra', brand: 'Samsung', model: 'SM-S938B', variant: '12GB + 256GB', color: 'Titanium Black', imei: '358921104829104' },
  price: 124999,
};
const COVER = { category: 'accessories', product: { name: 'Spigen Case' }, price: 1001 };

const bill = (payment, overrides = {}) =>
  api()
    .post('/api/v1/admin/purchases')
    .set('Authorization', adminAuth)
    .send({
      customerId: String(rohit._id),
      invoiceNumber: `FIN/${Math.random().toString(36).slice(2, 8)}`,
      items: [PHONE, COVER],
      payment,
      pricing: { discount: 1000 },
      ...overrides,
    });

describe('Paying through a finance company (EMI)', () => {
  it('records the lender, down payment and EMI plan; the loan is the bill minus the down payment', async () => {
    const res = await bill({ method: 'Finance', finance: FINANCE }).expect(201);
    // Bill: 124,999 + 1,001 − 1,000 = 125,000 → loan 100,000
    expect(res.body.data.order.totals.finalAmount).toBe(125000);
    for (const line of res.body.data.purchases) {
      expect(line.payment).toEqual({
        method: 'Finance',
        status: 'Paid',
        finance: { ...FINANCE, loanAmount: 100000 },
      });
    }

    const { auth } = await loginAsCustomer(app, '9876543210');
    const mine = await api().get(`/api/v1/customer/purchases/${res.body.data.purchase.id}`).set('Authorization', auth).expect(200);
    expect(mine.body.data.purchase.payment.finance).toMatchObject({ company: 'Bajaj Finserv', emiAmount: 8350, tenureMonths: 12, firstEmiDate: '2026-11-05' });
  });

  it.each([
    ['Finance without details', { method: 'Finance' }],
    ['finance details with Cash', { method: 'Cash', finance: FINANCE }],
    ['a down payment bigger than the bill', { method: 'Finance', finance: { ...FINANCE, downPayment: 200000 } }],
    ['0 months', { method: 'Finance', finance: { ...FINANCE, tenureMonths: 0 } }],
    ['more than 60 months', { method: 'Finance', finance: { ...FINANCE, tenureMonths: 61 } }],
    ['no EMI amount', { method: 'Finance', finance: { ...FINANCE, emiAmount: 0 } }],
    ['an impossible EMI date', { method: 'Finance', finance: { ...FINANCE, firstEmiDate: '2026-02-30' } }],
    ['no company', { method: 'Finance', finance: { ...FINANCE, company: '' } }],
  ])('rejects %s', async (_label, payment) => {
    await bill(payment).expect(422);
    expect(await Purchase.countDocuments()).toBe(0);
  });

  it('cash and UPI bills have no finance details', async () => {
    const res = await bill({ method: 'UPI' }).expect(201);
    expect(res.body.data.purchase.payment).toEqual({ method: 'UPI', status: 'Paid', finance: null });
  });

  it('finance details can be corrected, or removed by changing the payment method, for the whole bill', async () => {
    const res = await bill({ method: 'Finance', finance: FINANCE }).expect(201);
    const [phone, cover] = res.body.data.purchases;
    const patch = (id, payment) => api().patch(`/api/v1/admin/purchases/${id}`).set('Authorization', adminAuth).send({ payment });

    await patch(cover.id, { finance: { ...FINANCE, emiAmount: 9000, tenureMonths: 9, downPayment: 44000 } }).expect(200);
    let lines = await Purchase.find({}).lean();
    expect(lines.map((l) => [l.payment.finance.emiAmount, l.payment.finance.tenureMonths, l.payment.finance.loanAmount])).toEqual([
      [9000, 9, 81000],
      [9000, 9, 81000],
    ]);

    await patch(phone.id, { method: 'Cash' }).expect(200);
    lines = await Purchase.find({}).lean();
    expect(lines.map((l) => [l.payment.method, l.payment.finance])).toEqual([
      ['Cash', null],
      ['Cash', null],
    ]);

    await patch(phone.id, { method: 'Finance' }).expect(422); // needs the details again
    await patch(phone.id, { finance: FINANCE }).expect(422); // still paid in cash
    await patch(phone.id, { method: 'Finance', finance: FINANCE }).expect(200);
  });

  it('changing a product category on one line leaves the rest of the bill alone', async () => {
    const res = await bill({ method: 'Cash' }).expect(201);
    await api()
      .patch(`/api/v1/admin/purchases/${res.body.data.purchases[1].id}`)
      .set('Authorization', adminAuth)
      .send({ category: 'service' })
      .expect(200);
    const lines = await Purchase.find({}).sort({ 'order.lineNo': 1 }).lean();
    expect(lines.map((l) => l.category)).toEqual(['phones', 'service']);
  });
});
