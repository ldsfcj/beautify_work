<template>
  <div class="history-page">
    <!-- Title rendered by van-nav-bar in Layout.vue -->

    <van-tabs v-model:active="activeTab" sticky @change="onTabChange" class="tabs">
      <van-tab
        v-for="opt in STATUS_TABS"
        :key="opt.value"
        :title="opt.label"
        :name="opt.value"
      />
    </van-tabs>

    <van-skeleton :row="6" v-if="loading && items.length === 0" />

    <van-empty
      v-else-if="!loading && items.length === 0"
      :description="emptyText"
    />

    <van-list
      v-else
      v-model:loading="loading"
      :finished="finished"
      finished-text="没有更多了"
      :immediate-check="false"
      @load="onLoad"
      class="list"
    >
      <van-swipe-cell v-for="g in items" :key="g.id">
        <div
          class="card"
          @click="$router.push(`/result/${g.id}`)"
        >
          <div class="thumb-wrap">
            <van-image
              v-if="g.status === 'success'"
              :src="g.resultUrl"
              fit="cover"
              radius="6"
              class="thumb"
            />
            <div v-else class="thumb-placeholder">
              <van-icon :name="statusIcon(g.status)" size="36" color="#7a6761" />
              <div class="status-text">{{ statusLabel(g.status) }}</div>
            </div>
          </div>
          <div class="meta">
            <div class="row">
              <van-tag :type="statusType(g.status)" size="medium">
                {{ statusLabel(g.status) }}
              </van-tag>
              <span class="time">{{ formatTime(g.createdAt) }}</span>
            </div>
            <div class="row presets">
              <van-tag
                v-for="k in (g.presetKeys || [])"
                :key="k"
                plain
                type="primary"
                size="small"
                class="tag"
              >{{ presetNameOf(k) }}</van-tag>
            </div>
            <div class="row cost">消耗 {{ g.creditsCost }} 积分</div>
          </div>
        </div>
        <template #right>
          <van-button
            square
            type="danger"
            text="删除"
            class="delete-btn"
            @click.stop="onDelete(g)"
          />
        </template>
      </van-swipe-cell>
    </van-list>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import { list as listGenerations, remove as removeGeneration } from '@/api/generate';
import { usePresetStore } from '@/stores/preset';

const preset = usePresetStore();

const STATUS_TABS = [
  { value: 'all', label: '全部' },
  { value: 'success', label: '已完成' },
  { value: 'pending', label: '生成中' },
  { value: 'failed', label: '失败' },
];

const STATUS_LABELS = {
  pending: '生成中',
  processing: '生成中',
  success: '已完成',
  failed: '失败',
};
const statusLabel = (s) => STATUS_LABELS[s] || s;
const statusType = (s) =>
  ({ success: 'success', pending: 'warning', processing: 'warning', failed: 'danger' })[s] ||
  'default';
const statusIcon = (s) =>
  ({ pending: 'underway-o', processing: 'underway-o', success: 'photograph', failed: 'warning-o' })[s] ||
  'underway-o';

const activeTab = ref('all');
const items = ref([]);
const loading = ref(false);
const finished = ref(false);
const page = ref(1);
const PAGE_SIZE = 20;

const emptyText = computed(() =>
  activeTab.value === 'all' ? '还没有生成记录' : '该状态下没有记录',
);

const presetNameOf = (key) => preset.byKey[key]?.name || key;

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fetchPage = async (pageNum, append = false) => {
  loading.value = true;
  try {
    const params = { page: pageNum, pageSize: PAGE_SIZE };
    if (activeTab.value !== 'all') params.status = activeTab.value;
    const data = await listGenerations(params);
    const newItems = data.items || [];
    items.value = append ? items.value.concat(newItems) : newItems;
    if (newItems.length < PAGE_SIZE) {
      finished.value = true;
    }
  } catch (e) {
    finished.value = true;
  } finally {
    loading.value = false;
  }
};

const onLoad = async () => {
  await fetchPage(page.value, true);
  if (!finished.value) page.value += 1;
};

const onTabChange = () => {
  page.value = 1;
  items.value = [];
  finished.value = false;
  // Sticky tabs + immediate-check=false, so we drive the load explicitly.
  fetchPage(1, false);
};

const onDelete = async (g) => {
  try {
    await showConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条生成记录吗？删除后不可恢复。',
      confirmButtonText: '删除',
      confirmButtonColor: '#ee0a24',
    });
  } catch {
    return; // cancelled
  }
  try {
    await removeGeneration(g.id);
    items.value = items.value.filter((i) => i.id !== g.id);
    showToast('已删除');
  } catch (e) {
    // interceptor surfaces error
  }
};

onMounted(async () => {
  await preset.ensureLoaded();
  await fetchPage(1, false);
});
</script>

<style scoped>
.history-page {
  padding: 0 0 16px;
}
.page-title {
  margin: 16px 16px 0;
  font-size: 20px;
  font-weight: 600;
}
.tabs {
  margin: 12px 0 0;
}
.list {
  padding: 0 16px;
}
.card {
  display: flex;
  gap: 12px;
  background: #fff;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  cursor: pointer;
}
.delete-btn {
  height: 100%;
}
.thumb-wrap {
  flex-shrink: 0;
  width: 80px;
  height: 80px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--van-background-2);
}
.thumb {
  width: 80px;
  height: 80px;
  display: block;
}
.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background: var(--van-background-2);
}
.thumb-placeholder .status-text {
  font-size: 11px;
  color: var(--van-text-color-2);
}
.meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.row.time {
  margin-left: auto;
  font-size: 12px;
  color: var(--van-text-color-3);
}
.row.presets {
  flex-wrap: wrap;
}
.row.cost {
  font-size: 12px;
  color: var(--van-text-color-2);
}
.tag {
  margin: 0;
}
</style>
