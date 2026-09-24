import mongoose from 'mongoose';

export const LOYALTY_TYPES = Object.freeze({
  EARNED: 'earned',
  REDEEMED: 'redeemed',
  ADJUSTMENT: 'adjustment',
  EXPIRED: 'expired',
});

export const LOYALTY_SOURCES = Object.freeze({
  PURCHASE: 'purchase',
  REDEMPTION: 'redemption',
  ADMIN_ADJUSTMENT: 'admin_adjustment',
  PURCHASE_CANCELLATION: 'purchase_cancellation',
  EXPIRY: 'expiry',
});

// Append-only ledger. The sum of `points` for a customer always equals
// Customer.loyaltyPoints, and `balanceAfter` records the running balance.
const loyaltyTransactionSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    type: { type: String, enum: Object.values(LOYALTY_TYPES), required: true, immutable: true },
    source: { type: String, enum: Object.values(LOYALTY_SOURCES), required: true, immutable: true },
    // Signed: positive = credit, negative = debit. Never zero.
    points: {
      type: Number,
      required: true,
      immutable: true,
      validate: { validator: (v) => Number.isInteger(v) && v !== 0, message: 'points must be a non-zero integer' },
    },
    title: { type: String, required: true, trim: true, maxlength: 80, immutable: true },
    description: { type: String, trim: true, maxlength: 250, default: null, immutable: true },
    reason: { type: String, trim: true, maxlength: 250, default: null, immutable: true },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null, immutable: true },
    balanceAfter: { type: Number, required: true, min: 0, immutable: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

loyaltyTransactionSchema.index({ customerId: 1, createdAt: -1 });
loyaltyTransactionSchema.index({ purchaseId: 1 }, { sparse: true });
loyaltyTransactionSchema.index({ createdAt: -1 });
// A purchase can be rewarded once and reversed once — guards against double processing.
loyaltyTransactionSchema.index(
  { purchaseId: 1, source: 1 },
  { unique: true, partialFilterExpression: { purchaseId: { $type: 'objectId' } } }
);

export const LoyaltyTransaction = mongoose.model('LoyaltyTransaction', loyaltyTransactionSchema);
