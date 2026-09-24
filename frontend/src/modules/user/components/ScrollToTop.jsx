import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 * Ensures every page opens at the absolute top (scrollTop: 0) on route change.
 */
export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll window instantly to absolute top
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    });

    // Scroll document elements
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // Scroll root element
    const rootEl = document.getElementById('root');
    if (rootEl) rootEl.scrollTop = 0;

    // Scroll any scrollable main elements
    const mainEls = document.querySelectorAll('main');
    mainEls.forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname]);

  return null;
};
