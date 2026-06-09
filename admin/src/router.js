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
      // Tasks 34 adds: /configs /ai-logs /audit /refunds
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
