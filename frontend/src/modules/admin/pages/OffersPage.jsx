import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Pencil, Play, Plus, Smartphone, TicketPercent, Trash2, X } from 'lucide-react';
import { adminOfferService } from '../../../services/adminOfferService';
import { describeDiscount, describeMinimum } from '../../../utils/coupons';
import { formatDate, formatINR } from '../../../utils/formatters';
import { useToast } from '../context/ToastContext';

const CATEGORY_OPTIONS = [
  { value: 'phones', label: 'Mobiles' },
  { value: 'accessories', label: 'Accessories' },
  { value: 'service', label: 'Services' },
];
const CATEGORY_NAMES = { phones: 'Mobiles', accessories: 'Accessories', service: 'Services' };

const AUDIENCES = [
  { value: 'all', label: 'All customers', hint: 'Anyone, also walk-ins who are not on the app' },
  { value: 'first_purchase', label: 'First purchase only', hint: 'Customers buying from the store for the first time' },
  { value: 'new_app_users', label: 'New app users', hint: 'Customers who joined through the app' },
  { value: 'profile_complete', label: '100% profile complete', hint: 'Shown locked in the app until the profile is complete' },
];
const AUDIENCE_LABELS = Object.fromEntries(AUDIENCES.map((a) => [a.value, a.label]));

const DISCOUNT_TYPES = [
  { value: 'flat', label: '₹ Off' },
  { value: 'percent', label: '% Off' },
  { value: 'free_item', label: 'Free Item' },
];

