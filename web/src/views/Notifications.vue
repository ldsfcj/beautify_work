<template>
  <div class="notifications-page">
    <van-nav-bar
      title="通知"
      left-arrow
      @click-left="$router.back()"
    >
      <template #right>
        <span
          v-if="store.unreadCount > 0"
          class="mark-all"
          @click="onMarkAll"
        >全部已读</span>
      </template>
    </van-nav-bar>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loadingMore"
        :finished="finished"
        finished-text="没有更多了"
        :immediate-check="false"
        @load="onLoadMore"
        class="list"
      >
        <van-cell
          v-for="n in store.items"
          :key="n.id"
          class="notif-cell"
          :class="{ unread: !n.readAt }"
          @click="onTap(n)"
        >
          <template #title>
            <div class="title-row">
              <span class="title">{{ n.title }}</span>
              <van-badge
                v-if="!n.readAt"
                :show-zero="false"
                dot
                color="#ee0a24"
              />
            </div>
          </template>
          <template #label>
            <div class="body">{{ n.body }}</div>
            <div class="time">{{ formatTime(n.createdAt) }}</div>
          </template>
        </van-cell>

        <van-empty
          v-if="!store.loading && store.items.length === 0"
          description="暂无通知"
        />
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { useRouter } from 'vue-router';
import { useNotificationStore } from '@/stores/notification';

const router = useRouter();
const store = useNotificationStore();

const refreshing = ref(false);
const loadingMore = ref(false);
const finished = ref(false);

const PAGE_SIZE = 20;

onMounted(async () => {
  // Initial load. fetchList replaces the list and updates unreadCount,
  // which the layout bell badge subscribes to.
  await store.fetchList({ page: 1, pageSize: PAGE_SIZE });
});

const onRefresh = async () => {
  try {
    await store.fetchList({ page: 1, pageSize: PAGE_SIZE });
    finished.value = false;
  } finally {
    refreshing.value = false;
  }
};

const onLoadMore = async () => {
  if (finished.value) return;
  if (store.items.length >= store.total) {
    finished.value = true;
    return;
  }
  const nextPage = (store.page || 1) + 1;
  try {
    const data = await store.fetchList({
      page: nextPage,
      pageSize: PAGE_SIZE,
      append: true,
    });
    if (data.items.length < PAGE_SIZE) finished.value = true;
  } finally {
    loadingMore.value = false;
  }
};

const onTap = async (n) => {
  if (!n.readAt) {
    try {
      await store.markRead(n.id);
    } catch (e) {
      // Best-effort: the badge will catch up on next poll.
    }
  }
  // Route based on payload — generation completions jump to the result.
  if (n.type === 'generation_done' && n.payload?.generationId) {
    router.push(`/result/${n.payload.generationId}`);
  }
};

const onMarkAll = async () => {
  try {
    await store.markAllRead();
    showToast('已全部已读');
  } catch (e) {
    /* interceptor surfaces the error */
  }
};

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  if (yyyy === now.getFullYear()) return `${mm}-${dd}`;
  return `${yyyy}-${mm}-${dd}`;
};
</script>

<style scoped>
.notifications-page {
  min-height: 100vh;
  background: var(--van-background);
}
.list {
  padding-bottom: 16px;
}
.notif-cell {
  background: #fff;
  border-bottom: 1px solid var(--van-border-color);
  padding: 12px 16px;
}
.notif-cell.unread {
  background: #fff7e6;
}
.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.title {
  font-size: 15px;
  font-weight: 500;
  color: var(--van-text-color);
}
.body {
  margin-top: 4px;
  font-size: 13px;
  color: var(--van-text-color-2);
  line-height: 1.5;
  white-space: pre-wrap;
}
.time {
  margin-top: 6px;
  font-size: 12px;
  color: var(--van-text-color-3);
}
.mark-all {
  font-size: 14px;
  color: var(--van-primary-color);
  cursor: pointer;
}
</style>
