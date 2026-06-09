import api from './index';

/**
 * Fetch the full preset catalogue grouped by category.
 * Public endpoint — no token required; the catalogue is identical for
 * every user, so the dashboard warms its Pinia cache before login.
 *
 * @returns {Promise<Record<string, Array<{
 *   id: string, key: string, category: string, name: string,
 *   description: string|null, defaultPrompt: string,
 *   creditsCost: number, sortOrder: number
 * }>>>}
 */
export const list = () => api.get('/preset/list');
