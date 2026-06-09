import api from './index';

/**
 * GET /api/admin/orders — paginated, filterable list across all users.
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=20]
 * @param {'pending'|'paid'|'refunded'|'cancelled'|'all'} [opts.status]
 * @param {string} [opts.q]            free-text on order_no / nickname / phone_hash
 * @param {string} [opts.fromDate]     ISO date inclusive
 * @param {string} [opts.toDate]       ISO date inclusive
 */
export const list = (opts = {}) => api.get('/admin/orders', { params: opts });

export const detail = (id) => api.get(`/admin/orders/${id}`);
