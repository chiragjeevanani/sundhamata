/**
 * Development seed data. Idempotent: every record is looked up by a natural key
 * (admin email, customer mobile, invoice number, ledger entry title + date) and
 * skipped if it already exists, so `npm run seed` can be run repeatedly.
 *
 * All loyalty changes go through the same services as the API, so the seeded
 * ledger is consistent with Customer.loyaltyPoints.
 */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Admin, Customer, LoyaltyTransaction, Purchase, StoreSettings } from '../models/index.js';
import { LOYALTY_SOURCES, LOYALTY_TYPES } from '../models/LoyaltyTransaction.js';
import { SETTINGS_KEY } from '../models/StoreSettings.js';
import { hashPassword } from '../services/adminAuth.service.js';
import { createCustomer } from '../services/customer.service.js';
import { applyPointsChange, verifyLedgerConsistency } from '../services/loyalty.service.js';
import { createPurchase } from '../services/purchase.service.js';
import { getSettings } from '../services/settings.service.js';
import { runAtomic } from '../utils/transaction.js';
import { createPurchaseSchema } from '../validators/purchase.validators.js';

if (env.isProduction) {
  console.error('Refusing to seed development data into a production environment.');
  process.exit(1);
}

const ADMIN = {
  name: 'Ramesh Patel',
  email: 'admin@sundhamatamobile.com',
  mobile: '+919829012345',
  password: 'Admin@123',
  role: 'admin',
};

const STORE = {
  storeName: 'Sundhamata Mobile',
  tagline: 'Smart Phones Smart People',
  legalName: 'Sundhamata Mobile & Electronics Pvt. Ltd.',
  gstin: '08AABCS1429P1Z5',
  address: '70, Chandannagar, Near Aryamanflat, Bharatmata Chok, Bhamriyakuwa, Narol',
  city: 'Ahmedabad',
  state: 'Gujarat',
  pincode: '382405',
  contactNumber: '+91 98290 12345',
  supportNumber: '+91 141 2894567',
  whatsappNumber: '+91 98290 12345',
  email: 'care@sundhamatamobile.com',
  workingHours: 'Mon - Sun: 10:30 AM - 09:30 PM',
  googleMapsUrl: 'https://maps.google.com/?q=Chandannagar+Bharatmata+Chok+Narol+Ahmedabad+382405',
};

const CUSTOMERS = [
  { name: 'Rohit Sharma', mobile: '+919876543210', interest: 'Mobile', budget: 50000, email: 'rohit@gmail.com', city: 'Jaipur', address: 'B-42, Malviya Nagar, Jaipur', createdAt: '2024-10-14' },
  { name: 'Priya Mehta', mobile: '+919823456789', interest: 'Accessories', budget: 8000, email: 'priya.mehta@gmail.com', city: 'Jaipur', createdAt: '2025-01-05' },
  { name: 'Amit Verma', mobile: '+919811122233', interest: 'Service', budget: 15000, email: 'amit.verma@yahoo.com', city: 'Jaipur', createdAt: '2024-11-20' },
  { name: 'Karan Singh', mobile: '+919829055443', interest: 'Mobile', budget: 85000, email: 'karan.singh@gmail.com', city: 'Jaipur', createdAt: '2025-02-12' },
  { name: 'Sneha Jain', mobile: '+919833411229', interest: 'Accessories', budget: 5000, email: 'sneha.jain@outlook.com', city: 'Jaipur', createdAt: '2026-09-20' },
];

// Chronological per customer so balanceAfter reads naturally.
// Rohit ends at 2,450 points, matching the documented example
// (recording a ₹1,24,999 Galaxy S25 Ultra then takes him to 3,699).
const EVENTS = [
  { kind: 'purchase', mobile: '+919823456789', at: '2026-04-10T16:20:00+05:30', invoiceNumber: 'SM-2026-000412', category: 'accessories', product: { name: 'Samsung Galaxy Buds3 Pro', model: 'SM-R630', variant: 'Blade Lights ANC', color: 'Silver', serialNumber: 'RF9M30489KZ' }, payment: { method: 'Cash', status: 'Paid' }, pricing: { purchaseAmount: 19999, discount: 0 } },
  { kind: 'purchase', mobile: '+919876543210', at: '2026-06-15T11:45:00+05:30', invoiceNumber: 'SM-2026-000731', product: { name: 'OnePlus 13', model: 'CPH2609', variant: '16GB + 512GB', color: 'Midnight Ocean', imei: '864720059182741' }, payment: { method: 'UPI', status: 'Paid' }, pricing: { purchaseAmount: 69999, discount: 0 }, notes: 'Red Cable Club 1-year extended screen protection activated.' },
  { kind: 'purchase', mobile: '+919811122233', at: '2026-07-10T13:05:00+05:30', invoiceNumber: 'SM-2026-000850', category: 'service', product: { name: 'Screen Replacement - iPhone 13' }, payment: { method: 'Cash', status: 'Paid' }, pricing: { purchaseAmount: 5499, discount: 500 } },
  { kind: 'purchase', mobile: '+919876543210', at: '2026-08-02T18:15:00+05:30', invoiceNumber: 'SM-2026-000981', product: { name: 'Apple iPhone 16 Pro', model: 'MYNJ3HN/A', variant: '256GB', color: 'Natural Titanium', imei: '356784119830219' }, payment: { method: 'EMI', status: 'Paid' }, pricing: { purchaseAmount: 119999, discount: 0 }, notes: 'Customer opted for Apple 20W USB-C adapter bundle.' },
  { kind: 'bonus', mobile: '+919876543210', at: '2026-08-15T10:00:00+05:30', points: 100, title: 'Bonus Points', description: 'Independence Day Special Offer' },
  { kind: 'purchase', mobile: '+919829055443', at: '2026-08-20T19:40:00+05:30', invoiceNumber: 'SM-2026-001102', product: { name: 'Google Pixel 9', variant: '12GB + 256GB', color: 'Obsidian', imei: '353912110482736' }, payment: { method: 'Credit Card', status: 'Paid' }, pricing: { purchaseAmount: 79999, discount: 2000 } },
  { kind: 'purchase', mobile: '+919876543210', at: '2026-09-05T17:30:00+05:30', invoiceNumber: 'SM-2026-001190', category: 'accessories', product: { name: 'Samsung Galaxy Watch7 Classic', variant: '47mm LTE', color: 'Silver' }, payment: { method: 'UPI', status: 'Paid' }, pricing: { purchaseAmount: 45299, discount: 0 } },
  { kind: 'bonus', mobile: '+919876543210', at: '2026-09-10T11:00:00+05:30', points: 500, title: 'Bonus Points', description: 'Customer anniversary reward' },
  { kind: 'redemption', mobile: '+919876543210', at: '2026-09-12T15:10:00+05:30', points: 500, title: 'Redeemed', description: '₹500 In-Store Benefit' },
  { kind: 'purchase', mobile: '+919823456789', at: '2026-09-22T12:25:00+05:30', invoiceNumber: 'SM-2026-001240', category: 'accessories', product: { name: 'Apple AirPods Pro 2', color: 'White', serialNumber: 'H9KL2PX0QW' }, payment: { method: 'UPI', status: 'Pending' }, pricing: { purchaseAmount: 24900, discount: 0 } },
];

