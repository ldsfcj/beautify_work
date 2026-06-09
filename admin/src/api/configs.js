import api from './index';

/**
 * System config (system_configs) admin endpoints. The `value` column
 * is JSONB so callers can pass any serializable shape.
 */
export const list = () => api.get('/admin/configs');

/**
 * @param {string} key   the config key
 * @param {unknown} value  the new value (any JSON-serializable)
 */
export const upsert = (key, value) => api.put(`/admin/configs/${key}`, { value });
