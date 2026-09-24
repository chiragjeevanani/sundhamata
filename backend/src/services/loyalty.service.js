import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Customer, LoyaltyTransaction } from '../models/index.js';
import { LOYALTY_SOURCES, LOYALTY_TYPES } from '../models/LoyaltyTransaction.js';
import { ApiError } from '../utils/ApiError.js';
import { startOfIstMonth } from '../utils/dates.js';
import { LOYALTY_TIERS } from '../utils/loyalty.js';
import { buildPagination, paginated } from '../utils/query.js';
import { serializeLoyaltyBalance, serializeLoyaltyTransaction } from '../utils/serializers.js';
import { runAtomic } from '../utils/transaction.js';
import { getPointsIssuedTrends } from './analytics.service.js';
import { getSettings } from './settings.service.js';

/**
 * THE ONLY place Customer.loyaltyPoints changes.
 *
 * Atomically applies `delta` to the cached balance and appends the matching
 * ledger entry with the resulting `balanceAfter`. Debits use a conditional
 * update (`loyaltyPoints >= amount`) so the balance can never go negative,
 * even under concurrent requests. Must be called inside `runAtomic`.
 *
 * @param {object} params
 * @param {import('mongoose').Types.ObjectId|string} params.customerId
 * @param {number} params.delta signed, non-zero integer
 * @param {string} params.type LOYALTY_TYPES value
 * @param {string} params.source LOYALTY_SOURCES value
 * @param {string} params.title
 * @param {string} [params.description]
 * @param {string} [params.reason]
 * @param {object} [params.purchaseId]
 * @param {object} [params.createdBy] admin id
 * @param {Date}   [params.occurredAt] backdating for seed/import only
 * @param {{ session: import('mongoose').ClientSession|null, onRollback: Function }} ctx
 */
export const applyPointsChange = async (params, { session, onRollback }) => {
  const { customerId, delta, type, source, title, description = null, reason = null } = params;
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error(`Invalid loyalty delta: ${delta}`);
  }

  const filter = { _id: customerId };
  if (delta < 0) filter.loyaltyPoints = { $gte: -delta };

  const customer = await Customer.findOneAndUpdate(
    filter,
    { $inc: { loyaltyPoints: delta } },
    { returnDocument: 'after', session, projection: { loyaltyPoints: 1 } }
  );

  if (!customer) {
    const current = await Customer.findById(customerId, { loyaltyPoints: 1 }).session(session).lean();
    if (!current) throw ApiError.notFound('Customer not found');
    throw ApiError.unprocessable('Insufficient loyalty points', [
      {
        field: 'points',
        message: `Customer has only ${current.loyaltyPoints} points; cannot deduct ${-delta}`,
      },
    ]);
  }
  onRollback(() => Customer.updateOne({ _id: customerId }, { $inc: { loyaltyPoints: -delta } }));

  const [transaction] = await LoyaltyTransaction.create(
    [
      {
        customerId,
        type,
        source,
        points: delta,
        title,
        description,
        reason,
        purchaseId: params.purchaseId ?? null,
        balanceAfter: customer.loyaltyPoints,
        createdBy: params.createdBy ?? null,
        ...(params.occurredAt ? { createdAt: params.occurredAt } : {}),
      },
    ],
    { session }
  );
  onRollback(() => LoyaltyTransaction.deleteOne({ _id: transaction._id }));

  return { transaction, balance: customer.loyaltyPoints };
};

/** Admin manual adjustment (add / deduct). */
export const adjustPoints = async ({ customerId, type, points, reason }, admin) => {
  const result = await runAtomic((ctx) =>
    applyPointsChange(
      {
        customerId,
        delta: type === 'add' ? points : -points,
        type: LOYALTY_TYPES.ADJUSTMENT,
        source: LOYALTY_SOURCES.ADMIN_ADJUSTMENT,
        title: type === 'add' ? 'Points Added by Store' : 'Points Deducted by Store',
        description: reason,
        reason,
        createdBy: admin._id,
      },
      ctx
    )
  );

  logger.info(
    { customerId: String(customerId), adminId: admin.id, type, points, balance: result.balance },
    'Loyalty adjustment'
  );

  const transaction = await LoyaltyTransaction.findById(result.transaction._id)
    .populate('customerId', 'name mobile customerCode')
    .populate('createdBy', 'name')
    .lean();
  return { transaction: serializeLoyaltyTransaction(transaction), balance: result.balance };
};

const buildTransactionFilter = ({ customerId, type, source, direction }) => {
  const filter = {};
  if (customerId) filter.customerId = new mongoose.Types.ObjectId(String(customerId));
  if (type && type !== 'all') filter.type = type;
  if (source && source !== 'all') filter.source = source;
  if (direction === 'credit') filter.points = { $gt: 0 };
  if (direction === 'debit') filter.points = { $lt: 0 };
  return filter;
};

/**
 * @param {object} query validated list query
 * @param {{ audience: 'admin'|'customer' }} options
 */
export const listTransactions = async (query, { audience }) => {
  const { page, limit } = query;
  const filter = buildTransactionFilter(query);
  const { skip } = buildPagination({ page, limit });

  let finder = LoyaltyTransaction.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate('purchaseId', 'invoiceNumber');
  if (audience === 'admin') {
    finder = finder.populate('customerId', 'name mobile customerCode').populate('createdBy', 'name');
  }

  const [rows, total] = await Promise.all([finder.lean(), LoyaltyTransaction.countDocuments(filter)]);
  return paginated(
    rows.map((t) => serializeLoyaltyTransaction(t, { audience })),
    { page, limit },
    total
  );
};

