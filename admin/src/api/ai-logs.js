import api from './index';

/**
 * AI call log admin endpoints. Used for cost / latency dashboards.
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=50]
 * @param {string} [opts.model]
 * @param {string} [opts.fromDate]
 * @param {string} [opts.toDate]
 */
export const list = (opts = {}) => api.get('/admin/ai-logs', { params: opts });
