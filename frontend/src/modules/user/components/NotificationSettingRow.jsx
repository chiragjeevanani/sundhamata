import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { pushService } from '../../../services/pushService';

// Profile → My Account: turn push notifications on/off for this browser.
// Hidden where the browser has no web push (e.g. inside the mobile app, which uses its own).
export const NotificationSettingRow = () => {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    pushService.getWebStatus().then((s) => active && setStatus(s));
    return () => {
      active = false;
    };
  }, []);

  if (!status?.supported) return null;

  const blocked = status.permission === 'denied';

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (status.enabled) await pushService.disableWebPush();
      else await pushService.enableWebPush();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatus(await pushService.getWebStatus());
      setBusy(false);
    }
  };

  const hint = error || (blocked ? 'Blocked in browser settings' : 'Purchases, points and offers');

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || blocked}
      role="switch"
      aria-checked={status.enabled}
      className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-stone-50 transition-colors group cursor-pointer disabled:cursor-default"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-6.5 h-6.5 rounded bg-brand-50 text-brand-700 flex items-center justify-center">
          <Bell className="w-3.5 h-3.5" />
        </div>
        <div>
          <span className="font-semibold text-stone-800 group-hover:text-brand-700 transition-colors block leading-tight">
            Notifications
          </span>
          <span className={`text-[9.5px] ${error ? 'text-rose-600' : 'text-stone-400'}`}>{hint}</span>
        </div>
      </div>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-4.5 w-8 shrink-0 rounded-full transition-colors ${
          status.enabled ? 'bg-brand-600' : 'bg-stone-300'
        } ${busy ? 'opacity-60' : ''}`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            status.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
};
