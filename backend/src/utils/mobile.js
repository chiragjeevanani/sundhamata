// Indian mobile numbers are stored in E.164 form ("+919876543210") so that
// "9876543210", "+91 98765 43210", "091-9876543210" and "919876543210"
// all resolve to the same customer.

const NATIONAL_MOBILE = /^[6-9]\d{9}$/;

/**
 * @param {unknown} input
 * @returns {string|null} "+91XXXXXXXXXX" or null when not a valid Indian mobile
 */
export const normalizeIndianMobile = (input) => {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const raw = String(input).trim();
  // Only digits, spaces, dashes, dots, parentheses and one leading "+" are acceptable noise.
  if (!/^\+?[\d\s\-.()]+$/.test(raw)) return null;

  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  else if (digits.length === 13 && digits.startsWith('091')) digits = digits.slice(3);

  return NATIONAL_MOBILE.test(digits) ? `+91${digits}` : null;
};

/** "+919876543210" → "9876543210" */
export const toNationalMobile = (e164) => (e164 ? e164.replace(/^\+91/, '') : e164);

/** "+919876543210" → "+91 98765 XXXXX" style mask for logs */
export const maskMobile = (e164) => {
  const national = toNationalMobile(e164) || '';
  return national.length === 10 ? `+91 ${national.slice(0, 2)}XXXXXX${national.slice(8)}` : '[invalid]';
};
