import api from './index';

// Get the current user's profile. Returns {id, nickname, phone_mask, credits}.
export const getMe = () => api.get('/user/me');

// Update mutable profile fields. Only `nickname` is supported today.
export const updateMe = (dto) => api.patch('/user/me', dto);

// Soft-delete the current user. 30-day grace period; sets
// status=pending_delete and immediately revokes the access token.
export const cancel = () => api.delete('/user/me');
