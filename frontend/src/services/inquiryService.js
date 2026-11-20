// Sundhamata Mobile - inquiries the customer sends to the store (Profile → Make an Inquiry)

import { API_BASE_URL, customerApi } from './api/apiClient';

export const INQUIRY_CATEGORY_LABELS = Object.freeze({
  mobile: 'Mobile',
  accessories: 'Accessories',
  service: 'Service',
});

// Mobile inquiry quick picks ("Other" lets the customer type their own)
export const MOBILE_BRANDS = Object.freeze(['Samsung', 'Apple', 'Vivo', 'Oppo', 'OnePlus', 'Xiaomi', 'Realme']);
export const MOBILE_RAM_ROM = Object.freeze([
  '4GB RAM + 64GB ROM',
  '6GB RAM + 128GB ROM',
  '8GB RAM + 128GB ROM',
  '8GB RAM + 256GB ROM',
  '12GB RAM + 256GB ROM',
  '12GB RAM + 512GB ROM',
]);
// Same list as the API (models/Inquiry.js MOBILE_FEATURES)
export const MOBILE_FEATURES = Object.freeze(['Camera', 'Battery', 'Gaming', 'Display', '5G', 'Processor', 'Fast Charging']);

// Accessories inquiry: type (same keys as the API's ACCESSORY_TYPES) and quick picks
export const ACCESSORY_TYPE_LABELS = Object.freeze({
  mobile: 'Mobile Accessories',
  computer: 'Computer Accessories',
  laptop: 'Laptop Accessories',
  other: 'Other Accessories',
});
export const ACCESSORY_ITEMS = Object.freeze([
  'Charger / Adapter',
  'Cable',
  'Earbuds / TWS',
  'Neckband',
  'Headphones',
  'Speaker',
  'Power Bank',
  'Mobile Cover',
  'Tempered Glass',
  'Smart Watch',
  'Keyboard',
  'Mouse',
  'Keyboard & Mouse Combo',
  'Webcam',
  'USB Hub',
  'Pendrive',
  'SSD / Hard Disk',
  'Laptop Charger',
  'HDMI / VGA / Display Cable',
  'Laptop Stand / Cooling Pad',
]);

// Service inquiry: device (same keys as the API's SERVICE_DEVICES), common problems per device,
// and how the customer wants it serviced (SERVICE_PREFERENCES)
export const SERVICE_DEVICE_LABELS = Object.freeze({ mobile: 'Mobile', computer: 'Computer / Laptop' });
export const SERVICE_PROBLEMS = Object.freeze({
  mobile: [
    'Screen / Display broken',
    'Touch not working',
    'Battery problem',
    'Charging problem',
    'Not turning on',
    'Water damage',
    'Speaker / Mic problem',
    'Camera problem',
    'Network / SIM problem',
    'Software / Hanging',
    'Back panel / Body damage',
  ],
  computer: [
    'Not turning on',
    'Slow performance',
    'Virus / Software problem',
    'Windows / OS installation',
    'Display problem',
    'Keyboard / Mouse problem',
    'Hard disk / Data recovery',
    'Overheating / Fan noise',
    'Wi-Fi / Network problem',
    'Upgrade (RAM / SSD)',
  ],
});
export const SERVICE_PREFERENCE_LABELS = Object.freeze({
  visit_store: 'Visit the store',
  pickup_drop: 'Pickup & drop',
  technician_visit: 'Technician visit (home / office)',
});

/** "Mobile · Samsung Galaxy A54 · Screen / Display broken · Visit the store" */
export const describeServiceInquiry = (svc) =>
  [SERVICE_DEVICE_LABELS[svc.device], svc.brandModel, svc.problem, SERVICE_PREFERENCE_LABELS[svc.preference]]
    .filter(Boolean)
    .join(' · ');

/** Full URL of an inquiry photo ({ path } from the API) */
export const inquiryPhotoUrl = (photo) => (photo?.path ? `${API_BASE_URL}${photo.path}` : null);

/** "Samsung · 8GB RAM + 128GB ROM · Camera, 5G" */
export const describeMobileInquiry = (mobile) =>
  [mobile.brand, mobile.ramRom, mobile.features?.length ? mobile.features.join(', ') : null].filter(Boolean).join(' · ');

/** "Mobile Accessories · Earbuds / TWS × 2 · Brand: boAt · For: Samsung A54" */
export const describeAccessoriesInquiry = (acc) =>
  [
    ACCESSORY_TYPE_LABELS[acc.type],
    acc.quantity > 1 ? `${acc.item} × ${acc.quantity}` : acc.item,
    acc.brandPreference && `Brand: ${acc.brandPreference}`,
    acc.device && `For: ${acc.device}`,
  ]
    .filter(Boolean)
    .join(' · ');

export const inquiryService = {
  /**
   * { category, budget, message, mobile?: { brand, ramRom, features },
   *   accessories?: { type, item, brandPreference, device, quantity },
   *   service?: { device, brandModel, problem, details, preference } } (answers for that category)
   */
  async create(inquiry) {
    const data = await customerApi.post('/customer/inquiries', inquiry);
    return data.inquiry;
  },

  /** Photo of the problem on a service inquiry (already scaled down on the device, see utils/photo.js) */
  async uploadPhoto(id, blob) {
    const data = await customerApi.upload(`/customer/inquiries/${encodeURIComponent(id)}/photo`, blob);
    return data.inquiry;
  },

  /** The customer's own inquiries, newest first */
  async listMine() {
    const data = await customerApi.get('/customer/inquiries');
    return data.items;
  },
};
