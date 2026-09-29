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
import {
  markCouponRedeemed,
  PLACEHOLDER_CUSTOMER_NAME,
  prepareCouponForPurchase,
  restoreCouponOfPurchase,
} from './coupon.service.js';
import { applyPointsChange } from './loyalty.service.js';
import { learnFromPurchaseLines } from './product.service.js';
import { verifyAfterPurchase } from './customerVerification.js';
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
            interest: INTEREST_BY_CATEGORY[input.items[0].category] ?? 'Mobile',
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

/**
 * Invoice numbers are unique per bill, ignoring case ("inv-1" and "INV-1" are the same bill).
 * `excludeIds`: the lines of the bill being edited.
 */
const invoiceTaken = (invoiceNumber, { excludeIds = [], session = null } = {}) =>
  Purchase.exists(excludeIds.length ? { invoiceNumber, _id: { $nin: excludeIds } } : { invoiceNumber })
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

const financeProblem = (message, field = 'payment.finance.downPayment') =>
  ApiError.unprocessable(message, [{ field, message }]);

/** Finance details with the loan amount worked out from the bill total. */
const financeFor = (finance, billTotal) => {
  if (finance.downPayment > billTotal) {
    throw financeProblem(`Down payment (₹${finance.downPayment}) cannot be more than the bill (₹${billTotal})`);
  }
  return { ...finance, loanNumber: finance.loanNumber ?? null, loanAmount: roundMoney(billTotal - finance.downPayment) };
};

/**
 * Splits `total` (whole units: paise or points) across lines in proportion to `weights`,
 * so the parts always add up exactly (largest remainder). No part exceeds its weight when
 * total <= sum(weights).
 */
const allocate = (total, weights) => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0) || !(sum > 0)) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (left > 0) {
        parts[index] += 1;
        left -= 1;
      }
    });
  return parts;
};
const toPaise = (rupees) => Math.round(rupees * 100);
const fromPaise = (paise) => paise / 100;

/** "Galaxy S25 Ultra", or "Galaxy S25 Ultra + 2 more" for a multi-product bill */
const billTitle = (items) =>
  items.length > 1 ? `${items[0].product.name} + ${items.length - 1} more` : items[0].product.name;

/**
 * Records a bill with one or more products. Each product becomes its own Purchase ("line")
 * with its own warranty, IMEI and photo; the lines share the invoice number and `order.id`.
 * Bill-level amounts (store discount, coupon, loyalty points) are split across the lines in
 * proportion to their prices, so every line is self-consistent (e.g. for cancelling one item)
 * and the lines add up exactly to the bill. Loyalty is earned on the bill total.
 * Everything happens in one atomic unit.
 *
 * Any `pointsEarned` sent by a client is ignored (the validator rejects it);
 * the server is the only authority on loyalty.
 *
 * @param {object} input validated createPurchaseSchema output (always has `items`)
 * @param {object} admin authenticated admin document
 * @param {{ occurredAt?: Date }} [options] backdating for seed/import only
 */
