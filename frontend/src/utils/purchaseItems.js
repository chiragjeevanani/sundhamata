// Sundhamata Mobile - product rows of the Record Purchase form (one row per product on the bill)

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
