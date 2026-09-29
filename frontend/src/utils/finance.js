// Sundhamata Mobile - payment options and consumer-finance (EMI) helpers

import { Banknote, CreditCard, Landmark, Smartphone } from 'lucide-react';
import { addMonthsToDate } from './purchaseDates';
import { formatDate, formatINR } from './formatters';

export { addMonthsToDate };

/** "Purchase By" choices on Record Purchase */
export const PURCHASE_BY = [
  { id: 'Cash', label: 'Cash', icon: Banknote },
  { id: 'UPI', label: 'UPI', icon: Smartphone },
  { id: 'Card', label: 'Card', icon: CreditCard },
  { id: 'Finance', label: 'Finance (EMI)', icon: Landmark },
];

/** Lenders suggested while typing (any other name can be entered) */
export const FINANCE_COMPANIES = [
  'Bajaj Finserv',
  'HDB Financial Services',
  'HDFC Bank',
  'ICICI Bank',
  'IDFC FIRST Bank',
  'TVS Credit',
  'Home Credit',
  'Samsung Finance+',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'SBI Card',
  'Poonawalla Fincorp',
];

/** "₹8,350 × 12 months" */
export const describeEmi = (finance) =>
  finance ? `${formatINR(finance.emiAmount)} × ${finance.tenureMonths} month${finance.tenureMonths === 1 ? '' : 's'}` : '';

/** Calendar date "YYYY-MM-DD" → local Date at midday (no time-zone shift) */
const calendarDate = (value) => new Date(`${value}T12:00:00`);

/**
 * EMI schedule: day of month, first and last EMI dates, next EMI due (null when finished).
 * @param {{ firstEmiDate: string, tenureMonths: number }} finance
 */
export const emiSchedule = (finance, today = new Date()) => {
  if (!finance?.firstEmiDate) return null;
  const first = calendarDate(finance.firstEmiDate);
  const last = addMonthsToDate(first, finance.tenureMonths - 1);
  let next = null;
  for (let i = 0; i < finance.tenureMonths; i += 1) {
    const due = addMonthsToDate(first, i);
    if (due >= new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
      next = due;
      break;
    }
  }
  return {
    day: first.getDate(),
    firstLabel: formatDate(first),
    lastLabel: formatDate(last),
    nextLabel: next ? formatDate(next) : null,
  };
};

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd" */
export const ordinal = (n) => {
  const teen = Math.floor(n / 10) % 10 === 1;
  const suffix = !teen && { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10];
  return `${n}${suffix || 'th'}`;
};
