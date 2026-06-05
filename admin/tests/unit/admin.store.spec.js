import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAdminStore } from '@/stores/admin';

// Mock the auth + api modules so the store doesn't talk to the network.
vi.mock('@/api/auth', () => ({
  loginByPassword: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@/api', () => ({
  default: { get: vi.fn() },
}));

import * as authApi from '@/api/auth';

describe('useAdminStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('starts with null token / refreshToken / profile', () => {
      const admin = useAdminStore();
      expect(admin.token).toBeNull();
      expect(admin.refreshToken).toBeNull();
      expect(admin.profile).toBeNull();
      expect(admin.isLoggedIn).toBe(false);
    });
  });

  describe('login action', () => {
    it('stores token, refreshToken, and profile on success', async () => {
      authApi.loginByPassword.mockResolvedValueOnce({
        token: 'tk-1',
        refreshToken: 'rt-1',
        user: { id: 'u1', username: 'admin', role: 'admin' },
      });
      const admin = useAdminStore();
      await admin.login('admin', 'secret');

      expect(admin.token).toBe('tk-1');
      expect(admin.refreshToken).toBe('rt-1');
      expect(admin.profile).toEqual({ id: 'u1', username: 'admin', role: 'admin' });
      expect(admin.isLoggedIn).toBe(true);
      expect(admin.isSuper).toBe(false);
      expect(admin.username).toBe('admin');
    });

    it('marks isSuper true for role=super', async () => {
      authApi.loginByPassword.mockResolvedValueOnce({
        token: 'tk-2',
        refreshToken: 'rt-2',
        user: { id: 'u2', username: 'root', role: 'super' },
      });
      const admin = useAdminStore();
      await admin.login('root', 'pw');
      expect(admin.isSuper).toBe(true);
    });
  });

  describe('logout action', () => {
    it('clears local state even when server logout fails', async () => {
      authApi.logout.mockRejectedValueOnce(new Error('network'));
      const admin = useAdminStore();
      admin.token = 'tk-1';
      admin.refreshToken = 'rt-1';
      admin.profile = { id: 'u1', username: 'admin', role: 'admin' };

      await admin.logout();

      expect(admin.token).toBeNull();
      expect(admin.refreshToken).toBeNull();
      expect(admin.profile).toBeNull();
      expect(admin.isLoggedIn).toBe(false);
    });
  });
});
