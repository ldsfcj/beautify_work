import api from './index';

// Fetch the current published version + body for a given agreement type.
// `type` is one of 'user' | 'privacy'.
export const getCurrent = (type) => api.get('/agreement/current', { params: { type } });

// Record the user's acceptance. Version is sourced from the server.
export const accept = (type) => api.post('/agreement/accept', { type });
