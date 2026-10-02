import { useEffect, useRef, useState } from 'react';
import { Loader2, Lock, QrCode, Sparkles, Ticket, UserRoundPen } from 'lucide-react';
import { describeDiscount } from '../../../services/offerService';
import { formatDate } from '../../../utils/formatters';

const STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  redeemed: { label: 'Used', className: 'bg-stone-100 text-stone-600 border-stone-200' },
  expired: { label: 'Expired', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

/**
 * Silver layer to rub off (finger or mouse), or tap "Reveal".
 * Calls onReveal once about half of it has been scratched away.
 */
const ScratchCover = ({ onReveal, label = 'SCRATCH HERE' }) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const { width, height } = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#C9CCD1');
    gradient.addColorStop(0.5, '#EEF0F2');
    gradient.addColorStop(1, '#B9BDC3');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 70; i += 1) ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
    ctx.fillStyle = '#5B5F66';
    ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, width / 2, height / 2);
  }, [label]);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onReveal();
  };

  const scratch = (e) => {
    if (!drawing.current || done.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(e.clientX - rect.left, e.clientY - rect.top, 18, 0, Math.PI * 2);
    ctx.fill();
  };

  const checkCleared = () => {
    const canvas = canvasRef.current;
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 32) {
      total += 1;
      if (data[i] === 0) clear += 1;
    }
    if (clear / total > 0.45) finish();
  };

  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full touch-none cursor-grab"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          scratch(e);
        }}
        onPointerMove={scratch}
        onPointerUp={() => {
          drawing.current = false;
          checkCleared();
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={finish}
        className="absolute right-1.5 bottom-1.5 px-2 py-0.5 rounded-md bg-white/85 text-[10px] font-bold text-stone-600 border border-stone-300 cursor-pointer"
      >
        Reveal
      </button>
    </div>
  );
};

const CodeStrip = ({ code, muted = false }) => (
  <div className={`flex items-stretch rounded-lg overflow-hidden border ${muted ? 'border-dashed border-stone-300' : 'border-ink-900'}`}>
    <span
      className={`text-[9.5px] font-bold leading-tight uppercase px-2 flex items-center text-center ${
        muted ? 'bg-stone-100 text-stone-500' : 'bg-ink-900 text-white'
      }`}
    >
      Voucher
      <br />
      Code
    </span>
    <span
      className={`flex-1 font-black text-lg text-center py-1.5 ${
        muted ? 'text-stone-400 tracking-[0.3em] select-none' : 'bg-gradient-to-r from-amber-300 to-brand-400 text-ink-900 tracking-[0.12em]'
      }`}
    >
      {muted ? '•••••••' : code}
    </span>
  </div>
);

const CATEGORY_WORDS = { phones: 'Mobiles', accessories: 'Mobile Accessories', service: 'Services' };
const scopeOf = (appliesTo) =>
  appliesTo?.length ? `on ${appliesTo.map((c) => CATEGORY_WORDS[c] ?? c).join(' & ')}` : 'on your bill';

/**
 * Welcome voucher or store offer, in the style of the store's "App Welcome Offers" poster:
 * - locked: unlocks once the profile is 100% complete (progress + Complete Profile)
 * - ready: a scratch card — scratching it claims the voucher and reveals the code
 * - claimed: the code, validity, Active / Used / Expired, and the QR for the counter
 * `label` names the ticket ("Voucher 1" by default, from `number`).
 */
