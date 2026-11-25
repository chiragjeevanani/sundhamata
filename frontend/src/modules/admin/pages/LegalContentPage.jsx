import { useEffect, useState } from 'react';
import { ExternalLink, RotateCcw, Save, X } from 'lucide-react';
import { adminLegalService } from '../../../services/legalService';
import { LEGAL_PAGES, defaultLegalText, useStoreText } from '../../user/legal/legalContent';
import { LegalText } from '../../user/legal/LegalText';
import { useToast } from '../context/ToastContext';

const KEYS = ['terms', 'privacy'];
const MAX_LENGTH = 50_000;

const formatDate = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Edit the public Terms & Conditions and Privacy Policy pages */
export const LegalContentPage = () => {
  const { showSuccess, showError } = useToast();
  const s = useStoreText();
  const [docs, setDocs] = useState(null); // { terms: { content, updatedAt }, privacy: {...} }
  const [active, setActive] = useState('terms');
  const [drafts, setDrafts] = useState({}); // unsaved text per page
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let alive = true;
    adminLegalService
      .list()
      .then((list) => alive && setDocs(Object.fromEntries(list.map((d) => [d.key, d]))))
      .catch((err) => alive && showError('Error', err.message || 'Could not load the pages.'));
    return () => {
      alive = false;
    };
  }, [showError]);

  if (!docs) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-8 w-56 bg-stone-100 rounded animate-pulse" />
        <div className="h-96 bg-white border border-stone-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const doc = docs[active];
  const saved = doc.content ?? defaultLegalText(active, s);
  const text = drafts[active] ?? saved;
  const changed = drafts[active] !== undefined && drafts[active] !== saved;
  const unsaved = (key) => drafts[key] !== undefined && drafts[key] !== (docs[key].content ?? defaultLegalText(key, s));

  const applied = (document) => {
    setDocs((prev) => ({ ...prev, [document.key]: document }));
    setDrafts((prev) => ({ ...prev, [document.key]: undefined }));
  };

  const save = async () => {
    if (!text.trim()) {
      showError('Page is empty', 'Write the page text, or use “Reset to default”.');
      return;
    }
    setSaving(true);
    try {
      applied(await adminLegalService.save(active, text));
      showSuccess('Page saved', `Customers now see the new ${LEGAL_PAGES[active].title}.`);
    } catch (err) {
      showError('Error', err.errors?.[0]?.message || err.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    setSaving(true);
    try {
      applied(await adminLegalService.save(active, null));
      showSuccess('Reset to default', `${LEGAL_PAGES[active].title} shows the original wording again.`);
    } catch (err) {
      showError('Error', err.message || 'Could not reset.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-200/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900 tracking-tight">Terms & Privacy</h1>
          <p className="text-xs text-stone-500 mt-0.5">
            The Terms & Conditions and Privacy Policy pages customers can read in the app, without signing in.
          </p>
        </div>
        <a
          href={LEGAL_PAGES[active].path}
          target="_blank"
          rel="noreferrer"
          className="self-start sm:self-auto py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 text-xs font-medium hover:bg-stone-50 inline-flex items-center gap-1.5"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open live page
        </a>
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 p-1 bg-stone-100 rounded-lg w-fit text-xs">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={`px-3.5 py-1.5 rounded-md font-medium cursor-pointer ${
              active === key ? 'bg-white text-stone-900 shadow-2xs' : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {LEGAL_PAGES[key].title}
            {unsaved(key) && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" title="Unsaved changes" />}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        <div className="bg-white rounded-xl border border-stone-200/80 shadow-2xs p-5 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                doc.content ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-stone-100 border-stone-200 text-stone-600'
              }`}
            >
              {doc.content ? `Edited · ${formatDate(doc.updatedAt)}` : 'Default text'}
            </span>
            <span className={`tabular-nums ${text.length > MAX_LENGTH ? 'text-rose-600 font-semibold' : 'text-stone-400'}`}>
              {text.length.toLocaleString('en-IN')} / {MAX_LENGTH.toLocaleString('en-IN')}
            </span>
          </div>

          <textarea
            aria-label={`${LEGAL_PAGES[active].title} text`}
            value={text}
            onChange={(e) => setDrafts((prev) => ({ ...prev, [active]: e.target.value }))}
            rows={26}
            spellCheck
            className="w-full px-3 py-2.5 bg-white border border-stone-300 rounded-lg text-stone-900 text-[12.5px] leading-relaxed font-mono focus:outline-hidden focus:border-brand-600 shadow-2xs resize-y"
          />

          <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-[11px] text-stone-500 space-y-0.5">
            <p className="font-semibold text-stone-700">How to format</p>
            <p>
              <code className="text-stone-800">## Heading</code> starts a section ·{' '}
              <code className="text-stone-800">- text</code> makes a bullet point · a blank line starts a new paragraph
            </p>
            <p>
              <code className="text-stone-800">[contact]</code> shows the store’s address, phone, email and hours from Settings
              (always up to date). <code className="text-stone-800">[contact: Heading]</code> does the same with your own first line.
            </p>
          </div>

          <div className="flex flex-wrap justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={saving || (!doc.content && !changed)}
              className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {doc.content ? 'Reset to default' : 'Discard changes'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !changed || text.length > MAX_LENGTH}
              className="py-2 px-4 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Live preview, at phone width */}
        <div className="space-y-2 lg:sticky lg:top-4">
          <p className="text-[11px] font-medium text-stone-500 text-center">Preview (as customers see it)</p>
          <div className="mx-auto max-w-[360px] h-[640px] overflow-y-auto rounded-2xl border border-stone-200 bg-cream-50 shadow-sm">
            <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm border-b border-stone-200/80 px-4 py-2.5">
              <p className="text-[14px] font-black text-ink-900 tracking-tight">{LEGAL_PAGES[active].title}</p>
            </div>
            <div className="p-4">
              <LegalText text={text} s={s} />
            </div>
          </div>
        </div>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-xs" onClick={() => setConfirmReset(false)}>
          <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-xl p-5 space-y-3 text-xs" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-900">
                {doc.content ? 'Go back to the default text?' : 'Discard your changes?'}
              </h3>
              <button type="button" onClick={() => setConfirmReset(false)} className="p-1 text-stone-400 hover:text-stone-700 cursor-pointer" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-stone-500">
              {doc.content
                ? `Your edited ${LEGAL_PAGES[active].title} will be deleted and customers will see the original wording.`
                : 'The text goes back to what customers see now.'}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="py-2 px-3.5 rounded-lg border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 cursor-pointer">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (doc.content) reset();
                  else {
                    setDrafts((prev) => ({ ...prev, [active]: undefined }));
                    setConfirmReset(false);
                  }
                }}
                className="py-2 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium cursor-pointer"
              >
                {doc.content ? 'Reset' : 'Discard'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
