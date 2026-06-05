import axios from 'axios';
// ElMessage / ElMessageBox are auto-imported by unplugin-auto-import
// (see vite.config.js) — no manual import needed.
import { useAdminStore } from '@/stores/admin';
import router from '@/router';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const admin = useAdminStore();
  if (admin.token) {
    config.headers.Authorization = `Bearer ${admin.token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data;
      }
      // 401 family → clear admin state and bounce to login
      if (body.code === 3001 || body.code === 3002 || body.code === 3003) {
        useAdminStore().logout();
        if (router.currentRoute.value.name !== 'Login') {
          router.push({
            name: 'Login',
            query: { redirect: router.currentRoute.value.fullPath },
          });
        }
        ElMessage.error(body.message || '登录已过期');
        return Promise.reject(new Error(body.message || 'unauthorized'));
      }
      // 403 — permission denied
      if (body.code === 3030) {
        ElMessage.error(body.message || '权限不足');
        return Promise.reject(new Error(body.message || 'forbidden'));
      }
      ElMessage.error(body.message || `错误码 ${body.code}`);
      return Promise.reject(new Error(body.message || `code ${body.code}`));
    }
    return body;
  },
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message || '网络错误';
    if (status === 401) {
      useAdminStore().logout();
      if (router.currentRoute.value.name !== 'Login') {
        router.push({ name: 'Login' });
      }
      ElMessage.error('登录已过期');
    } else if (status >= 500) {
      ElMessage.error(`服务异常: ${msg}`);
    } else {
      ElMessage.warning(msg);
    }
    return Promise.reject(err);
  },
);

export default api;
