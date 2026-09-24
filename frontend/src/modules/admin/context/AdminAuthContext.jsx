import { createContext, useContext, useState, useEffect } from 'react';
import { adminAuthService } from '../../../services/adminAuthService';

const AdminAuthContext = createContext(null);

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// Development convenience only: signs in with the seeded dev account (see backend seed).
// import.meta.env.DEV is false in production builds, so these values are not shipped.
const DEV_ADMIN_CREDENTIALS = import.meta.env.DEV
  ? { identifier: 'admin@sundhamatamobile.com', password: 'Admin@123' }
  : null;

export const AdminAuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => adminAuthService.getCurrentSession());
  const [isLoading, setIsLoading] = useState(false);

  const admin = session?.admin ?? null;
  const token = session?.token ?? null;

  // Logout, expiry or a 401 from the API → signed out (AdminLayout redirects to login)
  useEffect(() => adminAuthService.onSessionEnded(() => setSession(null)), []);

  // Validate a restored session against the API
  useEffect(() => {
    if (!adminAuthService.getCurrentSession()) return;
    adminAuthService
      .refreshCurrentAdmin()
      .then((fresh) => setSession((prev) => (prev ? { ...prev, admin: fresh } : prev)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const timer = setTimeout(
      () => adminAuthService.logoutAdmin(),
      Math.min(Math.max(session.expiresAt - Date.now(), 0), MAX_TIMEOUT_MS)
    );
    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  const login = async (credentials) => {
    setIsLoading(true);
    try {
      const newSession = await adminAuthService.loginAdmin(credentials);
      setSession(newSession);
      return newSession;
    } finally {
      setIsLoading(false);
    }
  };

  const quickDemo = async () => {
    if (!DEV_ADMIN_CREDENTIALS) throw new Error('Demo sign-in is only available in development.');
    return login(DEV_ADMIN_CREDENTIALS);
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await adminAuthService.logoutAdmin();
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AdminAuthContext.Provider
      value={{
        admin,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        quickDemo,
        logout,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
};

export const useAdminAuth = () => {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
};
