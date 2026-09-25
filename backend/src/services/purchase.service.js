import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import { Customer, Purchase } from '../models/index.js';
import { LOYALTY_SOURCES, LOYALTY_TYPES } from '../models/LoyaltyTransaction.js';
import { INVOICE_COLLATION, PURCHASE_STATUSES } from '../models/Purchase.js';
import { ApiError } from '../utils/ApiError.js';
import { addMonths, monthsBetween } from '../utils/dates.js';
import { calculatePurchasePoints } from '../utils/loyalty.js';
import { buildPagination, containsRegex, paginated, parseSort } from '../utils/query.js';
import { serializePurchase } from '../utils/serializers.js';
import { runAtomic } from '../utils/transaction.js';
import { buildCustomerSearchFilter } from './customer.service.js';
import { applyPointsChange } from './loyalty.service.js';
import { getSettings } from './settings.service.js';

const KNOWN_BRANDS = [
  ['Samsung', /\b(samsung|galaxy)\b/i],
  ['Apple', /\b(apple|iphone|ipad|airpods|macbook)\b/i],
  ['OnePlus', /\boneplus\b/i],
  ['Xiaomi', /\b(xiaomi|redmi|poco|mi)\b/i],
  ['Realme', /\brealme\b/i],
  ['Vivo', /\bvivo\b/i],
  ['Oppo', /\boppo\b/i],
  ['Google', /\b(google|pixel)\b/i],
  ['Motorola', /\b(motorola|moto)\b/i],
  ['Nothing', /\bnothing\b/i],
  ['iQOO', /\biqoo\b/i],
];

const inferBrand = (productName) => KNOWN_BRANDS.find(([, pattern]) => pattern.test(productName))?.[0] ?? null;

const roundMoney = (value) => Math.round(value * 100) / 100;

const ADMIN_POPULATE = [
  { path: 'customerId', select: 'name mobile customerCode' },
  { path: 'createdBy', select: 'name' },
];

const findPurchaseForAdmin = (id) => Purchase.findById(id).populate(ADMIN_POPULATE).lean();

const WARRANTY_COVERAGE = 'Manufacturing defects covered at authorised brand service centres across India.';

const duplicateInvoice = () =>
  ApiError.conflict('A purchase with this invoice number already exists', [
    { field: 'invoiceNumber', message: 'Already used on another purchase' },
  ]);

/** Invoice numbers are unique ignoring case ("inv-1" and "INV-1" are the same bill). */
const invoiceTaken = (invoiceNumber, { excludeId = null, session = null } = {}) =>
  Purchase.exists(excludeId ? { invoiceNumber, _id: { $ne: excludeId } } : { invoiceNumber })
    .collation(INVOICE_COLLATION)
    .session(session);

/** "2 Years Warranty", "18 Months Warranty", "1 Year Warranty" */
const warrantyLabel = (months) => {
  const [n, unit] = months % 12 === 0 ? [months / 12, 'Year'] : [months, 'Month'];
  return `${n} ${unit}${n === 1 ? '' : 's'} Warranty`;
};

/** Warranty expiring exactly `months` after the purchase date, or null for none. */
const buildWarranty = (purchaseDate, months) =>
  months > 0
    ? { months, type: warrantyLabel(months), validUntil: addMonths(purchaseDate, months), coverage: WARRANTY_COVERAGE }
    : null;

const warrantyMonths = ({ duration, unit }) => duration * (unit === 'years' ? 12 : 1);

/**
 * Records a purchase: validates the customer, prices it, calculates loyalty
 * from the store settings, stores the purchase, appends the loyalty ledger
 * entry and updates the customer's balance — all in one atomic unit.
 *
 * Any `pointsEarned` sent by a client is ignored (the validator rejects it);
 * the server is the only authority on loyalty.
 *
 * @param {object} input validated createPurchaseSchema output
 * @param {object} admin authenticated admin document
 * @param {{ occurredAt?: Date }} [options] backdating for seed/import only
 */
