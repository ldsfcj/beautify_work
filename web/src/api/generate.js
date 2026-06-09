import api from './index';

/**
 * Submit a generation. Returns `{ generationId }` synchronously; the actual
 * AI work runs in a Bull worker. Caller should poll `status(id)` or wait
 * for the in-app notification.
 */
export const submit = (body) => api.post('/generate/submit', body);

/**
 * Lightweight status poll — returns status only, no resultUrl, no logs.
 * Use for the Generating page spinner.
 */
export const status = (id) => api.get(`/generate/status/${id}`);

/**
 * Paginated history. Default pageSize is 20.
 */
export const list = (params = {}) => api.get('/generate/list', { params });

/**
 * Full detail incl. result + AI call logs.
 */
export const detail = (id) => api.get(`/generate/${id}`);

/**
 * Soft delete — sets status='deleted'. Not exposed in the dashboard grid.
 */
export const remove = (id) => api.delete(`/generate/${id}`);

/**
 * Returns a 5-minute signed OSS URL for the generated image. 5min matches
 * the server-side TTL (D6 privacy policy).
 */
export const downloadUrl = (id) => api.get(`/generate/${id}/download-url`);
