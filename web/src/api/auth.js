import api from './index';

// Send a 6-digit SMS code to the given phone (dev: prints to server log).
export const sendSms = (phone) => api.post('/auth/sms/send', { phone });

// Verify SMS code and exchange for access + refresh tokens.
export const login = (phone, code) => api.post('/auth/login', { phone, code });

// Trade a refresh token for a fresh access token.
export const refresh = (refreshToken) => api.post('/auth/refresh', { refreshToken });

// Logout: invalidate refresh token server-side (Task 10) and clear local state.
export const logout = () => api.post('/auth/logout').catch(() => {});
