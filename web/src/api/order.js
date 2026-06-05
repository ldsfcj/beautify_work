import api from './index';

// Create a pending order for a package. `method` is 'wechat' | 'alipay'.
// Returns {order_no, credits, amount_cents, h5_url, expire_at}.
export const create = (packageId, method) =>
  api.post('/order/create', { packageId, method });

// Paginated list of the current user's orders, newest first.
export const list = (page = 1, size = 10) =>
  api.get('/order/list', { params: { page, size } });

// Get a single order by its order_no. Owner-only; cross-user returns 404.
export const detail = (orderNo) => api.get(`/order/${orderNo}`);
