import { defineStore } from 'pinia';
import * as notificationApi from '@/api/notification';

/**
 * Notification store: list + unread counter + read mutations.
 *
 * The store is intentionally non-persisted: notifications are server-driven
 * and fetched fresh on demand, so localStorage is not the source of truth.
 *
 * Unread count is mirrored on `unreadCount` so the layout's bell badge can
 * render without iterating the list.
 */
export const useNotificationStore = defineStore('notification', {
  state: () => ({
    items: [],
    unreadCount: 0,
    total: 0,
    page: 1,
    pageSize: 20,
    loading: false,
  }),

  actions: {
    /**
     * Fetch a page of notifications. Replaces `items` and updates the unread
     * counter. `unreadOnly` is forwarded to the API so the bell-icon unread
     * badge can be derived server-side as well.
     */
    async fetchList({ unreadOnly = false, page = 1, pageSize = 20, append = false } = {}) {
      this.loading = true;
      try {
        const data = await notificationApi.list({ unreadOnly, page, pageSize });
        if (append) {
          this.items = this.items.concat(data.items || []);
        } else {
          this.items = data.items || [];
        }
        this.total = data.total ?? this.items.length;
        this.page = data.page ?? page;
        this.pageSize = data.pageSize ?? pageSize;
        // Prefer server-provided unreadCount; fall back to client-side scan.
        this.unreadCount = data.unreadCount ?? this.items.filter((n) => !n.readAt).length;
        return data;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Mark one notification as read and update the local item + counter.
     * Already-read items are no-ops on the server, but we still patch state
     * to keep the UI consistent.
     */
    async markRead(id) {
      const target = this.items.find((n) => n.id === id);
      if (target && target.readAt) return;
      if (target) {
        target.readAt = new Date().toISOString();
        this.unreadCount = Math.max(0, this.unreadCount - 1);
      }
      try {
        await notificationApi.markRead(id);
      } catch (e) {
        // Roll back on failure.
        if (target) {
          target.readAt = null;
          this.unreadCount += 1;
        }
        throw e;
      }
    },

    /**
     * Mark every notification as read and clear the local counter.
     */
    async markAllRead() {
      const previousUnread = this.unreadCount;
      const previousItems = this.items.map((n) => ({ ...n }));
      const now = new Date().toISOString();
      this.items.forEach((n) => {
        n.readAt = n.readAt || now;
      });
      this.unreadCount = 0;
      try {
        await notificationApi.markAllRead();
      } catch (e) {
        this.items = previousItems;
        this.unreadCount = previousUnread;
        throw e;
      }
    },
  },
});
