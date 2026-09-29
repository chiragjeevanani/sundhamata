import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Loader2, PartyPopper, UserRoundPen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { describeOffer, offerService } from '../../../services/offerService';
import { formatINR } from '../../../utils/formatters';
import { CouponModal } from './CouponModal';

// Screens where the offer popups may appear (exact paths: never on the profile form or during login)
const POPUP_ROUTES = ['/home', '/profile', '/purchases', '/loyalty'];
// "Maybe later" hides a popup for the rest of this visit
const DISMISS_KEY = 'sm_offer_dismissed';

const readDismissed = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DISMISS_KEY)) || {};
  } catch {
    return {};
  }
};
const rememberDismissed = (status) => {
  try {
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify({ ...readDismissed(), [status]: true }));
  } catch {
    // storage blocked: the popup may show again on the next screen, which is harmless
  }
};

/**
 * New-customer offer:
 * 1. "Complete your profile and get a discount coupon" (until the profile is complete)
 * 2. "Congratulations!" with "Get Your Coupon" (once it is complete)
 * 3. The coupon itself: QR + code
 */
export const WelcomeOfferPopups = () => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [offer, setOffer] = useState(null);
  const [popup, setPopup] = useState(null); // 'complete_profile' | 'ready'
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState('');
  const [coupon, setCoupon] = useState(null);

  const onPopupRoute = POPUP_ROUTES.includes(pathname);

  // Re-check on every screen change: completing the profile moves the offer to "ready"
  useEffect(() => {
    if (!isAuthenticated || !onPopupRoute) return undefined;
    let active = true;
    offerService
      .getWelcomeOffer()
      .then((data) => {
        if (!active) return;
        setOffer(data);
        const wanted = data.status === 'complete_profile' || data.status === 'ready' ? data.status : null;
        setPopup(wanted && !readDismissed()[wanted] ? wanted : null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAuthenticated, onPopupRoute, pathname]);

  const dismiss = () => {
    if (popup) rememberDismissed(popup);
    setPopup(null);
  };

  const claim = async () => {
    setClaiming(true);
    setClaimError('');
    try {
      const issued = await offerService.claimWelcomeCoupon();
      setPopup(null);
      setOffer((prev) => ({ ...prev, status: 'claimed', coupon: issued }));
      setCoupon(issued);
    } catch (err) {
      setClaimError(err.message || 'Could not get your coupon. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const reward = describeOffer(offer?.offer);
  const minBill = offer?.offer?.minBillAmount;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {popup && (
            <motion.div
              key="offer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={dismiss}
              role="dialog"
              aria-modal="true"
              aria-label={popup === 'ready' ? 'Your coupon is ready' : 'Complete your profile'}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-xs bg-white rounded-2xl p-5 text-center shadow-2xl"
              >
                <button
                  onClick={dismiss}
                  aria-label="Close"
                  className="absolute right-3 top-3 w-7 h-7 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {popup === 'complete_profile' ? (
                  <>
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center">
                      <Gift className="w-7 h-7" />
                    </div>
                    <h2 className="mt-3 text-[17px] font-black text-ink-900 leading-tight">
                      Complete your profile &amp; get {reward}!
                    </h2>
                    <p className="mt-1.5 text-[12px] text-stone-500 leading-relaxed">
                      Add a few details about yourself and unlock a discount coupon
                      {minBill > 0 ? ` for your next purchase of ${formatINR(minBill)} or more` : ' for your next purchase'}.
                    </p>
                    {offer?.missingFields?.length > 0 && (
                      <p className="mt-2 text-[11px] text-stone-400">
                        Needed: {offer.missingFields.map((f) => f.label).join(', ')}
                      </p>
                    )}
                    <button
                      onClick={() => {
                        setPopup(null);
                        navigate('/profile/edit?offer=1');
                      }}
                      className="mt-4 w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
                    >
                      <UserRoundPen className="w-4 h-4" />
                      Complete Profile
                    </button>
                    <button onClick={dismiss} className="mt-2 text-[11.5px] font-semibold text-stone-400 hover:text-stone-600 cursor-pointer">
                      Maybe later
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <PartyPopper className="w-7 h-7" />
                    </div>
                    <h2 className="mt-3 text-[17px] font-black text-ink-900 leading-tight">Congratulations!</h2>
                    <p className="mt-1.5 text-[12px] text-stone-500 leading-relaxed">
                      Your profile is complete. You have unlocked <span className="font-bold text-ink-900">{reward}</span> on
                      your next purchase at Sundhamata Mobile.
                    </p>
                    {claimError && <p className="mt-2 text-[11px] text-rose-600">{claimError}</p>}
                    <button
                      onClick={claim}
                      disabled={claiming}
                      className="mt-4 w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
                    >
                      {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
                      {claiming ? 'Getting your coupon…' : 'Get Your Coupon'}
                    </button>
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <CouponModal coupon={coupon} onClose={() => setCoupon(null)} title="Welcome Coupon" />
    </>
  );
};
