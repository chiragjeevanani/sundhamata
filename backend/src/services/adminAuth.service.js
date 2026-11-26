import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Admin } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { normalizeIndianMobile } from '../utils/mobile.js';
import { serializeAdmin } from '../utils/serializers.js';
import { signAdminToken } from './token.service.js';

// Compared against when the admin does not exist, so response time does not
// reveal whether an email/mobile is registered.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

const findByIdentifier = (identifier) => {
  if (identifier.includes('@')) {
    return Admin.findOne({ email: identifier.toLowerCase() }).select('+passwordHash');
  }
  const mobile = normalizeIndianMobile(identifier);
  return mobile ? Admin.findOne({ mobile }).select('+passwordHash') : null;
};

export const loginAdmin = async ({ identifier, password }) => {
  const admin = await findByIdentifier(identifier);
  const passwordMatches = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);

  if (!admin || !passwordMatches) {
    logger.warn({ identifierType: identifier.includes('@') ? 'email' : 'mobile' }, 'Admin login failed');
    throw ApiError.unauthorized('Invalid email/mobile or password');
  }
  if (!admin.isActive) {
    throw ApiError.forbidden('This admin account has been deactivated.');
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  const { token, expiresAt } = signAdminToken(admin);
  logger.info({ adminId: admin.id, role: admin.role }, 'Admin login');
  return { token, expiresAt, admin: serializeAdmin(admin) };
};

// ---- My Account: an admin changes their own details --------------------------

const checkCurrentPassword = async (adminId, currentPassword) => {
  const withHash = await Admin.findById(adminId).select('+passwordHash');
  const ok = Boolean(currentPassword) && (await bcrypt.compare(currentPassword, withHash?.passwordHash ?? DUMMY_HASH));
  if (!ok) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'currentPassword', message: 'Current password is not correct' }]);
  }
  return withHash;
};

/**
 * Name, email and mobile of the signed-in admin. Changing the email or mobile (used to sign in)
 * needs the current password.
 * @param {{ name?, email?, mobile? (null = remove), currentPassword? }} patch
 */
export const updateOwnProfile = async (admin, { currentPassword, ...patch }) => {
  const changes = {};
  if (patch.name !== undefined && patch.name !== admin.name) changes.name = patch.name;
  if (patch.email !== undefined && patch.email !== admin.email) changes.email = patch.email;
  if (patch.mobile !== undefined && patch.mobile !== (admin.mobile ?? null)) changes.mobile = patch.mobile;
  if (!Object.keys(changes).length) return serializeAdmin(admin);

  if (changes.email !== undefined || changes.mobile !== undefined) await checkCurrentPassword(admin._id, currentPassword);

  const taken = [];
  if (changes.email && (await Admin.exists({ email: changes.email, _id: { $ne: admin._id } }))) {
    taken.push({ field: 'email', message: 'Another admin already uses this email' });
  }
  if (changes.mobile && (await Admin.exists({ mobile: changes.mobile, _id: { $ne: admin._id } }))) {
    taken.push({ field: 'mobile', message: 'Another admin already uses this mobile number' });
  }
  if (taken.length) throw ApiError.conflict('Already in use', taken);

  // A removed mobile is unset (the index is sparse, so several admins can have none)
  const { mobile, ...rest } = changes;
  const update = {
    ...(Object.keys(rest).length || mobile ? { $set: { ...rest, ...(mobile ? { mobile } : {}) } } : {}),
    ...(mobile === null ? { $unset: { mobile: 1 } } : {}),
  };
  const updated = await Admin.findByIdAndUpdate(admin._id, update, { returnDocument: 'after', runValidators: true });
  logger.info({ adminId: admin.id, fields: Object.keys(changes) }, 'Admin updated own profile');
  return serializeAdmin(updated);
};

/**
 * New password for the signed-in admin. Every other device is signed out; this one gets a fresh token.
 * @returns {{ token, expiresAt, admin }}
 */
export const changeOwnPassword = async (admin, { currentPassword, newPassword }) => {
  const withHash = await checkCurrentPassword(admin._id, currentPassword);
  if (await bcrypt.compare(newPassword, withHash.passwordHash)) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'newPassword', message: 'Choose a password different from the current one' }]);
  }
  withHash.passwordHash = await hashPassword(newPassword);
  withHash.passwordChangedAt = new Date();
  await withHash.save();

  const { token, expiresAt } = signAdminToken(withHash);
  logger.info({ adminId: admin.id }, 'Admin changed own password; other sessions signed out');
  return { token, expiresAt, admin: serializeAdmin(withHash) };
};
