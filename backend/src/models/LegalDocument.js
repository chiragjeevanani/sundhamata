import mongoose from 'mongoose';

// The public /terms and /privacy pages, as edited in Admin → Terms & Privacy.
// No document = the app shows its built-in default text.
export const LEGAL_KEYS = Object.freeze(['terms', 'privacy']);
export const MAX_LEGAL_LENGTH = 50_000;

const legalDocumentSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: LEGAL_KEYS, immutable: true },
    // Plain text: "## " starts a heading, "- " a bullet, "[contact]" shows the store's contact details
    content: { type: String, required: true, maxlength: MAX_LEGAL_LENGTH },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

export const LegalDocument = mongoose.model('LegalDocument', legalDocumentSchema);
