import mongoose from 'mongoose';

export const PURCHASE_CATEGORIES = Object.freeze(['phones', 'accessories', 'service']);
export const PURCHASE_STATUSES = Object.freeze({ PURCHASED: 'Purchased', CANCELLED: 'Cancelled' });
export const PAYMENT_METHODS = Object.freeze(['UPI', 'Cash', 'Card', 'Credit Card', 'Debit Card', 'EMI', 'Other']);
// "Cancelled" is only ever set by the cancel workflow, never through a normal update.
export const PAYMENT_STATUSES = Object.freeze(['Paid', 'Pending', 'Partially Paid', 'Cancelled']);

const moneyField = { type: Number, required: true, min: 0 };

const purchaseSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    invoiceNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
    category: { type: String, enum: PURCHASE_CATEGORIES, default: 'phones' },

    product: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      brand: { type: String, trim: true, maxlength: 40, default: null },
      model: { type: String, trim: true, maxlength: 80, default: null },
      variant: { type: String, trim: true, maxlength: 80, default: null },
      color: { type: String, trim: true, maxlength: 40, default: null },
      imei: { type: String, match: /^\d{15}$/, default: null },
      serialNumber: { type: String, trim: true, uppercase: true, maxlength: 30, default: null },
      quantity: { type: Number, min: 1, default: 1 },
    },

    purchaseDate: { type: Date, required: true },

    payment: {
      method: { type: String, enum: PAYMENT_METHODS, required: true },
      status: { type: String, enum: PAYMENT_STATUSES, required: true },
    },

    pricing: {
      purchaseAmount: moneyField,
      discount: { ...moneyField, default: 0 },
      finalAmount: moneyField,
      // GST-inclusive breakdown frozen at billing time.
      taxRatePercent: { type: Number, min: 0, max: 100, default: 18 },
      taxAmount: { ...moneyField, default: 0 },
      baseAmount: { ...moneyField, default: 0 },
    },

    loyalty: {
      // Always calculated server-side from StoreSettings at creation time.
      pointsEarned: { type: Number, default: 0, min: 0 },
      pointsPerHundredRupees: { type: Number, default: null },
      pointsReversed: { type: Number, default: 0, min: 0 },
      // Points that could not be reversed on cancellation because the customer
      // had already spent them (balance can never go negative).
      reversalShortfall: { type: Number, default: 0, min: 0 },
    },

    warranty: {
      type: { type: String, trim: true, default: null },
      validUntil: { type: Date, default: null },
      coverage: { type: String, trim: true, default: null },
    },

    notes: { type: String, trim: true, maxlength: 500, default: null },

    // Bill uploaded by the store (PDF / image / Word / Excel); the file itself is in GridFS.
    bill: {
      fileId: { type: mongoose.Schema.Types.ObjectId },
      filename: { type: String },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    },
    status: {
      type: String,
      enum: Object.values(PURCHASE_STATUSES),
      default: PURCHASE_STATUSES.PURCHASED,
    },
    cancelReason: { type: String, trim: true, maxlength: 250, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  },
  { timestamps: true }
);

purchaseSchema.index({ customerId: 1, purchaseDate: -1 });
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ status: 1, purchaseDate: -1 });
purchaseSchema.index({ 'product.imei': 1 }, { sparse: true });

export const Purchase = mongoose.model('Purchase', purchaseSchema);
