/* global importScripts, firebase, clients */
// Sundhamata Mobile - push notification service worker (Firebase Cloud Messaging)
// Registered by src/services/pushService.js. Shows notifications while the app is closed or in
// the background, and opens the right screen when one is tapped. The server sends web
// notifications as data only: { title, body, link }, where link is an app path like "/loyalty".

importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

// Same values as src/config/firebase.js
firebase.initializeApp({
  apiKey: 'AIzaSyCzlbYD4qjKtTIbqKinOdxxpvkXb7DR2fY',
  authDomain: 'sundhamata-f741d.firebaseapp.com',
  projectId: 'sundhamata-f741d',
  storageBucket: 'sundhamata-f741d.firebasestorage.app',
  messagingSenderId: '497965743215',
  appId: '1:497965743215:web:2d4bb55ccc85c499e0219a',
});

firebase.messaging().onBackgroundMessage(({ data = {} }) =>
  self.registration.showNotification(data.title || 'Sundhamata Mobile', {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/favicon.png',
    data: { link: data.link || '/home' },
  })
);

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/home';
  const url = new URL(link, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // An open customer-app tab (not the admin panel) navigates in place; otherwise open one
      const appWindow = windows.find((w) => {
        const { origin, pathname } = new URL(w.url);
        return origin === self.location.origin && !pathname.startsWith('/admin');
      });
      if (appWindow) {
        appWindow.postMessage({ type: 'push:open', link });
        return appWindow.focus();
      }
      return clients.openWindow(url);
    })()
  );
});
