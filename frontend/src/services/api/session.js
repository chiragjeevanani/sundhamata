// Sundhamata Mobile - Central session storage
// The ONLY module that reads or writes authentication tokens in localStorage.
// Customer and admin sessions are stored separately and never mixed.

const createSessionStore = (storageKey) => {
  const listeners = new Set();

  const read = () => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.token || (session.expiresAt && Date.now() >= session.expiresAt)) {
        localStorage.removeItem(storageKey);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  };

  return {
    /** @returns {{ token: string, expiresAt: number, [key: string]: unknown } | null} */
    get: read,

    getToken: () => read()?.token ?? null,

    set(session) {
      localStorage.setItem(storageKey, JSON.stringify(session));
    },

    update(patch) {
      const current = read();
      if (current) localStorage.setItem(storageKey, JSON.stringify({ ...current, ...patch }));
    },

    /**
     * Ends the session and notifies subscribers (auth contexts) so the UI
     * returns to the login screen.
     * @param {'logout'|'expired'|'unauthorized'} reason
     */
    clear(reason = 'logout') {
      localStorage.removeItem(storageKey);
      listeners.forEach((listener) => listener(reason));
    },

    /** @returns {() => void} unsubscribe */
    onClear(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const customerSession = createSessionStore('sm_customer_session');
export const adminSession = createSessionStore('sm_admin_session');
