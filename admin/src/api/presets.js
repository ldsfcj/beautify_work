import api from './index';

/**
 * Preset CRUD. `includeInactive=true` flips the soft-disabled rows
 * back into the response (the public `/preset/list` endpoint only
 * returns active rows).
 */
export const list = (includeInactive = false) =>
  api.get('/admin/presets', { params: { includeInactive: includeInactive ? 'true' : undefined } });

export const create = (dto) => api.post('/admin/presets', dto);
export const update = (id, dto) => api.put(`/admin/presets/${id}`, dto);
export const remove = (id) => api.delete(`/admin/presets/${id}`);
