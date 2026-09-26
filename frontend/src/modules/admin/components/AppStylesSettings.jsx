import { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Home,
  LayoutDashboard,
  Palette,
  RotateCcw,
  Save,
  ShoppingBag,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { adminSettingsService } from '../../../services/adminSettingsService';
import { userService } from '../../../services/userService';
import {
  THEME_DEFAULTS,
  THEME_FIELDS,
  THEME_PRESETS,
  buildThemeVars,
  contrastRatio,
  isHexColor,
  publishTheme,
} from '../../../utils/theme';
import { useToast } from '../context/ToastContext';

const APPS = [
  { id: 'customer', label: 'Customer App' },
  { id: 'admin', label: 'Admin Panel' },
];

const emptyTheme = () => ({
  customer: Object.fromEntries(THEME_FIELDS.customer.map((f) => [f.key, null])),
  admin: Object.fromEntries(THEME_FIELDS.admin.map((f) => [f.key, null])),
});

/** Server theme → editable draft (null = default colour) */
const toDraft = (theme) => {
  const draft = emptyTheme();
  Object.keys(draft).forEach((app) =>
    Object.keys(draft[app]).forEach((key) => {
      if (isHexColor(theme?.[app]?.[key])) draft[app][key] = theme[app][key].toUpperCase();
    })
  );
  return draft;
};

/** Picking the default colour again stores null, so the hand-tuned default palette is used */
const normalize = (draft) => {
  const out = emptyTheme();
  Object.keys(out).forEach((app) =>
    Object.keys(out[app]).forEach((key) => {
      const value = draft[app][key];
      out[app][key] = isHexColor(value) && value.toUpperCase() !== THEME_DEFAULTS[app][key] ? value.toUpperCase() : null;
    })
  );
  return out;
};

/** Every colour filled in (defaults for unset ones) — used for previews and contrast checks */
const resolved = (colors, app) =>
  Object.fromEntries(Object.keys(THEME_DEFAULTS[app]).map((k) => [k, colors[k] || THEME_DEFAULTS[app][k]]));

const warningsFor = (app, c) => {
  const warnings = {};
  if (contrastRatio(c.primary, '#FFFFFF') < 3) {
    warnings.primary = 'Too light: white text on buttons will be hard to read. Pick a darker shade.';
  }
  const text = app === 'customer' ? c.dark : '#1C1917';
  if (contrastRatio(c.background, text) < 7) {
    warnings.background = 'Dark background: page text may be hard to read. Light colours work best here.';
  }
  if (app === 'customer' && contrastRatio(c.dark, c.background) < 4.5) {
    warnings.dark = 'Too close to the background: headings will be hard to read.';
  }
  return warnings;
};

const ColorRow = ({ field, value, defaultValue, warning, onChange }) => {
  const [text, setText] = useState(null); // while typing a hex value
  const shown = value || defaultValue;
  const customised = Boolean(value) && value !== defaultValue;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <label
          className="relative w-10 h-10 rounded-lg border border-stone-300 shadow-2xs cursor-pointer shrink-0 overflow-hidden"
          style={{ backgroundColor: shown }}
          title={`Choose ${field.label.toLowerCase()}`}
        >
          <input
            type="color"
            value={shown.toLowerCase()}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label={field.label}
          />
        </label>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-stone-800">{field.label}</div>
          <div className="text-[11px] text-stone-400 truncate">{field.hint}</div>
        </div>
        <input
          type="text"
          value={text ?? shown}
          onChange={(e) => {
            const next = e.target.value.trim();
            setText(next);
            const hex = next.startsWith('#') ? next : `#${next}`;
            if (isHexColor(hex)) onChange(hex.toUpperCase());
          }}
          onBlur={() => setText(null)}
          maxLength={7}
          spellCheck={false}
          aria-label={`${field.label} hex value`}
          className="w-20 px-2 py-1.5 bg-white border border-stone-300 rounded-md font-mono text-[11px] text-stone-800 uppercase focus:outline-hidden focus:border-brand-600"
        />
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={!customised}
          title="Back to the logo colour"
          className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 hover:bg-stone-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-default"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
      {warning && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-700 pl-[52px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {warning}
        </p>
      )}
    </div>
  );
};

