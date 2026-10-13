import mongoose from 'mongoose';

export const INQUIRY_CATEGORIES = Object.freeze(['mobile', 'accessories', 'service']);
export const INQUIRY_STATUSES = Object.freeze(['new', 'contacted', 'closed']);

// Sent by a customer from the app (Profile → Make an Inquiry); the staff follow up on Admin → Inquiries.
const inquirySchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    category: { type: String, enum: INQUIRY_CATEGORIES, required: true },
    // ₹; null = not given
    budget: { type: Number, min: 0, default: null },
    message: { type: String, trim: true, required: true },

    status: { type: String, enum: INQUIRY_STATUSES, default: 'new' },
    // Staff note, e.g. "Called, will visit on Sunday"
    adminNote: { type: String, trim: true, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

inquirySchema.index({ status: 1, createdAt: -1 });
inquirySchema.index({ customerId: 1, createdAt: -1 });

export const Inquiry = mongoose.model('Inquiry', inquirySchema);
