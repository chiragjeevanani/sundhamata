import mongoose from 'mongoose';

// Atomic sequences for human-readable numbers (invoice numbers, customer codes).
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export const Counter = mongoose.model('Counter', counterSchema);

/**
 * @param {string} name
 * @param {import('mongoose').ClientSession|null} [session]
 */
export const nextSequence = async (name, session = null) => {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', session }
  );
  return doc.seq;
};
