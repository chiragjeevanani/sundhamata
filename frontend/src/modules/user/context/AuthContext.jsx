import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../../../services/authService';

const AuthContext = createContext(null);

// setTimeout cannot schedule further than ~24.8 days
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(() => authService.getCurrentSession());
  const [isLoading, setIsLoading] = useState(false);

  const user = session?.user ?? null;
  const token = session?.token ?? null;

  // Session ended elsewhere (logout, expiry, or a 401 from the API) → back to signed-out state
  useEffect(() => authService.onSessionEnded(() => setSession(null)), []);

  // Validate a restored session and pick up the latest profile (e.g. loyalty balance)
  useEffect(() => {
    if (!authService.getCurrentSession()) return;
    authService
      .refreshCurrentUser()
      .then((fresh) => setSession((prev) => (prev ? { ...prev, user: fresh } : prev)))
      .catch(() => {
        // a 401 already cleared the session via onSessionEnded; network errors keep the cached profile
      });
  }, []);

  // Sign out automatically when the token expires
  useEffect(() => {
    if (!session?.expiresAt) return undefined;
    const timer = setTimeout(
      () => authService.logout('expired'),
      Math.min(Math.max(session.expiresAt - Date.now(), 0), MAX_TIMEOUT_MS)
    );
    return () => clearTimeout(timer);
  }, [session?.expiresAt]);

  const checkCustomer = (mobile) => authService.checkCustomer(mobile);
  const sendOtp = (mobile) => authService.sendOtp(mobile);
  const resendOtp = (mobile) => authService.resendOtp(mobile);
  const registerCustomer = (data) => authService.registerCustomer(data);

  const loginWithOtp = async (phoneNumber, otp) => {
    setIsLoading(true);
    try {
      const newSession = await authService.verifyOtp(phoneNumber, otp);
      setSession(newSession);
      return newSession;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshUser = useCallback(async () => {
    const fresh = await authService.refreshCurrentUser();
    setSession((prev) => (prev ? { ...prev, user: fresh } : prev));
    return fresh;
  }, []);

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        checkCustomer,
        sendOtp,
        resendOtp,
        registerCustomer,
        loginWithOtp,
        refreshUser,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
