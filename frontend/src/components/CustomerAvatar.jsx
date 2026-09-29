import { useState } from 'react';

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'CU';

/**
 * Customer photo, or their initials when there is none (or it fails to load).
 * `className` sets the size and shape, e.g. "w-11 h-11 rounded-xl".
 */
export const CustomerAvatar = ({ customer, className = 'w-9 h-9 rounded-full', textClassName = 'text-xs' }) => {
  const [failedUrl, setFailedUrl] = useState(null);
  const url = customer?.photoUrl;

  if (url && failedUrl !== url) {
    return (
      <img
        src={url}
        alt={customer?.name ? `Photo of ${customer.name}` : 'Customer photo'}
        onError={() => setFailedUrl(url)}
        className={`${className} object-cover bg-stone-100 shrink-0`}
        loading="lazy"
      />
    );
  }
  return (
    <div className={`${className} bg-ink-900 text-white flex items-center justify-center font-bold tracking-wide shrink-0 ${textClassName}`}>
      {initialsOf(customer?.name)}
    </div>
  );
};

/**
 * Blue "verified" tick: the customer uses the app and has bought at the store.
 * The blue is fixed (not the theme colour) so it always reads as "verified".
 */
export const VerifiedTick = ({ className = 'w-4 h-4', title = 'Verified customer' }) => (
  <svg viewBox="0 0 24 24" className={`${className} shrink-0`} role="img" aria-label={title}>
    <title>{title}</title>
    <path
      fill="#1D9BF0"
      d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
    />
    <path fill="#FFFFFF" d="M10.54 16.2 6.8 12.46l1.41-1.41 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.76z" />
  </svg>
);
