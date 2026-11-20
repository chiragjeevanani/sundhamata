import mongoose from 'mongoose';

export const STARTUP_AD_KEY = 'startup';
export const MAX_SKIP_AFTER_SECONDS = 60;
export const MAX_AUTO_CLOSE_SECONDS = 300;

// Full-screen advertisement poster shown when the customer app opens (Admin → Advertisement).
// Singleton document (key = "startup").
const startupAdSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: STARTUP_AD_KEY, immutable: true },
    enabled: { type: Boolean, default: false },
    // The Skip button appears after this many seconds (0 = straight away)
    skipAfterSeconds: { type: Number, min: 0, max: MAX_SKIP_AFTER_SECONDS, default: 5 },
    // Closes by itself after this many seconds; null = stays until the customer taps Skip
    autoCloseSeconds: { type: Number, min: 1, max: MAX_AUTO_CLOSE_SECONDS, default: null },
    // GridFS "adPosters"; served publicly under a random key that changes on every replacement
    poster: {
      key: { type: String },
      fileId: { type: mongoose.Schema.Types.ObjectId },
      contentType: { type: String },
      size: { type: Number },
      uploadedAt: { type: Date },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

startupAdSchema.index({ 'poster.key': 1 }, { sparse: true });

export const StartupAd = mongoose.model('StartupAd', startupAdSchema);
