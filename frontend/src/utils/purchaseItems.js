// Sundhamata Mobile - product rows of the Record Purchase form (one row per product on the bill)

import { Headphones, Smartphone, Wrench } from 'lucide-react';
import { MAX_WARRANTY_MONTHS, warrantyToMonths } from './purchaseDates';

let nextKey = 1;

/** Empty product row for the Record Purchase form */
export const newPurchaseItem = () => ({
  key: nextKey++,
  name: '',
  category: 'phones',
  brand: '',
  model: '',
  variant: '',
  color: '',
  hsn: '',
  imei: '',
  price: '',
  warrantyDuration: '1',
  warrantyUnit: 'years',
  imageFile: null,
  imagePreview: null,
  imageError: '',
  // Catalog entry picked for this row: offers its variants / colours as quick choices
  catalog: null,
});

/** Fields to copy from a catalog product into a row (keeps what the user already typed) */
export const fillFromCatalog = (item, product) => {
  const months = product.warrantyMonths;
  const warranty =
    months === null || months === undefined
      ? {}
      : months % 12 === 0
        ? { warrantyDuration: String(months / 12), warrantyUnit: 'years' }
        : { warrantyDuration: String(months), warrantyUnit: 'months' };
  return {
    name: product.name,
    category: product.category,
    brand: product.brand || item.brand,
    model: product.model || item.model,
    variant: item.variant || product.variants?.[0] || '',
    color: item.color,
    hsn: item.hsn || product.hsn || '',
    price: item.price || (product.lastPrice ? String(product.lastPrice) : ''),
    ...warranty,
    catalog: product,
  };
};

export const itemWarrantyMonths = (item) => warrantyToMonths(item.warrantyDuration, item.warrantyUnit);
export const itemWarrantyValid = (item) => {
  const months = itemWarrantyMonths(item);
  return months !== null && months <= MAX_WARRANTY_MONTHS;
};

// What is being sold decides which details are asked for
export const ITEM_TYPES = [
  {
    id: 'phones',
    label: 'Mobile',
    icon: Smartphone,
    name: 'Mobile Name',
    namePlaceholder: 'e.g. Samsung Galaxy S25 Ultra',
    brand: 'Brand',
    model: 'Model',
    variant: true,
    color: true,
    imei: { label: 'IMEI *', placeholder: '15-digit IMEI (dial *#06#)' },
    warranty: 'Warranty',
  },
  {
    id: 'accessories',
    label: 'Accessories',
    icon: Headphones,
    name: 'Accessory Name',
    namePlaceholder: 'e.g. boAt Airdopes 141, 65W charger',
    brand: 'Brand',
    model: 'Model',
    variant: false,
    color: true,
    imei: { label: 'Serial Number (optional)', placeholder: 'Serial number, if any' },
    warranty: 'Warranty',
  },
  {
    id: 'service',
    label: 'Services',
    icon: Wrench,
    name: 'Service Name',
    namePlaceholder: 'e.g. Screen replacement, battery change',
    brand: 'Device Brand',
    model: 'Device Model',
    variant: false,
    color: false,
    imei: { label: 'Device IMEI (optional)', placeholder: "IMEI of the customer's phone" },
    warranty: 'Service Warranty',
  },
];

/** A mobile needs its 15-digit IMEI (for warranty claims). Returns an error message or null. */
export const itemImeiError = (item) => {
  if (item.category !== 'phones') return null;
  const digits = (item.imei || '').replace(/[\s-]/g, '');
  if (!digits) return 'Enter the IMEI of the mobile.';
  if (!/^\d{15}$/.test(digits)) return 'IMEI must be 15 digits.';
  return null;
};
