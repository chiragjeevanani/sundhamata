import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Customer, PUSH_PLATFORMS } from '../models/Customer.js';

/**
 * Push notifications to the customer app through Firebase Cloud Messaging.
 *
 * Each customer keeps a separate token list per platform (Customer.fcmTokens.web / .app),
 * one token per device. Sending never throws: a notification is a courtesy, so a push failure
 * must never fail the request that triggered it. Tokens FCM reports as dead are removed.
 */

// Oldest devices drop off beyond this (per platform)
const MAX_TOKENS_PER_PLATFORM = 10;
// FCM replies with these when the app was uninstalled, the browser unsubscribed, etc.
const DEAD_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

let messagingClient;

/** @returns {import('firebase-admin/messaging').Messaging|null} null when push is not configured */
const messaging = () => {
  if (messagingClient !== undefined) return messagingClient;
  messagingClient = null;
  if (!env.FIREBASE_SERVICE_ACCOUNT_PATH) return null;
  try {
    const keyFile = path.resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
    const serviceAccount = JSON.parse(readFileSync(keyFile, 'utf8'));
    const app = initializeApp({ credential: cert(serviceAccount) }, 'push');
    messagingClient = getMessaging(app);
    logger.info({ projectId: serviceAccount.project_id }, 'Push notifications enabled');
  } catch (err) {
    logger.error({ err: err.message }, 'Push notifications disabled: cannot load the Firebase service account');
  }
  return messagingClient;
};

export const isPushEnabled = () => Boolean(messaging());

const tokenPath = (platform) => `fcmTokens.${platform}`;

/** Saves this device's token for the customer (most recent last). */
export const registerToken = async (customerId, { token, platform }) => {
  const field = tokenPath(platform);
  // The device signed in to another account before: it only gets this customer's notifications now
  await Customer.updateMany({ _id: { $ne: customerId }, [field]: token }, { $pull: { [field]: token } });
  await Customer.updateOne({ _id: customerId }, { $pull: { [field]: token } });
  await Customer.updateOne(
    { _id: customerId },
    { $push: { [field]: { $each: [token], $slice: -MAX_TOKENS_PER_PLATFORM } } }
  );
};

/** Signing out on a device: it stops receiving this customer's notifications. */
export const unregisterToken = async (customerId, { token, platform }) => {
  await Customer.updateOne({ _id: customerId }, { $pull: { [tokenPath(platform)]: token } });
};

const stringData = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );

/**
 * Web: data-only, so the service worker (public/firebase-messaging-sw.js) shows it and opens
 * `link` on click. App: a regular notification; the app reads `link` from the data.
 */
const buildMessage = ({ token, platform }, { title, body, link = '/home', data = {} }) => {
  const payload = stringData({ ...data, title, body, link });
  if (platform === 'web') {
    return { token, data: payload, webpush: { headers: { Urgency: 'high' } } };
  }
  return {
    token,
    notification: { title, body },
    data: payload,
    android: { priority: 'high', notification: { sound: 'default' } },
    apns: { payload: { aps: { sound: 'default' } } },
  };
};

/**
 * Sends a notification to every device of the customer (web and app).
 * @param {import('mongoose').Types.ObjectId|string} customerId
 * @param {{ title: string, body: string, link?: string, data?: Record<string, unknown> }} notification
 *   `link` is a customer-app path, e.g. "/purchases/<id>"
 * @returns {Promise<{ sent: number, failed: number }>}
 */
export const sendToCustomer = async (customerId, notification) => {
  const client = messaging();
  if (!client) return { sent: 0, failed: 0 };

  const customer = await Customer.findById(customerId, { fcmTokens: 1 }).lean();
  const targets = PUSH_PLATFORMS.flatMap((platform) =>
    (customer?.fcmTokens?.[platform] ?? []).map((token) => ({ token, platform }))
  );
  if (!targets.length) return { sent: 0, failed: 0 };

  const { responses, successCount, failureCount } = await client.sendEach(
    targets.map((target) => buildMessage(target, notification))
  );

  const dead = targets.filter((_, i) => DEAD_TOKEN_ERRORS.has(responses[i].error?.code));
  if (dead.length) {
    const $pull = {};
    for (const platform of PUSH_PLATFORMS) {
      const tokens = dead.filter((t) => t.platform === platform).map((t) => t.token);
      if (tokens.length) $pull[tokenPath(platform)] = { $in: tokens };
    }
    await Customer.updateOne({ _id: customerId }, { $pull });
  }

  const otherErrors = responses.filter((r) => r.error && !DEAD_TOKEN_ERRORS.has(r.error.code));
  if (otherErrors.length) {
    logger.warn(
      { customerId: String(customerId), errors: otherErrors.map((r) => r.error.code) },
      'Some push notifications failed'
    );
  }
  return { sent: successCount, failed: failureCount };
};

/** Fire-and-forget sendToCustomer for use after a request's work is done. */
export const notifyCustomer = (customerId, notification) => {
  if (!messaging()) return;
  sendToCustomer(customerId, notification).catch((err) =>
    logger.error({ err, customerId: String(customerId) }, 'Push notification failed')
  );
};
