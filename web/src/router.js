import { createRouter, createWebHistory } from 'vue-router';
import { useUserStore } from '@/stores/user';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/',
    component: () => import('@/views/Layout.vue'),
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'generate',
        name: 'Generate',
        component: () => import('@/views/Placeholder.vue'),
        meta: { title: 'AI 生成' },
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@/views/Placeholder.vue'),
        meta: { title: '生成历史' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '我的' },
      },
      {
        path: 'packages',
        name: 'Packages',
        component: () => import('@/views/Packages.vue'),
        meta: { title: '积分套餐' },
      },
      {
        path: 'orders',
        name: 'OrderList',
        component: () => import('@/views/OrderList.vue'),
        meta: { title: '我的订单' },
      },
      {
        path: 'orders/:no',
        name: 'OrderDetail',
        component: () => import('@/views/OrderDetail.vue'),
        meta: { title: '订单详情' },
      },
    ],
  },
  {
    path: '/order/create',
    name: 'OrderCreate',
    component: () => import('@/views/OrderCreate.vue'),
    meta: { title: '确认订单' },
  },
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('@/views/Notifications.vue'),
    meta: { title: '通知' },
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
  const user = useUserStore();
  if (to.meta.public) return true;
  if (!user.token) {
    return { name: 'Login', query: { redirect: to.fullPath } };
  }
  return true;
});

router.afterEach((to) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} · 医美咨询 AI 预览`;
  }
});

export default router;
