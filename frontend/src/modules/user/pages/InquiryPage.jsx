import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Headphones, MessageSquareText, Smartphone, Wrench } from 'lucide-react';
import { INQUIRY_CATEGORY_LABELS, inquiryService } from '../../../services/inquiryService';
import { formatDate, formatINR } from '../../../utils/formatters';

const CATEGORIES = [
  { key: 'mobile', icon: Smartphone, hint: 'New phone' },
  { key: 'accessories', icon: Headphones, hint: 'Covers, chargers…' },
  { key: 'service', icon: Wrench, hint: 'Repair & service' },
];

const STATUS_BADGE = {
  new: { label: 'Sent', className: 'bg-brand-50 text-brand-700 border-brand-200/70' },
  contacted: { label: 'Store contacted you', className: 'bg-emerald-50 text-emerald-800 border-emerald-200/70' },
  closed: { label: 'Closed', className: 'bg-stone-100 text-stone-600 border-stone-200' },
};

const inputClass =
  'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-[13px] text-stone-900 focus:outline-hidden focus:border-brand-600';

/** Make an Inquiry: pick Mobile / Accessories / Service, add a budget and the reason; the store sees it on Admin → Inquiries */
export const InquiryPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a Home shortcut: /inquiry?type=mobile
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState(() =>
    CATEGORIES.some((c) => c.key === searchParams.get('type')) ? searchParams.get('type') : ''
  );
  const [budget, setBudget] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    let active = true;
    inquiryService
      .listMine()
      .then((items) => active && setHistory(items))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!category) return setError('Choose what you are looking for.');
    if (message.trim().length < 3) return setError('Tell us the reason for your inquiry.');
    setSending(true);
    try {
      const inquiry = await inquiryService.create({
        category,
        budget: budget === '' ? null : Number(budget),
        message: message.trim(),
      });
      setHistory((prev) => [inquiry, ...(prev ?? [])]);
      setSent(true);
      setCategory('');
      setBudget('');
      setMessage('');
    } catch (err) {
      setError(err.message || 'Could not send your inquiry. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="sticky top-0 z-20 bg-cream-50/95 backdrop-blur-sm border-b border-stone-200/80 px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/home'))}
          aria-label="Go back"
          className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-700 cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <h1 className="text-[15px] font-black text-ink-900 tracking-tight">Make an Inquiry</h1>
      </div>

      <div className="p-3.5 sm:p-4 space-y-3">
        {sent && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200/80 p-3 flex items-start gap-2.5 text-[12px]">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-emerald-900">Inquiry sent</p>
              <p className="text-emerald-800">The store team will contact you soon.</p>
            </div>
          </div>
        )}

        <form
          onSubmit={submit}
          className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] p-3 space-y-3.5"
        >
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-stone-700">What are you looking for?</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Inquiry type">
              {CATEGORIES.map(({ key, icon: Icon, hint }) => {
                const selected = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setCategory(key);
                      setSent(false);
                    }}
                    className={`rounded-xl border p-2.5 flex flex-col items-center gap-1 text-center transition-colors cursor-pointer ${
                      selected
                        ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${selected ? 'text-brand-700' : 'text-stone-500'}`} />
                    <span className={`text-[12px] font-bold ${selected ? 'text-brand-800' : 'text-stone-800'}`}>
                      {INQUIRY_CATEGORY_LABELS[key]}
                    </span>
                    <span className="text-[9.5px] text-stone-400 leading-tight">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="inquiry-budget" className="text-[11px] font-bold text-stone-700 block">
              Your Budget (₹) <span className="font-normal text-stone-400">optional</span>
            </label>
            <input
              id="inquiry-budget"
              type="number"
              inputMode="numeric"
              min="0"
              max="10000000"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="e.g. 20000"
              className={`${inputClass} tabular-nums`}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="inquiry-message" className="text-[11px] font-bold text-stone-700 block">
              Reason for Inquiry
            </label>
            <textarea
              id="inquiry-message"
              rows={4}
              maxLength={1000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                category === 'service'
                  ? 'e.g. Screen is cracked on my Samsung A54'
                  : category === 'accessories'
                    ? 'e.g. Fast charger and back cover for iPhone 15'
                    : 'e.g. Looking for a 5G phone with a good camera'
              }
              className={`${inputClass} resize-none`}
            />
          </div>

          {error && <p className="text-[11px] text-rose-600">{error}</p>}

          <button
            type="submit"
            disabled={sending}
            className="w-full py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-[13px] transition-colors active:scale-[0.99] cursor-pointer disabled:opacity-60"
          >
            {sending ? 'Sending...' : 'Send Inquiry'}
          </button>
        </form>

        {history?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] overflow-hidden">
            <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
              <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-stone-600">My Inquiries</h3>
            </div>
            <ul className="divide-y divide-stone-100">
              {history.map((inq) => {
                const badge = STATUS_BADGE[inq.status] ?? STATUS_BADGE.new;
                return (
                  <li key={inq.id} className="px-3 py-2.5 flex items-start gap-2.5 text-xs">
                    <div className="w-6.5 h-6.5 rounded bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <MessageSquareText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-stone-800">
                          {INQUIRY_CATEGORY_LABELS[inq.category]}
                          {inq.budget != null && (
                            <span className="font-semibold text-stone-500"> · {formatINR(inq.budget)}</span>
                          )}
                        </span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9.5px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-stone-600 leading-snug break-words mt-0.5">{inq.message}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{formatDate(inq.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
