import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Gift, Lock, PartyPopper } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { userService } from '../../../services/userService';
import { GENDER_LABELS } from '../../../utils/formatters';
import { PhotoEditor } from '../../../components/PhotoEditor';
import { describeDiscount, offerService } from '../../../services/offerService';

const GENDERS = Object.entries(GENDER_LABELS).map(([id, label]) => ({ id, label }));

const INTERESTS = ['Mobile', 'Accessories', 'Service'];

// Today as "YYYY-MM-DD" in the phone's time zone — the latest selectable birthday / anniversary
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const toForm = (user) => ({
  name: user?.name ?? '',
  email: user?.email ?? '',
  dob: user?.dob ?? '',
  gender: user?.gender ?? '',
  anniversaryDate: user?.anniversaryDate ?? '',
  address: user?.address ?? '',
  city: user?.city ?? '',
  pincode: user?.pincode ?? '',
  interest: user?.interest ?? 'Mobile',
});

const validate = (form) => {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (form.pincode.trim() && !/^[1-9]\d{5}$/.test(form.pincode.trim())) {
    errors.pincode = 'Pincode must be a valid 6-digit code';
  }
  const today = todayLocal();
  if (form.dob && form.dob > today) errors.dob = 'Date of birth cannot be in the future';
  if (form.anniversaryDate && form.anniversaryDate > today) {
    errors.anniversaryDate = 'Anniversary date cannot be in the future';
  }
  return errors;
};

const inputClass = (hasError) =>
  `w-full px-3 py-2 rounded-lg border bg-white text-[13px] text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 transition-colors ${
    hasError
      ? 'border-rose-300 focus:ring-rose-200'
      : 'border-stone-200 focus:border-brand-400 focus:ring-brand-100'
  }`;

const Field = ({ label, hint, error, children }) => (
  <label className="block space-y-1">
    <span className="text-[11px] font-bold text-stone-600">
      {label}
      {hint && <span className="font-medium text-stone-400"> · {hint}</span>}
    </span>
    {children}
    {error && <span className="block text-[10.5px] font-medium text-rose-600">{error}</span>}
  </label>
);

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] overflow-hidden">
    <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
      <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-stone-600">{title}</h3>
    </div>
    <div className="p-3 space-y-3">{children}</div>
  </div>
);

