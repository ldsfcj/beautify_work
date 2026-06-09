import api from './index';

/**
 * Credit-package CRUD (admin side). The public `/credit/packages`
 * endpoint is read-only; the admin variants flip isActive + pricing.
 */
export const list = (includeInactive = false) =>
  api.get('/admin/packages', { params: { includeInactive: includeInactive ? 'true' : undefined } });

export const create = (dto) => api.post('/admin/packages', dto);
export const update = (id, dto) => api.put(`/admin/packages/${id}`, dto);
export const remove = (id) => api.delete(`/admin/packages/${id}`);
