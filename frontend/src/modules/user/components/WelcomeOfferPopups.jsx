import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { offerService } from '../../../services/offerService';
import { CouponModal } from './CouponModal';
import { VoucherCard } from './VoucherCard';

// Screens where the popup may appear (exact paths: never on the profile form or during login)
const POPUP_ROUTES = ['/home', '/profile', '/purchases', '/loyalty'];
// "Later" hides the popup for the rest of this visit
const DISMISS_KEY = 'sm_vouchers_later';

const dismissedThisVisit = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
};
const rememberDismissed = () => {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // storage blocked: the popup may show again on the next screen, which is harmless
  }
};

/**
 * Welcome vouchers for new app users: right after registering, "Congratulations! You unlocked
 * 2 Welcome Vouchers" with both vouchers and a Claim Now button on each. A claimed voucher turns
 * into a scratch card that reveals its code; the QR for the counter is one tap away.
 */
export const WelcomeOfferPopups = () => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState([]);
  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(null);
  const [claimedNow, setClaimedNow] = useState(() => new Set());
  const [error, setError] = useState('');
  const [qrCoupon, setQrCoupon] = useState(null);

  const onPopupRoute = POPUP_ROUTES.includes(pathname);

  useEffect(() => {
    if (!isAuthenticated || !onPopupRoute || open) return undefined;
    let active = true;
    offerService
      .getWelcomeOffer()
      .then((data) => {
        if (!active) return;
        setVouchers(data.vouchers);
        if (data.status === 'ready' && !dismissedThisVisit()) setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAuthenticated, onPopupRoute, pathname, open]);

  const close = () => {
    if (vouchers.some((v) => v.status === 'ready')) rememberDismissed();
    setOpen(false);
  };

  const claim = async (key) => {
    setClaiming(key);
    setError('');
    try {
      const coupon = await offerService.claimVoucher(key);
      setVouchers((prev) => prev.map((v) => (v.key === key ? { ...v, status: 'claimed', coupon } : v)));
      setClaimedNow((prev) => new Set(prev).add(key));
    } catch (err) {
      setError(err.message || 'Could not claim the voucher. Please try again.');
    } finally {
      setClaiming(null);
    }
  };

  const allClaimed = vouchers.length > 0 && vouchers.every((v) => v.status === 'claimed');

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="welcome-vouchers"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[55] bg-stone-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Welcome vouchers"
            >
              <motion.div
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', damping: 24, stiffness: 280 }}
                className="relative w-full sm:max-w-sm max-h-[92vh] overflow-y-auto bg-cream-100 rounded-t-3xl sm:rounded-3xl shadow-2xl"
              >
                {/* Celebration header */}
                <div className="relative bg-ink-900 text-white px-5 pt-6 pb-7 text-center overflow-hidden">
                  <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-40 rounded-full bg-brand-500/40 blur-3xl" />
                  <button
                    onClick={close}
                    aria-label="Close"
                    className="absolute right-3 top-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="relative">
                    <div className="text-4xl" aria-hidden="true">🎁</div>
                    <h2 className="mt-2 text-[22px] font-black leading-tight">Congratulations!</h2>
                    <p className="mt-1 text-[13px] text-white/85">
                      You unlocked <span className="font-black text-brand-300">{vouchers.length} Welcome Voucher{vouchers.length === 1 ? '' : 's'}</span>
                    </p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                      Exclusive for our app users
                    </p>
                  </div>
                </div>

                <div className="px-4 py-4 space-y-3 -mt-3 relative">
                  {vouchers.map((voucher, i) => (
                    <VoucherCard
                      key={voucher.key}
                      voucher={voucher}
                      number={i + 1}
                      claiming={claiming === voucher.key}
                      onClaim={() => claim(voucher.key)}
                      scratch={claimedNow.has(voucher.key)}
                      onShowQr={setQrCoupon}
                    />
                  ))}
                  {error && <p className="text-[11px] text-rose-600 text-center">{error}</p>}

                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] text-stone-500 px-1">
                    <li>• Valid for {vouchers[0]?.validityDays ?? 30} days after claiming</li>
                    <li>• One voucher per customer</li>
                    <li>• Registered mobile number required</li>
                    <li>• Valid at Sundhamata Mobile only</li>
                  </ul>

                  {allClaimed ? (
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate('/coupons');
                      }}
                      className="w-full py-2.5 rounded-xl bg-ink-900 text-white text-xs font-bold cursor-pointer"
                    >
                      View My Vouchers
                    </button>
                  ) : (
                    <button onClick={close} className="w-full py-1.5 text-[11.5px] font-semibold text-stone-500 hover:text-stone-700 cursor-pointer">
                      Later
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <CouponModal coupon={qrCoupon} onClose={() => setQrCoupon(null)} />
    </>
  );
};