const STATUS = {
  active: { label: 'Active', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  scheduled: { label: 'Scheduled', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  paused: { label: 'Paused', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ended: { label: 'Ended', className: 'bg-stone-100 text-stone-500 border-stone-200' },
  used_up: { label: 'Fully used', className: 'bg-stone-100 text-stone-500 border-stone-200' },
};

const inputClass =
  'w-full px-3 py-2 bg-white border rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs';

/** Date → "YYYY-MM-DD" in store time (India) */
const istDay = (value) => new Date(new Date(value).getTime() + 330 * 60000).toISOString().slice(0, 10);

const EMPTY_FORM = {
  code: '',
  title: '',
  description: '',
  type: 'flat',
  value: '',
  maxAmount: '',
  itemName: '',
  appliesTo: [],
  minBillAmount: '',
  audience: 'all',
  startsAt: istDay(Date.now()),
  endsAt: '',
  validityDays: '',
  usesPerCustomer: '1',
  totalUses: '',
  showInApp: true,
};

const formFromOffer = (o) => ({
  code: o.code,
  title: o.title ?? '',
  description: o.description ?? '',
  type: o.discount.type,
  value: String(o.discount.value),
  maxAmount: o.discount.maxAmount ? String(o.discount.maxAmount) : '',
  itemName: o.discount.itemName ?? '',
  appliesTo: o.appliesTo,
  minBillAmount: o.minBillAmount ? String(o.minBillAmount) : '',
  audience: o.audience,
  startsAt: istDay(o.startsAt),
  endsAt: o.endsAt ? istDay(o.endsAt) : '',
  validityDays: o.validityDays ? String(o.validityDays) : '',
  usesPerCustomer: String(o.usesPerCustomer),
  totalUses: o.totalUses ? String(o.totalUses) : '',
  showInApp: o.showInApp,
});

/** The name customers see when no title is typed (same rule as the server) */
const automaticTitle = (form) => {
  if (form.type === 'free_item') return `Free ${form.itemName || 'item'}`;
  const value = Number(form.value) || 0;
  const off = form.type === 'percent' ? `${value}% off` : `${formatINR(value)} off`;
  return form.appliesTo.length ? `${off} ${form.appliesTo.map((c) => CATEGORY_NAMES[c]).join(' & ')}` : off;
};

const Field = ({ label, htmlFor, error, hint, className = '', children }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="font-medium text-stone-700 block" htmlFor={htmlFor}>{label}</label>
    {children}
    {error ? <p className="text-[11px] text-rose-600">{error}</p> : hint ? <p className="text-[11px] text-stone-400">{hint}</p> : null}
  </div>
);

/** Create / edit an offer */
const OfferForm = ({ initial, onClose, onSaved }) => {
  const { showError } = useToast();
  const [form, setForm] = useState(() => (initial ? formFromOffer(initial) : EMPTY_FORM));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [field]: field === 'code' ? value.toUpperCase().replace(/[^A-Z0-9]/g, '') : value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  };
  const toggleCategory = (value) =>
    setForm((prev) => ({
      ...prev,
      appliesTo: prev.appliesTo.includes(value) ? prev.appliesTo.filter((c) => c !== value) : [...prev.appliesTo, value],
    }));

  const inputCls = (field) => `${inputClass} ${errors[field] ? 'border-rose-400' : 'border-stone-300'}`;
  const title = form.title.trim() || automaticTitle(form);
  const preview = {
    discount: { type: form.type, value: Number(form.value) || 0, maxAmount: Number(form.maxAmount) || null, itemName: form.itemName },
    appliesTo: form.appliesTo,
    minBillAmount: Number(form.minBillAmount) || 0,
  };

  const validate = () => {
    const next = {};
    if (!/^[A-Z0-9]{4,20}$/.test(form.code)) next.code = 'Use 4–20 letters or digits, e.g. DIWALI500';
    if (!(Number(form.value) > 0)) next.value = 'Enter the discount';
    else if (form.type === 'percent' && Number(form.value) > 100) next.value = 'A percentage cannot be more than 100';
    if (form.type === 'free_item' && form.itemName.trim().length < 2) next.itemName = 'Enter the free item';
    if (!form.startsAt) next.startsAt = 'Choose the start date';
    if (form.endsAt && form.endsAt < form.startsAt) next.endsAt = 'The end date must be after the start date';
    if (!(Number(form.usesPerCustomer) >= 1)) next.usesPerCustomer = 'At least once';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        code: form.code,
        title: form.title.trim() || null,
        description: form.description.trim() || null,
        discount: {
          type: form.type,
          value: Number(form.value),
          maxAmount: form.type === 'percent' && form.maxAmount ? Number(form.maxAmount) : null,
          itemName: form.type === 'free_item' ? form.itemName.trim() : null,
        },
        appliesTo: form.appliesTo,
        minBillAmount: form.minBillAmount ? Number(form.minBillAmount) : null,
        audience: form.audience,
        startsAt: form.startsAt,
        endsAt: form.endsAt || null,
        validityDays: form.validityDays ? Number(form.validityDays) : null,
        usesPerCustomer: Number(form.usesPerCustomer),
        totalUses: form.totalUses ? Number(form.totalUses) : null,
        showInApp: form.showInApp,
      };
      const saved = initial ? await adminOfferService.update(initial.id, body) : await adminOfferService.create(body);
      onSaved(saved, Boolean(initial));
    } catch (err) {
      // Show the server's field errors next to the fields ("discount.value" → "value")
      const fieldErrors = Object.fromEntries((err.errors ?? []).map((fe) => [String(fe.field ?? '').split('.').pop(), fe.message]));
      if (Object.keys(fieldErrors).length) setErrors(fieldErrors);
      showError('Error', err.message || 'Could not save the offer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-stone-900/50 backdrop-blur-xs overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        noValidate
        className="w-full max-w-3xl bg-white rounded-xl border border-stone-200 shadow-xl text-xs my-4"
        aria-label={initial ? 'Edit coupon' : 'Create coupon'}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-900">{initial ? `Edit ${initial.code}` : 'Create Coupon'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-[1fr_240px] gap-5 p-5">
          <div className="space-y-5">
            {/* Code & name */}
            <section className="grid grid-cols-2 gap-3">
              <Field label="Coupon Code *" htmlFor="offer-code" error={errors.code} hint="Customers show or say this at the counter" className="col-span-2 sm:col-span-1">
                <input
                  id="offer-code"
                  value={form.code}
                  onChange={set('code')}
                  maxLength={20}
                  placeholder="DIWALI500"
                  autoComplete="off"
                  spellCheck={false}
                  className={`${inputCls('code')} font-mono font-semibold tracking-wider uppercase`}
                />
              </Field>
              <Field label="Name (optional)" htmlFor="offer-title" error={errors.title} hint={`Shown as "${automaticTitle(form)}" if left empty`} className="col-span-2 sm:col-span-1">
                <input id="offer-title" value={form.title} onChange={set('title')} maxLength={60} placeholder={automaticTitle(form)} className={inputCls('title')} />
              </Field>
            </section>

            {/* Discount */}
            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Discount</h4>
              <div className="inline-flex rounded-lg border border-stone-300 p-0.5 bg-stone-50" role="radiogroup" aria-label="Discount type">
                {DISCOUNT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={form.type === t.value}
                    onClick={() => setForm((prev) => ({ ...prev, type: t.value }))}
                    className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${form.type === t.value ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {form.type === 'free_item' && (
                  <Field label="Free Item *" htmlFor="offer-item" error={errors.itemName}>
                    <input id="offer-item" value={form.itemName} onChange={set('itemName')} maxLength={60} placeholder="6D Toughened Glass" className={inputCls('itemName')} />
                  </Field>
                )}
                <Field
                  label={form.type === 'percent' ? 'Discount (%) *' : form.type === 'free_item' ? 'Item value (₹) *' : 'Discount (₹) *'}
                  htmlFor="offer-value"
                  error={errors.value}
                  hint={form.type === 'free_item' ? 'Taken off the bill, up to this much' : undefined}
                >
                  <input id="offer-value" type="number" min="1" max={form.type === 'percent' ? 100 : undefined} value={form.value} onChange={set('value')} className={`${inputCls('value')} tabular-nums`} />
                </Field>
                {form.type === 'percent' && (
                  <Field label="Maximum discount (₹)" htmlFor="offer-max" error={errors.maxAmount} hint="Optional cap">
                    <input id="offer-max" type="number" min="1" value={form.maxAmount} onChange={set('maxAmount')} placeholder="No limit" className={`${inputCls('maxAmount')} tabular-nums`} />
                  </Field>
                )}
                <Field label="Minimum bill (₹)" htmlFor="offer-min" error={errors.minBillAmount} hint={form.appliesTo.length ? 'Only the chosen products count' : 'Optional'}>
                  <input id="offer-min" type="number" min="0" value={form.minBillAmount} onChange={set('minBillAmount')} placeholder="No minimum" className={`${inputCls('minBillAmount')} tabular-nums`} />
                </Field>
              </div>
              <div className="space-y-1.5">
                <span className="font-medium text-stone-700 block">Applies to</span>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((c) => (
                    <label
                      key={c.value}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border cursor-pointer ${form.appliesTo.includes(c.value) ? 'border-brand-400 bg-brand-50 text-brand-800' : 'border-stone-300 text-stone-600'}`}
                    >
                      <input type="checkbox" checked={form.appliesTo.includes(c.value)} onChange={() => toggleCategory(c.value)} className="w-3.5 h-3.5 accent-brand-600" />
                      {c.label}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-stone-400">{form.appliesTo.length ? 'Only these products get the discount.' : 'Nothing ticked = the whole bill.'}</p>
              </div>
            </section>

            {/* Who & when */}
            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Who &amp; when</h4>
              <Field label="Who can use it" htmlFor="offer-audience" hint={AUDIENCES.find((a) => a.value === form.audience)?.hint}>
                <select id="offer-audience" value={form.audience} onChange={set('audience')} className={`${inputCls('audience')} cursor-pointer`}>
                  {AUDIENCES.map((a) => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Starts on *" htmlFor="offer-start" error={errors.startsAt}>
                  <input id="offer-start" type="date" value={form.startsAt} onChange={set('startsAt')} className={inputCls('startsAt')} />
                </Field>
                <Field label="Ends on" htmlFor="offer-end" error={errors.endsAt} hint="Empty = no end date">
                  <input id="offer-end" type="date" value={form.endsAt} min={form.startsAt} onChange={set('endsAt')} className={inputCls('endsAt')} />
                </Field>
                <Field label="Valid for (days)" htmlFor="offer-validity" error={errors.validityDays} hint="After the customer claims it" className="col-span-2 sm:col-span-1">
                  <input id="offer-validity" type="number" min="1" value={form.validityDays} onChange={set('validityDays')} placeholder="Till the end date" className={`${inputCls('validityDays')} tabular-nums`} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Uses per customer *" htmlFor="offer-per-customer" error={errors.usesPerCustomer} hint="How many bills one customer can use it on">
                  <input id="offer-per-customer" type="number" min="1" max="100" value={form.usesPerCustomer} onChange={set('usesPerCustomer')} className={`${inputCls('usesPerCustomer')} tabular-nums`} />
                </Field>
                <Field label="Total uses" htmlFor="offer-total" error={errors.totalUses} hint="e.g. first 100 bills; empty = no limit">
                  <input id="offer-total" type="number" min="1" value={form.totalUses} onChange={set('totalUses')} placeholder="No limit" className={`${inputCls('totalUses')} tabular-nums`} />
                </Field>
              </div>
            </section>

            {/* In the app */}
            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">In the app</h4>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" checked={form.showInApp} onChange={set('showInApp')} className="w-4 h-4 mt-0.5 accent-brand-600" />
                <span>
                  <span className="font-medium text-stone-800 block">Show in the customer app</span>
                  <span className="text-[11px] text-stone-400">
                    As a scratch card under My Coupons. Untick for a code only staff use at the counter.
                  </span>
                </span>
              </label>
              <Field label="Description (optional)" htmlFor="offer-description" hint="Shown under the name in the app">
                <textarea
                  id="offer-description"
                  rows={2}
                  value={form.description}
                  onChange={set('description')}
                  maxLength={200}
                  placeholder="e.g. Diwali special: ₹500 off any smartphone"
                  className={`${inputCls('description')} resize-none`}
                />
              </Field>
            </section>
          </div>

          {/* Live preview */}
          <aside className="md:sticky md:top-4 self-start space-y-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">Preview</span>
            <div className="rounded-xl border border-brand-200 bg-white overflow-hidden shadow-2xs">
              <div className="bg-gradient-to-r from-brand-600 to-brand-500 px-3.5 py-2 text-white flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
                <TicketPercent className="w-3.5 h-3.5" />
                Coupon
              </div>
              <div className="p-3.5 space-y-2">
                <p className="text-[15px] font-bold text-stone-900 leading-tight">{title}</p>
                <p className="text-[11px] text-stone-500">
                  {form.description.trim() || [describeDiscount(preview.discount), describeMinimum(preview)].filter(Boolean).join(' ')}
                </p>
                <div className="rounded-lg border border-dashed border-stone-300 py-1.5 text-center font-mono font-bold tracking-widest text-stone-800">
                  {form.code || 'CODE'}
                </div>
                <p className="text-[10.5px] text-stone-400">
                  {form.endsAt ? `Till ${formatDate(`${form.endsAt}T12:00:00`)}` : 'No end date'}
                  {form.validityDays ? ` · ${form.validityDays} days after claiming` : ''}
                </p>
              </div>
            </div>
            <p className="text-[11px] text-stone-400 leading-relaxed">
              {form.showInApp ? 'Customers scratch it in the app to get their own QR.' : 'Not shown in the app.'} Staff can also type{' '}
              <span className="font-mono font-semibold text-stone-600">{form.code || 'the code'}</span> on Record Purchase.
            </p>
            {initial && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
                Changes apply to coupons claimed from now on. Customers who already claimed it keep their terms.
              </p>
            )}
          </aside>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-stone-100">
          <button type="button" onClick={onClose} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50">
            {saving ? 'Saving...' : initial ? 'Save Changes' : 'Create Coupon'}
          </button>
        </div>
      </form>
    </div>
  );
};

const validityText = (o) => {
  const from = new Date(o.startsAt) > new Date() ? `From ${formatDate(o.startsAt)}` : null;
  const till = o.endsAt ? `till ${formatDate(o.endsAt)}` : 'no end date';
  return from ? `${from}, ${till}` : till.charAt(0).toUpperCase() + till.slice(1);
};

/**
 * Coupons the staff create themselves (Diwali offers, ₹ off on accessories, first-purchase
 * deals…). Customers claim them in the app; staff type the code on Record Purchase.
 */
export const OffersPage = () => {
  const { showSuccess, showError } = useToast();
  const [offers, setOffers] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState(null); // offer, or 'new'
  const [deleting, setDeleting] = useState(null);
  const [filter, setFilter] = useState('current');

  useEffect(() => {
    let active = true;
    adminOfferService
      .list()
      .then((items) => active && setOffers(items))
      .catch((err) => active && showError('Error', err.message || 'Could not load coupons.'));
    return () => {
      active = false;
    };
  }, [reloadKey, showError]);

  const shown = useMemo(() => {
    if (!offers) return null;
    if (filter === 'current') return offers.filter((o) => ['active', 'scheduled', 'paused'].includes(o.status));
    if (filter === 'past') return offers.filter((o) => ['ended', 'used_up'].includes(o.status));
    return offers;
  }, [offers, filter]);
  const pastCount = offers?.filter((o) => ['ended', 'used_up'].includes(o.status)).length ?? 0;

  const togglePause = async (offer) => {
    try {
      await adminOfferService.update(offer.id, { isActive: !offer.isActive });
      showSuccess(offer.isActive ? 'Coupon paused' : 'Coupon resumed', offer.isActive ? `${offer.code} cannot be used until you resume it.` : `${offer.code} can be used again.`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Error', err.message || 'Could not update the coupon.');
    }
  };

  const confirmDelete = async () => {
    try {
      await adminOfferService.remove(deleting.id);
      showSuccess('Coupon deleted', deleting.code);
      setDeleting(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      showError('Cannot delete', err.message || 'Could not delete the coupon.');
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Coupons</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            Create your own coupon codes. Customers claim them in the app; use the code on Record Purchase.
          </p>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Coupon
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-stone-200 p-0.5 bg-white text-xs shadow-2xs" role="tablist">
          {[
            ['current', 'Current'],
            ['past', `Ended${pastCount ? ` (${pastCount})` : ''}`],
            ['all', 'All'],
          ].map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${filter === value ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-stone-400">
          Welcome vouchers (WELCOME6D, SAVE200) are set in{' '}
          <Link to="/admin/settings" className="text-brand-700 hover:underline">Settings</Link>.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-stone-50/80 text-stone-500 border-b border-stone-100">
              <tr>
                <th className="py-2.5 px-5 font-medium">Coupon</th>
                <th className="py-2.5 px-4 font-medium">Discount</th>
                <th className="py-2.5 px-4 font-medium">Who</th>
                <th className="py-2.5 px-4 font-medium">Valid</th>
                <th className="py-2.5 px-4 font-medium text-right">Used</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {!shown &&
                [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-5 py-3">
                      <div className="h-4 bg-stone-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              {shown?.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-stone-400">
                    <TicketPercent className="w-7 h-7 mx-auto mb-2 opacity-60" />
                    {filter === 'past' ? 'No ended coupons.' : 'No coupons yet. Create one for your next offer.'}
                  </td>
                </tr>
              )}
              {shown?.map((o) => {
                const status = STATUS[o.status];
                return (
                  <tr key={o.id} className="hover:bg-stone-50/60">
                    <td className="py-3 px-5">
                      <span className="font-mono font-semibold text-stone-900 tracking-wider block">{o.code}</span>
                      <span className="text-[11px] text-stone-500 flex items-center gap-1">
                        {o.displayTitle}
                        {o.showInApp ? (
                          <Smartphone className="w-3 h-3 text-stone-400" aria-label="Shown in the app" />
                        ) : (
                          <span className="text-stone-400">· counter only</span>
                        )}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-700 max-w-[220px]">
                      <span className="block">{describeDiscount(o.discount)}</span>
                      {describeMinimum(o) && <span className="block text-[11px] text-stone-400">{describeMinimum(o)}</span>}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      <span className="block whitespace-nowrap">{AUDIENCE_LABELS[o.audience]}</span>
                      <span className="block text-[11px] text-stone-400 whitespace-nowrap">
                        {o.usesPerCustomer === 1 ? 'Once per customer' : `${o.usesPerCustomer}× per customer`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-600 whitespace-nowrap">
                      {validityText(o)}
                      {o.validityDays && <span className="block text-[11px] text-stone-400">{o.validityDays} days after claiming</span>}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <span className="tabular-nums font-medium text-stone-800">
                        {o.stats.used}
                        {o.totalUses ? <span className="text-stone-400 font-normal"> / {o.totalUses}</span> : null}
                      </span>
                      <span className="block text-[11px] text-stone-400">{o.stats.customers} customer{o.stats.customers === 1 ? '' : 's'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10.5px] font-semibold border rounded-md px-1.5 py-0.5 whitespace-nowrap ${status.className}`}>{status.label}</span>
                    </td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <button
                        onClick={() => togglePause(o)}
                        className="p-1.5 text-stone-400 hover:text-amber-700 rounded-md hover:bg-stone-100 cursor-pointer"
                        aria-label={o.isActive ? `Pause ${o.code}` : `Resume ${o.code}`}
                        title={o.isActive ? 'Pause' : 'Resume'}
                      >
                        {o.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setEditing(o)}
                        className="p-1.5 text-stone-400 hover:text-brand-700 rounded-md hover:bg-stone-100 cursor-pointer"
                        aria-label={`Edit ${o.code}`}
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(o)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 rounded-md hover:bg-stone-100 cursor-pointer"
                        aria-label={`Delete ${o.code}`}
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <OfferForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, wasEdit) => {
            showSuccess(wasEdit ? 'Coupon updated' : 'Coupon created', `${saved.code}: ${saved.displayTitle}`);
            setEditing(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={() => setDeleting(null)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-stone-900">Delete {deleting.code}?</h3>
            <p className="text-stone-500">
              {deleting.stats.customers > 0
                ? 'Customers have already claimed or used this coupon, so it cannot be deleted. Pause it instead.'
                : 'Nobody has claimed or used it yet. The code stops working straight away.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
                Cancel
              </button>
              {deleting.stats.customers > 0 ? (
                <button
                  onClick={() => {
                    if (deleting.isActive) togglePause(deleting);
                    setDeleting(null);
                  }}
                  className="py-2 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer"
                >
                  {deleting.isActive ? 'Pause instead' : 'OK'}
                </button>
              ) : (
                <button onClick={confirmDelete} className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer">
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
