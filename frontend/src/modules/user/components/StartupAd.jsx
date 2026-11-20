import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { posterUrl, startupAdService } from '../../../services/startupAdService';

// Advertisement poster shown full screen when the customer app opens (Admin → Advertisement).
// Once per app launch: a fresh WebView / tab starts a new session, a page reload does not.
// The Skip button appears after the admin's skip time; the poster stays until skipped, or until
// the admin's optional auto-close time.

const SEEN_KEY = 'sm_startup_ad_seen';
// Give up quietly if the poster takes longer than this to load (slow network)
const LOAD_TIMEOUT_MS = 5000;

let seenThisLaunch = false;
const alreadySeen = () => {
  if (seenThisLaunch) return true;
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
};
const markSeen = () => {
  seenThisLaunch = true;
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // storage unavailable: the module flag still covers this launch
  }
};

export const StartupAd = () => {
  // { src, skipAfterSeconds, autoCloseSeconds } once the poster has loaded
  const [ad, setAd] = useState(null);
  const [shownAt, setShownAt] = useState(0);
  const [now, setNow] = useState(0);

  // Fetch the live ad and preload its poster; show it only when the image is ready
  useEffect(() => {
    if (alreadySeen()) return undefined;
    let cancelled = false;
    let timer;
    startupAdService
      .getLive()
      .then((live) => {
        if (cancelled || !live) return;
        const src = posterUrl(live.posterPath);
        const img = new Image();
        timer = setTimeout(() => {
          cancelled = true;
        }, LOAD_TIMEOUT_MS);
        img.onload = () => {
          clearTimeout(timer);
          if (cancelled || alreadySeen()) return;
          markSeen();
          const t = Date.now();
          setShownAt(t);
          setNow(t);
          setAd({ src, skipAfterSeconds: live.skipAfterSeconds, autoCloseSeconds: live.autoCloseSeconds });
        };
        img.onerror = () => clearTimeout(timer);
        img.src = src;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Countdown ticks, and the optional auto-close
  useEffect(() => {
    if (!ad) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 250);
    const close = ad.autoCloseSeconds ? setTimeout(() => setAd(null), ad.autoCloseSeconds * 1000) : null;
    return () => {
      clearInterval(tick);
      clearTimeout(close);
    };
  }, [ad]);

  if (!ad) return null;

  const secondsLeft = Math.max(0, Math.ceil(ad.skipAfterSeconds - (now - shownAt) / 1000));
  const canSkip = secondsLeft === 0;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black flex items-center justify-center select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Advertisement"
    >
      <img src={ad.src} alt="Advertisement" className="w-full h-full object-contain" draggable={false} />

      <div
        className="absolute right-3 flex items-center gap-2"
        style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <span className="px-2 py-1 rounded-md bg-black/50 text-white/80 text-[10px] font-bold uppercase tracking-wider">
          Ad
        </span>
        {canSkip ? (
          <button
            type="button"
            onClick={() => setAd(null)}
            className="pl-3 pr-2.5 py-1.5 rounded-full bg-white text-ink-900 text-[12px] font-bold flex items-center gap-1 shadow-lg cursor-pointer active:scale-95 transition-transform"
            autoFocus
          >
            Skip
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span
            className="px-3 py-1.5 rounded-full bg-black/60 text-white text-[12px] font-bold tabular-nums"
            aria-live="polite"
          >
            Skip in {secondsLeft}s
          </span>
        )}
      </div>
    </div>
  );
};
