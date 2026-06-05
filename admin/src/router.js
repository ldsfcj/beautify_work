import { createRouter, createWebHistory } from 'vue-router';
import { useAdminStore } from '@/stores/admin';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true, title: '管理员登录' },
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台', icon: 'odometer' },
      },
      // Tasks 32-35 add: /orders /users /packages /presets /configs /ai-logs /audit /refunds
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFound.vue'),
    meta: { public: true, title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const admin = useAdminStore();
  if (to.meta.public) return true;
  if (!admin.token) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }
  // Future: role-based gating (super vs admin)
  return true;
});

router.afterEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} · 医美 AI 后台`;
  }
});

export default router;
