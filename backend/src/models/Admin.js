import mongoose from 'mongoose';
import { ROLES } from '../config/permissions.js';

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    mobile: { type: String, unique: true, sparse: true, match: /^\+91[6-9]\d{9}$/ },
    // Never returned by default; login explicitly selects it.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.MANAGER },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Admin = mongoose.model('Admin', adminSchema);
