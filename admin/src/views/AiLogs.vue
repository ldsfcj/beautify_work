<template>
  <div class="ai-logs-page">
    <h2>AI 调用日志</h2>

    <el-form :inline="true" :model="filter" class="filter-bar">
      <el-form-item label="模型">
        <el-input
          v-model="filter.model"
          placeholder="如 mock-v1, wanx-v1, hunyuan-..."
          clearable
          style="width: 240px"
        />
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始"
          end-placeholder="结束"
          unlink-panels
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="model" label="模型" width="140" />
      <el-table-column prop="userId" label="用户 ID" width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.userId.slice(0, 8) }}…</span>
        </template>
      </el-table-column>
      <el-table-column prop="generationId" label="Generation ID" width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.generationId.slice(0, 8) }}…</span>
        </template>
      </el-table-column>
      <el-table-column prop="costCents" label="成本(分)" width="100" />
      <el-table-column prop="latencyMs" label="延迟(ms)" width="100" />
      <el-table-column prop="requestSize" label="请求(B)" width="100" />
      <el-table-column prop="responseSize" label="响应(B)" width="100" />
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="[50, 100, 200]"
      :total="total"
      layout="total, sizes, prev, pager, next"
      background
      class="pagination"
      @current-change="fetch"
      @size-change="fetch"
    />
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import * as aiLogsApi from '@/api/ai-logs';

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const loading = ref(false);

const filter = reactive({ model: '' });
const dateRange = ref([]);

const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const fetch = async () => {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (filter.model) params.model = filter.model;
    if (dateRange.value?.length === 2) {
      params.fromDate = dateRange.value[0];
      params.toDate = dateRange.value[1];
    }
    const data = await aiLogsApi.list(params);
    rows.value = data.items || [];
    total.value = data.total || 0;
  } finally {
    loading.value = false;
  }
};

const onSearch = () => {
  page.value = 1;
  fetch();
};
const onReset = () => {
  filter.model = '';
  dateRange.value = [];
  page.value = 1;
  fetch();
};

watch(dateRange, () => onSearch());

onMounted(fetch);
</script>

<style scoped>
.ai-logs-page {
  padding: 8px;
}
h2 {
  margin: 0 0 16px;
  font-size: 20px;
}
.filter-bar {
  margin-bottom: 12px;
}
.mono {
  font-family: monospace;
  font-size: 12px;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
</style>
