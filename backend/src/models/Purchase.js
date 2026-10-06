import mongoose from 'mongoose';

// Case-insensitive comparison for invoice numbers (matches the invoiceNumber_ci index).
export const INVOICE_COLLATION = Object.freeze({ locale: 'en', strength: 2 });
export const MAX_WARRANTY_MONTHS = 120;

export const PURCHASE_CATEGORIES = Object.freeze(['phones', 'accessories', 'service']);
export const PURCHASE_STATUSES = Object.freeze({ PURCHASED: 'Purchased', CANCELLED: 'Cancelled' });
// "Finance": bought on a loan (Bajaj Finserv, HDB …) with the details in payment.finance.
// "EMI" is kept for purchases recorded before finance details existed.
export const PAYMENT_METHODS = Object.freeze(['UPI', 'Cash', 'Card', 'Finance', 'Credit Card', 'Debit Card', 'EMI', 'Other']);
// "Cancelled" is only ever set by the cancel workflow, never through a normal update.
export const PAYMENT_STATUSES = Object.freeze(['Paid', 'Pending', 'Partially Paid', 'Cancelled']);

const moneyField = { type: Number, required: true, min: 0 };

// Consumer-finance details when the bill is paid through a lender (whole bill, same on every line)
const financeSchema = new mongoose.Schema(
  {
    company: { type: String, required: true, trim: true, maxlength: 60 },
    downPayment: { type: Number, required: true, min: 0 },
    // Bill total minus the down payment (what the lender pays the store)
    loanAmount: { type: Number, required: true, min: 0 },
    emiAmount: { type: Number, required: true, min: 0 },
    tenureMonths: { type: Number, required: true, min: 1, max: 60 },
    // First EMI (calendar date at 00:00 UTC); later EMIs fall on the same day each month
    firstEmiDate: { type: Date, required: true },
    loanNumber: { type: String, trim: true, maxlength: 40, default: null },
  },
  { _id: false }
);

const purchaseSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    // Entered by the store exactly as printed on their bill (any format). One bill (invoice)
    // may have several products: each product is its own Purchase ("line") sharing the
    // invoice number and `order.id`. Unique per bill, ignoring case.
    invoiceNumber: { type: String, required: true, trim: true, maxlength: 50 },
    // The bill this line belongs to. Purchases recorded before multi-product bills have no
    // `order` and are a one-line bill on their own (see orderKeyOf in purchase.service.js).
    order: {
      id: { type: mongoose.Schema.Types.ObjectId },
      lineNo: { type: Number, min: 1 },
      lineCount: { type: Number, min: 1 },
    },
    category: { type: String, enum: PURCHASE_CATEGORIES, default: 'phones' },

    product: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      brand: { type: String, trim: true, maxlength: 40, default: null },
      model: { type: String, trim: true, maxlength: 80, default: null },
      variant: { type: String, trim: true, maxlength: 80, default: null },
      color: { type: String, trim: true, maxlength: 40, default: null },
      // HSN / SAC code for the tax invoice, entered by the store (none = not printed)
      hsn: { type: String, match: /^(\d{4}|\d{6}|\d{8})$/, default: null },
      imei: { type: String, match: /^\d{15}$/, default: null },
      serialNumber: { type: String, trim: true, uppercase: true, maxlength: 30, default: null },
      quantity: { type: Number, min: 1, default: 1 },
    },

    purchaseDate: { type: Date, required: true },

    payment: {
      method: { type: String, enum: PAYMENT_METHODS, required: true },
      status: { type: String, enum: PAYMENT_STATUSES, required: true },
      finance: { type: financeSchema, default: null },
    },

    pricing: {
      purchaseAmount: moneyField,
      discount: { ...moneyField, default: 0 },
      // Coupon discount (after the store discount, before loyalty points)
      couponDiscount: { ...moneyField, default: 0 },
      // Rupee value of loyalty points redeemed on this bill (after the discount and coupon)
      loyaltyDiscount: { ...moneyField, default: 0 },
      finalAmount: moneyField,
      // GST-inclusive breakdown frozen at billing time.
      taxRatePercent: { type: Number, min: 0, max: 100, default: 18 },
      taxAmount: { ...moneyField, default: 0 },
      baseAmount: { ...moneyField, default: 0 },
    },

    loyalty: {
      // Always calculated server-side from StoreSettings at creation time.
      pointsEarned: { type: Number, default: 0, min: 0 },
      // Points spent on this bill, and the ₹ value per point applied at billing time
      pointsRedeemed: { type: Number, default: 0, min: 0 },
      rupeeValuePerPoint: { type: Number, default: null },
      // Redeemed points given back on cancellation
      pointsRefunded: { type: Number, default: 0, min: 0 },
      pointsPerHundredRupees: { type: Number, default: null },
      pointsReversed: { type: Number, default: 0, min: 0 },
      // Points that could not be reversed on cancellation because the customer
      // had already spent them (balance can never go negative).
      reversalShortfall: { type: Number, default: 0, min: 0 },
    },

    warranty: {
      months: { type: Number, min: 1, default: null },
      type: { type: String, trim: true, default: null },
      validUntil: { type: Date, default: null },
      coverage: { type: String, trim: true, default: null },
    },

    notes: { type: String, trim: true, maxlength: 500, default: null },

    // Product photo (GridFS "productImages"); served publicly under the random `key`.
    productImage: {
      key: { type: String },
      fileId: { type: mongoose.Schema.Types.ObjectId },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    },

    // Coupon redeemed on this bill (given back if the purchase is cancelled)
    coupon: {
      couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
      code: { type: String },
    },

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

// One invoice number per bill: lines of the same bill share it (different lineNo).
// Replaces the older single-field index "invoiceNumber_ci" (dropped by migrations.js).
purchaseSchema.index(
  { invoiceNumber: 1, 'order.lineNo': 1 },
  { unique: true, name: 'invoiceNumber_line_ci', collation: INVOICE_COLLATION }
);
purchaseSchema.index({ 'order.id': 1 }, { sparse: true });
purchaseSchema.index({ customerId: 1, purchaseDate: -1 });
purchaseSchema.index({ purchaseDate: -1 });
purchaseSchema.index({ status: 1, purchaseDate: -1 });
purchaseSchema.index({ 'product.imei': 1 }, { sparse: true });
purchaseSchema.index({ 'productImage.key': 1 }, { sparse: true });

export const Purchase = mongoose.model('Purchase', purchaseSchema);
