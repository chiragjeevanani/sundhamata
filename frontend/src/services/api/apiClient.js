// Sundhamata Mobile - Reusable API client
// Base URL, JSON handling, JWT headers, error normalization and 401 handling.

import { adminSession, customerSession } from './session';

// e.g. "http://localhost:5000/api/v1" — configured through VITE_API_URL (see .env.example).
// Falls back to a same-origin "/api/v1" when the API is served behind the same host.
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, { status = 0, errors = [], meta = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.meta = meta;
  }
}

const buildUrl = (path, query) => {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url;
};

// "Validation failed" alone is not actionable in a toast; surface the first field error instead.
const messageFrom = (payload, status) => {
  const firstError = payload?.errors?.find((e) => e?.message)?.message;
  if (status === 422 && firstError) return firstError;
  return payload?.message || firstError || `Request failed (${status})`;
};

const request = async (session, path, { method = 'GET', body, query, file, responseType = 'json' } = {}) => {
  const token = session?.getToken() ?? null;
  const headers = { Accept: responseType === 'blob' ? '*/*' : 'application/json' };
  if (file !== undefined) {
    // The server detects the real file type from the bytes, so the declared type is irrelevant.
    headers['Content-Type'] = 'application/octet-stream';
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: file !== undefined ? file : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Unable to reach the server. Please check your connection and try again.');
  }

  if (response.ok && responseType === 'blob') return response.blob();

  const payload = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    // An authenticated request rejected with 401 means the token expired or was revoked:
    // end the session so the app redirects to its login screen.
    if (response.status === 401 && token) session.clear('unauthorized');
    throw new ApiError(messageFrom(payload, response.status), {
      status: response.status,
      errors: payload?.errors ?? [],
      meta: payload?.meta ?? null,
    });
  }

  return payload?.data;
};

const createApiClient = (session) => ({
  get: (path, query) => request(session, path, { query }),
  post: (path, body = {}) => request(session, path, { method: 'POST', body }),
  patch: (path, body = {}) => request(session, path, { method: 'PATCH', body }),
  delete: (path) => request(session, path, { method: 'DELETE' }),
  /** POST a File/Blob as the raw request body */
  upload: (path, file, query) => request(session, path, { method: 'POST', file, query }),
  /** GET a binary response as a Blob */
  download: (path) => request(session, path, { responseType: 'blob' }),
});

/** Unauthenticated endpoints (login, OTP, public store info). */
export const publicApi = createApiClient(null);
/** Customer app — sends the customer token. */
export const customerApi = createApiClient(customerSession);
/** Admin panel — sends the admin token. */
export const adminApi = createApiClient(adminSession);
