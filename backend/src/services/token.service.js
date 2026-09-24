import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ISSUER = 'sundhamata-api';

// Distinct audiences make customer and admin tokens mutually unusable:
// verification of one against the other's audience always fails.
export const TOKEN_AUDIENCE = Object.freeze({
  CUSTOMER: 'sundhamata:customer',
  ADMIN: 'sundhamata:admin',
});

const sign = (subject, audience, expiresIn, claims = {}) => {
  const token = jwt.sign({ typ: audience, ...claims }, env.JWT_SECRET, {
    subject: String(subject),
    audience,
    issuer: ISSUER,
    expiresIn,
    algorithm: 'HS256',
  });
  const { exp } = jwt.decode(token);
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
};

export const signCustomerToken = (customer) =>
  sign(customer._id, TOKEN_AUDIENCE.CUSTOMER, env.JWT_EXPIRES_IN);

export const signAdminToken = (admin) =>
  sign(admin._id, TOKEN_AUDIENCE.ADMIN, env.ADMIN_JWT_EXPIRES_IN, { role: admin.role });

/** Throws jsonwebtoken errors (TokenExpiredError, JsonWebTokenError) on failure. */
export const verifyToken = (token, audience) => {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    audience,
    issuer: ISSUER,
    algorithms: ['HS256'],
  });
  if (payload.typ !== audience) {
    throw new jwt.JsonWebTokenError('invalid token type');
  }
  return payload;
};
