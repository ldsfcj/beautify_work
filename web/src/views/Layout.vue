<template>
  <div class="layout">
    <header class="topbar">
      <span class="title">医美咨询</span>
      <span class="credits">积分 {{ user.credits }}</span>
      <van-icon
        name="bell"
        size="22"
        class="bell"
        :badge="notif.unreadCount > 0 ? String(notif.unreadCount) : ''"
        @click="goNotifications"
      />
    </header>
    <main class="content">
      <router-view />
    </main>
    <van-tabbar route>
      <van-tabbar-item to="/" icon="home-o">工作台</van-tabbar-item>
      <van-tabbar-item to="/generate" icon="photograph">生成</van-tabbar-item>
      <van-tabbar-item to="/history" icon="orders-o">历史</van-tabbar-item>
      <van-tabbar-item to="/profile" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useNotificationStore } from '@/stores/notification';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();
const notif = useNotificationStore();

let pollTimer = null;

const goNotifications = () => {
  router.push('/notifications');
};

const pollUnread = async () => {
  if (!user.token) return;
  try {
    // We don't need the full list — just refresh and let the store
    // re-derive unreadCount. Pull only the first page of unread items.
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
.topbar {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--van-background-2);
  border-bottom: 1px solid var(--van-border-color);
  position: sticky;
  top: 0;
  z-index: 10;
}
.title {
  font-weight: 600;
  color: var(--van-primary-color);
}
.credits {
  flex: 1;
  font-size: 13px;
  color: var(--van-text-color-2);
  text-align: right;
}
.bell {
  cursor: pointer;
}
.content {
  flex: 1;
  padding: 16px;
}
</style>
