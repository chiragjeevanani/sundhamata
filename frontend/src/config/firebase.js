// Sundhamata Mobile - Firebase web configuration (push notifications)
// These values are public by design: they only identify the Firebase project. Sending
// notifications needs the server's private service account key, which never reaches the browser.
// Keep in sync with public/firebase-messaging-sw.js (a service worker cannot import this file).

export const firebaseConfig = {
  apiKey: 'AIzaSyCzlbYD4qjKtTIbqKinOdxxpvkXb7DR2fY',
  authDomain: 'sundhamata-f741d.firebaseapp.com',
  projectId: 'sundhamata-f741d',
  storageBucket: 'sundhamata-f741d.firebasestorage.app',
  messagingSenderId: '497965743215',
  appId: '1:497965743215:web:2d4bb55ccc85c499e0219a',
  measurementId: 'G-GMJ63Q892X',
};

// Firebase console → Project settings → Cloud Messaging → Web Push certificates (public key)
export const FIREBASE_VAPID_KEY =
  'BGR-1YdOhdCe6vy3rOgjUb2uC7CHOP5iZbtbD8AM9I7UwEHarNUYE9Ljxg-BcGVKdIS_ciy6lBhJoplhWrM8tYM';
