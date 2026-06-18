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
      {
        path: 'orders',
        name: 'Orders',
        component: () => import('@/views/Orders.vue'),
        meta: { title: '订单管理', icon: 'list' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/Users.vue'),
        meta: { title: '用户管理', icon: 'user' },
      },
      {
        path: 'presets',
        name: 'Presets',
        component: () => import('@/views/Presets.vue'),
        meta: { title: '预设项目', icon: 'collection' },
      },
      {
        path: 'packages',
        name: 'Packages',
        component: () => import('@/views/Packages.vue'),
        meta: { title: '积分套餐', icon: 'goods' },
      },
      {
        path: 'configs',
        name: 'Configs',
        component: () => import('@/views/Configs.vue'),
        meta: { title: '系统配置', icon: 'setting' },
      },
      {
        path: 'refunds',
        name: 'Refunds',
        component: () => import('@/views/Refunds.vue'),
        meta: { title: '退款审核', icon: 'refresh' },
      },
      {
        path: 'ai-logs',
        name: 'AiLogs',
        component: () => import('@/views/AiLogs.vue'),
        meta: { title: 'AI 调用日志', icon: 'cpu' },
      },
      {
        path: 'audit-logs',
        name: 'AuditLogs',
        component: () => import('@/views/AuditLogs.vue'),
        meta: { title: '审计日志', icon: 'document' },
      },
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
  // The SPA is mounted under /admin/ behind the main reverse proxy,
  // so vue-router must use it as the base for both link generation
  // and the History API fallback. Matches Vite `base` in vite.config.js.
  history: createWebHistory('/admin/'),
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
