import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { Check, Copy, Store, TicketPercent, X } from 'lucide-react';
import { describeDiscount } from '../../../services/offerService';
import { formatDate, formatINR } from '../../../utils/formatters';

/** QR image for a coupon code (the QR contains just the code, so any scanner can read it) */
export const CouponQr = ({ code, size = 200, dimmed = false }) => {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(code, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#1C1917', light: '#FFFFFF' } })
      .then((url) => active && setSrc(url))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, size]);

  return (
    <div
      className={`bg-white rounded-xl border border-stone-200 p-2 mx-auto ${dimmed ? 'opacity-30 grayscale' : ''}`}
      style={{ width: size + 18, height: size + 18 }}
    >
      {src ? (
        <img src={src} alt={`QR code for coupon ${code}`} width={size} height={size} className="block" />
      ) : (
        <div className="w-full h-full bg-stone-100 rounded animate-pulse" />
      )}
    </div>
  );
};

const STATUS_STAMP = {
  redeemed: { label: 'Used', className: 'text-stone-600 border-stone-400' },
  expired: { label: 'Expired', className: 'text-rose-600 border-rose-400' },
};

/**
 * Full coupon: QR + code + terms. Shown after unlocking the welcome offer and from "My Coupons".
 */
export const CouponModal = ({ coupon, onClose, title = 'Your Coupon' }) =>
  createPortal(
    <AnimatePresence>{coupon && <CouponSheet coupon={coupon} onClose={onClose} title={title} />}</AnimatePresence>,
    document.body
  );

const CouponSheet = ({ coupon, onClose, title }) => {
  const [copied, setCopied] = useState(false);
  const stamp = STATUS_STAMP[coupon.status];

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = () => {
    navigator.clipboard?.writeText(coupon.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-stone-900/70 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs bg-white rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* Ticket header */}
        <div className="bg-brand-600 text-white px-5 pt-4 pb-5 text-center relative">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <TicketPercent className="w-6 h-6 mx-auto opacity-90" />
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] mt-1 opacity-90">{title}</p>
          <p className="text-2xl font-black tracking-tight mt-0.5">{describeDiscount(coupon.discount)}</p>
          {coupon.minBillAmount > 0 && (
            <p className="text-[11px] opacity-90">on a bill of {formatINR(coupon.minBillAmount)} or more</p>
          )}
        </div>

        {/* Perforation */}
        <div className="relative h-0 border-t-2 border-dashed border-stone-200">
          <span className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-stone-900/70" />
          <span className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-stone-900/70" />
        </div>

        <div className="px-5 pt-5 pb-4 text-center space-y-3">
          <div className="relative">
            <CouponQr code={coupon.code} size={170} dimmed={Boolean(stamp)} />
            {stamp && (
              <span
                className={`absolute inset-0 m-auto w-fit h-fit px-3 py-1 border-2 rounded-lg text-lg font-black uppercase tracking-widest -rotate-12 bg-white/80 ${stamp.className}`}
              >
                {stamp.label}
              </span>
            )}
          </div>

          <button
            onClick={copy}
            className="mx-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-200 cursor-pointer"
            title="Copy code"
          >
            <span className="font-mono text-[17px] font-bold tracking-[0.12em] text-ink-900">{coupon.code}</span>
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-500" />}
          </button>

          <div className="text-[11px] text-stone-500 space-y-0.5">
            {coupon.status === 'redeemed' ? (
              <p>Used on {formatDate(coupon.redeemedAt)}</p>
            ) : (
              <p>
                {coupon.status === 'expired' ? 'Expired on' : 'Valid till'}{' '}
                <span className="font-semibold text-stone-700">{formatDate(coupon.expiresAt)}</span>
              </p>
            )}
            <p>One-time use • Only for your account</p>
          </div>

          {coupon.status === 'active' && (
            <p className="flex items-center justify-center gap-1.5 text-[11.5px] font-semibold text-brand-800 bg-brand-50 rounded-lg py-2">
              <Store className="w-3.5 h-3.5" />
              Show this QR at the store counter
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
