// Sundhamata Mobile - Utility Formatters

/**
 * Format numeric value to Indian Rupee currency format (e.g. ₹1,24,999)
 * @param {number} amount
 * @returns {string}
 */
export const formatINR = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
};

/**
 * Format date string into human readable Indian retail date (e.g. "18 Sep 2026")
 * @param {string|Date} dateInput
 * @returns {string}
 */
export const formatDate = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

/**
 * Format date into long date format (e.g. "18 September 2026")
 * @param {string|Date} dateInput
 * @returns {string}
 */
export const formatLongDate = (dateInput) => {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

/**
 * Format Indian phone number (10-digit or "+91XXXXXXXXXX") with standard +91 spacing
 * @param {string} phone
 * @returns {string}
 */
export const formatPhone = (phone) => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (clean.length === 12 && clean.startsWith('91')) clean = clean.slice(2);
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return phone;
};

/**
 * Mask sensitive 10-digit phone number: +91 98765 4XXXX
 * @param {string} phone
 * @returns {string}
 */
export const maskPhone = (phone) => {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5, 6)}XXXX`;
  }
  return phone;
};

/**
 * Human relative time for activity feeds (e.g. "5 mins ago", "Yesterday")
 * @param {string|Date} dateInput
 * @returns {string}
 */
export const formatRelativeTime = (dateInput) => {
  if (!dateInput) return '';
  const minutes = Math.floor((Date.now() - new Date(dateInput).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(dateInput);
};

/**
 * Calendar date "YYYY-MM-DD" (birthday, anniversary) → "17 Aug 1994", without time-zone shifting
 * @param {string} value
 * @returns {string}
 */
export const formatCalendarDate = (value) => {
  if (!value) return '';
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const GENDER_LABELS = Object.freeze({
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
});
