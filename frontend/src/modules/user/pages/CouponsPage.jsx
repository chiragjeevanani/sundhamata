import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, TicketPercent } from 'lucide-react';
import { describeDiscount, describeMinimum, offerService } from '../../../services/offerService';
import { formatDate } from '../../../utils/formatters';
import { CouponModal } from '../components/CouponModal';
import { VoucherCard } from '../components/VoucherCard';

const STATUS_BADGE = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200/70',
  redeemed: 'bg-stone-100 text-stone-600 border-stone-200',
  expired: 'bg-rose-50 text-rose-700 border-rose-200/70',
};
const STATUS_LABEL = { active: 'Active', redeemed: 'Used', expired: 'Expired' };

/** My Coupons: welcome vouchers and store offers (scratch to claim), and all other coupons: Active / Used / Expired */
export const CouponsPage = () => {
  const navigate = useNavigate();
  const [vouchers, setVouchers] = useState(null);
  const [offers, setOffers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [others, setOthers] = useState([]);
  const [error, setError] = useState('');
  const [qrCoupon, setQrCoupon] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      offerService.getWelcomeOffer().catch(() => ({ vouchers: [] })),
      offerService.getOffers().catch(() => ({ offers: [] })),
      offerService.listCoupons(),
    ])
      .then(([welcome, store, coupons]) => {
        if (!active) return;
        const shown = new Set([...welcome.vouchers, ...store.offers].map((v) => v.coupon?.id).filter(Boolean));
        setVouchers(welcome.vouchers);
        setOffers(store.offers);
        setProfile(welcome.profile ?? store.profile ?? null);
        setOthers(coupons.filter((c) => !shown.has(c.id)));
      })
      .catch((err) => active && setError(err.message || 'Could not load your coupons.'));
    return () => {
      active = false;
    };
  }, []);

  // Scratching a card claims it (VoucherCard shows any error on the card itself)
  const claim = async (key) => {
    const coupon = await offerService.claimVoucher(key);
    setVouchers((prev) => prev.map((v) => (v.key === key ? { ...v, status: 'claimed', coupon } : v)));
  };

  const claimOffer = async (id) => {
    const coupon = await offerService.claimOffer(id);
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status: 'claimed', coupon } : o)));
  };

  const empty = vouchers && vouchers.length === 0 && offers.length === 0 && others.length === 0;

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

      <div className="p-3.5 sm:p-4 space-y-3">
        {error && <p className="text-xs text-rose-600 text-center">{error}</p>}

        {!vouchers && !error && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-white border border-stone-200 animate-pulse" />
            ))}
          </div>
        )}

        {vouchers?.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-stone-500">App Welcome Offers</h2>
            {vouchers.map((voucher, i) => (
              <VoucherCard
                key={voucher.key}
                voucher={voucher}
                number={i + 1}
                profile={profile}
                onClaim={() => claim(voucher.key)}
                onShowQr={setQrCoupon}
                onCompleteProfile={() => navigate('/profile/edit?offer=1')}
              />
            ))}
          </section>
        )}

        {offers.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 pt-1">Offers for you</h2>
            {offers.map((offer) => (
              <VoucherCard
                key={offer.id}
                voucher={offer}
                label="Store Offer"
                profile={profile}
                onClaim={() => claimOffer(offer.id)}
                onShowQr={setQrCoupon}
                onCompleteProfile={() => navigate('/profile/edit?offer=1')}
              />
            ))}
          </section>
        )}

        {others.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-stone-500 pt-1">Other Coupons</h2>
            {others.map((c) => (
              <button
                key={c.id}
                onClick={() => setQrCoupon(c)}
                className={`w-full text-left bg-white rounded-xl border border-stone-200/90 flex items-stretch overflow-hidden cursor-pointer hover:border-stone-300 transition ${
                  c.status === 'active' ? '' : 'opacity-75'
                }`}
              >
                <div className={`w-16 shrink-0 flex items-center justify-center text-white ${c.status === 'active' ? 'bg-brand-600' : 'bg-stone-400'}`}>
                  <TicketPercent className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 p-3 border-l-2 border-dashed border-stone-200">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[14px] font-black text-ink-900 truncate">{c.title || describeDiscount(c.discount)}</p>
                    <span className={`text-[10px] font-semibold border rounded-md px-1.5 py-0.5 whitespace-nowrap ${STATUS_BADGE[c.status]}`}>
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <p className="font-mono text-[12px] font-bold text-stone-700 tracking-wider mt-0.5">{c.campaignCode || c.code}</p>
                  <p className="text-[10.5px] text-stone-400 mt-0.5">
                    {describeMinimum(c) ? `${describeMinimum(c)} • ` : ''}
                    {c.status === 'redeemed' ? `Used ${formatDate(c.redeemedAt)}` : `${c.status === 'expired' ? 'Expired' : 'Valid till'} ${formatDate(c.expiresAt)}`}
                  </p>
                </div>
              </button>
            ))}
          </section>
        )}

        {empty && (
          <div className="text-center py-10 text-stone-400">
            <TicketPercent className="w-9 h-9 mx-auto opacity-60" />
            <p className="text-xs font-semibold mt-2">No coupons yet</p>
          </div>
        )}
      </div>

      <CouponModal coupon={qrCoupon} onClose={() => setQrCoupon(null)} />
    </div>
  );
};
