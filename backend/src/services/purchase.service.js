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
import { buildCustomerSearchFilter, createCustomer } from './customer.service.js';
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

// Name used when the store records a purchase for a new number without asking the name.
// The customer is asked to confirm their details the first time they sign in.
export const PLACEHOLDER_CUSTOMER_NAME = 'Customer';
const INTEREST_BY_CATEGORY = { phones: 'Mobile', accessories: 'Accessories', service: 'Service' };

/**
 * The customer a new purchase belongs to: an existing one by id, or, for a mobile number
 * given as `newCustomer`, the customer with that number (created now if they are new).
 * Runs inside the purchase transaction, so a failed purchase never leaves a stray customer.
 */
const resolvePurchaseCustomer = async (input, admin, ctx) => {
  const { session } = ctx;
  let customer;
  let customerCreated = false;

  if (input.customerId) {
    customer = await Customer.findById(input.customerId).session(session).lean();
    if (!customer) throw ApiError.notFound('Customer not found');
  } else {
    const { mobile, name } = input.newCustomer;
    customer = await Customer.findOne({ mobile }).session(session).lean();
    if (!customer) {
      try {
        const created = await createCustomer(
          {
            name: name ?? PLACEHOLDER_CUSTOMER_NAME,
            mobile,
            interest: INTEREST_BY_CATEGORY[input.category] ?? 'Mobile',
          },
          { source: 'admin', createdBy: admin },
          ctx
        );
        customer = created.toObject();
        customerCreated = true;
      } catch (err) {
        // Another counter recorded a purchase for this number at the same moment
        if (err?.code === 11000 || err?.statusCode === 409) {
          throw ApiError.conflict('This customer was just added by someone else. Please record the purchase again.');
        }
        throw err;
      }
    }
  }

  if (!customer.isActive) {
    throw ApiError.unprocessable('Cannot record a purchase for an inactive customer', [
      { field: 'customerId', message: 'Customer is inactive' },
    ]);
  }
  return { customer, customerCreated };
};

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

    const { customer, customerCreated } = await resolvePurchaseCustomer(input, admin, ctx);

    if (await invoiceTaken(input.invoiceNumber, { session })) throw duplicateInvoice();

    const settings = await getSettings(session);
    const { purchaseAmount, discount } = input.pricing;
    const amountAfterDiscount = roundMoney(purchaseAmount - discount);

    // Loyalty redemption: points come off the bill after the discount.
    const pointsRedeemed = input.loyaltyRedemption?.points ?? 0;
    const { rupeeValuePerPoint, minRedeemPoints } = settings.loyalty;
    let loyaltyDiscount = 0;
    if (pointsRedeemed > 0) {
      const redemptionError = (message) =>
        ApiError.unprocessable(message, [{ field: 'loyaltyRedemption.points', message }]);
      if (!(rupeeValuePerPoint > 0)) {
        throw redemptionError('Point redemption is switched off (point value is ₹0 in settings)');
      }
      if (minRedeemPoints > 0 && pointsRedeemed < minRedeemPoints) {
        throw redemptionError(`At least ${minRedeemPoints} points must be redeemed at a time`);
      }
      if (pointsRedeemed > customer.loyaltyPoints) {
        throw redemptionError(`Customer has only ${customer.loyaltyPoints} points; cannot redeem ${pointsRedeemed}`);
      }
      loyaltyDiscount = roundMoney(pointsRedeemed * rupeeValuePerPoint);
      if (loyaltyDiscount > amountAfterDiscount) {
        throw redemptionError(
          `${pointsRedeemed} points are worth ₹${loyaltyDiscount}, more than the ₹${amountAfterDiscount} bill`
        );
      }
    }

    // What the customer actually pays; tax and newly earned points are based on this.
    const finalAmount = roundMoney(amountAfterDiscount - loyaltyDiscount);
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
          pricing: { purchaseAmount, discount, loyaltyDiscount, finalAmount, taxRatePercent, taxAmount, baseAmount },
          loyalty: {
            pointsEarned,
            pointsPerHundredRupees,
            pointsRedeemed,
            rupeeValuePerPoint: pointsRedeemed > 0 ? rupeeValuePerPoint : null,
          },
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
    // Spend first, then earn: the conditional debit guarantees the balance never goes negative,
    // even if another request spent points after the check above.
    if (pointsRedeemed > 0) {
      ({ balance } = await applyPointsChange(
        {
          customerId: customer._id,
          delta: -pointsRedeemed,
          type: LOYALTY_TYPES.REDEEMED,
          source: LOYALTY_SOURCES.REDEMPTION,
          title: 'Points Redeemed',
          description: `${purchase.product.name} — ₹${loyaltyDiscount.toLocaleString('en-IN')} off`,
          purchaseId: purchase._id,
          createdBy: admin._id,
          occurredAt,
        },
        ctx
      ));
    }
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

    return { purchaseId: purchase._id, pointsEarned, pointsRedeemed, balance, customerCreated };
  });

  logger.info(
    {
      purchaseId: result.purchaseId.toString(),
      adminId: admin.id,
      pointsEarned: result.pointsEarned,
      pointsRedeemed: result.pointsRedeemed,
      customerCreated: result.customerCreated,
    },
    'Purchase created'
  );

  const purchase = await findPurchaseForAdmin(result.purchaseId);
  return {
    purchase: serializePurchase(purchase),
    customerLoyaltyBalance: result.balance,
    customerCreated: result.customerCreated,
  };
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
    const redeemed = purchase.loyalty?.pointsRedeemed ?? 0;
    let reversed = 0;
    let shortfall = 0;

    // Give back points the customer spent on this bill first, so the reversal
    // of earned points below can draw on them.
    if (redeemed > 0) {
      await applyPointsChange(
        {
          customerId: purchase.customerId,
          delta: redeemed,
          type: LOYALTY_TYPES.ADJUSTMENT,
          source: LOYALTY_SOURCES.REDEMPTION_REFUND,
          title: 'Redeemed Points Returned',
          description: purchase.product.name,
          reason,
          purchaseId: purchase._id,
          createdBy: admin._id,
        },
        ctx
      );
    }

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

    }

    if (earned > 0 || redeemed > 0) {
      await Purchase.updateOne(
        { _id: id },
        {
          $set: {
            'loyalty.pointsReversed': reversed,
            'loyalty.reversalShortfall': shortfall,
            'loyalty.pointsRefunded': redeemed,
          },
        },
        { session }
      );
    }

    return { earned, reversed, shortfall, refunded: redeemed };
  });

  logger.info({ purchaseId: id, adminId: admin.id, ...result }, 'Purchase cancelled');

  return {
    purchase: serializePurchase(await findPurchaseForAdmin(id)),
    loyalty: { pointsReversed: result.reversed, reversalShortfall: result.shortfall, pointsRefunded: result.refunded },
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
