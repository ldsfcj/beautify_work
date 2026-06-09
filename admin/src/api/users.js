import api from './index';

/**
 * GET /api/admin/users — paginated, filterable list of all users.
 */
export const list = (opts = {}) => api.get('/admin/users', { params: opts });

export const detail = (id) => api.get(`/admin/users/${id}`);

/**
 * POST /api/admin/users/:id/adjust-credits — manual balance bump.
 * `amount` must be a positive integer; the backend writes a ledger
 * row with `type=recharge` and `relatedId=admin-adjust:<adminId>:<ts>:<reason>`.
 */
export const adjustCredits = (id, body) => api.post(`/admin/users/${id}/adjust-credits`, body);
