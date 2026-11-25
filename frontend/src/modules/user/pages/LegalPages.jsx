import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileCheck, ShieldCheck } from 'lucide-react';
import { legalService } from '../../../services/legalService';
import { DEFAULT_LEGAL_UPDATED, LEGAL_PAGES, defaultLegalText, useStoreText } from '../legal/legalContent';
import { LegalText } from '../legal/LegalText';

// Public pages (no sign-in needed): /terms and /privacy.
// The text is edited in Admin → Terms & Privacy; until then the built-in wording is shown,
// filled in with the store name, address, contact and loyalty rules from Admin → Settings.

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

const LegalPage = ({ pageKey, icon: Icon, otherKey }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const s = useStoreText();
  // undefined = loading; null = not edited (or could not load): use the default text
  const [doc, setDoc] = useState(undefined);

  useEffect(() => {
    let active = true;
    legalService
      .get(pageKey)
      .then((data) => active && setDoc(data?.content ? data : null))
      .catch(() => active && setDoc(null));
    return () => {
      active = false;
    };
  }, [pageKey]);

  const { title } = LEGAL_PAGES[pageKey];
  const other = LEGAL_PAGES[otherKey];

  return (
    <div className="flex-1 flex flex-col">
      <div className="sticky top-0 z-20 bg-cream-50/95 backdrop-blur-sm border-b border-stone-200/80 px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))}
          aria-label="Go back"
          className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-700 cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <h1 className="text-[15px] font-black text-ink-900 tracking-tight">{title}</h1>
      </div>

      <article className="p-4 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5" />
          </div>
          {doc !== undefined && (
            <p className="text-[11px] text-stone-500">
              Last updated: {doc?.updatedAt ? formatDate(doc.updatedAt) : DEFAULT_LEGAL_UPDATED}
            </p>
          )}
        </div>

        {doc === undefined ? (
          <div className="space-y-2.5" aria-busy="true">
            {[92, 100, 78, 96, 60, 88].map((w, i) => (
              <div key={i} className="h-3 rounded bg-stone-200/70 animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <LegalText text={doc?.content ?? defaultLegalText(pageKey, s)} s={s} />
        )}

        <p className="pt-2 border-t border-stone-200/80 text-[12px] text-stone-500">
          See also our{' '}
          <Link to={other.path} replace className="font-bold text-brand-700">
            {other.title}
          </Link>
          .
        </p>
      </article>
    </div>
  );
};

export const TermsPage = () => <LegalPage key="terms" pageKey="terms" icon={FileCheck} otherKey="privacy" />;

export const PrivacyPage = () => <LegalPage key="privacy" pageKey="privacy" icon={ShieldCheck} otherKey="terms" />;
