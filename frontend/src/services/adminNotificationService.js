// Sundhamata Mobile - Store Admin Notifications Service
// Notifications are the store's recent activity from the API. Which ones this
// admin has already opened is a per-browser convenience kept in localStorage.

import { adminApi } from './api/apiClient';
import { formatRelativeTime } from '../utils/formatters';

const READ_KEY = 'sm_admin_notifications_read';

const readIds = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]'));
  } catch {
    return new Set();
  }
};

const saveReadIds = (ids) => {
  try {
    // Keep the list bounded
    localStorage.setItem(READ_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    // storage unavailable — read state simply won't persist
  }
};

export const adminNotificationService = {
  async getNotifications() {
    const data = await adminApi.get('/admin/activity', { limit: 20 });
    const read = readIds();
    return data.items.map((item) => ({
      ...item,
      time: formatRelativeTime(item.occurredAt),
      read: read.has(item.id),
    }));
  },

  async markAsRead(id) {
    const ids = readIds();
    ids.add(id);
    saveReadIds(ids);
    return this.getNotifications();
  },

  async markAllAsRead() {
    const list = await this.getNotifications();
    const ids = readIds();
    list.forEach((n) => ids.add(n.id));
    saveReadIds(ids);
    return list.map((n) => ({ ...n, read: true }));
  },
};
