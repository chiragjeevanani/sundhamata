import mongoose from 'mongoose';
import { PURCHASE_CATEGORIES } from './Purchase.js';

/** Case/spacing-insensitive key: "Samsung  galaxy S25" and "samsung Galaxy S25" are one product. */
export const productKeyOf = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// Product catalog: filled automatically from recorded purchases (and editable in the admin
// panel) so the counter can pick a product instead of typing its full name every time.
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    nameKey: { type: String, required: true, unique: true },
    category: { type: String, enum: PURCHASE_CATEGORIES, default: 'phones' },
    brand: { type: String, trim: true, maxlength: 40, default: null },
    model: { type: String, trim: true, maxlength: 80, default: null },
    // Variants / colours this product has been sold in (most recent first), offered as choices
    variants: { type: [String], default: [] },
    colors: { type: [String], default: [] },
    // Price and warranty of the latest sale, suggested for the next one
    lastPrice: { type: Number, min: 0, default: null },
    warrantyMonths: { type: Number, min: 0, default: null },
    timesSold: { type: Number, min: 0, default: 0 },
    lastSoldAt: { type: Date, default: null },
    // "purchase" = learned automatically, "admin" = added on the Products page
    source: { type: String, enum: ['purchase', 'admin'], default: 'purchase' },
  },
  { timestamps: true }
);

productSchema.index({ timesSold: -1, lastSoldAt: -1 });
productSchema.index({ name: 1 });

export const Product = mongoose.model('Product', productSchema);