export const VoucherCard = ({ voucher, number, label, profile, onClaim, onShowQr, onCompleteProfile }) => {
  const [claimState, setClaimState] = useState('idle'); // idle | claiming | error
  const [claimError, setClaimError] = useState('');
  const coupon = voucher.coupon;
  const locked = voucher.status === 'locked';
  const status = coupon ? STATUS[coupon.status] : null;
  const isFree = voucher.discount?.type === 'free_item';

  const claim = async () => {
    setClaimState('claiming');
    setClaimError('');
    try {
      await onClaim();
      setClaimState('idle');
    } catch (err) {
      setClaimState('error');
      setClaimError(err.message || 'Could not claim the voucher.');
    }
  };

  return (
    <div
      className={`relative bg-white rounded-2xl border overflow-hidden ${
        locked ? 'border-stone-300 border-dashed' : 'border-brand-200 shadow-[0_6px_20px_rgba(181,91,31,0.12)]'
      } ${coupon && coupon.status !== 'active' ? 'opacity-75' : ''}`}
    >
      {/* Ticket notches */}
      <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cream-100 border border-brand-200" />
      <span className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cream-100 border border-brand-200" />

      <div className="px-4 pt-3 pb-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider text-white ${
              locked ? 'bg-stone-400' : 'bg-gradient-to-r from-brand-600 to-brand-500'
            }`}
          >
            {locked ? <Lock className="w-3 h-3" /> : <Ticket className="w-3 h-3" />}
            {label ?? `Voucher ${number}`}
          </span>
          {status && <span className={`text-[10px] font-bold border rounded-md px-1.5 py-0.5 ${status.className}`}>{status.label}</span>}
          {locked && <span className="text-[10px] font-bold text-stone-500">Locked</span>}
        </div>

        <div className={locked ? 'opacity-70' : ''}>
          {voucher.customTitle && (
            <p className="text-[11px] font-black uppercase tracking-wider text-ink-900/70 mb-0.5">{voucher.customTitle}</p>
          )}
          <p className={`text-[19px] leading-tight font-black uppercase tracking-tight ${locked ? 'text-stone-500' : 'text-brand-600'}`}>
            {isFree ? 'Free' : describeDiscount(voucher.discount)}
          </p>
          <p className="text-[13px] font-extrabold uppercase text-ink-900 leading-snug">
            {isFree ? voucher.discount.itemName : scopeOf(voucher.appliesTo)}
          </p>
          <p className="text-[11.5px] text-stone-500 mt-1 leading-snug">{voucher.description}</p>
          {!coupon && voucher.endsAt && (
            <p className="text-[10.5px] font-semibold text-stone-400 mt-0.5">Offer ends {formatDate(voucher.endsAt)}</p>
          )}
        </div>

        {locked ? (
          <div className="rounded-xl bg-brand-50 border border-brand-100 p-3 space-y-2">
            <p className="text-[12px] font-bold text-ink-900">Complete 100% of your profile to unlock this offer</p>
            {profile && (
              <>
                <div className="h-2 rounded-full bg-white border border-brand-100 overflow-hidden" role="progressbar" aria-valuenow={profile.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completion">
                  <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${profile.percent}%` }} />
                </div>
                <p className="text-[10.5px] text-stone-500">
                  Profile {profile.percent}% complete
                  {profile.missingFields?.length > 0 && ` · add ${profile.missingFields.map((f) => f.label.toLowerCase()).join(', ')}`}
                </p>
              </>
            )}
            {onCompleteProfile && (
              <button
                type="button"
                onClick={onCompleteProfile}
                className="w-full py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <UserRoundPen className="w-3.5 h-3.5" />
                Complete Profile
              </button>
            )}
          </div>
        ) : coupon ? (
          <>
            <CodeStrip code={coupon.campaignCode || coupon.code} />
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="text-[10.5px] text-stone-500">
                {coupon.status === 'redeemed'
                  ? `Used on ${formatDate(coupon.redeemedAt)}`
                  : `${coupon.status === 'expired' ? 'Expired on' : 'Valid till'} ${formatDate(coupon.expiresAt)}`}
              </span>
              {coupon.status === 'active' && onShowQr && (
                <button
                  type="button"
                  onClick={() => onShowQr(coupon)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-ink-900 text-white text-[11px] font-bold cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Show at store
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Ready: scratch to claim */}
            <div className="relative">
              <CodeStrip code={voucher.campaignCode} />
              {claimState === 'idle' && <ScratchCover onReveal={claim} label="SCRATCH TO CLAIM" />}
              {claimState === 'claiming' && (
                <div className="absolute inset-0 rounded-lg bg-white/70 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-brand-600 animate-spin" aria-label="Claiming" />
                </div>
              )}
            </div>
            {claimState === 'error' ? (
              <p className="text-[11px] text-rose-600 flex items-center justify-between gap-2">
                {claimError}
                <button type="button" onClick={claim} className="font-bold underline cursor-pointer shrink-0">
                  Try again
                </button>
              </p>
            ) : (
              <p className="text-[10.5px] text-brand-700 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Scratch the card to claim your voucher
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
