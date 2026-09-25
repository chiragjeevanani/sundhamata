// Sundhamata Mobile - date helpers for the purchase forms (browser local time).

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for <input type="date"> in the user's local timezone (not UTC). */
export const toDateInputValue = (date = new Date()) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Date input value → ISO timestamp. Today's purchases keep the current time (for hourly
 * reports); other dates are recorded at midday so time zones never shift the calendar day.
 */
export const dateInputToTimestamp = (value) => {
  if (!value) return undefined;
  if (value === toDateInputValue()) return new Date().toISOString();
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toISOString();
};

/** Same day `months` later, clamped to month end (31 Jan + 1 month → 28/29 Feb). Mirrors the server. */
export const addMonthsToDate = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
};

export const warrantyToMonths = (duration, unit) => {
  const n = Number(duration);
  if (!Number.isInteger(n) || n < 0) return null;
  return unit === 'years' ? n * 12 : n;
};

/** Split stored months into the form's duration + unit (24 → 2 years, 18 → 18 months). */
export const monthsToWarrantyInput = (months) =>
  !months ? { duration: '0', unit: 'years' } : months % 12 === 0 ? { duration: String(months / 12), unit: 'years' } : { duration: String(months), unit: 'months' };

export const MAX_WARRANTY_MONTHS = 120;
