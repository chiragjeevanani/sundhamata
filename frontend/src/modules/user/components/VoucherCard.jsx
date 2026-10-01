import { useEffect, useRef, useState } from 'react';
import { Gift, Loader2, QrCode, Sparkles, Ticket } from 'lucide-react';
import { describeDiscount } from '../../../services/offerService';
import { formatDate } from '../../../utils/formatters';

const STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  redeemed: { label: 'Used', className: 'bg-stone-100 text-stone-600 border-stone-200' },
  expired: { label: 'Expired', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

/**
 * Silver layer over the voucher code: rub it (finger or mouse) to reveal the code, or tap "Reveal".
 * Calls onReveal once about half of it has been scratched away.
 */
const ScratchCover = ({ onReveal }) => {
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
    // Sparkle texture
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 70; i += 1) ctx.fillRect(Math.random() * width, Math.random() * height, 1.5, 1.5);
    ctx.fillStyle = '#5B5F66';
    ctx.font = '700 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('SCRATCH HERE TO REVEAL', width / 2, height / 2);
  }, []);

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
    if (done.current) return;
    const canvas = canvasRef.current;
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 32) {
      total += 1;
      if (data[i] === 0) clear += 1;
    }
    if (clear / total > 0.45) {
      done.current = true;
      onReveal();
    }
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
        onClick={() => {
          done.current = true;
          onReveal();
        }}
        className="absolute right-1.5 bottom-1.5 px-2 py-0.5 rounded-md bg-white/85 text-[10px] font-bold text-stone-600 border border-stone-300 cursor-pointer"
      >
        Reveal
      </button>
    </div>
  );
};

/**
 * Welcome voucher in the style of the store's "App Welcome Offers" poster.
 * Before claiming: "Claim Now". After claiming: the voucher code (scratch to reveal when `scratch`)
 * with validity, status and a button for the QR code to show at the counter.
 */
export const VoucherCard = ({ voucher, number, onClaim, claiming = false, scratch = false, onShowQr }) => {
  const coupon = voucher.coupon;
  // Scratched off by the customer (only matters for a voucher just claimed, when `scratch` is on)
  const [scratched, setScratched] = useState(false);
  const revealed = !scratch || scratched;
  const status = coupon ? STATUS[coupon.status] : null;
  const isFree = voucher.discount?.type === 'free_item';

  return (
    <div
      className={`relative bg-white rounded-2xl border border-brand-200 shadow-[0_6px_20px_rgba(181,91,31,0.12)] overflow-hidden ${
        coupon && coupon.status !== 'active' ? 'opacity-75' : ''
      }`}
    >
      {/* Ticket notches */}
      <span className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cream-100 border border-brand-200" />
      <span className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-cream-100 border border-brand-200" />

      <div className="px-4 pt-3 pb-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-600 to-brand-500 text-white px-2 py-0.5 text-[10.5px] font-black uppercase tracking-wider">
            <Ticket className="w-3 h-3" />
            Voucher {number}
          </span>
          {status && (
            <span className={`text-[10px] font-bold border rounded-md px-1.5 py-0.5 ${status.className}`}>{status.label}</span>
          )}
        </div>

        <div>
          <p className="text-[19px] leading-tight font-black uppercase tracking-tight text-brand-600">
            {isFree ? 'Free' : describeDiscount(voucher.discount)}
          </p>
          <p className="text-[13px] font-extrabold uppercase text-ink-900 leading-snug">
            {isFree ? voucher.discount.itemName : voucher.appliesTo?.includes('accessories') ? 'on Mobile Accessories' : 'on your bill'}
          </p>
          <p className="text-[11.5px] text-stone-500 mt-1 leading-snug">
            {voucher.description}
          </p>
        </div>

        {/* Voucher code */}
        {coupon ? (
          <div className="relative">
            <div className="flex items-stretch rounded-lg overflow-hidden border border-ink-900">
              <span className="bg-ink-900 text-white text-[9.5px] font-bold leading-tight uppercase px-2 flex items-center text-center">
                Voucher
                <br />
                Code
              </span>
              <span className="flex-1 bg-gradient-to-r from-amber-300 to-brand-400 text-ink-900 font-black tracking-[0.12em] text-lg text-center py-1.5">
                {coupon.campaignCode || coupon.code}
              </span>
            </div>
            {!revealed && <ScratchCover onReveal={() => setScratched(true)} />}
          </div>
        ) : (
          <div className="flex items-stretch rounded-lg overflow-hidden border border-dashed border-stone-300">
            <span className="bg-stone-100 text-stone-500 text-[9.5px] font-bold leading-tight uppercase px-2 flex items-center text-center">
              Voucher
              <br />
              Code
            </span>
            <span className="flex-1 text-stone-400 font-black tracking-[0.3em] text-lg text-center py-1.5 select-none">•••••••</span>
          </div>
        )}

        {coupon ? (
          revealed && (
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
          )
        ) : (
          <button
            type="button"
            onClick={onClaim}
            disabled={claiming}
            className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
          >
            {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            {claiming ? 'Claiming…' : 'Claim Now'}
          </button>
        )}
        {coupon && !revealed && (
          <p className="text-[10.5px] text-brand-700 font-semibold flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Claimed! Scratch the card to see your code
          </p>
        )}
      </div>
    </div>
  );
};
