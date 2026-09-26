import { useEffect, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { userService } from '../services/userService';
import { applyThemeVars, buildThemeVars, onThemeChange, publishTheme, readCachedTheme } from '../utils/theme';

/**
 * Applies the colours configured in Admin → Settings → User & Admin Styles.
 * The customer app and the admin panel share one page, so the colours follow the route.
 */
export const ThemeManager = () => {
  const { pathname } = useLocation();
  const app = pathname.startsWith('/admin') ? 'admin' : 'customer';
  // Start from the last theme this browser saw, so there is no flash of the default colours
  const [theme, setTheme] = useState(readCachedTheme);

  useEffect(() => {
    const unsubscribe = onThemeChange(setTheme);
    userService
      .getStoreInfo()
      .then((store) => publishTheme(store.theme ?? null))
      .catch(() => {}); // offline: keep the cached colours
    return unsubscribe;
  }, []);

  // Before paint, so route changes between the two apps never show the wrong colours
  useLayoutEffect(() => {
    applyThemeVars(buildThemeVars(theme?.[app]));
  }, [theme, app]);

  return null;
};