export const createPurchase = async (input, admin, { occurredAt } = {}) => {
  const result = await runAtomic(async (ctx) => {
    const { session, onRollback } = ctx;

    const customer = await Customer.findById(input.customerId).session(session).lean();
    if (!customer) {
      throw ApiError.notFound('Customer not found');
    }
    if (!customer.isActive) {
      throw ApiError.unprocessable('Cannot record a purchase for an inactive customer', [
        { field: 'customerId', message: 'Customer is inactive' },
      ]);
    }

    if (await invoiceTaken(input.invoiceNumber, { session })) throw duplicateInvoice();

    const settings = await getSettings(session);
    const { purchaseAmount, discount } = input.pricing;
    const finalAmount = roundMoney(purchaseAmount - discount);
    const taxRatePercent = settings.tax?.gstRatePercent ?? 18;
    const baseAmount = roundMoney(finalAmount / (1 + taxRatePercent / 100));
    const taxAmount = roundMoney(finalAmount - baseAmount);

    const pointsPerHundredRupees = settings.loyalty.pointsPerHundredRupees;
    const pointsEarned = calculatePurchasePoints(finalAmount, pointsPerHundredRupees);

    const purchaseDate = input.purchaseDate ?? new Date();
    // Default when not specified: 12 months, none for service jobs.
    const months = input.warranty ? warrantyMonths(input.warranty) : input.category === 'service' ? 0 : 12;

    const [purchase] = await Purchase.create(
      [
        {
          customerId: customer._id,
          invoiceNumber: input.invoiceNumber,
          category: input.category,
          product: { ...input.product, brand: input.product.brand ?? inferBrand(input.product.name) },
          purchaseDate,
          payment: input.payment,
          pricing: { purchaseAmount, discount, finalAmount, taxRatePercent, taxAmount, baseAmount },
          loyalty: { pointsEarned, pointsPerHundredRupees },
          warranty: buildWarranty(purchaseDate, months) ?? undefined,
          notes: input.notes ?? null,
          createdBy: admin._id,
          ...(occurredAt ? { createdAt: occurredAt } : {}),
        },
      ],
      { session }
    );
    onRollback(() => Purchase.deleteOne({ _id: purchase._id }));

    let balance = customer.loyaltyPoints;
    if (pointsEarned > 0) {
      ({ balance } = await applyPointsChange(
        {
          customerId: customer._id,
          delta: pointsEarned,
          type: LOYALTY_TYPES.EARNED,
          source: LOYALTY_SOURCES.PURCHASE,
          title: 'Purchase Reward',
          description: purchase.product.name,
          purchaseId: purchase._id,
          createdBy: admin._id,
          occurredAt,
        },
        ctx
      ));
    }

    return { purchaseId: purchase._id, pointsEarned, balance };
  });

  logger.info(
    {
      purchaseId: result.purchaseId.toString(),
      adminId: admin.id,
      pointsEarned: result.pointsEarned,
    },
    'Purchase created'
  );

  const purchase = await findPurchaseForAdmin(result.purchaseId);
  return { purchase: serializePurchase(purchase), customerLoyaltyBalance: result.balance };
};

const toSetPaths = (patch) => {
  const $set = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === 'product' || key === 'payment') {
      for (const [sub, subValue] of Object.entries(value)) {
        if (subValue !== undefined) $set[`${key}.${sub}`] = subValue;
      }
    } else {
      $set[key] = value;
    }
  }
  return $set;
};

/**
 * Updates non-financial details (incl. invoice number, purchase date, warranty).
 * Pricing (and therefore loyalty) is immutable.
 */
export const updatePurchase = async (id, { warranty, ...patch }, admin) => {
  const existing = await Purchase.findById(id, { status: 1, product: 1, purchaseDate: 1, warranty: 1 }).lean();
  if (!existing) throw ApiError.notFound('Purchase not found');
  if (existing.status === PURCHASE_STATUSES.CANCELLED) {
    throw ApiError.conflict('Cancelled purchases cannot be edited');
  }
  if (patch.invoiceNumber && (await invoiceTaken(patch.invoiceNumber, { excludeId: existing._id }))) {
    throw duplicateInvoice();
  }

  const $set = toSetPaths(patch);
  const $unset = {};

  // The expiry always follows the purchase date: recompute when either changes.
  if (warranty || patch.purchaseDate) {
    const purchaseDate = patch.purchaseDate ?? existing.purchaseDate;
    const currentMonths =
      existing.warranty?.months ??
      (existing.warranty?.validUntil ? monthsBetween(existing.purchaseDate, existing.warranty.validUntil) : 0);
    const next = buildWarranty(purchaseDate, warranty ? warrantyMonths(warranty) : currentMonths);
    if (next) $set.warranty = next;
    else $unset.warranty = 1;
  }
  if (patch.product?.name && patch.product.brand === undefined && !existing.product.brand) {
    $set['product.brand'] = inferBrand(patch.product.name);
  }

  let updated;
  try {
    updated = await Purchase.findOneAndUpdate(
      { _id: id, status: PURCHASE_STATUSES.PURCHASED },
      Object.keys($unset).length ? { $set, $unset } : { $set },
      { returnDocument: 'after', runValidators: true }
    );
  } catch (err) {
    if (err?.code === 11000) throw duplicateInvoice(); // lost a race with another edit
    throw err;
  }
  if (!updated) throw ApiError.conflict('Cancelled purchases cannot be edited');

  logger.info({ purchaseId: id, adminId: admin.id, fields: [...Object.keys($set), ...Object.keys($unset)] }, 'Purchase updated');
  return serializePurchase(await findPurchaseForAdmin(id));
};

/**
 * Cancels a purchase (the record is kept) and reverses the loyalty points it
 * earned, in one atomic unit. If the customer already spent some of those
 * points, only the available balance is reversed (the balance never goes
 * negative) and the shortfall is recorded on the purchase.
 */