/** A single transaction owned by `customerId` (404 otherwise — never leaks others' data). */
export const getCustomerTransaction = async (customerId, transactionId) => {
  const txn = await LoyaltyTransaction.findOne({ _id: transactionId, customerId })
    .populate('purchaseId', 'invoiceNumber')
    .lean();
  if (!txn) throw ApiError.notFound('Transaction not found');
  return serializeLoyaltyTransaction(txn, { audience: 'customer' });
};

const sumPoints = async (match) => {
  const [row] = await LoyaltyTransaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        credits: { $sum: { $cond: [{ $gt: ['$points', 0] }, '$points', 0] } },
        debits: { $sum: { $cond: [{ $lt: ['$points', 0] }, { $abs: '$points' }, 0] } },
        redeemed: { $sum: { $cond: [{ $eq: ['$type', LOYALTY_TYPES.REDEEMED] }, { $abs: '$points' }, 0] } },
      },
    },
  ]);
  return { credits: row?.credits ?? 0, debits: row?.debits ?? 0, redeemed: row?.redeemed ?? 0 };
};

/** Balance + tier + this-month and lifetime movement for one customer. */
export const getCustomerLoyaltySummary = async (customer) => {
  const settings = await getSettings();
  const customerId = customer._id;
  const [thisMonth, lifetime] = await Promise.all([
    sumPoints({ customerId, createdAt: { $gte: startOfIstMonth() } }),
    sumPoints({ customerId }),
  ]);

  return {
    ...serializeLoyaltyBalance(customer.loyaltyPoints, settings),
    thisMonth: {
      earned: thisMonth.credits,
      redeemed: thisMonth.debits,
      net: thisMonth.credits - thisMonth.debits,
    },
    lifetime: { earned: lifetime.credits, redeemed: lifetime.debits },
  };
};

/** Customer loyalty overview: balance, summary and latest activity. */
export const getCustomerLoyaltyOverview = async (customer) => {
  const [summary, recent] = await Promise.all([
    getCustomerLoyaltySummary(customer),
    listTransactions({ customerId: customer._id, page: 1, limit: 5 }, { audience: 'customer' }),
  ]);
  return { ...summary, recentTransactions: recent.items };
};

/** Store-wide loyalty metrics for the admin loyalty page. */
export const getAdminLoyaltySummary = async () => {
  const bucketBoundaries = [...LOYALTY_TIERS].reverse().map((t) => t.minPoints);

  const [totals, balances, tierRows, recent, issuedTrend] = await Promise.all([
    sumPoints({}),
    Customer.aggregate([
      {
        $group: {
          _id: null,
          outstanding: { $sum: '$loyaltyPoints' },
          customersWithPoints: { $sum: { $cond: [{ $gt: ['$loyaltyPoints', 0] }, 1, 0] } },
          totalCustomers: { $sum: 1 },
        },
      },
    ]),
    Customer.aggregate([
      { $bucket: { groupBy: '$loyaltyPoints', boundaries: [...bucketBoundaries, Infinity], default: 'other', output: { count: { $sum: 1 } } } },
    ]),
    listTransactions({ page: 1, limit: 10 }, { audience: 'admin' }),
    getPointsIssuedTrends(),
  ]);

  const tierCounts = new Map(tierRows.map((r) => [r._id, r.count]));

  return {
    totalPointsIssued: totals.credits,
    totalPointsDebited: totals.debits,
    pointsRedeemed: totals.redeemed,
    pointsOutstanding: balances[0]?.outstanding ?? 0,
    customersWithPoints: balances[0]?.customersWithPoints ?? 0,
    totalCustomers: balances[0]?.totalCustomers ?? 0,
    tierDistribution: [...LOYALTY_TIERS].reverse().map((tier) => ({
      key: tier.key,
      label: tier.label,
      minPoints: tier.minPoints,
      color: tier.color,
      customers: tierCounts.get(tier.minPoints) ?? 0,
    })),
    issuedTrend,
    recentActivity: recent.items,
  };
};

/**
 * Ledger integrity check: cached balance must equal the sum of the ledger and
 * the latest entry's balanceAfter. Used by tests and available for audits.
 */
export const verifyLedgerConsistency = async (customerId) => {
  const id = new mongoose.Types.ObjectId(String(customerId));
  const [customer, sum, latest] = await Promise.all([
    Customer.findById(id, { loyaltyPoints: 1 }).lean(),
    LoyaltyTransaction.aggregate([{ $match: { customerId: id } }, { $group: { _id: null, total: { $sum: '$points' } } }]),
    LoyaltyTransaction.findOne({ customerId: id }).sort({ createdAt: -1, _id: -1 }).lean(),
  ]);
  const ledgerTotal = sum[0]?.total ?? 0;
  const cached = customer?.loyaltyPoints ?? 0;
  return {
    cachedBalance: cached,
    ledgerTotal,
    latestBalanceAfter: latest?.balanceAfter ?? 0,
    consistent: cached === ledgerTotal && cached === (latest?.balanceAfter ?? 0),
  };
};
