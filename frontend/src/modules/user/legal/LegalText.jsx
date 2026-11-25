import { Fragment } from 'react';
import { parseLegalText } from './legalContent';

// Renders Terms / Privacy text (format: see legalContent.js)

const ContactBlock = ({ s, heading }) => (
  <div className="rounded-xl bg-cream-100 border border-stone-200/80 p-3 text-[12.5px] text-stone-700 leading-relaxed">
    <p className="font-bold text-ink-900">{heading || s.legalName}</p>
    {s.address && <p>{s.address}</p>}
    {s.phone && (
      <p>
        Phone:{' '}
        <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-brand-700">
          {s.phone}
        </a>
      </p>
    )}
    {s.email && (
      <p>
        Email:{' '}
        <a href={`mailto:${s.email}`} className="font-semibold text-brand-700 break-all">
          {s.email}
        </a>
      </p>
    )}
    {s.hours && <p className="text-stone-500">{s.hours}</p>}
  </div>
);

/** Renders page text in the app's style */
export const LegalText = ({ text, s }) => (
  <div className="space-y-2 text-[12.5px] text-stone-600 leading-relaxed">
    {parseLegalText(text).map((block, i) => (
      <Fragment key={i}>
        {block.type === 'h' && (
          <h2 className={`text-[13px] font-black text-ink-900 tracking-tight ${i > 0 ? 'pt-2' : ''}`}>{block.text}</h2>
        )}
        {block.type === 'p' && <p>{block.text}</p>}
        {block.type === 'list' && (
          <ul className="list-disc pl-4.5 space-y-1">
            {block.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        )}
        {block.type === 'contact' && <ContactBlock s={s} heading={block.heading} />}
      </Fragment>
    ))}
  </div>
);