export const createPurchase = async (input, admin, { occurredAt } = {}) => {
  const items = input.items;
  const result = await runAtomic(async (ctx) => {
    const { session, onRollback } = ctx;

    const { customer, customerCreated } = await resolvePurchaseCustomer(input, admin, ctx);

    if (await invoiceTaken(input.invoiceNumber, { session })) throw duplicateInvoice();

    const settings = await getSettings(session);
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.price, 0));
    const { discount } = input.pricing;
    const amountAfterDiscount = roundMoney(subtotal - discount);

    // Coupon (e.g. the welcome offer): comes off after the store discount, before points.
    let coupon = null;
    let couponDiscount = 0;
    if (input.couponCode) {
      ({ coupon, discount: couponDiscount } = await prepareCouponForPurchase(
        { code: input.couponCode, customerId: customer._id, amount: amountAfterDiscount },
        ctx
      ));
    }
    const amountAfterCoupon = roundMoney(amountAfterDiscount - couponDiscount);

    // Loyalty redemption: points come off the bill after the discount and coupon.
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
      if (loyaltyDiscount > amountAfterCoupon) {
        throw redemptionError(
          `${pointsRedeemed} points are worth ₹${loyaltyDiscount}, more than the ₹${amountAfterCoupon} bill`
        );
      }
    }

    // What the customer actually pays; newly earned points are based on the bill total.
    const finalAmount = roundMoney(amountAfterCoupon - loyaltyDiscount);
    const taxRatePercent = settings.tax?.gstRatePercent ?? 18;
    const pointsPerHundredRupees = settings.loyalty.pointsPerHundredRupees;
    const pointsEarned = calculatePurchasePoints(finalAmount, pointsPerHundredRupees);

    // Bought on finance: the lender pays the bill minus the down payment
    const payment = { ...input.payment, finance: null };
    if (input.payment.method === 'Finance') {
      payment.finance = financeFor(input.payment.finance, finalAmount);
    }

    // ---- split the bill across its lines (in paise, so the parts add up exactly)
    const pricePaise = items.map((item) => toPaise(item.price));
    const discountPaise = allocate(toPaise(discount), pricePaise);
    const afterDiscount = pricePaise.map((p, i) => p - discountPaise[i]);
    const couponPaise = allocate(toPaise(couponDiscount), afterDiscount);
    const afterCoupon = afterDiscount.map((p, i) => p - couponPaise[i]);
    const loyaltyPaise = allocate(toPaise(loyaltyDiscount), afterCoupon);
    const finalPaise = afterCoupon.map((p, i) => p - loyaltyPaise[i]);
    const redeemedPoints = allocate(pointsRedeemed, loyaltyPaise);
    const earnedPoints = allocate(pointsEarned, finalPaise);

    const purchaseDate = input.purchaseDate ?? new Date();
    const orderId = new mongoose.Types.ObjectId();

    const docs = items.map((item, i) => {
      const lineFinal = fromPaise(finalPaise[i]);
      const baseAmount = roundMoney(lineFinal / (1 + taxRatePercent / 100));
      // Default when not specified: 12 months, none for service jobs.
      const months = item.warranty ? warrantyMonths(item.warranty) : item.category === 'service' ? 0 : 12;
      return {
        customerId: customer._id,
        invoiceNumber: input.invoiceNumber,
        order: { id: orderId, lineNo: i + 1, lineCount: items.length },
        category: item.category,
        product: { ...item.product, brand: item.product.brand ?? inferBrand(item.product.name) },
        purchaseDate,
        payment,
        pricing: {
          purchaseAmount: item.price,
          discount: fromPaise(discountPaise[i]),
          couponDiscount: fromPaise(couponPaise[i]),
          loyaltyDiscount: fromPaise(loyaltyPaise[i]),
          finalAmount: lineFinal,
          taxRatePercent,
          taxAmount: roundMoney(lineFinal - baseAmount),
          baseAmount,
        },
        coupon: coupon ? { couponId: coupon._id, code: coupon.code } : undefined,
        loyalty: {
          pointsEarned: earnedPoints[i],
          pointsPerHundredRupees,
          pointsRedeemed: redeemedPoints[i],
          rupeeValuePerPoint: redeemedPoints[i] > 0 ? rupeeValuePerPoint : null,
        },
        warranty: buildWarranty(purchaseDate, months) ?? undefined,
        notes: input.notes ?? null,
        createdBy: admin._id,
        ...(occurredAt ? { createdAt: occurredAt } : {}),
      };
    });

    const lines = await Purchase.create(docs, { session, ordered: true });
    onRollback(() => Purchase.deleteMany({ 'order.id': orderId }));
    const first = lines[0];

    if (coupon) await markCouponRedeemed({ couponId: coupon._id, purchaseId: first._id, admin }, ctx);

    // App user + purchase at the store = verified (blue tick)
    await verifyAfterPurchase(customer, ctx);

    // One ledger entry per bill (not per product): spend first, then earn. The conditional
    // debit guarantees the balance never goes negative, even under concurrent bills.
    let balance = customer.loyaltyPoints;
    const title = billTitle(items);
    if (pointsRedeemed > 0) {
      ({ balance } = await applyPointsChange(
        {
          customerId: customer._id,
          delta: -pointsRedeemed,
          type: LOYALTY_TYPES.REDEEMED,
          source: LOYALTY_SOURCES.REDEMPTION,
          title: 'Points Redeemed',
          description: `${title} — ₹${loyaltyDiscount.toLocaleString('en-IN')} off`,
          purchaseId: first._id,
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
          description: title,
          purchaseId: first._id,
          createdBy: admin._id,
          occurredAt,
        },
        ctx
      ));
    }

    return {
      orderId,
      purchaseIds: lines.map((line) => line._id),
      lines: docs,
      pointsEarned,
      pointsRedeemed,
      balance,
      customerCreated,
      totals: { subtotal, discount, couponDiscount, loyaltyDiscount, finalAmount },
    };
  });

  logger.info(
    {
      orderId: result.orderId.toString(),
      items: result.purchaseIds.length,
      adminId: admin.id,
      pointsEarned: result.pointsEarned,
      pointsRedeemed: result.pointsRedeemed,
      customerCreated: result.customerCreated,
    },
    'Purchase created'
  );

  // Remember the products for next time (after the bill is safely saved)
  await learnFromPurchaseLines(result.lines);

  const purchases = await Purchase.find({ _id: { $in: result.purchaseIds } })
    .sort({ 'order.lineNo': 1 })
    .populate(ADMIN_POPULATE)
    .lean();
  const serialized = purchases.map((p) => serializePurchase(p));
  return {
    // First line, for clients that record one product at a time
    purchase: serialized[0],
    purchases: serialized,
    order: {
      id: result.orderId.toString(),
      invoiceNumber: serialized[0].invoiceNumber,
      itemCount: serialized.length,
      totals: result.totals,
      pointsEarned: result.pointsEarned,
      pointsRedeemed: result.pointsRedeemed,
    },
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

/** Warranty change for one line when its months or the purchase date change. */
const warrantyUpdate = (line, purchaseDate, warrantyInput) => {
  const currentMonths =
    line.warranty?.months ??
    (line.warranty?.validUntil ? monthsBetween(line.purchaseDate, line.warranty.validUntil) : 0);
  const next = buildWarranty(purchaseDate, warrantyInput ? warrantyMonths(warrantyInput) : currentMonths);
  return next ? { $set: { warranty: next } } : { $unset: { warranty: 1 } };
};

const mergeUpdate = (...parts) => {
  const $set = Object.assign({}, ...parts.map((p) => p?.$set ?? {}));
  const $unset = Object.assign({}, ...parts.map((p) => p?.$unset ?? {}));
  return Object.keys($unset).length ? { $set, $unset } : { $set };
};

/**
 * Updates non-financial details. Product details and warranty belong to this line; the
 * invoice number, purchase date, payment and notes belong to the whole bill and are applied
 * to every product on it. Pricing (and therefore loyalty) is immutable.
 */
export const updatePurchase = async (id, { warranty, product, category, ...billPatch }, admin) => {
  const existing = await Purchase.findById(id, { status: 1, product: 1, purchaseDate: 1, warranty: 1, order: 1, payment: 1, pricing: 1 }).lean();
  if (!existing) throw ApiError.notFound('Purchase not found');
  if (existing.status === PURCHASE_STATUSES.CANCELLED) {
    throw ApiError.conflict('Cancelled purchases cannot be edited');
  }

  const hasBillChanges = Object.values(billPatch).some((v) => v !== undefined);
  const siblings =
    hasBillChanges && existing.order?.id && existing.order.lineCount > 1
      ? await Purchase.find(
          { 'order.id': existing.order.id, _id: { $ne: existing._id } },
          { status: 1, purchaseDate: 1, warranty: 1 }
        ).lean()
      : [];

  if (
    billPatch.invoiceNumber &&
    (await invoiceTaken(billPatch.invoiceNumber, { excludeIds: [existing._id, ...siblings.map((s) => s._id)] }))
  ) {
    throw duplicateInvoice();
  }

  // Finance: only for "Finance" payments; the loan amount follows the bill total
  if (billPatch.payment) {
    const method = billPatch.payment.method ?? existing.payment.method;
    if (billPatch.payment.finance) {
      if (method !== 'Finance') throw financeProblem('Finance details are only for "Finance" payments', 'payment.finance');
      const lines = existing.order?.id
        ? await Purchase.find({ 'order.id': existing.order.id, status: PURCHASE_STATUSES.PURCHASED }, { pricing: 1 }).lean()
        : [existing];
      const billTotal = roundMoney(lines.reduce((sum, line) => sum + line.pricing.finalAmount, 0));
      billPatch.payment.finance = financeFor(billPatch.payment.finance, billTotal);
    } else if (method === 'Finance' && !existing.payment.finance) {
      throw financeProblem('Add the finance details (company, down payment, EMI)', 'payment.finance');
    }
    if (billPatch.payment.method && method !== 'Finance') billPatch.payment.finance = null;
  }

  const billSet = toSetPaths(billPatch);
  const lineSet = toSetPaths({ ...(product ? { product } : {}), ...(category ? { category } : {}) });
  if (product?.name && product.brand === undefined && !existing.product.brand) {
    lineSet['product.brand'] = inferBrand(product.name);
  }
  const purchaseDate = billPatch.purchaseDate ?? existing.purchaseDate;
  // The expiry always follows the purchase date: recompute when either changes.
  const ownWarranty = warranty || billPatch.purchaseDate ? warrantyUpdate(existing, purchaseDate, warranty) : null;

  let updated;
  try {
    updated = await runAtomic(async ({ session, onRollback }) => {
      const before = await Purchase.findOneAndUpdate(
        { _id: id, status: PURCHASE_STATUSES.PURCHASED },
        mergeUpdate({ $set: { ...billSet, ...lineSet } }, ownWarranty),
        { returnDocument: 'before', runValidators: true, session }
      ).lean();
      if (!before) throw ApiError.conflict('Cancelled purchases cannot be edited');
      onRollback(() => Purchase.replaceOne({ _id: id }, before));

      // The rest of the bill gets the same invoice number, date, payment and notes
      for (const sibling of siblings) {
        const cancelled = sibling.status === PURCHASE_STATUSES.CANCELLED;
        // A cancelled line keeps its "Cancelled" payment status
        const siblingSet = Object.fromEntries(
          Object.entries(billSet).filter(([key]) => !(cancelled && key.startsWith('payment.')))
        );
        const siblingWarranty = billPatch.purchaseDate ? warrantyUpdate(sibling, purchaseDate, null) : null;
        const previous = await Purchase.findOneAndUpdate(
          { _id: sibling._id },
          mergeUpdate({ $set: siblingSet }, siblingWarranty),
          { returnDocument: 'before', runValidators: true, session }
        ).lean();
        if (previous) onRollback(() => Purchase.replaceOne({ _id: sibling._id }, previous));
      }
      return true;
    });
  } catch (err) {
    if (err?.code === 11000) throw duplicateInvoice(); // lost a race with another edit
    throw err;
  }
  if (!updated) throw ApiError.conflict('Cancelled purchases cannot be edited');

  logger.info(
    {
      purchaseId: id,
      adminId: admin.id,
      fields: [...Object.keys(billSet), ...Object.keys(lineSet), ...(ownWarranty ? ['warranty'] : [])],
      billLinesUpdated: siblings.length,
    },
    'Purchase updated'
  );
  return getPurchaseForAdmin(id);
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

    // The coupon used on this bill can be used again once the whole bill is cancelled
    const openLines = purchase.order?.id
      ? await Purchase.countDocuments({ 'order.id': purchase.order.id, status: PURCHASE_STATUSES.PURCHASED }).session(session)
      : 0;
    if (openLines === 0) await restoreCouponOfPurchase(purchase, ctx);

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

/**
 * All products on the same bill as `purchase` (itself included), in bill order, for the
 * invoice and the "other items on this bill" list.
 */
const billItemsOf = async (purchase, audience) => {
  if (!(purchase.order?.id && purchase.order.lineCount > 1)) return [serializePurchase(purchase, { audience })];
  const lines = await Purchase.find({ 'order.id': purchase.order.id, customerId: purchase.customerId._id ?? purchase.customerId })
    .sort({ 'order.lineNo': 1 })
    .lean();
  return lines.map((line) => serializePurchase(line, { audience }));
};

export const getPurchaseForAdmin = async (id) => {
  const purchase = await findPurchaseForAdmin(id);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  return { ...serializePurchase(purchase), billItems: await billItemsOf(purchase, 'admin') };
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
  return { ...serializePurchase(purchase, { audience: 'customer' }), billItems: await billItemsOf(purchase, 'customer') };
};
