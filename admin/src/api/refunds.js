import api from './index';

/**
 * Refund queue admin endpoints.
 */
export const list = (opts = {}) => api.get('/admin/refunds', { params: opts });

/** Approve: marks APPROVED + refunds credits to the user. */
export const approve = (id) => api.post(`/admin/refunds/${id}/approve`);

/**
 * Reject: marks REJECTED, requires a reason (saved to audit log).
 * @param {string} id
 * @param {string} reason
 */
export const reject = (id, reason) => api.post(`/admin/refunds/${id}/reject`, { reason });
