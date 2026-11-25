import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

// Address auto-fill for the customer's profile:
//  - pincode → city / state / areas, from the India Post pincode directory (api.postalpincode.in)
//  - GPS position → address, from OpenStreetMap Nominatim (nominatim.openstreetmap.org)
// Both are free and keyless, so calls go through the API (not the browser) to cache answers and to
// respect Nominatim's usage policy: an identifying User-Agent and at most one request per second.

const USER_AGENT = 'SundhamataMobile/1.0 (https://sundhamatamobile.in)';
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 2_000;

const cache = new Map();
const cached = async (key, load) => {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await load();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
};

/** Test helper: forget cached answers */
export const clearAddressCache = () => cache.clear();

const unavailable = () => new ApiError(503, 'Address lookup is not available right now. Please type your address.');

const getJson = async (url, source) => {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn({ err, source }, 'Address lookup request failed');
    throw unavailable();
  }
  if (!res.ok) {
    logger.warn({ status: res.status, source }, 'Address lookup returned an error');
    throw unavailable();
  }
  try {
    return await res.json();
  } catch {
    throw unavailable();
  }
};

/**
 * @param {string} pincode 6 digits
 * @returns {Promise<{ pincode, city, state, areas: string[] }>}
 */
export const lookupPincode = (pincode) =>
  cached(`pin:${pincode}`, async () => {
    const data = await getJson(`https://api.postalpincode.in/pincode/${pincode}`, 'india-post');
    const offices = Array.isArray(data) && data[0]?.Status === 'Success' ? data[0].PostOffice ?? [] : [];
    if (!offices.length) throw ApiError.notFound('No area found for this pincode. Please check it.');
    return {
      pincode,
      city: offices[0].District ?? null,
      state: offices[0].State ?? null,
      // Post office / locality names, e.g. "Gyaspur", "Lambha"
      areas: [...new Set(offices.map((o) => o.Name).filter(Boolean))].slice(0, 20),
    };
  });

// Nominatim allows one request per second: queue them
let lastNominatimAt = 0;
let nominatimQueue = Promise.resolve();
const throttleNominatim = () => {
  const turn = nominatimQueue.then(async () => {
    const wait = lastNominatimAt + 1_100 - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastNominatimAt = Date.now();
  });
  nominatimQueue = turn.catch(() => {});
  return turn;
};

/**
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<{ address, city, state, pincode }>} any part may be null
 */
export const reverseGeocode = (lat, lng) =>
  // ~11 m precision for the cache key: nearby taps share an answer
  cached(`rev:${lat.toFixed(4)},${lng.toFixed(4)}`, async () => {
    await throttleNominatim();
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(lat),
      lon: String(lng),
      addressdetails: '1',
      'accept-language': 'en',
    }).toString();
    const data = await getJson(url, 'nominatim');
    const a = data?.address;
    if (!a) throw ApiError.notFound('Could not find an address for your location. Please type it.');

    // In India a village / hamlet is a locality inside a district (e.g. Lambha, Ahmedabad):
    // the district is the city, the village goes on the address line
    const city = a.city ?? a.town ?? a.state_district ?? a.county ?? a.village ?? null;
    // Street-level parts, without the city / state / pincode (they have their own fields)
    const lines = [
      [a.house_number, a.building ?? a.amenity].filter(Boolean).join(', '),
      a.road,
      a.neighbourhood ?? a.quarter,
      a.suburb,
      a.hamlet,
      a.village,
    ]
      .filter((part) => part && part !== city)
      .filter((part, i, all) => all.indexOf(part) === i);
    const pincode = /^[1-9]\d{5}$/.test(a.postcode ?? '') ? a.postcode : null;

    return { address: lines.join(', ') || null, city, state: a.state ?? null, pincode };
  });
