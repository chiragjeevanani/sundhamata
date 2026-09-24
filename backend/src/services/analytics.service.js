import { Customer, LoyaltyTransaction, Purchase } from '../models/index.js';
import { LOYALTY_SOURCES } from '../models/LoyaltyTransaction.js';
import { PURCHASE_STATUSES } from '../models/Purchase.js';
import { buildTrendBuckets, startOfIstMonth, STORE_TIMEZONE } from '../utils/dates.js';
import { serializePurchase } from '../utils/serializers.js';

const ACTIVE = { status: PURCHASE_STATUSES.PURCHASED };
const TREND_RANGES = ['30d', '6m', '1y'];
const CATEGORY_LABELS = { phones: 'Smartphones', accessories: 'Accessories', service: 'Repairs & Service' };

const toBucketMap = (rows, valueKeys) =>
  new Map(
    rows.map((r) => [r._id instanceof Date ? r._id.getTime() : r._id, Object.fromEntries(valueKeys.map((k) => [k, r[k]]))])
  );

/** Sales (sum of final amounts) and invoice count per time bucket, oldest first. */
export const getRevenueTrend = async (range, now = new Date()) => {
  const buckets = buildTrendBuckets(range, now);
  const rows = await Purchase.aggregate([
    { $match: { ...ACTIVE, purchaseDate: { $gte: buckets[0].start, $lt: buckets.at(-1).end } } },
    {
      $bucket: {
        groupBy: '$purchaseDate',
        boundaries: [...buckets.map((b) => b.start), buckets.at(-1).end],
        output: { value: { $sum: '$pricing.finalAmount' }, count: { $sum: 1 } },
      },
    },
  ]);
  const byStart = toBucketMap(rows, ['value', 'count']);
  return buckets.map((b) => ({
    label: b.label,
    start: b.start,
    value: byStart.get(b.start.getTime())?.value ?? 0,
    count: byStart.get(b.start.getTime())?.count ?? 0,
  }));
};

/** Loyalty points credited per time bucket, oldest first. */
const getPointsIssuedTrend = async (range, now = new Date()) => {
  const buckets = buildTrendBuckets(range, now);
  const rows = await LoyaltyTransaction.aggregate([
    { $match: { points: { $gt: 0 }, createdAt: { $gte: buckets[0].start, $lt: buckets.at(-1).end } } },
    {
      $bucket: {
        groupBy: '$createdAt',
        boundaries: [...buckets.map((b) => b.start), buckets.at(-1).end],
        output: { value: { $sum: '$points' }, count: { $sum: 1 } },
      },
    },
  ]);
  const byStart = toBucketMap(rows, ['value', 'count']);
  return buckets.map((b) => ({
    label: b.label,
    start: b.start,
    value: byStart.get(b.start.getTime())?.value ?? 0,
    count: byStart.get(b.start.getTime())?.count ?? 0,
  }));
};

const allRanges = async (fn, now) => {
  const series = await Promise.all(TREND_RANGES.map((range) => fn(range, now)));
  return Object.fromEntries(TREND_RANGES.map((range, i) => [range, series[i]]));
};

const getRevenueTrends = (now) => allRanges(getRevenueTrend, now);
export const getPointsIssuedTrends = (now = new Date()) => allRanges(getPointsIssuedTrend, now);

/** Revenue share grouped by a purchase field, largest first. */
const getShareBy = async (field, match = {}) => {
  const rows = await Purchase.aggregate([
    { $match: { ...ACTIVE, ...match } },
    { $group: { _id: { $ifNull: [`$${field}`, 'Other'] }, value: { $sum: '$pricing.finalAmount' }, count: { $sum: 1 } } },
    { $sort: { value: -1 } },
  ]);
  return rows.map((r) => ({ key: r._id, label: r._id, value: r.value, count: r.count }));
};

const getPurchaseTotals = async (match = {}) => {
  const [row] = await Purchase.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: { $cond: [{ $eq: ['$status', PURCHASE_STATUSES.PURCHASED] }, 1, 0] } },
        cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', PURCHASE_STATUSES.CANCELLED] }, 1, 0] } },
        totalSales: {
          $sum: { $cond: [{ $eq: ['$status', PURCHASE_STATUSES.PURCHASED] }, '$pricing.finalAmount', 0] },
        },
        totalDiscount: {
          $sum: { $cond: [{ $eq: ['$status', PURCHASE_STATUSES.PURCHASED] }, '$pricing.discount', 0] },
        },
      },
    },
  ]);
  return {
    totalOrders: row?.totalOrders ?? 0,
    cancelledOrders: row?.cancelledOrders ?? 0,
    totalSales: row?.totalSales ?? 0,
    totalDiscount: row?.totalDiscount ?? 0,
  };
};

