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
        component: () => import('@/views/Generate.vue'),
        meta: { title: 'AI 生成' },
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@/views/History.vue'),
        meta: { title: '生成历史' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '我的' },
      },
      // TODO: 线上支付暂未接入，屏蔽充值/订单相关路由，后续接入后恢复
      // {
      //   path: 'packages',
      //   name: 'Packages',
      //   component: () => import('@/views/Packages.vue'),
      //   meta: { title: '积分套餐', hideTabbar: true },
      // },
      // {
      //   path: 'recharge',
      //   name: 'Recharge',
      //   component: () => import('@/views/Recharge.vue'),
      //   meta: { title: '充值积分', hideTabbar: true },
      // },
      // {
      //   path: 'orders',
      //   name: 'OrderList',
      //   component: () => import('@/views/OrderList.vue'),
      //   meta: { title: '我的订单', hideTabbar: true },
      // },
      // {
      //   path: 'orders/:no',
      //   name: 'OrderDetail',
      //   component: () => import('@/views/OrderDetail.vue'),
      //   meta: { title: '订单详情', hideTabbar: true },
      // },
    ],
  },
  // TODO: 线上支付暂未接入，屏蔽订单创建路由，后续接入后恢复
  // {
  //   path: '/order/create',
  //   name: 'OrderCreate',
  //   component: () => import('@/views/OrderCreate.vue'),
  //   meta: { title: '确认订单' },
  // },
  {
    path: '/generating/:id',
    name: 'Generating',
    component: () => import('@/views/Generating.vue'),
    meta: { title: '生成中' },
  },
  {
    path: '/result/:id',
    name: 'Result',
    component: () => import('@/views/Result.vue'),
    meta: { title: '预览结果' },
  },
  {
    path: '/notifications',
    name: 'Notifications',
    component: () => import('@/views/Notifications.vue'),
    meta: { title: '通知' },
  },
  {
    path: '/agreement',
    name: 'Agreement',
    component: () => import('@/views/Agreement.vue'),
    meta: { title: '用户服务协议' },
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
