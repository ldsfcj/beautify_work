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
      // Tasks 28-30 add: /generate, /history, /presets, /credits, /profile
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
