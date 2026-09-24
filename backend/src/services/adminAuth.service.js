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
