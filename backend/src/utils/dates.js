// Business reporting uses the store's local time (India, UTC+05:30, no DST).
export const STORE_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;

const toIst = (date) => new Date(date.getTime() + IST_OFFSET_MS);
const fromIst = (date) => new Date(date.getTime() - IST_OFFSET_MS);

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Start of the IST calendar month containing `date`, offset by `monthOffset` months. */
export const startOfIstMonth = (date = new Date(), monthOffset = 0) => {
  const ist = toIst(date);
  return fromIst(new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + monthOffset, 1)));
};

/** Start of the IST day containing `date`, offset by `dayOffset` days. */
export const startOfIstDay = (date = new Date(), dayOffset = 0) => {
  const ist = toIst(date);
  return fromIst(new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + dayOffset)));
};

export const istYear = (date = new Date()) => toIst(date).getUTCFullYear();

export const addMonths = (date, months) => {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
};

/**
 * Time buckets for trend charts, oldest first.
 * - "30d": 4 rolling 7-day weeks ending today
 * - "6m":  last 6 calendar months (current month included)
 * - "1y":  last 4 calendar quarters (current quarter included)
 * @returns {Array<{ label: string, start: Date, end: Date }>}
 */
export const buildTrendBuckets = (range, now = new Date()) => {
  if (range === '30d') {
    const endOfToday = startOfIstDay(now, 1);
    return [3, 2, 1, 0].map((weeksAgo, i) => ({
      label: `Week ${i + 1}`,
      start: new Date(endOfToday.getTime() - (weeksAgo + 1) * 7 * 86400000),
      end: new Date(endOfToday.getTime() - weeksAgo * 7 * 86400000),
    }));
  }

  if (range === '1y') {
    const ist = toIst(now);
    const currentQuarterStartMonth = Math.floor(ist.getUTCMonth() / 3) * 3;
    return [3, 2, 1, 0].map((quartersAgo) => {
      const startMonth = currentQuarterStartMonth - quartersAgo * 3;
      const start = fromIst(new Date(Date.UTC(ist.getUTCFullYear(), startMonth, 1)));
      const end = fromIst(new Date(Date.UTC(ist.getUTCFullYear(), startMonth + 3, 1)));
      const startIst = toIst(start);
      const quarter = Math.floor(startIst.getUTCMonth() / 3) + 1;
      return { label: `Q${quarter} '${String(startIst.getUTCFullYear()).slice(2)}`, start, end };
    });
  }

  // default: 6 months
  return [5, 4, 3, 2, 1, 0].map((monthsAgo) => {
    const start = startOfIstMonth(now, -monthsAgo);
    const end = startOfIstMonth(now, -monthsAgo + 1);
    return { label: MONTH_LABELS[toIst(start).getUTCMonth()], start, end };
  });
};
