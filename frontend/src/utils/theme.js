// Sundhamata Mobile - runtime colour themes (Admin → Settings → User & Admin Styles)
//
// Every colour in the UI comes from Tailwind theme variables (--color-brand-600, --color-cream-50, ...),
// declared in index.css with the logo colours. A custom theme overrides those variables on <html>,
// so the whole app recolours without a rebuild. Only colours the admin actually changed are
// overridden; `null` keeps the hand-tuned defaults from index.css.

/** The built-in colours, as shown in the colour pickers. Keep in sync with index.css. */
export const THEME_DEFAULTS = Object.freeze({
  customer: Object.freeze({ primary: '#B55B1F', background: '#FEF6EE', dark: '#1C1917' }),
  admin: Object.freeze({ primary: '#B55B1F', background: '#FEF6EE', sidebar: '#120F0D' }),
});

export const THEME_FIELDS = Object.freeze({
  customer: [
    { key: 'primary', label: 'Primary colour', hint: 'Buttons, links, icons and highlights' },
    { key: 'background', label: 'Background', hint: 'Page background behind the cards' },
    { key: 'dark', label: 'Text & dark accents', hint: 'Headings, dark cards and badges' },
  ],
  admin: [
    { key: 'primary', label: 'Primary colour', hint: 'Buttons, links, charts and highlights' },
    { key: 'background', label: 'Background', hint: 'Page background behind the cards' },
    { key: 'sidebar', label: 'Sidebar', hint: 'Navigation menu on the left' },
  ],
});

export const THEME_PRESETS = Object.freeze([
  { name: 'Logo Orange', primary: '#B55B1F' },
  { name: 'Royal Blue', primary: '#1D4ED8' },
  { name: 'Emerald', primary: '#047857' },
  { name: 'Crimson', primary: '#B91C1C' },
  { name: 'Plum', primary: '#7E22CE' },
  { name: 'Teal', primary: '#0F766E' },
  { name: 'Charcoal', primary: '#3F3F46' },
]);

export const isHexColor = (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);

// ---- colour maths (sRGB)

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** `weight` (0–1) of `hex`, the rest `other` */
const mix = (hex, other, weight) => {
  const a = toRgb(hex);
  const b = toRgb(other);
  return toHex(a.map((v, i) => v * weight + b[i] * (1 - weight)));
};
const tint = (hex, weight) => mix(hex, '#FFFFFF', weight);
const shade = (hex, weight) => mix(hex, '#000000', weight);

/** WCAG relative luminance, 0 (black) – 1 (white) */
export const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two colours, 1 – 21 */
export const contrastRatio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ---- palettes

/** One primary colour (used as the 600 shade, for filled buttons) → the full 50–950 scale */
const brandScale = (p) => ({
  '--color-brand-50': tint(p, 0.07),
  '--color-brand-100': tint(p, 0.15),
  '--color-brand-200': tint(p, 0.3),
  '--color-brand-300': tint(p, 0.5),
  '--color-brand-400': tint(p, 0.7),
  '--color-brand-500': tint(p, 0.85),
  '--color-brand-600': p,
  '--color-brand-700': shade(p, 0.85),
  '--color-brand-800': shade(p, 0.7),
  '--color-brand-900': shade(p, 0.58),
  '--color-brand-950': shade(p, 0.34),
});

const backgroundScale = (bg) => ({
  '--color-cream-50': bg,
  '--color-cream-100': shade(bg, 0.965),
  '--color-cream-200': shade(bg, 0.93),
});

const inkScale = (d) => ({
  '--color-ink-950': shade(d, 0.75),
  '--color-ink-900': d,
  '--color-ink-800': tint(d, 0.92),
  '--color-ink-700': tint(d, 0.84),
});

/** Sidebar background plus readable text for it (dark text on a light sidebar and vice versa) */
const sidebarTokens = (s) => {
  const light = luminance(s) > 0.4;
  return light
    ? {
        '--color-sidebar': s,
        '--color-sidebar-line': shade(s, 0.9),
        '--color-sidebar-text': '#44403C',
        '--color-sidebar-muted': '#6B6560',
        '--color-sidebar-strong': '#1C1917',
        '--color-sidebar-accent': 'var(--color-brand-600)',
      }
    : {
        '--color-sidebar': s,
        '--color-sidebar-line': tint(s, 0.88),
        '--color-sidebar-text': '#D6D3D1',
        '--color-sidebar-muted': '#A8A29E',
        '--color-sidebar-strong': '#FFFFFF',
        '--color-sidebar-accent': 'var(--color-brand-400)',
      };
};

/**
 * CSS variables for one app's saved colours, e.g. `{ '--color-brand-600': '#1D4ED8', ... }`.
 * Colours that are null/invalid are left out, so the defaults from index.css apply.
 */
export const buildThemeVars = (colors) => {
  if (!colors) return {};
  const vars = {};
  if (isHexColor(colors.primary)) Object.assign(vars, brandScale(colors.primary.toUpperCase()));
  if (isHexColor(colors.background)) Object.assign(vars, backgroundScale(colors.background.toUpperCase()));
  if (isHexColor(colors.dark)) Object.assign(vars, inkScale(colors.dark.toUpperCase()));
  if (isHexColor(colors.sidebar)) Object.assign(vars, sidebarTokens(colors.sidebar.toUpperCase()));
  return vars;
};

// ---- applying to the page

let appliedKeys = [];

/** Replaces the variables previously set on <html> with `vars` */
export const applyThemeVars = (vars) => {
  const root = document.documentElement.style;
  appliedKeys.forEach((key) => {
    if (!(key in vars)) root.removeProperty(key);
  });
  Object.entries(vars).forEach(([key, value]) => root.setProperty(key, value));
  appliedKeys = Object.keys(vars);
};

// ---- sharing the saved theme between the settings page and the ThemeManager

const CACHE_KEY = 'sm_theme';
const listeners = new Set();

/** Last theme seen by this browser, so colours are right on the very first paint */
export const readCachedTheme = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || null;
  } catch {
    return null;
  }
};

/** Call with the theme from the API whenever it is loaded or saved */
export const publishTheme = (theme) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(theme ?? null));
  } catch {
    // storage unavailable (private mode): the theme still applies for this visit
  }
  listeners.forEach((listener) => listener(theme ?? null));
};

export const onThemeChange = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
