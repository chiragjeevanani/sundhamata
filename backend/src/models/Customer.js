import mongoose from 'mongoose';

export const CUSTOMER_INTERESTS = Object.freeze(['Mobile', 'Accessories', 'Service']);
export const CUSTOMER_GENDERS = Object.freeze(['male', 'female', 'other', 'prefer_not_to_say']);

const customerSchema = new mongoose.Schema(
  {
    // Human-friendly reference shown in the admin panel (e.g. "CUS00012").
    customerCode: { type: String, required: true, unique: true, immutable: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // Normalized E.164 Indian mobile, e.g. "+919876543210". See utils/mobile.js.
    mobile: { type: String, required: true, unique: true, match: /^\+91[6-9]\d{9}$/ },
    interest: { type: String, required: true, enum: CUSTOMER_INTERESTS },
    budget: { type: Number, min: 0, default: null },
    email: { type: String, trim: true, lowercase: true, maxlength: 254, default: null },
    address: { type: String, trim: true, maxlength: 250, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
    pincode: { type: String, match: /^\d{6}$/, default: null },
    profileImage: { type: String, trim: true, maxlength: 500, default: null },
    // Calendar dates stored at 00:00 UTC; always read/written as "YYYY-MM-DD".
    dob: { type: Date, default: null },
    anniversaryDate: { type: Date, default: null },
    gender: { type: String, enum: [...CUSTOMER_GENDERS, null], default: null },

    // Cached balance for fast reads. Only ever changed by services/loyalty.service.js,
    // always together with a LoyaltyTransaction (the source of truth).
    loyaltyPoints: { type: Number, default: 0, min: 0, validate: Number.isInteger },

    isActive: { type: Boolean, default: true },
    mobileVerifiedAt: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    registrationSource: { type: String, enum: ['self', 'admin', 'seed'], default: 'self' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

customerSchema.index({ email: 1 }, { sparse: true });
customerSchema.index({ name: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ loyaltyPoints: -1 });

export const Customer = mongoose.model('Customer', customerSchema);
