import api from './index';

/**
 * Audit log admin read endpoint. Filters map 1:1 to the server
 * query params; the response is the standard list envelope:
 *   { items, total, page, pageSize }
 */
export const list = (opts = {}) => api.get('/admin/audit-logs', { params: opts });
