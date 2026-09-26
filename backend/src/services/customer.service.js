import { logger } from '../config/logger.js';
import { Customer, nextSequence, Purchase } from '../models/index.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';
import { ApiError } from '../utils/ApiError.js';
import { maskMobile } from '../utils/mobile.js';
import { buildPagination, containsRegex, escapeRegex, paginated, parseSort } from '../utils/query.js';
import { serializeAdminCustomer } from '../utils/serializers.js';

const formatCustomerCode = (seq) => `CUS${String(seq).padStart(5, '0')}`;

/**
 * Creates a customer. Used by self-registration (after OTP) and by admins.
 * @param {object} data validated fields (mobile already normalized)
 * @param {{ source: 'self'|'admin'|'seed', createdBy?: object, verified?: boolean }} options
 * @param {{ session?: import('mongoose').ClientSession|null, onRollback?: Function }} [ctx]
 *   pass the runAtomic context to create the customer as part of a larger workflow
 */
export const createCustomer = async (data, { source, createdBy = null, verified = false }, ctx = {}) => {
  const session = ctx.session ?? null;
  if (await Customer.exists({ mobile: data.mobile }).session(session)) {
    throw ApiError.conflict('A customer with this mobile number already exists', [
      { field: 'mobile', message: 'Already registered' },
    ]);
  }
  // Outside the transaction on purpose: a rolled-back workflow only leaves a gap in the codes.
  const customerCode = formatCustomerCode(await nextSequence('customerCode'));
  // The unique index on mobile still guards the race between the check and the insert.
  const [customer] = await Customer.create(
    [
      {
        ...data,
        customerCode,
        loyaltyPoints: 0,
        registrationSource: source,
        createdBy: createdBy?._id ?? null,
        mobileVerifiedAt: verified ? new Date() : null,
      },
    ],
    { session }
  );
  ctx.onRollback?.(() => Customer.deleteOne({ _id: customer._id }));
  logger.info({ customerId: customer.id, mobile: maskMobile(customer.mobile), source }, 'Customer created');
  return customer;
};

/** Purchase aggregates (active purchases only) keyed by customer id. */
export const getPurchaseStatsByCustomer = async (customerIds) => {
  if (!customerIds.length) return new Map();
  const rows = await Purchase.aggregate([
    { $match: { customerId: { $in: customerIds }, status: PURCHASE_STATUSES.PURCHASED } },
    {
      $group: {
        _id: '$customerId',
        totalPurchases: { $sum: 1 },
        totalSpent: { $sum: '$pricing.finalAmount' },
        lastPurchaseDate: { $max: '$purchaseDate' },
      },
    },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r]));
};

/**
 * Builds a filter that matches customers by name, email, customer code or
 * (partial) mobile number in any common format ("98765", "+91 98765 43210").
 */
export const buildCustomerSearchFilter = (search) => {
  const text = search.trim();
  const or = [{ name: containsRegex(text) }, { email: containsRegex(text) }, { customerCode: containsRegex(text) }];

  let digits = text.replace(/\D/g, '');
  if (/^\+?\s*91/.test(text) && digits.length > 10) digits = digits.slice(2);
  if (digits.length >= 3 && /^[\d\s+()-]+$/.test(text)) {
    or.push({ mobile: new RegExp(escapeRegex(digits)) });
  }
  return { $or: or };
};

export const listCustomers = async ({ page, limit, search, status, sort }) => {
  const filter = {};
  if (status === 'active') filter.isActive = true;
  if (status === 'inactive') filter.isActive = false;
  if (search) Object.assign(filter, buildCustomerSearchFilter(search));

  const { skip } = buildPagination({ page, limit });
  const [customers, total] = await Promise.all([
    Customer.find(filter).sort(parseSort(sort)).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);

  const stats = await getPurchaseStatsByCustomer(customers.map((c) => c._id));
  const items = customers.map((c) => serializeAdminCustomer(c, stats.get(c._id.toString())));
  return paginated(items, { page, limit }, total);
};

export const getCustomerOrThrow = async (id) => {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
};

export const getCustomerWithStats = async (id) => {
  const customer = await getCustomerOrThrow(id);
  const stats = await getPurchaseStatsByCustomer([customer._id]);
  return serializeAdminCustomer(customer, stats.get(customer.id));
};

export const updateCustomer = async (id, patch, admin) => {
  const customer = await getCustomerOrThrow(id);
  if (patch.mobile && patch.mobile !== customer.mobile) {
    if (await Customer.exists({ mobile: patch.mobile })) {
      throw ApiError.conflict('A customer with this mobile number already exists', [
        { field: 'mobile', message: 'Already registered' },
      ]);
    }
    // The customer has not verified the new number yet.
    customer.mobileVerifiedAt = null;
  }
  customer.set(patch);
  await customer.save();
  logger.info({ customerId: customer.id, adminId: admin?._id?.toString(), fields: Object.keys(patch) }, 'Customer updated');
  return getCustomerWithStats(customer._id);
};

export const updateOwnProfile = async (customer, patch) => {
  customer.set(patch);
  await customer.save();
  return customer;
};