const getPointsIssued = async (match = {}) => {
  const [row] = await LoyaltyTransaction.aggregate([
    { $match: { points: { $gt: 0 }, ...match } },
    { $group: { _id: null, total: { $sum: '$points' } } },
  ]);
  return row?.total ?? 0;
};

/** Monthly series (last 6 months) for the dashboard sparklines. */
const getSparklines = async (now) => {
  const buckets = buildTrendBuckets('6m', now);
  const boundaries = [...buckets.map((b) => b.start), buckets.at(-1).end];
  const since = buckets[0].start;

  const [customersBefore, customerRows, pointsRows] = await Promise.all([
    Customer.countDocuments({ createdAt: { $lt: since } }),
    Customer.aggregate([
      { $match: { createdAt: { $gte: since, $lt: boundaries.at(-1) } } },
      { $bucket: { groupBy: '$createdAt', boundaries, output: { count: { $sum: 1 } } } },
    ]),
    LoyaltyTransaction.aggregate([
      { $match: { points: { $gt: 0 }, createdAt: { $gte: since, $lt: boundaries.at(-1) } } },
      { $bucket: { groupBy: '$createdAt', boundaries, output: { points: { $sum: '$points' } } } },
    ]),
  ]);
  const revenue = await getRevenueTrend('6m', now);
  const newCustomers = toBucketMap(customerRows, ['count']);
  const points = toBucketMap(pointsRows, ['points']);

  let runningCustomers = customersBefore;
  return {
    labels: buckets.map((b) => b.label),
    customers: buckets.map((b) => (runningCustomers += newCustomers.get(b.start.getTime())?.count ?? 0)),
    purchases: revenue.map((r) => r.count),
    sales: revenue.map((r) => r.value),
    loyaltyPoints: buckets.map((b) => points.get(b.start.getTime())?.points ?? 0),
  };
};

/**
 * Merged feed of recent store events (purchases, cancellations, new customers,
 * manual loyalty adjustments), newest first. Drives the dashboard feed and the
 * admin notification drawer.
 */
export const getRecentActivity = async (limit = 10) => {
  const [purchases, cancellations, customers, adjustments] = await Promise.all([
    Purchase.find({}, { invoiceNumber: 1, product: 1, pricing: 1, customerId: 1, createdAt: 1, loyalty: 1 })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('customerId', 'name')
      .lean(),
    Purchase.find({ status: PURCHASE_STATUSES.CANCELLED }, { invoiceNumber: 1, product: 1, cancelledAt: 1 })
      .sort({ cancelledAt: -1 })
      .limit(limit)
      .lean(),
    Customer.find({}, { name: 1, mobile: 1, createdAt: 1, registrationSource: 1 }).sort({ createdAt: -1 }).limit(limit).lean(),
    LoyaltyTransaction.find({ source: LOYALTY_SOURCES.ADMIN_ADJUSTMENT })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('customerId', 'name')
      .lean(),
  ]);

  const events = [
    ...purchases.map((p) => ({
      id: `purchase:${p._id}`,
      type: 'purchase',
      title: 'Purchase Recorded',
      message: `${p.customerId?.name ?? 'Customer'} purchased ${p.product.name} (₹${p.pricing.finalAmount.toLocaleString('en-IN')}, +${p.loyalty?.pointsEarned ?? 0} pts)`,
      occurredAt: p.createdAt,
      link: `/admin/purchases/${p._id}`,
    })),
    ...cancellations.map((p) => ({
      id: `cancellation:${p._id}`,
      type: 'warning',
      title: 'Purchase Cancelled',
      message: `Invoice ${p.invoiceNumber} (${p.product.name}) was cancelled.`,
      occurredAt: p.cancelledAt,
      link: `/admin/purchases/${p._id}`,
    })),
    ...customers.map((c) => ({
      id: `customer:${c._id}`,
      type: 'customer',
      title: c.registrationSource === 'self' ? 'New Customer Registered' : 'Customer Added',
      message: `${c.name} (${c.mobile}) joined Sundhamata Mobile.`,
      occurredAt: c.createdAt,
      link: `/admin/customers/${c._id}`,
    })),
    ...adjustments.map((t) => ({
      id: `loyalty:${t._id}`,
      type: 'loyalty',
      title: t.points > 0 ? 'Loyalty Points Added' : 'Loyalty Points Deducted',
      message: `${Math.abs(t.points).toLocaleString('en-IN')} points ${t.points > 0 ? 'added to' : 'deducted from'} ${t.customerId?.name ?? 'customer'}: ${t.reason ?? ''}`.trim(),
      occurredAt: t.createdAt,
      link: `/admin/customers/${t.customerId?._id ?? t.customerId}`,
    })),
  ];

  return events
    .filter((e) => e.occurredAt)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
    .slice(0, limit);
};