/** Miniature customer app, painted with the draft colours (CSS variables scoped to this element) */
const CustomerPreview = ({ colors }) => (
  <div
    style={buildThemeVars(colors)}
    className="w-[210px] shrink-0 rounded-[22px] border-[5px] border-stone-800 bg-cream-50 overflow-hidden shadow-md mx-auto select-none"
    aria-hidden="true"
  >
    <div className="px-3 py-2 flex items-center gap-1.5 bg-white border-b border-stone-200/80">
      <img src="/logo.png" alt="" className="w-5 h-5 rounded bg-black object-contain" />
      <span className="text-[9px] font-black text-ink-900 tracking-tight">SUNDHAMATA</span>
      <span className="text-[7px] font-bold text-brand-600">MOBILE</span>
    </div>
    <div className="p-2.5 space-y-2">
      <div className="text-[12px] font-black text-ink-900">Hello, Karan</div>
      <div className="rounded-lg bg-ink-900 p-2.5 text-white">
        <div className="text-[7px] uppercase tracking-wider text-white/60 font-bold">Loyalty balance</div>
        <div className="text-[15px] font-black flex items-center gap-1">
          2,450 <Sparkles className="w-3 h-3 text-brand-400" />
        </div>
      </div>
      <div className="rounded-lg bg-white border border-stone-200/90 p-2 flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-brand-50 text-brand-600 flex items-center justify-center">
          <ShoppingBag className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[8.5px] font-bold text-stone-800">Galaxy S25 Ultra</div>
          <div className="text-[7.5px] text-stone-400">25 Sept 2026</div>
        </div>
        <span className="text-[7px] font-bold text-brand-700 bg-brand-100 rounded px-1 py-0.5">Warranty</span>
      </div>
      <div className="rounded-lg bg-brand-600 text-white text-[8.5px] font-bold text-center py-1.5">View Purchases</div>
    </div>
    <div className="mt-1 bg-white border-t border-stone-200 grid grid-cols-4 py-1.5">
      {[Home, ShoppingBag, Sparkles, User].map((Icon, i) => (
        <div key={i} className="flex justify-center">
          <Icon className={`w-3.5 h-3.5 ${i === 0 ? 'text-brand-600' : 'text-stone-400'}`} />
        </div>
      ))}
    </div>
  </div>
);

