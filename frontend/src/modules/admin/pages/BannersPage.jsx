import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Images, Pencil, Plus, Trash2, X } from 'lucide-react';
import { BANNER_PLACEMENTS, adminBannerService, bannerImageUrl } from '../../../services/bannerService';
import { toScaledPhoto } from '../../../utils/photo';
import { useToast } from '../context/ToastContext';

const inputClass =
  'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs';

// Customer app screens a banner can open
const LINK_SCREENS = [
  { value: '', label: 'Nothing (not tappable)' },
  { value: '/coupons', label: 'My Coupons' },
  { value: '/loyalty', label: 'Loyalty points' },
  { value: '/inquiry?type=mobile', label: 'Inquiry: Mobile' },
  { value: '/inquiry?type=accessories', label: 'Inquiry: Accessories' },
  { value: '/inquiry?type=service', label: 'Inquiry: Service' },
  { value: '/purchases', label: 'My Purchases' },
  { value: '/profile', label: 'Profile' },
];
const WEBSITE = '__website__';

// ISO date ↔ <input type="datetime-local"> value (local time)
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

const formatWhen = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

const statusOf = (banner, now = Date.now()) => {
  if (!banner.active) return { label: 'Off', className: 'bg-stone-100 border-stone-200 text-stone-600' };
  if (banner.startsAt && new Date(banner.startsAt).getTime() > now) {
    return { label: `Starts ${formatWhen(banner.startsAt)}`, className: 'bg-sky-50 border-sky-200 text-sky-800' };
  }
  if (banner.endsAt && new Date(banner.endsAt).getTime() <= now) {
    return { label: 'Ended', className: 'bg-amber-50 border-amber-200 text-amber-800' };
  }
  return { label: 'Live', className: 'bg-emerald-50 border-emerald-200 text-emerald-800' };
};

const linkLabel = (link) => {
  if (!link) return 'Not tappable';
  return LINK_SCREENS.find((s) => s.value === link)?.label ?? link;
};

/** Scales the picked image down and reads its size and a preview */
const prepareImage = async (file) => {
  const blob = await toScaledPhoto(file, 1600);
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  const preview = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(blob);
  });
  return { blob, size, preview };
};

const emptyForm = (placement) => ({
  placement,
  title: '',
  linkChoice: '',
  website: '',
  active: true,
  startsAt: '',
  endsAt: '',
});

const formOf = (banner) => {
  const known = LINK_SCREENS.some((s) => s.value === (banner.link ?? ''));
  return {
    placement: banner.placement,
    title: banner.title ?? '',
    linkChoice: known ? banner.link ?? '' : WEBSITE,
    website: known ? '' : banner.link,
    active: banner.active,
    startsAt: toLocalInput(banner.startsAt),
    endsAt: toLocalInput(banner.endsAt),
  };
};

