// Sundhamata Mobile - Store Admin Authentication Service
// Email/mobile + password against the Sundhamata API. Session storage is centralized in api/session.js.

import { adminApi, publicApi } from './api/apiClient';
import { adminSession } from './api/session';

export const adminAuthService = {
  /**
   * @param {{identifier: string, password: string}} credentials email or mobile + password
   * @returns {Promise<{token: string, admin: object, expiresAt: number}>}
   */
  async loginAdmin({ identifier, password }) {
    const data = await publicApi.post('/auth/admin/login', { identifier: identifier.trim(), password });
    const session = { token: data.token, expiresAt: Date.parse(data.expiresAt), admin: data.admin };
    adminSession.set(session);
    return session;
  },

  getCurrentSession() {
    return adminSession.get();
  },

  getCurrentAdmin() {
    return adminSession.get()?.admin ?? null;
  },

  isAuthenticated() {
    return Boolean(adminSession.getToken());
  },

  /** Re-validates the token and refreshes the stored profile */
  async refreshCurrentAdmin() {
    const data = await adminApi.get('/admin/me');
    adminSession.update({ admin: data.admin });
    return data.admin;
  },

  /**
   * JWTs are stateless: the server acknowledges logout but cannot revoke the token,
   * so the client always discards it — even if the API call fails.
   */
  async logoutAdmin() {
    try {
      if (adminSession.getToken()) await adminApi.post('/auth/admin/logout');
    } catch {
      // ignore — local sign-out below is what ends the session
    } finally {
      adminSession.clear('logout');
    }
  },

  onSessionEnded(listener) {
    return adminSession.onClear(listener);
  },
};
