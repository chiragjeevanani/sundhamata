import mongoose from 'mongoose';

export const INQUIRY_CATEGORIES = Object.freeze(['mobile', 'accessories', 'service']);
export const INQUIRY_STATUSES = Object.freeze(['new', 'contacted', 'closed']);
// Admin → Leads shows these as "Open"; "closed" as "Closed"
export const OPEN_STATUSES = Object.freeze(['new', 'contacted']);
// Quick picks for "Additional requirements" on a mobile inquiry
export const MOBILE_FEATURES = Object.freeze(['Camera', 'Battery', 'Gaming', 'Display', '5G', 'Processor', 'Fast Charging']);
// Accessories inquiry: which kind of device the accessory is for
export const ACCESSORY_TYPES = Object.freeze(['mobile', 'computer', 'laptop', 'other']);
// Service inquiry: the device to repair, and how the customer wants it serviced
export const SERVICE_DEVICES = Object.freeze(['mobile', 'computer']);
export const SERVICE_PREFERENCES = Object.freeze(['visit_store', 'pickup_drop', 'technician_visit']);

// Sent by a customer from the app (Profile → Make an Inquiry); the staff follow up on Admin → Inquiries.
const inquirySchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, immutable: true },
    category: { type: String, enum: INQUIRY_CATEGORIES, required: true },
    // ₹; null = not given
    budget: { type: Number, min: 0, default: null },
    // Reason for the inquiry; for a mobile inquiry, the additional requirements (optional)
    message: { type: String, trim: true, default: null },
    // Mobile inquiries only: answers to the step-by-step questions
    mobile: {
      type: new mongoose.Schema(
        {
          brand: { type: String, trim: true, required: true },
          // "8GB RAM + 128GB ROM"
          ramRom: { type: String, trim: true, required: true },
          features: { type: [{ type: String, enum: MOBILE_FEATURES }], default: [] },
        },
        { _id: false }
      ),
      default: null,
    },
    // Accessories inquiries only: answers to the step-by-step questions
    accessories: {
      type: new mongoose.Schema(
        {
          type: { type: String, enum: ACCESSORY_TYPES, required: true },
          // "Earbuds / TWS", or what the customer typed for Other
          item: { type: String, trim: true, required: true },
          brandPreference: { type: String, trim: true, default: null },
          // Brand & model of the phone / laptop / computer it is for
          device: { type: String, trim: true, default: null },
          quantity: { type: Number, min: 1, default: 1 },
        },
        { _id: false }
      ),
      default: null,
    },
    // Service inquiries only: answers to the step-by-step questions
    service: {
      type: new mongoose.Schema(
        {
          device: { type: String, enum: SERVICE_DEVICES, required: true },
          brandModel: { type: String, trim: true, required: true },
          // "Screen / Display broken", or what the customer typed for Other
          problem: { type: String, trim: true, required: true },
          details: { type: String, trim: true, default: null },
          preference: { type: String, enum: SERVICE_PREFERENCES, required: true },
        },
        { _id: false }
      ),
      default: null,
    },
    // Optional photo of the problem (service inquiries), GridFS "inquiryPhotos"; see services/inquiryPhoto.service.js
    photo: {
      key: { type: String },
      fileId: { type: mongoose.Schema.Types.ObjectId },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date },
    },

    // Lead serial number, shown as "SM-001" (see formatLeadCode). Given on creation; older leads are
    // numbered by createdAt in config/migrations.js
    leadNumber: { type: Number, min: 1, immutable: true },

    status: { type: String, enum: INQUIRY_STATUSES, default: 'new' },
    // Staff note, e.g. "Called, will visit on Sunday"
    adminNote: { type: String, trim: true, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

inquirySchema.index({ status: 1, createdAt: -1 });
inquirySchema.index({ customerId: 1, createdAt: -1 });
inquirySchema.index({ 'photo.key': 1 }, { sparse: true });
inquirySchema.index({ leadNumber: 1 }, { unique: true, sparse: true });

export const LEAD_SEQUENCE = 'leadNumber';

/** 1 → "SM-001", 1234 → "SM-1234" */
export const formatLeadCode = (n) => (n ? `SM-${String(n).padStart(3, '0')}` : null);

/** "SM-004", "sm 4", "sm004", "#4" → 4; anything else → null */
export const parseLeadCode = (text) => {
  const m = /^\s*(?:sm[\s-]*|#)(\d{1,9})\s*$/i.exec(text ?? '');
  return m ? Number(m[1]) : null;
};

export const Inquiry = mongoose.model('Inquiry', inquirySchema);
