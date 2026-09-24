import { loginAdmin } from '../services/adminAuth.service.js';
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
