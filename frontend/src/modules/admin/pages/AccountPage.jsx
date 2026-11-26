import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Save, UserRound } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { useToast } from '../context/ToastContext';

const inputClass =
  'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs';

// "+918401341508" → "8401341508" for the input
const localMobile = (mobile) => (mobile ? mobile.replace(/^\+91/, '') : '');

const fieldErrors = (err) => Object.fromEntries((err.errors ?? []).filter((e) => e.field).map((e) => [e.field, e.message]));

const PasswordInput = ({ id, value, onChange, autoComplete, error }) => {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`${inputClass} pr-9 ${error ? 'border-rose-400' : ''}`}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
          aria-label={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-600 mt-1">{error}</p>}
    </div>
  );
};

const Field = ({ label, htmlFor, hint, error, children }) => (
  <div className="space-y-1">
    <label htmlFor={htmlFor} className="font-medium text-stone-700 block">
      {label}
    </label>
    {children}
    {error ? <p className="text-[11px] text-rose-600">{error}</p> : hint && <p className="text-[11px] text-stone-400">{hint}</p>}
  </div>
);

/** Signed-in admin's own details: name, email, mobile and password */
export const AccountPage = () => {
  const { admin, updateProfile, changePassword } = useAdminAuth();
  const { showSuccess, showError } = useToast();

  const [details, setDetails] = useState(() => ({ name: admin?.name ?? '', email: admin?.email ?? '', mobile: localMobile(admin?.mobile) }));
  const [detailsPassword, setDetailsPassword] = useState('');
  const [detailsErrors, setDetailsErrors] = useState({});
  const [savingDetails, setSavingDetails] = useState(false);

  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [savingPassword, setSavingPassword] = useState(false);

  if (!admin) return null;

  const patch = {};
  if (details.name.trim() !== admin.name) patch.name = details.name.trim();
  if (details.email.trim().toLowerCase() !== admin.email) patch.email = details.email.trim();
  const typedDigits = details.mobile.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
  if (typedDigits !== localMobile(admin.mobile)) patch.mobile = details.mobile.trim() || null;
  const changed = Object.keys(patch).length > 0;
  // Email and mobile are used to sign in, so changing them needs the current password
  const needsPassword = patch.email !== undefined || patch.mobile !== undefined;

  const saveDetails = async (e) => {
    e.preventDefault();
    setDetailsErrors({});
    if (needsPassword && !detailsPassword) {
      setDetailsErrors({ currentPassword: 'Enter your current password to change your email or mobile' });
      return;
    }
    setSavingDetails(true);
    try {
      const fresh = await updateProfile({ ...patch, ...(needsPassword ? { currentPassword: detailsPassword } : {}) });
      setDetails({ name: fresh.name, email: fresh.email, mobile: localMobile(fresh.mobile) });
      setDetailsPassword('');
      showSuccess('Details saved', needsPassword ? 'Use your new email / mobile next time you sign in.' : undefined);
    } catch (err) {
      const errors = fieldErrors(err);
      setDetailsErrors(errors);
      if (!Object.keys(errors).length) showError('Error', err.message || 'Could not save your details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!passwords.current) errors.currentPassword = 'Enter your current password';
    if (passwords.next.length < 8) errors.newPassword = 'Use at least 8 characters';
    else if (!/[A-Za-z]/.test(passwords.next) || !/\d/.test(passwords.next)) errors.newPassword = 'Use letters and at least one number';
    if (passwords.confirm !== passwords.next) errors.confirm = 'The two new passwords do not match';
    setPasswordErrors(errors);
    if (Object.keys(errors).length) return;

    setSavingPassword(true);
    try {
      await changePassword({ currentPassword: passwords.current, newPassword: passwords.next });
      setPasswords({ current: '', next: '', confirm: '' });
      showSuccess('Password changed', 'You stay signed in here. Other devices have been signed out.');
    } catch (err) {
      const fieldErrs = fieldErrors(err);
      setPasswordErrors(fieldErrs);
      if (!Object.keys(fieldErrs).length) showError('Error', err.message || 'Could not change the password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="pb-4 border-b border-stone-200/80">
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">My Account</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Your own sign-in details for this admin panel. Signed in as {admin.roleLabel || admin.role}.
        </p>
      </div>

      {/* Details */}
      <form onSubmit={saveDetails} className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <UserRound className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-stone-900">Your details</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" htmlFor="acc-name" error={detailsErrors.name}>
            <input
              id="acc-name"
              value={details.name}
              onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))}
              maxLength={80}
              required
              autoComplete="name"
              className={inputClass}
            />
          </Field>
          <Field label="Email (used to sign in)" htmlFor="acc-email" error={detailsErrors.email}>
            <input
              id="acc-email"
              type="email"
              value={details.email}
              onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))}
              required
              autoComplete="email"
              className={inputClass}
            />
          </Field>
          <Field
            label="Mobile (optional, can also be used to sign in)"
            htmlFor="acc-mobile"
            error={detailsErrors.mobile}
            hint="10-digit Indian mobile number. Leave empty to sign in with email only."
          >
            <input
              id="acc-mobile"
              type="tel"
              inputMode="numeric"
              value={details.mobile}
              onChange={(e) => setDetails((d) => ({ ...d, mobile: e.target.value }))}
              placeholder="e.g. 8401341508"
              autoComplete="tel-national"
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          {needsPassword && (
            <Field label="Current password" htmlFor="acc-details-password" hint="Needed to change your email or mobile.">
              <PasswordInput
                id="acc-details-password"
                value={detailsPassword}
                onChange={setDetailsPassword}
                autoComplete="current-password"
                error={detailsErrors.currentPassword}
              />
            </Field>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!changed || savingDetails}
            className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {savingDetails ? 'Saving...' : 'Save details'}
          </button>
        </div>
      </form>

      {/* Password */}
      <form onSubmit={savePassword} className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-4 text-xs">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-stone-900">Change password</h2>
        </div>
        {/* Lets password managers link the new password to this account */}
        <input type="text" name="username" autoComplete="username" value={admin.email} readOnly hidden />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Current password" htmlFor="acc-current">
            <PasswordInput
              id="acc-current"
              value={passwords.current}
              onChange={(v) => setPasswords((p) => ({ ...p, current: v }))}
              autoComplete="current-password"
              error={passwordErrors.currentPassword}
            />
          </Field>
          <Field label="New password" htmlFor="acc-new">
            <PasswordInput
              id="acc-new"
              value={passwords.next}
              onChange={(v) => setPasswords((p) => ({ ...p, next: v }))}
              autoComplete="new-password"
              error={passwordErrors.newPassword}
            />
          </Field>
          <Field label="Confirm new password" htmlFor="acc-confirm">
            <PasswordInput
              id="acc-confirm"
              value={passwords.confirm}
              onChange={(v) => setPasswords((p) => ({ ...p, confirm: v }))}
              autoComplete="new-password"
              error={passwordErrors.confirm}
            />
          </Field>
        </div>
        <p className="text-[11px] text-stone-400">
          At least 8 characters with letters and a number. Changing it signs out this account everywhere else (other
          computers and phones); you stay signed in here.
        </p>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPassword || !passwords.current || !passwords.next}
            className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <KeyRound className="w-3.5 h-3.5" />
            {savingPassword ? 'Changing...' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
};
