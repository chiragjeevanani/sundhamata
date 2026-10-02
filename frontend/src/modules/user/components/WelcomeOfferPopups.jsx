import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { UserRoundPen, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { offerService } from '../../../services/offerService';
import { CouponModal } from './CouponModal';
import { VoucherCard } from './VoucherCard';

// Screens where the popup may appear (exact paths: never on the profile form or during login)
const POPUP_ROUTES = ['/home', '/profile', '/purchases', '/loyalty'];
// "Later" hides the popup for this visit — until another voucher unlocks
const DISMISS_KEY = 'sm_vouchers_later';

const readDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
};
const rememberDismissed = (value) => {
  try {
    sessionStorage.setItem(DISMISS_KEY, value);
  } catch {
    // storage blocked: the popup may show again on the next screen, which is harmless
  }
};

/** Which vouchers are waiting to be scratched, e.g. "glass" or "glass,accessories" */
const readyKeysOf = (vouchers) =>
  vouchers
    .filter((v) => v.status === 'ready')
    .map((v) => v.key)
    .join(',');

/**
 * Welcome offers for new app users, as scratch cards:
 * - right after registering: the welcome voucher, plus "Complete 100% of your profile and get
 *   another offer" (the second voucher shown locked, with progress)
 * - once the profile is complete: "Profile 100% complete! You unlocked another offer"
 */
export const WelcomeOfferPopups = () => {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [offer, setOffer] = useState(null);
  const [open, setOpen] = useState(false);
  const [qrCoupon, setQrCoupon] = useState(null);

  const onPopupRoute = POPUP_ROUTES.includes(pathname);

  useEffect(() => {
    if (!isAuthenticated || !onPopupRoute || open) return undefined;
    let active = true;
    offerService
      .getWelcomeOffer()
      .then((data) => {
        if (!active) return;
        setOffer(data);
        const readyKeys = readyKeysOf(data.vouchers);
        if (readyKeys && readDismissed() !== readyKeys) setOpen(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isAuthenticated, onPopupRoute, pathname, open]);

  const vouchers = offer?.vouchers ?? [];
  // Shown in the popup: what can be scratched now, and what completing the profile unlocks
  const shown = vouchers.filter((v) => v.status !== 'claimed' || v.justClaimed);
  const locked = vouchers.filter((v) => v.status === 'locked');
  const unlockedByProfile = shown.some((v) => v.unlock === 'profile' && v.status !== 'locked');

  const close = () => {
    const readyKeys = readyKeysOf(vouchers);
    if (readyKeys) rememberDismissed(readyKeys);
    setOpen(false);
  };

  const claim = async (key) => {
    const coupon = await offerService.claimVoucher(key);
    setOffer((prev) => ({
      ...prev,
      vouchers: prev.vouchers.map((v) => (v.key === key ? { ...v, status: 'claimed', coupon, justClaimed: true } : v)),
    }));
  };

  const goCompleteProfile = () => {
    setOpen(false);
    navigate('/profile/edit?offer=1');
  };

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
              aria-label="Welcome offer"
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
                    <div className="text-4xl" aria-hidden="true">{unlockedByProfile ? '🎉' : '🎁'}</div>
                    <h2 className="mt-2 text-[22px] font-black leading-tight">
                      {unlockedByProfile ? 'Profile 100% complete!' : 'Welcome to Sundhamata Mobile!'}
                    </h2>
                    <p className="mt-1 text-[13px] text-white/85">
                      {unlockedByProfile ? 'You unlocked another offer' : 'You unlocked a Welcome Offer'}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
                      Scratch the card to claim it
                    </p>
                  </div>
                </div>

                <div className="px-4 py-4 space-y-3 -mt-3 relative">
                  {shown
                    .filter((v) => v.status !== 'locked')
                    .map((voucher) => (
                      <VoucherCard
                        key={voucher.key}
                        voucher={voucher}
                        number={vouchers.indexOf(voucher) + 1}
                        onClaim={() => claim(voucher.key)}
                        onShowQr={setQrCoupon}
                      />
                    ))}

                  {/* Complete the profile → another offer */}
                  {locked.length > 0 && (
                    <>
                      <div className="flex items-center gap-2 pt-1">
                        <span className="h-px flex-1 bg-brand-200" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-brand-700">
                          Complete 100% profile &amp; get another offer
                        </span>
                        <span className="h-px flex-1 bg-brand-200" />
                      </div>
                      {locked.map((voucher) => (
                        <VoucherCard
                          key={voucher.key}
                          voucher={voucher}
                          number={vouchers.indexOf(voucher) + 1}
                          profile={offer.profile}
                          onCompleteProfile={goCompleteProfile}
                        />
                      ))}
                    </>
                  )}

                  <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] text-stone-500 px-1">
                    <li>• Valid for {vouchers[0]?.validityDays ?? 30} days after claiming</li>
                    <li>• One voucher per customer</li>
                    <li>• Registered mobile number required</li>
                    <li>• Valid at Sundhamata Mobile only</li>
                  </ul>

                  {locked.length > 0 ? (
                    <div className="flex gap-2">
                      <button onClick={close} className="flex-1 py-2.5 rounded-xl border border-stone-300 bg-white text-stone-700 text-xs font-bold cursor-pointer">
                        Later
                      </button>
                      <button
                        onClick={goCompleteProfile}
                        className="flex-[2] py-2.5 rounded-xl bg-ink-900 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <UserRoundPen className="w-3.5 h-3.5" />
                        Complete Profile
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        close();
                        navigate('/coupons');
                      }}
                      className="w-full py-2.5 rounded-xl bg-ink-900 text-white text-xs font-bold cursor-pointer"
                    >
                      View My Vouchers
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
