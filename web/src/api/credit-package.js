import api from './index';

// List active credit packages sorted by sortOrder. No auth required.
export const list = () => api.get('/credit/packages');
