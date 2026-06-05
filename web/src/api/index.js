import axios from 'axios';
import { showDialog, showToast } from 'vant';
import { useUserStore } from '@/stores/user';
import router from '@/router';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Request: attach Bearer token if present.
api.interceptors.request.use((config) => {
  const user = useUserStore();
  if (user.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

// Response: unwrap envelope, surface errors via Vant dialog, bounce on 401.
api.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) {
        return body.data;
      }
      // Known business error — surface via dialog (more prominent than toast).
      if (body.code === 3001 || body.code === 3002 || body.code === 3003) {
        // 401 family — clear local state and bounce to login.
        useUserStore().logout();
        if (router.currentRoute.value.name !== 'Login') {
          router.push({ name: 'Login', query: { redirect: router.currentRoute.value.fullPath } });
        }
        showDialog({
          title: '登录已过期',
          message: body.message || '请重新登录',
          confirmButtonText: '去登录',
        }).catch(() => {});
        return Promise.reject(new Error(body.message || 'unauthorized'));
      }
      showDialog({
        title: '操作失败',
        message: body.message || `错误码 ${body.code}`,
        confirmButtonText: '我知道了',
      }).catch(() => {});
      return Promise.reject(new Error(body.message || `code ${body.code}`));
    }
    // Non-envelope response (e.g. raw stream) — return as-is.
    return body;
  },
  (err) => {
    const status = err.response?.status;
    const msg = err.response?.data?.message || err.message || '网络错误';
    if (status === 401) {
      useUserStore().logout();
      if (router.currentRoute.value.name !== 'Login') {
        router.push({ name: 'Login' });
      }
      showDialog({ title: '登录已过期', message: msg, confirmButtonText: '去登录' }).catch(() => {});
    } else if (status >= 500) {
      showDialog({ title: '服务异常', message: msg, confirmButtonText: '我知道了' }).catch(() => {});
    } else {
      // 4xx other than 401 — use lighter toast (validation etc.)
      showToast(msg);
    }
    return Promise.reject(err);
  },
);

export default api;
