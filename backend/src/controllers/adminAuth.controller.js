import { changeOwnPassword, loginAdmin, updateOwnProfile } from '../services/adminAuth.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { serializeAdmin } from '../utils/serializers.js';

export const login = async (req, res) => {
  const data = await loginAdmin(req.valid.body);
  sendSuccess(res, { data, message: 'Signed in' });
};

export const me = async (req, res) => {
  sendSuccess(res, { data: { admin: serializeAdmin(req.admin) } });
};

// JWTs are stateless: there is no server-side session to destroy. The client
// must discard its token; it stays valid until it expires (ADMIN_JWT_EXPIRES_IN).
export const logout = async (req, res) => {
  req.log?.info({ adminId: req.admin.id }, 'Admin logout');
  sendSuccess(res, {
    data: { serverSideInvalidation: false },
    message: 'Signed out. Discard the token on the client; it is not revoked server-side.',
  });
};

/** My Account: name, email, mobile */
export const updateMe = async (req, res) => {
  const admin = await updateOwnProfile(req.admin, req.valid.body);
  sendSuccess(res, { data: { admin }, message: 'Account details saved' });
};

/** My Account: new password (signs out other devices; returns a fresh token for this one) */
export const changePassword = async (req, res) => {
  const data = await changeOwnPassword(req.admin, req.valid.body);
  sendSuccess(res, { data, message: 'Password changed' });
};
