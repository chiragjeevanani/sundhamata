import mongoose from 'mongoose';

export const OTP_PURPOSES = Object.freeze({ LOGIN: 'login', REGISTER: 'register' });

// One active OTP challenge per mobile. Stored in MongoDB (not memory) so limits
// survive restarts and work across multiple API instances.
const otpChallengeSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, unique: true },
    purpose: { type: String, enum: Object.values(OTP_PURPOSES), required: true },
    // HMAC of the code — the plain OTP is never stored.
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    // Rolling one-hour window for send limits.
    windowStartedAt: { type: Date, required: true },
    sendCount: { type: Number, default: 1 },
    // Pending self-registration details; a Customer is only created after OTP verification.
    registration: {
      name: String,
      interest: String,
      budget: Number,
    },
    // MongoDB TTL cleanup once both the code and the send window have lapsed.
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

otpChallengeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge = mongoose.model('OtpChallenge', otpChallengeSchema);