export const getDashboard = async (now = new Date()) => {
  const monthStart = startOfIstMonth(now);

  const [
    totalCustomers,
    newCustomersThisMonth,
    allTime,
    thisMonth,
    pointsIssued,
    pointsIssuedThisMonth,
    outstanding,
    revenueTrend,
    categoryShare,
    sparklines,
    recentPurchases,
    recentActivity,
  ] = await Promise.all([
    Customer.countDocuments(),
    Customer.countDocuments({ createdAt: { $gte: monthStart } }),
    getPurchaseTotals(),
    getPurchaseTotals({ purchaseDate: { $gte: monthStart } }),
    getPointsIssued(),
    getPointsIssued({ createdAt: { $gte: monthStart } }),
    Customer.aggregate([{ $group: { _id: null, total: { $sum: '$loyaltyPoints' } } }]),
    getRevenueTrends(now),
    getShareBy('category'),
    getSparklines(now),
    Purchase.find().sort({ createdAt: -1, _id: -1 }).limit(5).populate('customerId', 'name mobile customerCode').populate('createdBy', 'name').lean(),
    getRecentActivity(10),
  ]);

  return {
    customers: { total: totalCustomers, newThisMonth: newCustomersThisMonth },
    purchases: { total: allTime.totalOrders, thisMonth: thisMonth.totalOrders, cancelled: allTime.cancelledOrders },
    sales: { total: allTime.totalSales, thisMonth: thisMonth.totalSales },
    loyaltyPointsIssued: { total: pointsIssued, thisMonth: pointsIssuedThisMonth, outstanding: outstanding[0]?.total ?? 0 },
    revenueTrend,
    categoryDistribution: categoryShare.map((c) => ({ ...c, label: CATEGORY_LABELS[c.key] ?? c.label })),
    sparklines,
    recentPurchases: recentPurchases.map((p) => serializePurchase(p)),
    recentActivity,
    generatedAt: now,
    timezone: STORE_TIMEZONE,
  };
};

// Retail-hours buckets (IST) for the hourly sales chart.
const HOUR_BUCKETS = [
  { label: '10 AM', from: 0, to: 12 },
  { label: '12 PM', from: 12, to: 14 },
  { label: '2 PM', from: 14, to: 16 },
  { label: '4 PM', from: 16, to: 18 },
  { label: '6 PM', from: 18, to: 20 },
  { label: '8 PM', from: 20, to: 24 },
];

const getHourlySales = async () => {
  const rows = await Purchase.aggregate([
    { $match: ACTIVE },
    { $group: { _id: { $hour: { date: '$purchaseDate', timezone: STORE_TIMEZONE } }, value: { $sum: '$pricing.finalAmount' }, count: { $sum: 1 } } },
  ]);
  return HOUR_BUCKETS.map(({ label, from, to }) => {
    const inBucket = rows.filter((r) => r._id >= from && r._id < to);
    return {
      label,
      value: inBucket.reduce((sum, r) => sum + r.value, 0),
      count: inBucket.reduce((sum, r) => sum + r.count, 0),
    };
  });
};

export const getReportSummary = async (now = new Date()) => {
  const [totals, totalCustomers, pointsIssued, revenueTrend, brandShare, categoryShare, paymentMethodShare, hourlySales] =
    await Promise.all([
      getPurchaseTotals(),
      Customer.countDocuments(),
      getPointsIssued(),
      getRevenueTrends(now),
      getShareBy('product.brand'),
      getShareBy('category'),
      getShareBy('payment.method'),
      getHourlySales(),
    ]);

  return {
    totals: {
      ...totals,
      totalCustomers,
      pointsIssued,
      averageOrderValue: totals.totalOrders ? Math.round((totals.totalSales / totals.totalOrders) * 100) / 100 : 0,
    },
    revenueTrend,
    brandShare,
    categoryShare: categoryShare.map((c) => ({ ...c, label: CATEGORY_LABELS[c.key] ?? c.label })),
    paymentMethodShare,
    hourlySales,
    generatedAt: now,
    timezone: STORE_TIMEZONE,
  };
};
