import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Mail, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { BrandLogo } from '../../user/components/BrandLogo';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../context/ToastContext';

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login, quickDemo } = useAdminAuth();
  const { showSuccess } = useToast();

  const destination = location.state?.from?.pathname || '/admin';

  // If already logged in, redirect
  useEffect(() => {
    if (isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, navigate, destination]);

  // Pre-filled with the seeded development account only in dev builds
  const [identifier, setIdentifier] = useState(import.meta.env.DEV ? 'admin@sundhamatamobile.com' : '');
  const [password, setPassword] = useState(import.meta.env.DEV ? 'Admin@123' : '');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your admin mobile number or email');
      return;
    }
    if (!password.trim()) {
      setError('Please enter your admin password');
      return;
    }

    setLoading(true);
    try {
      await login({ identifier, password });
      showSuccess('Welcome back', 'Store Manager authenticated successfully.');
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid store credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setLoading(true);
    try {
      await quickDemo();
      showSuccess('Welcome back', 'Store Manager demo signed in.');
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message || 'Quick sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-8 bg-[#0F2042] text-slate-100 select-none">
      {/* Top Header */}
      <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
        <BrandLogo size="md" light={true} />
        <span className="text-xs font-bold font-mono uppercase tracking-wider text-brand-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
          Store Management System
        </span>
      </div>

      {/* Main Login Card */}
      <div className="flex-1 flex flex-col justify-center my-8 max-w-sm mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl p-6 sm:p-7 shadow-2xl text-slate-900 border border-slate-100 space-y-5"
        >
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 block">
              Sundhamata Mobile
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-[#0F2042] tracking-tight">
              Admin Portal
            </h1>
            <p className="text-xs text-slate-500 font-normal">
              Sign in with your store staff credentials to record purchases and manage customers.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Email / Mobile */}
            <div className="space-y-1">
              <label
                htmlFor="identifier-input"
                className="block text-xs font-bold text-slate-700"
              >
                Mobile / Email
              </label>
              <div className="relative flex items-center rounded-xl border border-slate-300 focus-within:border-[#0F2042] focus-within:ring-2 focus-within:ring-brand-100 transition-all shadow-2xs overflow-hidden">
                <span className="pl-3 text-slate-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="identifier-input"
                  type="text"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="admin@sundhamatamobile.com"
                  className="w-full px-2.5 py-2.5 text-xs text-slate-900 font-semibold placeholder:text-slate-300 focus:outline-hidden"
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password-input"
                  className="block text-xs font-bold text-slate-700"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() =>
                    alert(
                      import.meta.env.DEV
                        ? 'Development seed password is Admin@123'
                        : 'Please contact your store administrator to reset your password.'
                    )
                  }
                  className="text-[10.5px] font-semibold text-brand-700 hover:text-brand-900 cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative flex items-center rounded-xl border border-slate-300 focus-within:border-[#0F2042] focus-within:ring-2 focus-within:ring-brand-100 transition-all shadow-2xs overflow-hidden">
                <span className="pl-3 text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="password-input"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="••••••••"
                  className="w-full px-2.5 py-2.5 text-xs text-slate-900 font-semibold placeholder:text-slate-300 focus:outline-hidden font-mono"
                />
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 pt-0.5">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 border-slate-300 cursor-pointer"
              />
              <label
                htmlFor="remember"
                className="text-xs text-slate-600 font-medium select-none cursor-pointer"
              >
                Remember this device
              </label>
            </div>

            {/* Sign In CTA */}
            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-[#0F2042] hover:bg-[#162B56] text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] cursor-pointer disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing In...</span>
                </span>
              ) : (
                <>
                  <span>Sign In to Admin</span>
                  <ArrowRight className="w-3.5 h-3.5 text-brand-400" />
                </>
              )}
            </button>
          </form>

          {/* Instant Demo Helper (development builds only) */}
          {import.meta.env.DEV && (
          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={handleQuickDemo}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:text-brand-900 transition-colors py-1.5 px-3 rounded-lg hover:bg-brand-50 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Instant Store Manager Demo Sign In</span>
            </button>
          </div>
          )}
        </motion.div>
      </div>

      {/* Footer Notice */}
      <div className="text-center text-slate-400 text-xs flex items-center justify-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400" />
        <span>Authorized Staff Only • Sundhamata Mobile Retail OS</span>
      </div>
    </div>
  );
};
