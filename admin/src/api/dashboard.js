import api from './index';

/**
 * GET /api/admin/dashboard — aggregated counters for the landing cards.
 */
export const summary = () => api.get('/admin/dashboard');
