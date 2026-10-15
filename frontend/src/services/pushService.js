// Sundhamata Mobile - Push notifications (Firebase Cloud Messaging)
// Each signed-in device registers its FCM token with the API, which keeps separate lists for
// "web" (this browser) and "app" (the mobile app). Everything here is best effort: a failure
// to set up notifications must never break signing in or out.
//
// Mobile app (WebView): the app gets its FCM token natively and hands it over with
//   window.SundhamataPush.setAppToken('<fcm token>')
// The token is registered as platform "app" now (if signed in) and after every sign-in.

import { getApps, initializeApp } from 'firebase/app';
import { deleteToken, getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { FIREBASE_VAPID_KEY, firebaseConfig } from '../config/firebase';
import { customerApi } from './api/apiClient';
import { customerSession } from './api/session';

const SW_URL = '/firebase-messaging-sw.js';
// Its own scope, so the worker never controls (or caches) the app's pages
const SW_SCOPE = '/firebase-cloud-messaging-push-scope';
// The browser token registered for the signed-in customer
const WEB_TOKEN_KEY = 'sm_push_web_token';
// The token handed over by the mobile app
const APP_TOKEN_KEY = 'sm_push_app_token';

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // storage unavailable (private mode): the token is simply registered again next time
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};

const isSignedIn = () => Boolean(customerSession.getToken());

let messagingPromise;
/** @returns {Promise<import('firebase/messaging').Messaging|null>} null when this browser has no web push */
const webMessaging = () => {
  messagingPromise ??= isSupported()
    .then((supported) =>
      supported && 'Notification' in window && 'serviceWorker' in navigator
        ? getMessaging(getApps()[0] ?? initializeApp(firebaseConfig))
        : null
    )
    .catch(() => null);
  return messagingPromise;
};

let registrationPromise;
const workerRegistration = () => {
  registrationPromise ??= navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  return registrationPromise;
};

let foregroundListening = false;
// With the app open, FCM hands the message to the page instead of the service worker:
// show it the same way so it looks (and opens) the same
const listenInForeground = (messaging) => {
  if (foregroundListening) return;
  foregroundListening = true;
  onMessage(messaging, async ({ data = {} }) => {
    const registration = await workerRegistration();
    registration.showNotification(data.title || 'Sundhamata Mobile', {
      body: data.body || '',
      icon: '/logo.png',
      badge: '/favicon.png',
      data: { link: data.link || '/home' },
    });
  });
};

const register = (token, platform) => customerApi.post('/customer/me/fcm-tokens', { token, platform });

const unregister = (token, platform) => customerApi.delete('/customer/me/fcm-tokens', { token, platform });

/** Gets this browser's token and registers it (permission must already be granted). */
const syncWebToken = async () => {
  const messaging = await webMessaging();
  if (!messaging || Notification.permission !== 'granted') return false;
  const token = await getToken(messaging, {
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await workerRegistration(),
  });
  if (!token) return false;
  await register(token, 'web');
  storage.set(WEB_TOKEN_KEY, token);
  listenInForeground(messaging);
  return true;
};

const quietly = (promise) => promise.catch(() => false);

export const pushService = {
  /**
   * Web push state for the settings toggle.
   * @returns {Promise<{ supported: boolean, permission: NotificationPermission|null, enabled: boolean }>}
   */
  async getWebStatus() {
    const supported = Boolean(await webMessaging());
    const permission = supported ? Notification.permission : null;
    return { supported, permission, enabled: permission === 'granted' && Boolean(storage.get(WEB_TOKEN_KEY)) };
  },

  /**
   * After sign-in and on app start: (re)registers this device. Never asks for permission;
   * the browser token is only registered when the customer allowed notifications before.
   */
  async syncDevice() {
    if (!isSignedIn()) return;
    const appToken = storage.get(APP_TOKEN_KEY);
    if (appToken) await quietly(register(appToken, 'app'));
    await quietly(syncWebToken());
  },

  /** Asks the browser for permission (call from a tap) and registers this browser. */
  async enableWebPush() {
    if (!(await webMessaging())) throw new Error('This browser does not support notifications.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notifications are blocked. Allow them for this site in your browser settings.');
    }
    if (!(await syncWebToken())) throw new Error('Could not turn on notifications. Please try again.');
  },

  /** Stops notifications to this browser for this customer. */
  async disableWebPush() {
    const token = storage.get(WEB_TOKEN_KEY);
    storage.remove(WEB_TOKEN_KEY);
    if (token) await unregister(token, 'web');
    const messaging = await webMessaging();
    if (messaging) await quietly(deleteToken(messaging));
  },

  /** Before signing out: this device stops getting the customer's notifications. */
  async unregisterDevice() {
    const webToken = storage.get(WEB_TOKEN_KEY);
    const appToken = storage.get(APP_TOKEN_KEY);
    storage.remove(WEB_TOKEN_KEY);
    await Promise.all([
      webToken && quietly(unregister(webToken, 'web')),
      appToken && quietly(unregister(appToken, 'app')),
    ]);
  },

  /** Notification tapped while the app is open: the service worker asks to show `link`. */
  onOpenLink(listener) {
    if (!('serviceWorker' in navigator)) return () => {};
    const handler = (event) => {
      if (event.data?.type === 'push:open' && typeof event.data.link === 'string') listener(event.data.link);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  },
};

// Bridge for the mobile app (see the top of this file)
window.SundhamataPush = {
  setAppToken(token) {
    if (typeof token !== 'string' || !token.trim()) return;
    storage.set(APP_TOKEN_KEY, token.trim());
    if (isSignedIn()) quietly(register(token.trim(), 'app'));
  },
};