/** Add / edit dialog. `banner` null = new banner in `placement` */
const BannerDialog = ({ banner, placement, onClose, onSaved }) => {
  const { showSuccess, showError } = useToast();
  const [form, setForm] = useState(() => (banner ? formOf(banner) : emptyForm(placement)));
  const [picked, setPicked] = useState(null); // { blob, size, preview }
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPreparing(true);
    try {
      setPicked(await prepareImage(file));
    } catch (err) {
      showError('Image', err.message || 'Could not open this image.');
    } finally {
      setPreparing(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    if (!banner && !picked) {
      showError('Image needed', 'Choose the banner image first.');
      return;
    }
    const fields = {
      placement: form.placement,
      title: form.title.trim() || null,
      link: form.linkChoice === WEBSITE ? form.website.trim() || null : form.linkChoice || null,
      active: form.active,
      startsAt: fromLocalInput(form.startsAt),
      endsAt: fromLocalInput(form.endsAt),
    };
    setSaving(true);
    try {
      let saved;
      if (banner) {
        saved = await adminBannerService.update(banner.id, fields);
        if (picked) saved = await adminBannerService.replaceImage(banner.id, picked.blob, picked.size);
      } else {
        saved = await adminBannerService.create(picked.blob, picked.size, fields);
      }
      showSuccess(banner ? 'Banner saved' : 'Banner added', statusOf(saved).label === 'Live' ? 'Customers see it on the Home screen.' : 'It is not showing right now.');
      onSaved();
    } catch (err) {
      showError('Error', err.errors?.[0]?.message || err.message || 'Could not save the banner.');
    } finally {
      setSaving(false);
    }
  };

  const previewSrc = picked?.preview ?? (banner ? bannerImageUrl(banner.image.path) : null);
  const spec = BANNER_PLACEMENTS[form.placement];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-4 text-xs"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-900">{banner ? 'Edit banner' : 'Add banner'}</h3>
          <button type="button" onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image */}
        <div className="space-y-2">
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 overflow-hidden flex items-center justify-center min-h-28">
            {previewSrc ? (
              <img src={previewSrc} alt="Banner preview" className="w-full h-auto" />
            ) : (
              <span className="text-stone-400 flex flex-col items-center gap-1 py-6">
                <Images className="w-6 h-6" />
                No image yet
              </span>
            )}
          </div>
          <label
            className={`py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer inline-flex items-center gap-1.5 ${
              preparing ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            {preparing ? 'Preparing...' : previewSrc ? 'Change image' : 'Choose image'}
            <input type="file" accept="image/*" onChange={pick} className="sr-only" />
          </label>
          <p className="text-[11px] text-stone-400">
            Wide image, about {spec.size} px. Use the same size for every banner in a slot so they line up.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="banner-slot" className="font-medium text-stone-700 block">Where</label>
            <select id="banner-slot" value={form.placement} onChange={set('placement')} className={inputClass}>
              {Object.entries(BANNER_PLACEMENTS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label} ({p.hint})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="banner-title" className="font-medium text-stone-700 block">Title (optional)</label>
            <input id="banner-title" value={form.title} onChange={set('title')} maxLength={80} placeholder="e.g. Diwali Dhamaka Offer" className={inputClass} />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="banner-link" className="font-medium text-stone-700 block">When tapped, open</label>
          <select id="banner-link" value={form.linkChoice} onChange={set('linkChoice')} className={inputClass}>
            {LINK_SCREENS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            <option value={WEBSITE}>A website...</option>
          </select>
          {form.linkChoice === WEBSITE && (
            <input
              aria-label="Website address"
              value={form.website}
              onChange={set('website')}
              placeholder="https://..."
              type="url"
              required
              className={`${inputClass} mt-2`}
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="banner-start" className="font-medium text-stone-700 block">Show from (optional)</label>
            <input id="banner-start" type="datetime-local" value={form.startsAt} onChange={set('startsAt')} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label htmlFor="banner-end" className="font-medium text-stone-700 block">Show until (optional)</label>
            <input id="banner-end" type="datetime-local" value={form.endsAt} onChange={set('endsAt')} className={inputClass} />
          </div>
        </div>
        <p className="text-[11px] text-stone-400 -mt-2">Leave empty to show it until you switch it off, e.g. set dates for a festival offer.</p>

        <label className="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={set('active')} className="w-4 h-4 accent-brand-600" />
          <span className="font-medium text-stone-800">Show in the customer app</span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || preparing}
            className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Saving...' : banner ? 'Save' : 'Add banner'}
          </button>
        </div>
      </form>
    </div>
  );
};

/** Home screen banners: two slots, each a carousel */
export const BannersPage = () => {
  const { showSuccess, showError } = useToast();
  const [banners, setBanners] = useState(null);
  const [dialog, setDialog] = useState(null); // { banner } or { placement }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    adminBannerService
      .list()
      .then(setBanners)
      .catch((err) => showError('Error', err.message || 'Could not load banners.'));

  useEffect(() => {
    let alive = true;
    adminBannerService
      .list()
      .then((data) => alive && setBanners(data))
      .catch((err) => alive && showError('Error', err.message || 'Could not load banners.'));
    return () => {
      alive = false;
    };
  }, [showError]);

  const move = async (placement, list, from, to) => {
    const ids = list.map((b) => b.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setBusy(true);
    try {
      setBanners(await adminBannerService.reorder(placement, ids));
    } catch (err) {
      showError('Error', err.errors?.[0]?.message || err.message || 'Could not change the order.');
      load();
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (banner) => {
    setBusy(true);
    try {
      const saved = await adminBannerService.update(banner.id, { active: !banner.active });
      setBanners((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
      showSuccess(saved.active ? 'Banner switched on' : 'Banner switched off');
    } catch (err) {
      showError('Error', err.message || 'Could not update the banner.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const banner = confirmDelete;
    setConfirmDelete(null);
    try {
      await adminBannerService.remove(banner.id);
      setBanners((prev) => prev.filter((b) => b.id !== banner.id));
      showSuccess('Banner deleted');
    } catch (err) {
      showError('Error', err.message || 'Could not delete the banner.');
    }
  };

  if (!banners) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-56 bg-stone-100 rounded animate-pulse" />
        <div className="h-72 bg-white border border-stone-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="pb-4 border-b border-stone-200/80">
        <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Banners</h1>
        <p className="text-xs text-stone-500 mt-0.5">
          Offer banners on the customer Home screen. Several banners in a slot slide by themselves every few seconds.
        </p>
      </div>

      {Object.entries(BANNER_PLACEMENTS).map(([placement, spec]) => {
        const list = banners.filter((b) => b.placement === placement);
        const liveCount = list.filter((b) => statusOf(b).label === 'Live').length;
        return (
          <section key={placement} className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-stone-900">{spec.label}</h2>
                <p className="text-[11px] text-stone-500">
                  {spec.hint} · {liveCount} live · recommended size {spec.size} px
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDialog({ placement })}
                disabled={list.length >= 10}
                className="py-2 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add banner
              </button>
            </div>

            {list.length === 0 ? (
              <div className="rounded-lg border border-dashed border-stone-300 py-8 text-center text-stone-400">
                No banners here yet. Customers will not see this slot.
              </div>
            ) : (
              <ul className="divide-y divide-stone-100">
                {list.map((banner, i) => {
                  const status = statusOf(banner);
                  return (
                    <li key={banner.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                      <img
                        src={bannerImageUrl(banner.image.path)}
                        alt={banner.title || 'Banner'}
                        style={{ aspectRatio: banner.image.width && banner.image.height ? `${banner.image.width} / ${banner.image.height}` : '12 / 5' }}
                        className="w-full sm:w-48 object-contain rounded-lg border border-stone-200 bg-stone-50 shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="font-semibold text-stone-900 truncate">{banner.title || 'Untitled banner'}</p>
                        <p className="text-stone-500 truncate">Opens: {linkLabel(banner.link)}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10.5px] font-semibold ${status.className}`}>
                          {status.label}
                        </span>
                        {banner.endsAt && status.label === 'Live' && (
                          <span className="ml-1.5 text-[10.5px] text-stone-400">until {formatWhen(banner.endsAt)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => move(placement, list, i, i - 1)}
                          disabled={busy || i === 0}
                          aria-label="Move up"
                          className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer disabled:opacity-30"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(placement, list, i, i + 1)}
                          disabled={busy || i === list.length - 1}
                          aria-label="Move down"
                          className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer disabled:opacity-30"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={banner.active}
                          aria-label={banner.active ? 'Switch off' : 'Switch on'}
                          onClick={() => toggle(banner)}
                          disabled={busy}
                          className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${banner.active ? 'bg-brand-600' : 'bg-stone-300'}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${banner.active ? 'left-[18px]' : 'left-0.5'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDialog({ banner })}
                          aria-label="Edit"
                          className="p-2 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(banner)}
                          aria-label="Delete"
                          className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {dialog && (
        <BannerDialog
          banner={dialog.banner ?? null}
          placement={dialog.placement ?? dialog.banner?.placement}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            load();
          }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-stone-900">Delete this banner?</h3>
            <p className="text-stone-500">
              “{confirmDelete.title || 'Untitled banner'}” will be removed from the app. To hide it for now, switch it off instead.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={remove} className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