/** Miniature admin panel, painted with the draft colours */
const AdminPreview = ({ colors }) => (
  <div
    style={buildThemeVars(colors)}
    className="w-full max-w-[340px] h-[230px] shrink-0 rounded-lg border border-stone-300 overflow-hidden shadow-md mx-auto flex select-none"
    aria-hidden="true"
  >
    <div className="w-[92px] bg-sidebar border-r border-sidebar-line p-1.5 space-y-1 text-[7.5px]">
      <div className="flex items-center gap-1 px-1 py-1 mb-1 border-b border-sidebar-line">
        <img src="/logo.png" alt="" className="w-4 h-4 rounded bg-black object-contain" />
        <span className="font-black text-sidebar-strong">SUNDHAMATA</span>
      </div>
      <div className="rounded bg-brand-600 text-white font-bold text-center py-1">+ Record</div>
      {[
        [LayoutDashboard, 'Dashboard', true],
        [Users, 'Customers'],
        [ShoppingBag, 'Purchases'],
        [BarChart3, 'Reports'],
      ].map(([Icon, label, active]) => (
        <div
          key={label}
          className={`flex items-center gap-1 rounded px-1.5 py-1 ${
            active ? 'bg-brand-600/20 text-sidebar-strong font-bold' : 'text-sidebar-muted'
          }`}
        >
          <Icon className="w-2.5 h-2.5 text-sidebar-accent" />
          {label}
        </div>
      ))}
    </div>
    <div className="flex-1 bg-cream-50 p-2 space-y-1.5 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-stone-900">Dashboard</span>
        <span className="rounded bg-brand-600 text-white text-[7px] font-bold px-1.5 py-0.5">Record Purchase</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          ['Revenue', '₹4.2L'],
          ['Customers', '128'],
        ].map(([label, value]) => (
          <div key={label} className="bg-white rounded border border-stone-200/80 p-1.5">
            <div className="text-[6.5px] text-stone-500">{label}</div>
            <div className="text-[10px] font-semibold text-stone-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="bg-white rounded border border-stone-200/80 p-1.5 h-[102px] flex items-end gap-1">
        {[40, 62, 48, 75, 58, 88, 70].map((h, i) => (
          <div key={i} className="flex-1 rounded-t bg-brand-500" style={{ height: `${h}%`, opacity: i === 5 ? 1 : 0.55 }} />
        ))}
      </div>
    </div>
  </div>
);

export const AppStylesSettings = ({ initialTheme }) => {
  const { showSuccess, showError } = useToast();
  const [saved, setSaved] = useState(() => toDraft(initialTheme));
  const [draft, setDraft] = useState(() => toDraft(initialTheme));
  const [app, setApp] = useState('customer');
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(normalize(draft)) !== JSON.stringify(normalize(saved));
  const colors = resolved(draft[app], app);
  const warnings = warningsFor(app, colors);
  const hasCustom = Object.values(normalize(draft)[app]).some(Boolean);

  const setColor = (key, value) => setDraft((prev) => ({ ...prev, [app]: { ...prev[app], [key]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = await adminSettingsService.updateSettings({ theme: normalize(draft) });
      const next = toDraft(settings.theme);
      setSaved(next);
      setDraft(next);
      userService.invalidateStoreInfo();
      publishTheme(settings.theme); // recolours this admin panel right away
      showSuccess('Styles Saved', 'New colours are live for customers and admins.');
    } catch (err) {
      showError('Error', err.message || 'Failed to save styles.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-white rounded-xl border border-stone-200/80 shadow-2xs overflow-hidden" id="app-styles">
      <div className="p-5 sm:p-6 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-stone-800 uppercase tracking-wide">User & Admin Styles</h3>
            <p className="text-xs text-stone-400 font-normal">
              Colours of the customer app and this admin panel. Changes apply to everyone once saved.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-all active:scale-[0.98] cursor-pointer self-start sm:self-auto disabled:opacity-50 disabled:cursor-default"
        >
          <Save className="w-3.5 h-3.5" />
          <span>{saving ? 'Saving...' : dirty ? 'Save Styles' : 'Saved'}</span>
        </button>
      </div>

      {/* App switcher */}
      <div className="px-5 sm:px-6 pt-4">
        <div className="inline-flex p-0.5 rounded-lg bg-stone-100 border border-stone-200 text-xs" role="tablist">
          {APPS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={app === a.id}
              onClick={() => setApp(a.id)}
              className={`px-3.5 py-1.5 rounded-md font-medium transition-colors cursor-pointer ${
                app === a.id ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          {/* Quick presets for the primary colour */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-stone-700">Quick colours</div>
            <div className="flex flex-wrap gap-2">
              {THEME_PRESETS.map((preset) => {
                const active = colors.primary === preset.primary;
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => setColor('primary', preset.primary)}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer ${
                      active ? 'border-stone-800 bg-stone-50 text-stone-900' : 'border-stone-200 text-stone-600 hover:border-stone-400'
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: preset.primary }} />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {THEME_FIELDS[app].map((field) => (
              <ColorRow
                key={`${app}-${field.key}`}
                field={field}
                value={draft[app][field.key]}
                defaultValue={THEME_DEFAULTS[app][field.key]}
                warning={warnings[field.key]}
                onChange={(value) => setColor(field.key, value)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <button
              type="button"
              onClick={() => setDraft((prev) => ({ ...prev, [app]: emptyTheme()[app] }))}
              disabled={!hasCustom}
              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset {app === 'customer' ? 'customer app' : 'admin panel'} to logo colours
            </button>
            {dirty && (
              <button
                type="button"
                onClick={() => setDraft(saved)}
                className="text-stone-500 hover:text-stone-800 font-medium cursor-pointer"
              >
                Discard changes
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-medium text-stone-500 text-center">Live preview</div>
          {app === 'customer' ? <CustomerPreview colors={colors} /> : <AdminPreview colors={colors} />}
        </div>
      </div>
    </section>
  );
};
