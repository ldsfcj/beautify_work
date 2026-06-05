import api from './index';

// Username + password login for back-office staff. Real implementation
// lands in Task 32 (admin auth + bcrypt password verify + JWT sign).
export const loginByPassword = (username, password) =>
  api.post('/admin/auth/login', { username, password });

export const refresh = (refreshToken) => api.post('/admin/auth/refresh', { refreshToken });

export const logout = () => api.post('/admin/auth/logout').catch(() => {});
