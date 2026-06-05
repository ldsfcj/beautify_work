import { defineStore } from 'pinia';
import * as authApi from '@/api/auth';
import api from '@/api';

/**
 * Authenticated user state. Persisted to localStorage automatically via
 * pinia-plugin-persistedstate; re-hydrated on app boot.
 */
export const useUserStore = defineStore('user', {
  state: () => ({
    token: null,
    refreshToken: null,
    profile: null,
  }),

  getters: {
    isLoggedIn: (s) => Boolean(s.token),
    phoneMask: (s) => s.profile?.phone_mask ?? '',
    credits: (s) => s.profile?.credits ?? 0,
  },

  actions: {
    async login(phone, code) {
      const data = await authApi.login(phone, code);
      this.token = data.token;
      this.refreshToken = data.refreshToken;
      this.profile = data.user;
    },
    async fetchProfile() {
      this.profile = await api.get('/user/me');
    },
    async logout() {
      try {
        await authApi.logout();
      } finally {
        this.token = null;
        this.refreshToken = null;
        this.profile = null;
      }
    },
  },

  // pinia-plugin-persistedstate: store the three token+profile fields in
  // localStorage. Sensitive PII (phone, nickname) lives inside `profile`
  // and is masked server-side before it reaches us.
  persist: {
    key: 'medical_aesthetics_user',
    storage: localStorage,
  },
});
