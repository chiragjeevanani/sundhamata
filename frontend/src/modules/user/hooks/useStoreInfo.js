import { useEffect, useState } from 'react';
import { userService } from '../../../services/userService';

/**
 * Public store details (name, address, contact, GSTIN) from the API.
 * Returns null until loaded; the request is shared and cached by userService.
 */
export const useStoreInfo = () => {
  const [store, setStore] = useState(null);

  useEffect(() => {
    let active = true;
    userService
      .getStoreInfo()
      .then((info) => active && setStore(info))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return store;
};

/** "Shop 12, Chandan Nagar, Jaipur, Rajasthan - 302019" without empty segments */
export const formatStoreAddress = (store, { includeState = true } = {}) => {
  if (!store) return '';
  const parts = [store.address, store.city, includeState ? store.state : null].filter(Boolean).join(', ');
  return store.pincode ? `${parts} - ${store.pincode}` : parts;
};
