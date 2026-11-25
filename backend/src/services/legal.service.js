import { logger } from '../config/logger.js';
import { LEGAL_KEYS, LegalDocument } from '../models/LegalDocument.js';

// Terms & Conditions and Privacy Policy text. content null = not edited yet, so the app
// shows its built-in default wording.

const serialize = (key, doc) => ({
  key,
  content: doc?.content ?? null,
  updatedAt: doc?.updatedAt ?? null,
});

export const getLegalDocument = async (key) => serialize(key, await LegalDocument.findOne({ key }).lean());

export const listLegalDocuments = async () => {
  const docs = await LegalDocument.find({ key: { $in: LEGAL_KEYS } }).lean();
  return LEGAL_KEYS.map((key) => serialize(key, docs.find((d) => d.key === key)));
};

/** content null = go back to the built-in default text */
export const saveLegalDocument = async (key, content, admin) => {
  if (content === null) {
    await LegalDocument.deleteOne({ key });
    logger.info({ adminId: admin?.id, key }, 'Legal page reset to default');
    return serialize(key, null);
  }
  const doc = await LegalDocument.findOneAndUpdate(
    { key },
    { $set: { content, updatedBy: admin?._id ?? null }, $setOnInsert: { key } },
    { upsert: true, returnDocument: 'after', runValidators: true }
  ).lean();
  logger.info({ adminId: admin?.id, key, length: content.length }, 'Legal page updated');
  return serialize(key, doc);
};