export const cancelPurchase = async (id, reason, admin) => {
  const result = await runAtomic(async (ctx) => {
    const { session, onRollback } = ctx;
    const now = new Date();

    // Atomic state transition: only one concurrent cancel can succeed.
    const purchase = await Purchase.findOneAndUpdate(
      { _id: id, status: PURCHASE_STATUSES.PURCHASED },
      {
        $set: {
          status: PURCHASE_STATUSES.CANCELLED,
          'payment.status': 'Cancelled',
          cancelledAt: now,
          cancelledBy: admin._id,
          cancelReason: reason,
        },
      },
      { returnDocument: 'before', session }
    ).lean();

    if (!purchase) {
      const exists = await Purchase.exists({ _id: id }).session(session);
      if (!exists) throw ApiError.notFound('Purchase not found');
      throw ApiError.conflict('This purchase is already cancelled');
    }
    onRollback(() =>
      Purchase.updateOne(
        { _id: id },
        {
          $set: {
            status: purchase.status,
            'payment.status': purchase.payment.status,
            cancelledAt: null,
            cancelledBy: null,
            cancelReason: null,
          },
        }
      )
    );

    const earned = purchase.loyalty?.pointsEarned ?? 0;
    let reversed = 0;
    let shortfall = 0;

    if (earned > 0) {
      const customer = await Customer.findById(purchase.customerId, { loyaltyPoints: 1 }).session(session).lean();
      reversed = Math.min(earned, customer?.loyaltyPoints ?? 0);
      shortfall = earned - reversed;

      if (reversed > 0) {
        await applyPointsChange(
          {
            customerId: purchase.customerId,
            delta: -reversed,
            type: LOYALTY_TYPES.ADJUSTMENT,
            source: LOYALTY_SOURCES.PURCHASE_CANCELLATION,
            title: 'Purchase Cancelled',
            description:
              shortfall > 0
                ? `${purchase.product.name} — ${shortfall} points were already used and could not be reversed`
                : purchase.product.name,
            reason,
            purchaseId: purchase._id,
            createdBy: admin._id,
          },
          ctx
        );
      }

      await Purchase.updateOne(
        { _id: id },
        { $set: { 'loyalty.pointsReversed': reversed, 'loyalty.reversalShortfall': shortfall } },
        { session }
      );
    }

    return { earned, reversed, shortfall };
  });

  logger.info({ purchaseId: id, adminId: admin.id, ...result }, 'Purchase cancelled');

  return {
    purchase: serializePurchase(await findPurchaseForAdmin(id)),
    loyalty: { pointsReversed: result.reversed, reversalShortfall: result.shortfall },
  };
};

const buildPurchaseSearch = async (search, { includeCustomers }) => {
  const regex = containsRegex(search);
  const or = [
    { invoiceNumber: regex },
    { 'product.name': regex },
    { 'product.brand': regex },
    { 'product.variant': regex },
    { 'product.imei': regex },
    { 'product.serialNumber': regex },
  ];
  if (includeCustomers) {
    const customerIds = await Customer.find(buildCustomerSearchFilter(search), { _id: 1 }).limit(500).lean();
    if (customerIds.length) or.push({ customerId: { $in: customerIds.map((c) => c._id) } });
  }
  return { $or: or };
};

export const listPurchasesForAdmin = async (query) => {
  const { page, limit, search, status, paymentStatus, category, customerId, from, to, sort } = query;
  const filter = {};
  if (status !== 'all') filter.status = status;
  if (paymentStatus !== 'all') filter['payment.status'] = paymentStatus;
  if (category !== 'all') filter.category = category;
  if (customerId) filter.customerId = new mongoose.Types.ObjectId(customerId);
  if (from || to) {
    filter.purchaseDate = {};
    if (from) filter.purchaseDate.$gte = from;
    if (to) filter.purchaseDate.$lte = to;
  }
  if (search) Object.assign(filter, await buildPurchaseSearch(search, { includeCustomers: true }));

  const { skip } = buildPagination({ page, limit });
  const [rows, total] = await Promise.all([
    Purchase.find(filter).sort(parseSort(sort)).skip(skip).limit(limit).populate(ADMIN_POPULATE).lean(),
    Purchase.countDocuments(filter),
  ]);
  return paginated(rows.map((p) => serializePurchase(p)), { page, limit }, total);
};

export const getPurchaseForAdmin = async (id) => {
  const purchase = await findPurchaseForAdmin(id);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  return serializePurchase(purchase);
};

export const listPurchasesForCustomer = async (customerId, { page, limit, search, category }) => {
  const filter = { customerId };
  if (category && category !== 'all') filter.category = category;
  if (search) Object.assign(filter, await buildPurchaseSearch(search, { includeCustomers: false }));

  const { skip } = buildPagination({ page, limit });
  const [rows, total] = await Promise.all([
    Purchase.find(filter)
      .sort({ purchaseDate: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name')
      .lean(),
    Purchase.countDocuments(filter),
  ]);
  return paginated(
    rows.map((p) => serializePurchase(p, { audience: 'customer' })),
    { page, limit },
    total
  );
};

/** 404 for purchases that don't exist AND for other customers' purchases (no existence leak). */
export const getPurchaseForCustomer = async (customerId, purchaseId) => {
  const purchase = await Purchase.findOne({ _id: purchaseId, customerId }).populate('createdBy', 'name').lean();
  if (!purchase) throw ApiError.notFound('Purchase not found');
  return serializePurchase(purchase, { audience: 'customer' });
};
