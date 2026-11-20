import { useEffect, useState } from 'react';
import { ImagePlus, Megaphone, Save, Trash2, X } from 'lucide-react';
import { adminStartupAdService, posterUrl } from '../../../services/startupAdService';
import { toScaledPhoto } from '../../../utils/photo';
import { useToast } from '../context/ToastContext';

const inputClass =
  'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-stone-900 focus:outline-hidden focus:border-brand-600 shadow-2xs tabular-nums';

const toForm = (ad) => ({
  enabled: ad.enabled,
  skipAfterSeconds: String(ad.skipAfterSeconds),
  autoCloseSeconds: ad.autoCloseSeconds == null ? '' : String(ad.autoCloseSeconds),
});

/** Advertisement poster shown full screen when the customer app opens */
export const AdvertisementPage = () => {
  const { showSuccess, showError } = useToast();
  const [ad, setAd] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let active = true;
    adminStartupAdService
      .get()
      .then((data) => {
        if (!active) return;
        setAd(data);
        setForm(toForm(data));
      })
      .catch((err) => active && showError('Error', err.message || 'Could not load the advertisement.'));
    return () => {
      active = false;
    };
  }, [showError]);

  const applied = (data) => {
    setAd(data);
    setForm(toForm(data));
  };

  const pickPoster = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      // Scaled down in the browser (keeps the shape); posters are shown full screen on phones
      const blob = await toScaledPhoto(file, 1920);
      applied(await adminStartupAdService.uploadPoster(blob));
      showSuccess('Poster uploaded', ad?.enabled ? 'Customers will see the new poster.' : 'Switch it on to show it to customers.');
    } catch (err) {
      showError('Error', err.message || 'Could not upload the poster.');
    } finally {
      setUploading(false);
    }
  };

  const removePoster = async () => {
    try {
      applied(await adminStartupAdService.removePoster());
      showSuccess('Poster removed', 'The advertisement is switched off.');
    } catch (err) {
      showError('Error', err.message || 'Could not remove the poster.');
    } finally {
      setConfirmRemove(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await adminStartupAdService.update({
        enabled: form.enabled,
        skipAfterSeconds: Number(form.skipAfterSeconds),
        autoCloseSeconds: form.autoCloseSeconds === '' ? null : Number(form.autoCloseSeconds),
      });
      applied(data);
      showSuccess('Advertisement saved', data.live ? 'Customers see it when they open the app.' : 'It is switched off.');
    } catch (err) {
      const fieldMessage = err.errors?.[0]?.message;
      showError('Error', fieldMessage || err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  if (!ad || !form) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-8 w-56 bg-stone-100 rounded animate-pulse" />
        <div className="h-96 bg-white border border-stone-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const changed =
    form.enabled !== ad.enabled ||
    form.skipAfterSeconds !== String(ad.skipAfterSeconds) ||
    form.autoCloseSeconds !== (ad.autoCloseSeconds == null ? '' : String(ad.autoCloseSeconds));
  const skipPreview = Number(form.skipAfterSeconds) || 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Advertisement</h1>
          <p className="text-xs text-stone-500 mt-0.5">A full-screen poster customers see each time they open the app.</p>
        </div>
        <span
          className={`self-start sm:self-auto px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
            ad.live ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-stone-100 border-stone-200 text-stone-600'
          }`}
        >
          {ad.live ? 'Live in the app' : 'Not showing'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-6 items-start">
        <form onSubmit={save} className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-5 text-xs">
          {/* Poster */}
          <div className="space-y-2">
            <p className="font-medium text-stone-700">Poster</p>
            <div className="flex flex-wrap gap-2">
              <label
                className={`py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer inline-flex items-center gap-1.5 ${
                  uploading ? 'opacity-60 pointer-events-none' : ''
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {uploading ? 'Uploading...' : ad.poster ? 'Replace poster' : 'Upload poster'}
                <input type="file" accept="image/*" onChange={pickPoster} className="sr-only" />
              </label>
              {ad.poster && (
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="py-2 px-3.5 rounded-lg border border-rose-200 text-rose-700 font-medium hover:bg-rose-50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-stone-400">
              Portrait works best (phone screen shape, e.g. 1080 × 1920). JPG, PNG or WebP; large images are scaled down
              before uploading.
            </p>
          </div>

          {/* On / off */}
          <label className={`flex items-start gap-2.5 ${ad.poster ? 'cursor-pointer' : 'opacity-50'}`}>
            <input
              type="checkbox"
              checked={form.enabled}
              disabled={!ad.poster}
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-brand-600"
            />
            <span>
              <span className="font-medium text-stone-800 block">Show to customers when the app opens</span>
              <span className="text-[11px] text-stone-400">
                {ad.poster ? 'Shown once each time the app is opened.' : 'Upload a poster first.'}
              </span>
            </span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="ad-skip" className="font-medium text-stone-700 block">
                Skip button appears after (seconds)
              </label>
              <input
                id="ad-skip"
                type="number"
                min="0"
                max="60"
                step="1"
                required
                value={form.skipAfterSeconds}
                onChange={(e) => setForm((prev) => ({ ...prev, skipAfterSeconds: e.target.value }))}
                className={inputClass}
              />
              <p className="text-[11px] text-stone-400">0 to 60. Customers cannot close the poster before this.</p>
            </div>
            <div className="space-y-1">
              <label htmlFor="ad-close" className="font-medium text-stone-700 block">
                Close automatically after (seconds)
              </label>
              <input
                id="ad-close"
                type="number"
                min="1"
                max="300"
                step="1"
                placeholder="Never"
                value={form.autoCloseSeconds}
                onChange={(e) => setForm((prev) => ({ ...prev, autoCloseSeconds: e.target.value }))}
                className={inputClass}
              />
              <p className="text-[11px] text-stone-400">Optional. Leave empty to keep it until the customer taps Skip.</p>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving || !changed}
              className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>

        {/* Phone preview */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium text-stone-500 text-center">Preview</p>
          <div className="mx-auto w-[220px] aspect-[9/19] rounded-[28px] border-[6px] border-stone-800 bg-black overflow-hidden relative shadow-lg">
            {ad.poster ? (
              <>
                <img src={posterUrl(ad.poster.path)} alt="Advertisement poster" className="w-full h-full object-contain" />
                <div className="absolute top-2.5 right-2 flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-black/50 text-white/80 text-[8px] font-bold uppercase">Ad</span>
                  <span className="px-2 py-0.5 rounded-full bg-black/60 text-white text-[9px] font-bold tabular-nums">
                    {skipPreview > 0 ? `Skip in ${skipPreview}s` : 'Skip'}
                  </span>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-stone-500 px-4 text-center">
                <Megaphone className="w-7 h-7" />
                <span className="text-[11px]">No poster yet</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={() => setConfirmRemove(false)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">Remove the poster?</h3>
              <button type="button" onClick={() => setConfirmRemove(false)} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-stone-500">Customers will stop seeing the advertisement. You can upload a new poster any time.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRemove(false)} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
                Cancel
              </button>
              <button onClick={removePoster} className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
