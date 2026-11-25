import { formatStoreAddress, useStoreInfo } from '../hooks/useStoreInfo';

// Terms & Conditions and Privacy Policy wording. The admin can replace it in Admin → Terms & Privacy;
// until then the app shows the default text below, which fills in the store details from Settings.
//
// Text format, rendered by LegalText.jsx (kept simple so store staff can edit it):
//   ## Heading           a section heading
//   - item               a bullet point
//   [contact]            the store's contact details (name, address, phone, email, hours)
//   [contact: Heading]   the same, with a different first line
//   anything else        a paragraph; a blank line starts a new one

export const LEGAL_PAGES = Object.freeze({
  terms: { title: 'Terms & Conditions', path: '/terms' },
  privacy: { title: 'Privacy Policy', path: '/privacy' },
});

/** Date shown on the default text */
export const DEFAULT_LEGAL_UPDATED = '26 October 2026';

// "SUNDHAMATA MOBILE" → "Sundhamata Mobile"
const toTitle = (value) => value.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/** Store name and contact lines, with fallbacks while the store details load */
export const useStoreText = () => {
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

const termsText = (s) => {
  const loyalty = s.store?.loyalty;
  const per = loyalty?.pointsPerHundredRupees;
  return `These terms apply to the ${s.name} customer app and website (the “App”), run by ${s.legalName} (“we”, “us”). By signing in or using the App, you agree to them. If you do not agree, please do not use the App.

## 1. What the App does
The App lets customers of our store see their purchases and invoices, check warranty details, earn and use loyalty points, claim coupons and offers, and send us inquiries. Buying, payment, returns and repairs happen at our store.

## 2. Your account
- You sign in with your mobile number and a one-time password (OTP) sent to it. Keep your phone and OTPs private; anyone who can read your OTPs can open your account.
- Give us correct details. Purchases recorded at the store are linked to the mobile number you give at billing.
- If you are under 18, use the App with the consent of a parent or guardian.
- We may suspend an account that is misused, for example for fraud or abusing offers.

## 3. Purchases, invoices and warranty
- Invoices in the App are digital copies of the tax invoices issued at our store. If a record looks wrong, tell us and we will check it against our billing records.
- Warranties are provided by the product manufacturer or service provider, on their terms. Warranty dates in the App are for your reference; the manufacturer or its service centre decides each claim and may verify the IMEI or serial number.
- Service and repair work carries the warranty stated on its invoice, if any.
- Returns, exchanges and refunds follow the store policy at the time of purchase and applicable law.

## 4. Loyalty points
- ${
    loyalty
      ? `You earn ${per} point${per === 1 ? '' : 's'} for every ₹100 spent on eligible bills. Each point is worth ₹${loyalty.rupeeValuePerPoint} off a future bill.`
      : 'You earn points on eligible bills, which can be used for a discount on a future bill.'
  }
- ${
    loyalty?.minRedeemPoints
      ? `Points can be redeemed at the store once you have at least ${loyalty.minRedeemPoints.toLocaleString('en-IN')} points.`
      : 'Points are redeemed at the store.'
  }
- ${loyalty?.expiryMonths ? `Points expire ${loyalty.expiryMonths} months after they are earned.` : 'Points may expire as shown in the App.'}
- Points have no cash value, cannot be transferred or sold, and are removed if the bill they came from is cancelled or returned.
- We may change the loyalty programme or correct wrongly credited points. Changes never remove points you have already earned fairly, except by expiry.

## 5. Coupons and offers
- Each coupon or offer has its own conditions (minimum bill, eligible products, validity), shown with it in the App.
- Coupons are personal, cannot be exchanged for cash and, unless stated, cannot be combined with other offers.
- We may end or change an offer at any time. A coupon you have already claimed stays valid until its expiry date, unless it was obtained by misuse.

## 6. Inquiries
When you send an inquiry, we may call or message you about it. Prices, stock and repair estimates are confirmed at the store; an inquiry does not reserve a product or price.

## 7. Notifications
With your permission we send notifications about your purchases, points, coupons and offers. You can turn them off in the App or in your phone settings.

## 8. Acceptable use
Do not misuse the App: no attempts to access other people’s accounts, interfere with the App, or obtain coupons or points dishonestly.

## 9. Liability
We work to keep the App accurate and available, but it is provided “as is” and may sometimes be unavailable or contain errors. To the extent the law allows, we are not liable for indirect losses from using the App. Nothing here limits your rights as a consumer under Indian law.

## 10. Changes and governing law
We may update these terms; the date at the top shows the latest version, and using the App after a change means you accept it. These terms are governed by the laws of India, and courts in Ahmedabad, Gujarat have jurisdiction.

## 11. Contact us
[contact]`;
};

const privacyText = (s) => `This policy explains what personal data ${s.legalName} (“we”, “us”) collects through the ${s.name} customer app and website and at our store, how we use it, and your choices. We process personal data in line with India’s Digital Personal Data Protection Act, 2023.

## 1. What we collect
- Account details: your name and mobile number.
- Profile details you choose to add: email, address, city, pincode, date of birth, marital status and anniversary, gender and profile photo.
- Purchase records: products and services bought, IMEI or serial numbers, prices, payment method, invoices and warranty details.
- Loyalty and offers: points earned and used, coupons claimed and redeemed.
- Inquiries you send: the type, your requirements, your budget, your message and any photo you attach.
- Location: only when you tap “Use my current location” while adding your address, to fill in the address. We do not track your location.
- Technical data: a notification token for your device (if you allow notifications) and basic server logs used for security.

We do not collect your payment card or bank details in the App, and we do not use advertising or analytics trackers.

## 2. How we use it
- To sign you in (sending OTPs to your mobile number) and keep your account secure.
- To show your purchases, invoices and warranty details, and help with warranty and service claims.
- To run the loyalty programme and issue coupons and offers, some of which depend on your profile details.
- To respond to your inquiries and support requests.
- To send notifications you have allowed about purchases, points and offers.
- To keep billing and tax records as the law requires, and to prevent fraud.

## 3. Who we share it with
We do not sell your personal data. We share it only with:
- Service providers who run the App for us, under contract and only for that purpose: cloud hosting (Amazon Web Services), our database provider (MongoDB Atlas), Google Firebase for notifications, our SMS provider (MSG91) for OTPs, and address lookup services (India Post pincode directory and OpenStreetMap) when you use address auto-fill.
- Manufacturers and authorised service centres, when needed for a warranty or repair you ask for.
- Government or law-enforcement authorities, when the law requires it.

## 4. Storage and security
Your data is stored on secured cloud servers. Access is limited to authorised store staff, connections are encrypted (HTTPS), and photos and invoices are only available through private links. On your device, the App keeps your sign-in session in the browser’s local storage; signing out removes it.

## 5. How long we keep it
We keep your account and profile while you use the App. Invoices and billing records are kept for as long as tax law requires (generally at least 6 years under GST rules), even if you close your account. Other data is deleted or anonymised when it is no longer needed.

## 6. Your rights and choices
- See and update your profile in the App at any time (Profile → Edit).
- Ask us for a summary of the personal data we hold about you.
- Ask us to correct or delete your data, or close your account. We will delete what we are not legally required to keep.
- Withdraw consent, for example by turning off notifications or removing optional profile details.
- Nominate a person to exercise these rights on your behalf if you are unable to.
- Raise a complaint with us, and if you are not satisfied, with the Data Protection Board of India.

To make a request, contact us using the details below. We reply within 30 days.

## 7. Children
The App is meant for adults. If you are under 18, use it only with a parent’s or guardian’s consent.

## 8. Changes to this policy
We may update this policy; the date at the top shows the latest version. If a change is significant, we will tell you in the App.

## 9. Contact and grievance officer
For questions, requests or complaints about your personal data, contact:
[contact: Grievance Officer, ${s.legalName}]`;

/** The built-in wording for a page, filled in with the store details */
export const defaultLegalText = (key, s) => (key === 'terms' ? termsText(s) : privacyText(s));

const CONTACT_LINE = /^\[contact(?::\s*(.*?))?\]$/i;
const BULLET_LINE = /^[-•*]\s+/;

/** Splits the text into headings, paragraphs, bullet lists and contact blocks */
export const parseLegalText = (text) => {
  const blocks = [];
  let paragraph = [];
  let list = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    if (list) blocks.push({ type: 'list', items: list });
    paragraph = [];
    list = null;
  };

  for (const raw of (text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    const contact = line.match(CONTACT_LINE);
    if (!line) {
      flush();
    } else if (line.startsWith('#')) {
      flush();
      blocks.push({ type: 'h', text: line.replace(/^#+\s*/, '') });
    } else if (contact) {
      flush();
      blocks.push({ type: 'contact', heading: contact[1]?.trim() || null });
    } else if (BULLET_LINE.test(line)) {
      if (paragraph.length) flush();
      list = list ?? [];
      list.push(line.replace(BULLET_LINE, ''));
    } else if (list) {
      // A line right after a bullet continues it
      list[list.length - 1] += ` ${line}`;
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
};
