import api from './index';

/**
 * List the current user's notifications.
 *
 * @param {object} [opts]
 * @param {number} [opts.page=1]
 * @param {number} [opts.pageSize=20]
 * @param {boolean} [opts.unreadOnly=false]
 * @returns {Promise<{items: Array, total: number, unreadCount: number, page: number, pageSize: number}>}
 */
export const list = (opts = {}) => api.get('/notification/list', { params: opts });

/**
 * Mark a single notification as read.
 *
 * @param {string|number} id
 */
export const markRead = (id) => api.patch(`/notification/${id}/read`);

/**
 * Mark every notification belonging to the current user as read.
 */
export const markAllRead = () => api.post('/notification/read-all');
