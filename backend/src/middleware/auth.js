import { Admin, Customer } from '../models/index.js';
import { hasPermission } from '../config/permissions.js';
import { TOKEN_AUDIENCE, verifyToken } from '../services/token.service.js';
import { ApiError } from '../utils/ApiError.js';
import { isObjectId } from '../utils/query.js';

const extractBearerToken = (req) => {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw ApiError.unauthorized('Authentication required');
  }
  return token;
};

// JWT errors (expired / malformed / wrong audience) are mapped to 401 by the error handler.
const readClaims = (req, audience) => {
  const claims = verifyToken(extractBearerToken(req), audience);
  if (!isObjectId(claims.sub)) throw ApiError.unauthorized('Invalid token');
  return claims;
};

/** Customer-only routes. Admin tokens are rejected (different audience). */
export const requireCustomerAuth = async (req, _res, next) => {
  const claims = readClaims(req, TOKEN_AUDIENCE.CUSTOMER);
  // Loaded on every request so deactivation takes effect immediately.
  const customer = await Customer.findById(claims.sub);
  if (!customer || !customer.isActive) {
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  }
  req.customer = customer;
  next();
};

/** Admin panel routes. Customer tokens are rejected (different audience). */
export const requireAdminAuth = async (req, _res, next) => {
  const claims = readClaims(req, TOKEN_AUDIENCE.ADMIN);
  const admin = await Admin.findById(claims.sub);
  if (!admin || !admin.isActive) {
    throw ApiError.unauthorized('Your session is no longer valid. Please sign in again.');
  }
  req.admin = admin;
  next();
};

/** Centralized role check — see config/permissions.js. Use after requireAdminAuth. */
export const requirePermission = (permission) => (req, _res, next) => {
  if (!req.admin || !hasPermission(req.admin.role, permission)) {
    throw ApiError.forbidden();
  }
  next();
};
