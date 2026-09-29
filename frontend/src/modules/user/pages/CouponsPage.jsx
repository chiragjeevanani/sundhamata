import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Gift, TicketPercent } from 'lucide-react';
import { describeDiscount, describeOffer, offerService } from '../../../services/offerService';
import { formatDate, formatINR } from '../../../utils/formatters';
import { CouponModal } from '../components/CouponModal';

const STATUS_BADGE = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  redeemed: 'bg-stone-100 text-stone-600 border-stone-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200/70',
};
const STATUS_LABEL = { active: 'Ready to use', redeemed: 'Used', expired: 'Expired' };

export const CouponsPage = () => {
  const navigate = useNavigate();
  const [coupons, setCoupons] = useState(null);
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([offerService.listCoupons(), offerService.getWelcomeOffer().catch(() => null)])
      .then(([items, welcome]) => {
        if (!active) return;
        setCoupons(items);
        setOffer(welcome);
      })
      .catch((err) => active && setError(err.message || 'Could not load your coupons.'));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex-1 flex flex-col">
      <div className="sticky top-0 z-20 bg-cream-50/95 backdrop-blur-sm border-b border-stone-200/80 px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          aria-label="Back to profile"
          className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-700 cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <h1 className="text-[15px] font-black text-ink-900 tracking-tight">My Coupons</h1>
      </div>

      <div className="p-3.5 sm:p-4 space-y-2.5">
        {/* Not unlocked yet: point them to the profile */}
        {offer && (offer.status === 'complete_profile' || offer.status === 'ready') && (
          <button
            onClick={() => navigate(offer.status === 'ready' ? '/home' : '/profile/edit?offer=1')}
            className="w-full text-left rounded-xl bg-brand-50 border border-brand-200/80 p-3 flex items-center gap-3 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-white text-brand-600 border border-brand-100 flex items-center justify-center shrink-0">
              <Gift className="w-4.5 h-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-bold text-ink-900">
                {offer.status === 'ready' ? 'Your coupon is ready to unlock!' : `Get ${describeOffer(offer.offer)}`}
              </p>
              <p className="text-[11px] text-stone-600">
                {offer.status === 'ready' ? 'Tap to get your welcome coupon.' : 'Complete your profile to unlock a welcome coupon.'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-brand-700 shrink-0" />
          </button>
        )}

        {error && <p className="text-xs text-rose-600 text-center py-6">{error}</p>}

        {!coupons && !error && (
          <div className="space-y-2.5">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-white border border-stone-200 animate-pulse" />
            ))}
          </div>
        )}

        {coupons?.length === 0 && (
          <div className="text-center py-10 text-stone-400">
            <TicketPercent className="w-9 h-9 mx-auto opacity-60" />
            <p className="text-xs font-semibold mt-2">No coupons yet</p>
          </div>
        )}

        {coupons?.map((c) => (
          <button
            key={c.id}
            onClick={() => setOpen(c)}
            className={`w-full text-left bg-white rounded-xl border border-stone-200/90 flex items-stretch overflow-hidden cursor-pointer hover:border-stone-300 transition ${
              c.status === 'active' ? '' : 'opacity-75'
            }`}
          >
            <div className={`w-20 shrink-0 flex flex-col items-center justify-center text-white ${c.status === 'active' ? 'bg-brand-600' : 'bg-stone-400'}`}>
              <TicketPercent className="w-5 h-5" />
              <span className="text-[10px] font-bold mt-1 uppercase tracking-wider">Coupon</span>
            </div>
            <div className="flex-1 min-w-0 p-3 border-l-2 border-dashed border-stone-200">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[14px] font-black text-ink-900 truncate">{describeDiscount(c.discount)}</p>
                <span className={`text-[10px] font-semibold border rounded-md px-1.5 py-0.5 whitespace-nowrap ${STATUS_BADGE[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="font-mono text-[12px] font-bold text-stone-700 tracking-wider mt-0.5">{c.code}</p>
              <p className="text-[10.5px] text-stone-400 mt-0.5">
                {c.minBillAmount > 0 ? `Min bill ${formatINR(c.minBillAmount)} • ` : ''}
                {c.status === 'redeemed' ? `Used ${formatDate(c.redeemedAt)}` : `${c.status === 'expired' ? 'Expired' : 'Valid till'} ${formatDate(c.expiresAt)}`}
              </p>
            </div>
          </button>
        ))}
      </div>

      <CouponModal coupon={open} onClose={() => setOpen(null)} />
    </div>
  );
};
