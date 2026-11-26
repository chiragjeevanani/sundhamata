import { logger } from './logger.js';
import { Inquiry, Purchase, nextSequence } from '../models/index.js';
import { LEAD_SEQUENCE } from '../models/Inquiry.js';
import { backfillVerifiedCustomers } from '../services/customerVerification.js';

/**
 * One-off schema migrations, run on every start (each step is idempotent).
 * Mongoose creates new indexes itself but never drops old ones.
 */
export const runMigrations = async () => {
  // Multi-product bills: invoice numbers used to be unique per purchase. Lines of one bill
  // now share the number, guarded by "invoiceNumber_line_ci" instead.
  // Any unique index on the invoice number alone (whatever its name, e.g. "invoiceNumber_ci"
  // or the even older "invoiceNumber_1") would block the second product of a bill.
  const indexes = await Purchase.collection.indexes().catch(() => []);
  const legacy = indexes.filter(
    (index) => index.unique && Object.keys(index.key).length === 1 && index.key.invoiceNumber !== undefined
  );
  for (const index of legacy) {
    await Purchase.collection.dropIndex(index.name);
    logger.info({ index: index.name }, 'Migration: dropped one-purchase-per-invoice index (bills can now have several products)');
  }
  await Purchase.createIndexes();

  // Verified customers (blue tick): customers who already qualify get it straight away
  await backfillVerifiedCustomers();

  // Lead serial numbers ("SM-001"): number leads sent before numbering existed, oldest first
  await backfillLeadNumbers();
};

export const backfillLeadNumbers = async () => {
  const unnumbered = await Inquiry.find({ leadNumber: { $exists: false } }, { _id: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
  for (const { _id } of unnumbered) {
    // Straight to the collection: Mongoose drops updates to immutable fields (leadNumber is one)
    await Inquiry.collection.updateOne(
      { _id, leadNumber: { $exists: false } },
      { $set: { leadNumber: await nextSequence(LEAD_SEQUENCE) } }
    );
  }
  if (unnumbered.length) logger.info({ count: unnumbered.length }, 'Migration: numbered existing leads');
};
