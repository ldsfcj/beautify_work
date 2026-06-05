import { defineStore } from 'pinia';
import * as authApi from '@/api/auth';
import api from '@/api';

/**
 * Authenticated admin user state. Persisted to localStorage via
 * pinia-plugin-persistedstate. Server-side `admin_users.role` is the
 * source of truth — the `super` role bypasses per-action permission
 * checks at the API level (Task 32).
 */
export const useAdminStore = defineStore('admin', {
  state: () => ({
    token: null,
    refreshToken: null,
    profile: null, // { id, username, role: 'admin' | 'super', lastLoginAt }
  }),

  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    isSuper: (s) => s.profile?.role === 'super',
    username: (s) => s.profile?.username ?? '',
  },

  actions: {
    async login(username, password) {
      const data = await authApi.loginByPassword(username, password);
      this.token = data.token;
      this.refreshToken = data.refreshToken;
      this.profile = data.user;
    },
    async fetchProfile() {
      this.profile = await api.get('/admin/me');
    },
    async logout() {
      // Swallow server-side errors: local state must always be cleared so a
      // subsequent login attempt isn't blocked by a stale token.
      try {
        await authApi.logout();
      } catch {
        // intentionally ignored
      }
      this.token = null;
      this.refreshToken = null;
      this.profile = null;
    },
  },

  persist: {
    key: 'medical_aesthetics_admin',
    storage: localStorage,
  },
});
