<template>
  <div class="layout" :class="{ 'layout--desktop': isDesktopView }">
    <!-- Mobile/tablet: van-nav-bar top bar -->
    <van-nav-bar
      v-if="!isDesktopView"
      :title="pageTitle"
      :left-arrow="showBack"
      @click-left="onBack"
      class="topbar topbar--mobile"
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
      </template>
    </van-nav-bar>

    <!-- Desktop: sidebar navigation -->
    <aside v-if="isDesktopView" class="topbar topbar--desktop">
      <div class="sidebar-header">
        <span class="brand">医美咨询</span>
        <span class="credits" v-if="user.token">{{ user.credits }} 积分</span>
      </div>
      <nav class="sidebar-nav">
        <router-link to="/" :class="{ 'router-link-active': route.name === 'Dashboard' }">
          <van-icon name="home-o" size="20" /> 工作台
        </router-link>
        <router-link to="/generate">
          <van-icon name="photograph" size="20" /> 生成
        </router-link>
        <router-link to="/history">
          <van-icon name="orders-o" size="20" /> 历史
        </router-link>
        <router-link to="/profile">
          <van-icon name="user-o" size="20" /> 我的
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <van-icon
          name="bell"
          size="22"
          class="bell"
          :badge="notif.unreadCount > 0 ? String(notif.unreadCount) : ''"
          @click="goNotifications"
        />
      </div>
    </aside>

    <main class="content">
      <router-view />
    </main>

    <!-- Mobile/tablet bottom tabbar -->
    <van-tabbar route v-if="showTabbar">
      <van-tabbar-item to="/" icon="home-o">工作台</van-tabbar-item>
      <van-tabbar-item to="/generate" icon="photograph">生成</van-tabbar-item>
      <van-tabbar-item to="/history" icon="orders-o">历史</van-tabbar-item>
      <van-tabbar-item to="/profile" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useNotificationStore } from '@/stores/notification';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const notif = useNotificationStore();

// Reactive viewport detection
const viewportWidth = ref(window.innerWidth);
const onResize = () => { viewportWidth.value = window.innerWidth; };

const isDesktopView = computed(() => viewportWidth.value >= 1024);

// Pages that are the "root" of each tab — no back arrow needed.
const HOME_NAMES = new Set(['Dashboard', 'Generate', 'History', 'Profile']);

const showBack = computed(() => !HOME_NAMES.has(route.name));
const showTabbar = computed(() => !route.meta?.hideTabbar && HOME_NAMES.has(route.name));

const pageTitle = computed(() => route.meta?.title || '医美咨询');

let pollTimer = null;

const onBack = () => {
  router.back();
};

const goNotifications = () => {
  router.push('/notifications');
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
  window.addEventListener('resize', onResize);
  if (user.token) pollUnread();
  // 5s polling per D12. Cleanup on unmount.
  pollTimer = setInterval(pollUnread, 5000);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Mobile topbar ─────────────────────────────────── */
.topbar--mobile {
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
:deep(.van-nav-bar__left .van-icon) {
  color: var(--ma-text);
}
.credits {
  font-size: 13px;
  color: var(--ma-text-secondary);
  margin-right: 8px;
}
.bell {
  cursor: pointer;
}
.content {
  flex: 1;
  padding: 16px;
}

/* ── Desktop sidebar ───────────────────────────────── */
.layout--desktop {
  flex-direction: row;
}

.topbar--desktop {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 200px;
  background: #fff;
  border-right: 1px solid var(--ma-border);
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.sidebar-header {
  padding: 20px 16px 8px;
}
.brand {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--ma-primary);
}
.sidebar-header .credits {
  display: block;
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--ma-text-secondary);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  flex: 1;
}
.sidebar-nav a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--ma-text-secondary);
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}
.sidebar-nav a:hover,
.sidebar-nav a.router-link-active {
  background: var(--ma-surface);
  color: var(--ma-primary);
  font-weight: 500;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--ma-border);
}

/* Desktop content offset */
.layout--desktop > .content {
  margin-left: 200px;
  padding: 24px 32px;
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
  .layout--desktop > .content {
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
