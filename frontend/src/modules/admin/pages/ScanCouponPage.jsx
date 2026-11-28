import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, CheckCircle2, Loader2, RotateCcw, ScanLine, Search, TicketPercent, Undo2, XCircle } from 'lucide-react';
import { QrScannerModal } from '../components/QrScannerModal';
import { useToast } from '../context/ToastContext';
import { adminCouponService } from '../../../services/adminCouponService';
import { couponDiscountFor, couponScope, describeDiscount, describeMinimum } from '../../../utils/coupons';
import { formatDate, formatINR } from '../../../utils/formatters';

const couponName = (coupon) => coupon.title || describeDiscount(coupon.discount);

/**
 * Counter staff (also from a phone): scan the QR the customer shows in the app (My Coupons)
 * and use up the coupon straight away, without recording a bill.
 */
export const ScanCouponPage = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(null); // 'lookup' | 'redeem' | 'undo'
  const [result, setResult] = useState(null); // { coupon, customer, usable, reason }
  const [error, setError] = useState('');
  const [justRedeemed, setJustRedeemed] = useState(false);
  // What the customer is buying (of the products the coupon is for): its conditions are checked against it
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState('');

  const look = useCallback(async (code) => {
    if (!code?.trim()) return;
    setBusy('lookup');
    setError('');
    setResult(null);
    setJustRedeemed(false);
    setAmount('');
    setAmountError('');
    try {
      const found = await adminCouponService.lookup(code);
      if (found.coupon.issuedOnBill || !found.customer) {
        setError(
          `${found.coupon.code} is a shared offer code, not a customer's own coupon. Ask the customer to open My Coupons in the app and show the QR, or apply it on Add Sale.`
        );
      } else {
        setResult(found);
      }
    } catch (err) {
      setError(err.message || 'Could not check this code.');
    } finally {
      setBusy(null);
    }
  }, []);

  const onScan = useCallback(
    (code) => {
      setScannerOpen(false);
      navigator.vibrate?.(60);
      setTyped(code);
      look(code);
    },
    [look]
  );
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  const redeem = async (e) => {
    e.preventDefault();
    if (amountProblem) {
      setAmountError(amountProblem);
      return;
    }
    setBusy('redeem');
    setAmountError('');
    try {
      const done = await adminCouponService.redeem(result.coupon.code, amountValue);
      setResult(done);
      setJustRedeemed(true);
      navigator.vibrate?.([40, 60, 40]);
      showSuccess('Coupon redeemed', `${couponName(done.coupon)} for ${done.customer?.name ?? 'the customer'}`);
    } catch (err) {
      // A condition not met (e.g. below the minimum) → shown under the amount; anything else → check again
      if (err.status === 422 && !/already been used|expired|paused|ended|fully used/i.test(err.message ?? '')) {
        setAmountError(err.message);
      } else {
        showError('Not redeemed', err.message || 'Could not redeem this coupon.');
        look(result.coupon.code);
      }
    } finally {
      setBusy(null);
    }
  };

  const undo = async () => {
    setBusy('undo');
    try {
      const back = await adminCouponService.undoRedeem(result.coupon.id);
      setResult(back);
      setJustRedeemed(false);
      showSuccess('Coupon given back', 'The customer can use it again.');
    } catch (err) {
      showError('Error', err.message || 'Could not give the coupon back.');
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setResult(null);
    setError('');
    setTyped('');
    setJustRedeemed(false);
  };

  const coupon = result?.coupon;
  const customer = result?.customer;
  const minimum = coupon ? describeMinimum(coupon) : '';
  const scope = couponScope(coupon);

  // Same checks as the server (which has the final say)
  const amountValue = Math.round(Number(amount) * 100) / 100;
  const preview = coupon && amountValue > 0 ? couponDiscountFor(coupon, amountValue) : 0;
  let amountProblem = '';
  if (coupon) {
    if (!amount.trim() || !(amountValue > 0)) amountProblem = `Enter the amount of ${scope ?? 'shopping'} the customer is buying`;
    else if (amountValue < (coupon.minBillAmount ?? 0)) {
      amountProblem = `This coupon needs ${formatINR(coupon.minBillAmount)} of ${scope ?? 'shopping'} (now ${formatINR(amountValue)})`;
    }
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="pb-3 border-b border-stone-200/80">
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Scan Coupon</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Scan the QR the customer shows in the app (My Coupons) to use their coupon at the counter.
        </p>
      </div>

      <button
        onClick={() => setScannerOpen(true)}
        disabled={busy !== null}
        className="w-full py-5 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-[0.99] text-white font-semibold text-base flex items-center justify-center gap-2.5 shadow-sm cursor-pointer disabled:opacity-60 transition-all"
      >
        <ScanLine className="w-6 h-6" />
        Scan coupon QR
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          look(typed);
        }}
        className="flex gap-2 text-sm"
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or type the code, e.g. SM-7KQ2-XH4P"
          autoCapitalize="characters"
          autoComplete="off"
          className="flex-1 min-w-0 px-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 uppercase placeholder:normal-case focus:outline-hidden focus:border-brand-600"
        />
        <button
          type="submit"
          disabled={!typed.trim() || busy !== null}
          className="px-4 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <Search className="w-4 h-4" />
          Check
        </button>
      </form>

      {busy === 'lookup' && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-stone-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Checking the coupon...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex gap-2.5">
          <XCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {coupon && (
        <div className="rounded-2xl border border-stone-200 bg-white shadow-2xs overflow-hidden">
          {/* Status banner */}
          {justRedeemed ? (
            <div className="bg-emerald-600 text-white px-4 py-4 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 shrink-0" />
              <div>
                <p className="font-semibold text-base">Redeemed</p>
                <p className="text-xs text-emerald-50">Give the customer their offer now.</p>
              </div>
            </div>
          ) : result.usable ? (
            <div className="bg-brand-50 text-brand-800 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <BadgeCheck className="w-5 h-5" /> Valid coupon
            </div>
          ) : (
            <div className="bg-rose-50 text-rose-800 px-4 py-3 text-sm font-semibold flex items-center gap-2">
              <XCircle className="w-5 h-5" /> {result.reason}
              {coupon.status === 'redeemed' && coupon.redeemedAt && (
                <span className="font-normal text-xs text-rose-700">({formatDate(coupon.redeemedAt)})</span>
              )}
            </div>
          )}

          <div className="p-4 space-y-4">
            {/* Offer */}
            <div className="flex gap-3">
              <div className="w-11 h-11 rounded-xl bg-brand-600 text-white flex items-center justify-center shrink-0">
                <TicketPercent className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold text-stone-900 leading-tight">{couponName(coupon)}</p>
                {coupon.title && <p className="text-sm text-stone-600">{describeDiscount(coupon.discount)}</p>}
                {minimum && <p className="text-xs text-amber-700 mt-0.5 first-letter:uppercase">Only {minimum}</p>}
                <p className="text-[11px] text-stone-400 mt-1 font-mono">
                  {coupon.code} · {coupon.status === 'active' ? `valid till ${formatDate(coupon.expiresAt)}` : `expires ${formatDate(coupon.expiresAt)}`}
                </p>
              </div>
            </div>

            {/* Customer: check it is their phone */}
            {customer && (
              <button
                type="button"
                onClick={() => navigate(`/admin/customers/${customer.id}`)}
                className="w-full flex items-center gap-3 rounded-xl bg-stone-50 border border-stone-200 p-3 text-left cursor-pointer hover:bg-stone-100"
              >
                {customer.photoUrl ? (
                  <img src={customer.photoUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-ink-950 text-white flex items-center justify-center font-semibold">
                    {customer.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-stone-900 truncate flex items-center gap-1">
                    {customer.name}
                    {customer.isVerified && <BadgeCheck className="w-4 h-4 text-sky-500" />}
                  </p>
                  <p className="text-xs text-stone-500 tabular-nums">
                    {customer.phone}
                    {customer.customerCode ? ` · ${customer.customerCode}` : ''}
                  </p>
                </div>
              </button>
            )}

            {/* Actions */}
            {result.usable && (
              <form onSubmit={redeem} className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="scan-amount" className="text-sm font-medium text-stone-700 block">
                    {scope ? `Amount of ${scope} being bought` : 'Bill amount'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-base">₹</span>
                    <input
                      id="scan-amount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setAmountError('');
                      }}
                      placeholder={coupon.minBillAmount > 0 ? `${coupon.minBillAmount} or more` : '0'}
                      className={`w-full pl-7 pr-3 py-3 bg-white border rounded-lg text-stone-900 text-base tabular-nums focus:outline-hidden focus:border-brand-600 ${
                        amountError ? 'border-rose-400' : 'border-stone-300'
                      }`}
                    />
                  </div>
                  {amountError ? (
                    <p className="text-xs text-rose-600">{amountError}</p>
                  ) : amount && amountProblem ? (
                    <p className="text-xs text-amber-700">{amountProblem}</p>
                  ) : preview > 0 ? (
                    <p className="text-xs text-emerald-700 font-medium">
                      Customer gets {coupon.discount.type === 'free_item' ? `the ${coupon.discount.itemName || 'item'} free (worth ` : ''}
                      {formatINR(preview)}
                      {coupon.discount.type === 'free_item' ? ')' : ' off'} · pays {formatINR(Math.max(amountValue - preview, 0))}
                    </p>
                  ) : (
                    <p className="text-[11px] text-stone-400">The coupon's conditions are checked against this amount.</p>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={busy !== null || Boolean(amountProblem)}
                  className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                  {busy === 'redeem' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  {busy === 'redeem' ? 'Redeeming...' : 'Redeem coupon'}
                </button>
                <p className="text-[11px] text-stone-400 text-center">
                  The coupon is used up straight away. To take it off a bill instead, apply it on Add Sale.
                </p>
              </form>
            )}
            {coupon.counterSale && coupon.status === 'redeemed' && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-900 flex justify-between gap-3">
                <span>
                  Discount <b>{formatINR(coupon.counterSale.discount)}</b> on {formatINR(coupon.counterSale.amount)}
                </span>
                <span className="text-emerald-700">
                  Pays <b>{formatINR(Math.max(coupon.counterSale.amount - coupon.counterSale.discount, 0))}</b>
                </span>
              </div>
            )}
            {justRedeemed && (
              <button
                onClick={undo}
                disabled={busy !== null}
                className="w-full py-2.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-700 text-sm font-medium cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {busy === 'undo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
                Undo (redeemed by mistake)
              </button>
            )}
          </div>
        </div>
      )}

      {(coupon || error) && (
        <button
          onClick={() => {
            reset();
            setScannerOpen(true);
          }}
          className="w-full py-2.5 text-sm font-medium text-brand-700 inline-flex items-center justify-center gap-2 cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" /> Scan another coupon
        </button>
      )}

      <QrScannerModal isOpen={scannerOpen} onClose={closeScanner} onScan={onScan} title="Scan Coupon QR" />
    </div>
  );
};