const seedAdmin = async () => {
  const existing = await Admin.findOne({ email: ADMIN.email });
  if (existing) {
    logger.info({ email: ADMIN.email }, 'Seed admin already exists (password left unchanged)');
    return existing;
  }
  const admin = await Admin.create({
    name: ADMIN.name,
    email: ADMIN.email,
    mobile: ADMIN.mobile,
    role: ADMIN.role,
    passwordHash: await hashPassword(ADMIN.password),
  });
  logger.info({ email: ADMIN.email }, 'Seed admin created');
  return admin;
};

const seedStoreSettings = async () => {
  await getSettings();
  // Only fill fields that are still empty, so admin edits survive re-seeding.
  const current = await StoreSettings.findOne({ key: SETTINGS_KEY }).lean();
  const $set = Object.fromEntries(Object.entries(STORE).filter(([key]) => !current[key]));
  if (Object.keys($set).length) await StoreSettings.updateOne({ key: SETTINGS_KEY }, { $set });
};

const seedCustomers = async (admin) => {
  const byMobile = new Map();
  for (const { createdAt, ...data } of CUSTOMERS) {
    let customer = await Customer.findOne({ mobile: data.mobile });
    if (!customer) {
      customer = await createCustomer({ ...data, createdAt: new Date(createdAt) }, { source: 'seed', createdBy: admin, verified: true });
    }
    byMobile.set(data.mobile, customer);
  }
  return byMobile;
};

const seedEvents = async (admin, customers) => {
  let created = 0;
  for (const event of EVENTS) {
    const customer = customers.get(event.mobile);
    const occurredAt = new Date(event.at);

    if (event.kind === 'purchase') {
      if (await Purchase.exists({ invoiceNumber: event.invoiceNumber })) continue;
      const input = createPurchaseSchema.parse({
        customerId: customer.id,
        category: event.category ?? 'phones',
        product: event.product,
        purchaseDate: occurredAt,
        invoiceNumber: event.invoiceNumber,
        payment: event.payment,
        pricing: event.pricing,
        notes: event.notes,
      });
      await createPurchase(input, admin, { occurredAt });
      created += 1;
      continue;
    }

    const title = event.title;
    if (await LoyaltyTransaction.exists({ customerId: customer._id, title, createdAt: occurredAt })) continue;
    const isRedemption = event.kind === 'redemption';
    await runAtomic((ctx) =>
      applyPointsChange(
        {
          customerId: customer._id,
          delta: isRedemption ? -event.points : event.points,
          type: isRedemption ? LOYALTY_TYPES.REDEEMED : LOYALTY_TYPES.ADJUSTMENT,
          source: isRedemption ? LOYALTY_SOURCES.REDEMPTION : LOYALTY_SOURCES.ADMIN_ADJUSTMENT,
          title,
          description: event.description,
          reason: event.description,
          createdBy: admin._id,
          occurredAt,
        },
        ctx
      )
    );
    created += 1;
  }
  return created;
};

const main = async () => {
  await connectDatabase(env.MONGODB_URI);
  await Promise.all([Admin, Customer, Purchase, LoyaltyTransaction, StoreSettings].map((model) => model.init()));

  const admin = await seedAdmin();
  await seedStoreSettings();
  const customers = await seedCustomers(admin);
  const created = await seedEvents(admin, customers);

  for (const [mobile, customer] of customers) {
    const check = await verifyLedgerConsistency(customer._id);
    logger.info({ mobile, balance: check.cachedBalance, consistent: check.consistent }, 'Seeded customer');
  }
  logger.info(
    { newRecords: created, adminEmail: ADMIN.email },
    'Seed complete. Development admin credentials are documented in docs/API.md.'
  );
};

main()
  .catch((err) => {
    logger.fatal({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
