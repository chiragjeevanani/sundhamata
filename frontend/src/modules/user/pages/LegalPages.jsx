import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileCheck, ShieldCheck } from 'lucide-react';
import { formatStoreAddress, useStoreInfo } from '../hooks/useStoreInfo';

// Public pages (no sign-in needed): /terms and /privacy.
// Store name, address, contact and loyalty rules come from Admin → Settings, so the text stays current.

const LAST_UPDATED = '26 October 2026';

const Section = ({ title, children }) => (
  <section className="space-y-1.5">
    <h2 className="text-[13px] font-black text-ink-900 tracking-tight">{title}</h2>
    <div className="space-y-1.5 text-[12.5px] text-stone-600 leading-relaxed">{children}</div>
  </section>
);

const List = ({ items }) => (
  <ul className="list-disc pl-4.5 space-y-1">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

/** Store name and contact lines, with fallbacks while the store details load */
const useStoreText = () => {
  const store = useStoreInfo();
  const name = store?.storeName ? toTitle(store.storeName) : 'Sundhamata Mobile';
  return {
    store,
    name,
    legalName: store?.legalName || name,
    address: formatStoreAddress(store),
    email: store?.email,
    phone: store?.contactNumber || store?.supportNumber,
    hours: store?.workingHours,
  };
};

// "SUNDHAMATA MOBILE" → "Sundhamata Mobile"
const toTitle = (value) => value.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const ContactBlock = ({ s, heading }) => (
  <div className="rounded-xl bg-cream-100 border border-stone-200/80 p-3 text-[12.5px] text-stone-700 leading-relaxed">
    <p className="font-bold text-ink-900">{heading ?? s.legalName}</p>
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

const LegalLayout = ({ icon: Icon, title, other, children }) => {
  const navigate = useNavigate();
  const location = useLocation();

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
          <p className="text-[11px] text-stone-500">Last updated: {LAST_UPDATED}</p>
        </div>

        {children}

        <p className="pt-2 border-t border-stone-200/80 text-[12px] text-stone-500">
          See also our{' '}
          <Link to={other.to} replace className="font-bold text-brand-700">
            {other.label}
          </Link>
          .
        </p>
      </article>
    </div>
  );
};

export const TermsPage = () => {
  const s = useStoreText();
  const loyalty = s.store?.loyalty;

  return (
    <LegalLayout icon={FileCheck} title="Terms & Conditions" other={{ to: '/privacy', label: 'Privacy Policy' }}>
      <p className="text-[12.5px] text-stone-600 leading-relaxed">
        These terms apply to the {s.name} customer app and website (the “App”), run by {s.legalName} (“we”, “us”).
        By signing in or using the App, you agree to them. If you do not agree, please do not use the App.
      </p>

      <Section title="1. What the App does">
        <p>
          The App lets customers of our store see their purchases and invoices, check warranty details, earn and use
          loyalty points, claim coupons and offers, and send us inquiries. Buying, payment, returns and repairs happen
          at our store.
        </p>
      </Section>

      <Section title="2. Your account">
        <List
          items={[
            'You sign in with your mobile number and a one-time password (OTP) sent to it. Keep your phone and OTPs private; anyone who can read your OTPs can open your account.',
            'Give us correct details. Purchases recorded at the store are linked to the mobile number you give at billing.',
            'If you are under 18, use the App with the consent of a parent or guardian.',
            'We may suspend an account that is misused, for example for fraud or abusing offers.',
          ]}
        />
      </Section>

      <Section title="3. Purchases, invoices and warranty">
        <List
          items={[
            'Invoices in the App are digital copies of the tax invoices issued at our store. If a record looks wrong, tell us and we will check it against our billing records.',
            'Warranties are provided by the product manufacturer or service provider, on their terms. Warranty dates in the App are for your reference; the manufacturer or its service centre decides each claim and may verify the IMEI or serial number.',
            'Service and repair work carries the warranty stated on its invoice, if any.',
            'Returns, exchanges and refunds follow the store policy at the time of purchase and applicable law.',
          ]}
        />
      </Section>

      <Section title="4. Loyalty points">
        <List
          items={[
            loyalty
              ? `You earn ${loyalty.pointsPerHundredRupees} point${loyalty.pointsPerHundredRupees === 1 ? '' : 's'} for every ₹100 spent on eligible bills. Each point is worth ₹${loyalty.rupeeValuePerPoint} off a future bill.`
              : 'You earn points on eligible bills, which can be used for a discount on a future bill.',
            loyalty?.minRedeemPoints
              ? `Points can be redeemed at the store once you have at least ${loyalty.minRedeemPoints.toLocaleString('en-IN')} points.`
              : 'Points are redeemed at the store.',
            loyalty?.expiryMonths
              ? `Points expire ${loyalty.expiryMonths} months after they are earned.`
              : 'Points may expire as shown in the App.',
            'Points have no cash value, cannot be transferred or sold, and are removed if the bill they came from is cancelled or returned.',
            'We may change the loyalty programme or correct wrongly credited points. Changes never remove points you have already earned fairly, except by expiry.',
          ]}
        />
      </Section>

      <Section title="5. Coupons and offers">
        <List
          items={[
            'Each coupon or offer has its own conditions (minimum bill, eligible products, validity), shown with it in the App.',
            'Coupons are personal, cannot be exchanged for cash and, unless stated, cannot be combined with other offers.',
            'We may end or change an offer at any time. A coupon you have already claimed stays valid until its expiry date, unless it was obtained by misuse.',
          ]}
        />
      </Section>

      <Section title="6. Inquiries">
        <p>
          When you send an inquiry, we may call or message you about it. Prices, stock and repair estimates are
          confirmed at the store; an inquiry does not reserve a product or price.
        </p>
      </Section>

      <Section title="7. Notifications">
        <p>
          With your permission we send notifications about your purchases, points, coupons and offers. You can turn
          them off in the App or in your phone settings.
        </p>
      </Section>

      <Section title="8. Acceptable use">
        <p>
          Do not misuse the App: no attempts to access other people’s accounts, interfere with the App, or obtain
          coupons or points dishonestly.
        </p>
      </Section>

      <Section title="9. Liability">
        <p>
          We work to keep the App accurate and available, but it is provided “as is” and may sometimes be unavailable
          or contain errors. To the extent the law allows, we are not liable for indirect losses from using the App.
          Nothing here limits your rights as a consumer under Indian law.
        </p>
      </Section>

      <Section title="10. Changes and governing law">
        <p>
          We may update these terms; the date at the top shows the latest version, and using the App after a change
          means you accept it. These terms are governed by the laws of India, and courts in Ahmedabad, Gujarat have
          jurisdiction.
        </p>
      </Section>

      <Section title="11. Contact us">
        <ContactBlock s={s} />
      </Section>
    </LegalLayout>
  );
};

export const PrivacyPage = () => {
  const s = useStoreText();

  return (
    <LegalLayout icon={ShieldCheck} title="Privacy Policy" other={{ to: '/terms', label: 'Terms & Conditions' }}>
      <p className="text-[12.5px] text-stone-600 leading-relaxed">
        This policy explains what personal data {s.legalName} (“we”, “us”) collects through the {s.name} customer
        app and website and at our store, how we use it, and your choices. We process personal data in line with
        India’s Digital Personal Data Protection Act, 2023.
      </p>

      <Section title="1. What we collect">
        <List
          items={[
            'Account details: your name and mobile number.',
            'Profile details you choose to add: email, address, city, pincode, date of birth, anniversary, gender and profile photo.',
            'Purchase records: products and services bought, IMEI or serial numbers, prices, payment method, invoices and warranty details.',
            'Loyalty and offers: points earned and used, coupons claimed and redeemed.',
            'Inquiries you send: the type, your budget and your message.',
            'Technical data: a notification token for your device (if you allow notifications) and basic server logs used for security.',
          ]}
        />
        <p>
          We do not collect your payment card or bank details in the App, and we do not use advertising or analytics
          trackers.
        </p>
      </Section>

      <Section title="2. How we use it">
        <List
          items={[
            'To sign you in (sending OTPs to your mobile number) and keep your account secure.',
            'To show your purchases, invoices and warranty details, and help with warranty and service claims.',
            'To run the loyalty programme and issue coupons and offers, some of which depend on your profile details.',
            'To respond to your inquiries and support requests.',
            'To send notifications you have allowed about purchases, points and offers.',
            'To keep billing and tax records as the law requires, and to prevent fraud.',
          ]}
        />
      </Section>

      <Section title="3. Who we share it with">
        <p>We do not sell your personal data. We share it only with:</p>
        <List
          items={[
            'Service providers who run the App for us, under contract and only for that purpose: cloud hosting (Amazon Web Services), our database provider (MongoDB Atlas), Google Firebase for notifications, and our SMS provider for OTPs.',
            'Manufacturers and authorised service centres, when needed for a warranty or repair you ask for.',
            'Government or law-enforcement authorities, when the law requires it.',
          ]}
        />
      </Section>

      <Section title="4. Storage and security">
        <p>
          Your data is stored on secured cloud servers. Access is limited to authorised store staff, connections are
          encrypted (HTTPS), and photos and invoices are only available through private links. On your device, the App
          keeps your sign-in session in the browser’s local storage; signing out removes it.
        </p>
      </Section>

      <Section title="5. How long we keep it">
        <p>
          We keep your account and profile while you use the App. Invoices and billing records are kept for as long as
          tax law requires (generally at least 6 years under GST rules), even if you close your account. Other data is
          deleted or anonymised when it is no longer needed.
        </p>
      </Section>

      <Section title="6. Your rights and choices">
        <List
          items={[
            'See and update your profile in the App at any time (Profile → Edit).',
            'Ask us for a summary of the personal data we hold about you.',
            'Ask us to correct or delete your data, or close your account. We will delete what we are not legally required to keep.',
            'Withdraw consent, for example by turning off notifications or removing optional profile details.',
            'Nominate a person to exercise these rights on your behalf if you are unable to.',
            'Raise a complaint with us, and if you are not satisfied, with the Data Protection Board of India.',
          ]}
        />
        <p>To make a request, contact us using the details below. We reply within 30 days.</p>
      </Section>

      <Section title="7. Children">
        <p>
          The App is meant for adults. If you are under 18, use it only with a parent’s or guardian’s consent.
        </p>
      </Section>

      <Section title="8. Changes to this policy">
        <p>
          We may update this policy; the date at the top shows the latest version. If a change is significant, we will
          tell you in the App.
        </p>
      </Section>

      <Section title="9. Contact and grievance officer">
        <p>For questions, requests or complaints about your personal data, contact:</p>
        <ContactBlock s={s} heading={`Grievance Officer, ${s.legalName}`} />
      </Section>
    </LegalLayout>
  );
};
