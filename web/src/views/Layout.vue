<template>
  <div class="layout">
    <!-- Unified top bar — same on phone / tablet / desktop. -->
    <van-nav-bar
      :title="pageTitle"
      :left-arrow="showBack"
      @click-left="onBack"
      class="topbar"
    >
      <template #right>
        <span class="credits" v-if="user.token">积分 {{ user.credits }}</span>
        <van-icon
          name="bell"
          size="22"
          class="bell"
          :badge="notif.unreadCount > 0 ? String(notif.unreadCount) : ''"
          @click="goNotifications"
        />
        <span
          v-if="user.token && !isHomeRoute"
          class="logout-link"
          @click="onLogout"
        >退出</span>
      </template>
    </van-nav-bar>

    <main class="content">
      <router-view />
    </main>

    <!-- Bottom tabbar on home routes (every device). -->
    <van-tabbar route v-if="showTabbar">
      <van-tabbar-item to="/" icon="home-o">工作台</van-tabbar-item>
      <van-tabbar-item to="/generate" icon="photograph">生成</van-tabbar-item>
      <van-tabbar-item to="/history" icon="orders-o">历史</van-tabbar-item>
      <van-tabbar-item to="/profile" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog } from 'vant';
import { useNotificationStore } from '@/stores/notification';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const notif = useNotificationStore();

// Bottom tabbar is shown on the 4 tab routes. Back arrow is hidden
// only on the true home (Dashboard) — every other page, including
// the other tab routes, gets a back arrow that returns to Dashboard.
const HOME_NAMES = new Set(['Dashboard', 'Generate', 'History', 'Profile']);

const isHomeRoute = computed(() => HOME_NAMES.has(route.name));
const showBack = computed(() => route.name !== 'Dashboard');
const showTabbar = computed(() => !route.meta?.hideTabbar && isHomeRoute.value);

const pageTitle = computed(() => route.meta?.title || '医美咨询');

let pollTimer = null;

const onBack = () => {
  // Prefer real browser history; if there's none (e.g. user opened
  // the link directly), fall back to Dashboard so we never leave
  // the app via the back button.
  if (window.history.state?.back) {
    router.back();
  } else {
    router.replace('/');
  }
};

const goNotifications = () => {
  router.push('/notifications');
};

const onLogout = async () => {
  try {
    await showConfirmDialog({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmButtonText: '退出',
    });
  } catch {
    return;
  }
  await user.logout();
  router.replace('/login');
};

const pollUnread = async () => {
  if (!user.token) return;
  try {
    await notif.fetchList({ unreadOnly: true, page: 1, pageSize: 1 });
  } catch (e) {
    // 401 is handled by the axios interceptor — silently swallow here.
  }
};

onMounted(() => {
  if (user.token) pollUnread();
  // 5s polling per D12. Cleanup on unmount.
  pollTimer = setInterval(pollUnread, 5000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Top nav-bar — identical across all viewport sizes. ─── */
.topbar {
  background: var(--ma-surface);
  border-bottom: 1px solid var(--ma-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
:deep(.van-nav-bar__title) {
  color: var(--ma-primary);
  font-weight: 600;
}
:deep(.van-nav-bar__left .van-icon),
:deep(.van-nav-bar__right .van-icon) {
  color: var(--ma-text);
}
:deep(.van-nav-bar__right) {
  display: flex;
  align-items: center;
  gap: 8px;
}
.credits {
  font-size: 13px;
  color: var(--ma-text-secondary);
}
.bell {
  cursor: pointer;
  color: var(--ma-text);
}
.logout-link {
  font-size: 13px;
  color: var(--ma-text-secondary);
  cursor: pointer;
  margin-left: 4px;
}
.logout-link:hover {
  color: var(--ma-danger);
}
.content {
  flex: 1;
  padding: 16px;
}
</style>

<!-- Unscoped responsive helpers — these need to reach into page
     components' grids (.recharge-page .grid, .history-page .list, …),
     which scoped styles can't do without :deep on every selector. -->
<style>
@media (min-width: 768px) {
  .layout > .content {
    max-width: var(--ma-max-tablet);
    margin: 0 auto;
  }

  .recharge-page .grid {
    grid-template-columns: repeat(3, 1fr) !important;
  }

  .history-page .list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .history-page .card {
    margin-bottom: 0 !important;
  }
}

@media (min-width: 1024px) {
  .layout > .content {
    max-width: var(--ma-max-desktop);
  }

  .recharge-page .grid {
    grid-template-columns: repeat(4, 1fr) !important;
  }

  .history-page .list {
    grid-template-columns: repeat(3, 1fr) !important;
  }

  .dashboard .recent-grid {
    grid-template-columns: repeat(4, 1fr) !important;
  }

  .dashboard .hero {
    padding: 32px 28px !important;
  }
  .dashboard .credits-value {
    font-size: 36px !important;
  }
}
</style>