export const EditProfilePage = () => {
  const navigate = useNavigate();
  const { user, refreshUser, finishProfileReview } = useAuth();
  // Arriving right after the first sign-in to an account the store created while billing
  const [searchParams] = useSearchParams();
  const welcome = searchParams.get('welcome') === '1';
  const placeholderName = user?.name === 'Customer';
  const [form, setForm] = useState(() => ({ ...toForm(user), name: placeholderName ? '' : user?.name ?? '' }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState('');
  // A welcome voucher that unlocks when the profile is 100% complete (anniversary and photo optional)
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    let active = true;
    offerService
      .getWelcomeOffer()
      .then((data) => {
        const locked = data.vouchers?.find((v) => v.status === 'locked');
        if (active && locked) setOffer({ voucher: locked, profile: data.profile });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const neededForOffer = new Set((offer?.profile?.missingFields ?? []).map((f) => f.field));
  const hint = (field) => (neededForOffer.has(field) ? 'needed for your offer' : 'optional');

  const today = todayLocal();

  const set = (field) => (e) => {
    const value = typeof e === 'string' ? e : e.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const goBack = () => {
    if (welcome) finishProfileReview();
    navigate(welcome ? '/home' : '/profile', { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const found = validate(form);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    setSaving(true);
    try {
      await userService.updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        dob: form.dob,
        gender: form.gender,
        anniversaryDate: form.anniversaryDate,
        address: form.address.trim(),
        city: form.city.trim(),
        pincode: form.pincode.trim(),
        interest: form.interest,
      });
      await refreshUser().catch(() => {});
      goBack();
    } catch (err) {
      // Map server-side field errors back onto the form where possible
      const fieldErrors = {};
      (err.errors || []).forEach(({ field, message }) => {
        const key = String(field || '').split('.').pop();
        if (key in form && !fieldErrors[key]) fieldErrors[key] = message;
      });
      setErrors(fieldErrors);
      setFormError(err.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-cream-50/95 backdrop-blur-sm border-b border-stone-200/80 px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          aria-label="Back to profile"
          className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-700 cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <h1 className="text-[15px] font-black text-ink-900 tracking-tight">Edit Profile</h1>
      </div>

      <form onSubmit={handleSubmit} noValidate className="p-3.5 sm:p-4 space-y-3 pb-6">
        {offer && (
          <div className="rounded-xl bg-brand-50 border border-brand-200/80 p-3 space-y-2">
            <div className="flex gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
                <Gift className="w-4 h-4" />
              </div>
              <div className="text-[12px] leading-snug">
                <p className="font-bold text-ink-900">
                  Complete 100% of your profile to unlock {offer.voucher.discount.type === 'free_item' ? describeDiscount(offer.voucher.discount) : offer.voucher.title}
                </p>
                <p className="text-stone-600 mt-0.5">
                  Profile {offer.profile.percent}% complete · fill the fields marked &ldquo;needed for your offer&rdquo; and save.
                </p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-white border border-brand-100 overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full" style={{ width: `${offer.profile.percent}%` }} />
            </div>
          </div>
        )}
        {welcome && (
          <div className="rounded-xl bg-brand-50 border border-brand-200/80 p-3 flex gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white text-brand-600 flex items-center justify-center shrink-0 border border-brand-100">
              <PartyPopper className="w-4 h-4" />
            </div>
            <div className="text-[12px] leading-snug">
              <p className="font-bold text-ink-900">Welcome to Sundhamata Mobile!</p>
              <p className="text-stone-600 mt-0.5">
                Your purchases and loyalty points from the store are already here. Please confirm your name and
                add any details you like.
              </p>
            </div>
          </div>
        )}
        <Section title="Basic Details">
          <div className="flex items-center gap-3">
            <PhotoEditor
              customer={user}
              onUpload={async (blob) => {
                setPhotoError('');
                await userService.uploadPhoto(blob);
                await refreshUser().catch(() => {});
              }}
              onRemove={async () => {
                setPhotoError('');
                await userService.removePhoto();
                await refreshUser().catch(() => {});
              }}
              onError={setPhotoError}
            />
            <div className="text-[11px] leading-snug">
              <p className="font-bold text-stone-700">Profile photo</p>
              <p className="text-stone-400">Helps the store team recognise you at the counter.</p>
              {photoError && <p className="text-rose-600 mt-0.5">{photoError}</p>}
            </div>
          </div>

          <Field label="Full Name" error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              maxLength={80}
              autoComplete="name"
              className={inputClass(errors.name)}
            />
          </Field>

          <Field label="Mobile Number" hint="used to sign in">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-200 bg-stone-50 text-[13px] text-stone-500 font-mono tabular-nums">
              <span className="flex-1">{user?.phone}</span>
              <Lock className="w-3.5 h-3.5 text-stone-400" />
            </div>
          </Field>

          <Field label="Email" hint={hint('email')} error={errors.email}>
            <input
              type="email"
              inputMode="email"
              value={form.email}
              onChange={set('email')}
              placeholder="you@example.com"
              autoComplete="email"
              className={inputClass(errors.email)}
            />
          </Field>
        </Section>

        <Section title="Personal Details">
          <Field label="Date of Birth" hint={hint('dob')} error={errors.dob}>
            <input
              type="date"
              value={form.dob}
              onChange={set('dob')}
              min="1900-01-01"
              max={today}
              className={inputClass(errors.dob)}
            />
          </Field>

          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-stone-600">
              Gender <span className="font-medium text-stone-400">· {hint('gender')}</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {GENDERS.map((g) => {
                const selected = form.gender === g.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set('gender')(selected ? '' : g.id)}
                    className={`px-3 py-1.5 rounded-full border text-[11.5px] font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-brand-600 border-brand-600 text-white'
                        : 'bg-white border-stone-200 text-stone-700 hover:border-brand-300'
                    }`}
                  >
                    {g.label}
                  </button>
                );
              })}
            </div>
            {errors.gender && <span className="block text-[10.5px] font-medium text-rose-600">{errors.gender}</span>}
          </div>

          <Field label="Anniversary Date" hint="optional" error={errors.anniversaryDate}>
            <input
              type="date"
              value={form.anniversaryDate}
              onChange={set('anniversaryDate')}
              min="1900-01-01"
              max={today}
              className={inputClass(errors.anniversaryDate)}
            />
          </Field>
        </Section>

        <Section title="Address">
          <Field label="Address" hint={hint('address')} error={errors.address}>
            <textarea
              value={form.address}
              onChange={set('address')}
              rows={2}
              maxLength={250}
              placeholder="House / flat, street, area"
              autoComplete="street-address"
              className={`${inputClass(errors.address)} resize-none`}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="City" hint={neededForOffer.has('city') ? 'needed for your offer' : undefined} error={errors.city}>
              <input
                type="text"
                value={form.city}
                onChange={set('city')}
                maxLength={80}
                autoComplete="address-level2"
                className={inputClass(errors.city)}
              />
            </Field>
            <Field label="Pincode" hint={neededForOffer.has('pincode') ? 'needed for your offer' : undefined} error={errors.pincode}>
              <input
                type="text"
                inputMode="numeric"
                value={form.pincode}
                onChange={(e) => set('pincode')(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="382405"
                autoComplete="postal-code"
                className={`${inputClass(errors.pincode)} font-mono tabular-nums`}
              />
            </Field>
          </div>
        </Section>

        <Section title="Preferences">
          <div className="space-y-1">
            <span className="block text-[11px] font-bold text-stone-600">Interested In</span>
            <div className="grid grid-cols-3 gap-1.5">
              {INTERESTS.map((item) => {
                const selected = form.interest === item;
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => set('interest')(item)}
                    className={`py-1.5 rounded-lg border text-[11.5px] font-semibold transition-colors cursor-pointer ${
                      selected
                        ? 'bg-brand-50 border-brand-500 text-brand-700'
                        : 'bg-white border-stone-200 text-stone-700 hover:border-brand-300'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {formError && (
          <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-[11.5px] font-medium text-rose-700">
            {formError}
          </div>
        )}

        <div className="flex gap-2 pt-0.5">
          <button
            type="button"
            onClick={goBack}
            className="flex-1 py-2.5 rounded-xl border border-stone-300 bg-white text-stone-700 font-bold text-xs hover:bg-stone-50 transition-colors cursor-pointer"
          >
            {welcome ? 'Skip for now' : 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-[2] py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-[0.98] cursor-pointer"
          >
            {saving ? (
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            {saving ? 'Saving…' : welcome ? 'Save & Continue' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
