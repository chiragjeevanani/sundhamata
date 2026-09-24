import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Smartphone,
  Headphones,
  Wrench,
  Lock,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { useAuth } from '../context/AuthContext';
import { maskPhone, formatPhone } from '../../../utils/formatters';

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, checkCustomer, sendOtp, resendOtp, registerCustomer, loginWithOtp } =
    useAuth();

  const destination = location.state?.from?.pathname || '/home';

  // If already authenticated, redirect immediately
  useEffect(() => {
    if (isAuthenticated) {
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, navigate, destination]);

  // Step state: 'mobile' | 'register' | 'otp' | 'success'
  const [step, setStep] = useState('mobile');
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = backward

  // Form states
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [interest, setInterest] = useState(''); // 'Mobile' | 'Accessories' | 'Service'
  const [budget, setBudget] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);

  // Flow meta
  const [isNewUser, setIsNewUser] = useState(false);
  const [existingUserName, setExistingUserName] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');

  // UI status
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // OTP Timer
  const [timer, setTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);
  const otpRefs = useRef([]);

  // Timer countdown on OTP step
  useEffect(() => {
    let interval = null;
    if (step === 'otp' && timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    } else if (timer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [step, timer]);

  // Auto-focus first OTP box when entering OTP step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        otpRefs.current[0]?.focus();
      }, 120);
    }
  }, [step]);

  // STEP 1: Handle Mobile Submit
  const handleMobileSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    setFieldErrors({});

    const clean = mobile.replace(/\D/g, '');
    if (!clean) {
      setError('Please enter your mobile number');
      return;
    }
    if (clean.length !== 10) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    setLoadingText('Checking your account...');

    try {
      const res = await checkCustomer(clean);

      if (res.isRegistered) {
        // CASE 1: Existing Customer -> Send OTP -> OTP screen
        setIsNewUser(false);
        setExistingUserName(res.user?.name || '');
        await sendOtp(clean);
        setTimer(30);
        setCanResend(false);
        setOtp(['', '', '', '', '', '']);
        setDirection(1);
        setStep('otp');
      } else {
        // CASE 2: New Customer -> Small Registration Form
        setIsNewUser(true);
        setDirection(1);
        setStep('register');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // STEP 2: Handle Registration Submit (New Customers)
  const handleRegisterSubmit = async (e) => {
    e?.preventDefault();
    setError('');
    const errors = {};

    const cleanName = name.trim();
    if (!cleanName) {
      errors.name = 'Please enter your name';
    } else if (cleanName.length < 2) {
      errors.name = 'Please enter a valid full name';
    }

    if (!interest) {
      errors.interest = "Please select what you're interested in";
    }

    if (budget && (isNaN(Number(budget)) || Number(budget) < 0)) {
      errors.budget = 'Please enter a valid positive budget';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setLoading(true);
    setLoadingText('Creating your account...');

    try {
      await registerCustomer({
        name: cleanName,
        mobile,
        interest,
        budget: budget ? Number(budget) : null,
      });

      setTimer(30);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      setDirection(1);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Failed to initialize registration.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // STEP 3: OTP Input Handling
  const handleOtpChange = (index, value) => {
    const cleaned = value.replace(/\D/g, '');
    if (!cleaned && value !== '') return;

    const newOtp = [...otp];

    // Handle fast typing or pasting multiple digits into single input
    if (cleaned.length > 1) {
      const chars = cleaned.slice(0, 6).split('');
      chars.forEach((c, i) => {
        newOtp[i] = c;
      });
      setOtp(newOtp);
      const nextIndex = Math.min(chars.length, 5);
      otpRefs.current[nextIndex]?.focus();
      return;
    }

    newOtp[index] = cleaned;
    setOtp(newOtp);

    // Auto advance
    if (cleaned && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newOtp = [...otp];
    pasted.split('').forEach((c, i) => {
      newOtp[i] = c;
    });
    setOtp(newOtp);

    const targetIdx = Math.min(pasted.length, 5);
    otpRefs.current[targetIdx]?.focus();
  };

  // STEP 4: Verify OTP Submission
  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    setError('');

    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit verification code.');
      return;
    }

    setLoading(true);
    setLoadingText('Verifying code...');

    try {
      const session = await loginWithOtp(mobile, code);

      const customerName = isNewUser
        ? name.trim()
        : session?.user?.name || existingUserName || 'Customer';

      const greeting = isNewUser
        ? `Welcome to Sundhamata Mobile, ${customerName.split(' ')[0]}!`
        : `Welcome back, ${customerName.split(' ')[0]}!`;

      setWelcomeMessage(greeting);
      setStep('success');

      // Short, pleasant success transition before redirect
      setTimeout(() => {
        navigate(destination, { replace: true });
      }, 750);
    } catch (err) {
      setError(err.message || 'Incorrect OTP. Please check the code and try again.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // Handle OTP Resend
  const handleResendOtp = async () => {
    if (!canResend) return;
    setError('');
    setLoading(true);
    setLoadingText('Resending code...');

    try {
      await resendOtp(mobile);
      setTimer(30);
      setCanResend(false);
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message || 'Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  // Back Navigation Behavior
  const handleGoBack = () => {
    setError('');
    setFieldErrors({});

    if (step === 'register') {
      // Back to Mobile Number screen (preserves mobile number)
      setDirection(-1);
      setStep('mobile');
    } else if (step === 'otp') {
      if (isNewUser) {
        // Return to Registration Form (preserves entered details!)
        setDirection(-1);
        setStep('register');
      } else {
        // Return to Mobile Number Screen
        setDirection(-1);
        setStep('mobile');
      }
    }
  };

  // Framer Motion Animation Variants
  const slideVariants = {
    enter: (dir) => ({
      x: dir > 0 ? 24 : -24,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] },
    },
    exit: (dir) => ({
      x: dir > 0 ? -24 : 24,
      opacity: 0,
      transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] },
    }),
  };

  // Selectable Interests Options
  const interestOptions = [
    { id: 'Mobile', label: 'Mobile', icon: Smartphone },
    { id: 'Accessories', label: 'Accessories', icon: Headphones },
    { id: 'Service', label: 'Service', icon: Wrench },
  ];

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 bg-[#F8F9FA]">
      {/* Centered Top Brand Logo */}
      <div className="flex flex-col items-center text-center pt-2 sm:pt-4">
        <BrandLogo size="md" showTagline={true} />
      </div>

      {/* Main Authentication Flow Container */}
      <div className="flex-1 flex flex-col justify-center my-4 max-w-sm mx-auto w-full">
        <AnimatePresence mode="wait" custom={direction}>
          {/* ======================================================== */}
          {/* STEP 1: MOBILE NUMBER ENTRY SCREEN                       */}
          {/* ======================================================== */}
          {step === 'mobile' && (
            <motion.div
              key="step-mobile"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              <div className="space-y-1 text-center sm:text-left">
                <h2 className="text-xl sm:text-2xl font-black text-[#0F2042] tracking-tight">
                  Welcome to Sundhamata Mobile
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Sign in or create your account using your mobile number.
                </p>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleMobileSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="mobile-input"
                    className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
                  >
                    Mobile Number
                  </label>
                  <div className="relative flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-[#0F2042] focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-2xs overflow-hidden">
                    <div className="px-3 py-2.5 bg-slate-50 border-r border-slate-200 text-slate-700 font-bold text-sm flex items-center gap-1.5 select-none shrink-0">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <input
                      id="mobile-input"
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={10}
                      value={mobile}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setMobile(val);
                        if (error) setError('');
                      }}
                      placeholder="Enter mobile number"
                      className="w-full px-3 py-2.5 text-slate-900 font-bold text-base tracking-wider placeholder:text-slate-300 focus:outline-hidden font-mono"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || mobile.replace(/\D/g, '').length !== 10}
                  className="w-full py-3 px-4 rounded-xl bg-[#0F2042] hover:bg-[#162B56] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-2xs active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{loadingText || 'Checking your account...'}</span>
                    </span>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              {/* Subtle Legal Notice */}
              <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
                By continuing, you agree to our{' '}
                <span className="text-slate-600 font-medium">Terms</span> &{' '}
                <span className="text-slate-600 font-medium">Privacy Policy</span>.
              </p>

              {/* Discreet Testing Shortcut Strip (development builds only) */}
              {import.meta.env.DEV && (
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-center gap-2 text-xs text-slate-500">
                <span className="text-[11px] text-slate-400">Quick Test:</span>
                <button
                  type="button"
                  onClick={() => {
                    setMobile('9876543210');
                    setError('');
                  }}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition-colors cursor-pointer"
                >
                  Existing User
                </button>
                <span className="text-slate-300">•</span>
                <button
                  type="button"
                  onClick={() => {
                    setMobile('9999988888');
                    setError('');
                  }}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 transition-colors cursor-pointer"
                >
                  New Customer
                </button>
              </div>
              )}
            </motion.div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: SMALL REGISTRATION FORM (NEW CUSTOMERS ONLY)     */}
          {/* ======================================================== */}
          {step === 'register' && (
            <motion.div
              key="step-register"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              {/* Back button & Title Header */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1 -ml-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>

                <h2 className="text-xl sm:text-2xl font-black text-[#0F2042] tracking-tight">
                  Let's get you started
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  Just a few details before we verify your number.
                </p>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                {/* Full Name */}
                <div className="space-y-1">
                  <label
                    htmlFor="name-input"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="name-input"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (fieldErrors.name) {
                        setFieldErrors((prev) => ({ ...prev, name: '' }));
                      }
                    }}
                    placeholder="Enter your name"
                    className={`w-full px-3 py-2.5 bg-white rounded-xl border text-slate-900 font-semibold text-sm transition-all shadow-2xs focus:outline-hidden ${
                      fieldErrors.name
                        ? 'border-rose-400 focus:ring-2 focus:ring-rose-100'
                        : 'border-slate-300 focus:border-[#0F2042] focus:ring-2 focus:ring-blue-100'
                    }`}
                    autoFocus
                  />
                  {fieldErrors.name && (
                    <p className="text-[11px] text-rose-600 font-medium">
                      {fieldErrors.name}
                    </p>
                  )}
                </div>

                {/* Pre-filled Mobile Number (Read-only) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-slate-700">
                      Mobile Number
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Pre-filled</span>
                    </span>
                  </div>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100/90 px-3 py-2.5 text-slate-700 font-mono text-sm font-semibold select-none shadow-2xs">
                    <span className="text-slate-400 mr-2 font-medium">🇮🇳 +91</span>
                    <span>
                      {mobile.length === 10
                        ? `${mobile.slice(0, 5)} ${mobile.slice(5)}`
                        : mobile}
                    </span>
                  </div>
                </div>

                {/* Interest Selector (3 compact options with Lucide icons) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Interest <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {interestOptions.map((item) => {
                      const Icon = item.icon;
                      const isSelected = interest === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setInterest(item.id);
                            if (fieldErrors.interest) {
                              setFieldErrors((prev) => ({ ...prev, interest: '' }));
                            }
                          }}
                          className={`py-2.5 px-2 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#0F2042] border-[#0F2042] text-white shadow-xs'
                              : 'bg-white border-slate-200/90 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon
                            className={`w-4.5 h-4.5 ${
                              isSelected ? 'text-[#F59E0B]' : 'text-slate-500'
                            }`}
                          />
                          <span className="text-xs font-bold tracking-tight">
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {fieldErrors.interest && (
                    <p className="text-[11px] text-rose-600 font-medium">
                      {fieldErrors.interest}
                    </p>
                  )}
                </div>

                {/* Budget (Optional) */}
                <div className="space-y-1">
                  <label
                    htmlFor="budget-input"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Budget <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <div className="relative flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-[#0F2042] focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-2xs overflow-hidden">
                    <span className="pl-3 text-slate-400 font-bold text-sm select-none">
                      ₹
                    </span>
                    <input
                      id="budget-input"
                      type="number"
                      inputMode="numeric"
                      value={budget}
                      onChange={(e) => {
                        setBudget(e.target.value);
                        if (fieldErrors.budget) {
                          setFieldErrors((prev) => ({ ...prev, budget: '' }));
                        }
                      }}
                      placeholder="e.g. ₹30,000"
                      className="w-full px-2.5 py-2.5 text-slate-900 font-semibold text-sm placeholder:text-slate-300 focus:outline-hidden font-mono"
                    />
                  </div>
                  {fieldErrors.budget && (
                    <p className="text-[11px] text-rose-600 font-medium">
                      {fieldErrors.budget}
                    </p>
                  )}
                </div>

                {/* Primary CTA */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-[#0F2042] hover:bg-[#162B56] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-2xs active:scale-[0.98] cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{loadingText || 'Creating your account...'}</span>
                    </span>
                  ) : (
                    <>
                      <span>Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: UNIFIED OTP VERIFICATION SCREEN                  */}
          {/* ======================================================== */}
          {step === 'otp' && (
            <motion.div
              key="step-otp"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              {/* Back Button & Title Header */}
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-1 -ml-1 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{isNewUser ? 'Back to details' : 'Change number'}</span>
                </button>

                <h2 className="text-xl sm:text-2xl font-black text-[#0F2042] tracking-tight">
                  Verify your mobile number
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed font-normal">
                  We've sent a 6-digit OTP to{' '}
                  <span className="font-bold text-slate-800 font-mono">
                    {maskPhone(mobile)}
                  </span>
                </p>
              </div>

              {error && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {/* 6 Responsive OTP Boxes */}
                <div className="space-y-2">
                  <div className="flex justify-between gap-1.5 sm:gap-2">
                    {otp.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={(el) => (otpRefs.current[idx] = el)}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        onPaste={handleOtpPaste}
                        className={`w-10 sm:w-11 h-12 sm:h-13 text-center text-lg sm:text-xl font-bold font-mono bg-white rounded-xl border transition-all shadow-2xs tabular-nums focus:outline-hidden ${
                          digit
                            ? 'border-[#0F2042] text-[#0F2042] ring-1 ring-[#0F2042]'
                            : 'border-slate-300 text-slate-800 focus:border-[#0F2042] focus:ring-2 focus:ring-blue-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.join('').length !== 6}
                  className="w-full py-3 px-4 rounded-xl bg-[#0F2042] hover:bg-[#162B56] disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-2xs active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{loadingText || 'Verifying code...'}</span>
                    </span>
                  ) : (
                    <>
                      <span>Verify & Continue</span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-200" />
                    </>
                  )}
                </button>
              </form>

              {/* OTP Resend Timer Controls */}
              <div className="text-center pt-1 space-y-1">
                <p className="text-xs text-slate-500">
                  {canResend ? (
                    <span>
                      Didn't receive the OTP?{' '}
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        className="font-bold text-blue-700 hover:text-blue-900 underline underline-offset-2 cursor-pointer"
                      >
                        Resend OTP
                      </button>
                    </span>
                  ) : (
                    <span className="text-slate-400 font-medium">
                      Resend OTP in{' '}
                      <span className="font-mono font-bold text-slate-600">
                        {timer}s
                      </span>
                    </span>
                  )}
                </p>

                {/* Change Mobile Number Link */}
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setDirection(-1);
                      setStep('mobile');
                      setError('');
                    }}
                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    Change mobile number
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ======================================================== */}
          {/* STEP 4: SUBTLE SUCCESS GREETING TRANSITION               */}
          {/* ======================================================== */}
          {step === 'success' && (
            <motion.div
              key="step-success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
              className="py-10 flex flex-col items-center justify-center text-center space-y-3"
            >
              <div className="w-13 h-13 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-6.5 h-6.5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-black text-[#0F2042] tracking-tight">
                  {welcomeMessage}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Taking you to your account...
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Trust & Retail Security Badge */}
      <div className="pt-3 border-t border-slate-200/60 flex items-center justify-center gap-1.5 text-slate-400 text-[11px]">
        <Lock className="w-3 h-3 text-slate-400" />
        <span>Official Sundhamata Mobile Customer Access</span>
      </div>
    </div>
  );
};
