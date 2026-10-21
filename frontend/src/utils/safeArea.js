// Keeps the bottom nav and bottom sheets clear of the phone's navigation bar in the mobile app.
//
// The CSS uses --app-safe-bottom = max(env(safe-area-inset-bottom), --app-nav-fallback).
// Browsers (and newer WebViews) report env(safe-area-inset-bottom) themselves: ~48px with the
// 3-button bar, a few px with gesture navigation, so gestures keep the full screen.
// Some Android WebViews draw under the navigation bar but report 0. Then, if the page reaches the
// bottom of the screen, reserve the 3-button bar's height so nothing sits underneath it.
//
// The mobile app can also pass exact values (CSS px), which replaces the guess:
//   window.SundhamataApp.setSafeArea({ bottom: 48 })

const NAV_BAR_FALLBACK = 48; // Android 3-button navigation bar (48dp)
// More than this between the page and the screen bottom = the app already keeps the page above the bar
const STATUS_BAR_MAX = 56;

const root = document.documentElement;
let fromApp = null;

const isAndroidWebView = () => /Android/i.test(navigator.userAgent) && /\bwv\b/.test(navigator.userAgent);

const reportedInset = () => {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const value = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
  probe.remove();
  return value;
};

const update = () => {
  let fallback = 0;
  if (fromApp != null) {
    fallback = fromApp;
  } else if (isAndroidWebView() && reportedInset() === 0) {
    const portrait = window.innerHeight >= window.innerWidth;
    const screenHeight = Math.max(window.screen.height, window.screen.width);
    const reachesBottom = screenHeight - window.innerHeight <= STATUS_BAR_MAX;
    if (portrait && reachesBottom) fallback = NAV_BAR_FALLBACK;
  }
  root.style.setProperty('--app-nav-fallback', `${fallback}px`);
};

export const initSafeArea = () => {
  window.SundhamataApp = {
    ...window.SundhamataApp,
    /** @param {{ bottom?: number }} insets CSS px; pass null to go back to automatic */
    setSafeArea(insets) {
      const bottom = Number(insets?.bottom);
      fromApp = insets == null || !Number.isFinite(bottom) ? null : Math.max(0, bottom);
      update();
    },
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
};
