<template>
  <div class="audit-logs-page">
    <h2>审计日志</h2>

    <el-form :inline="true" :model="filter" class="filter-bar">
      <el-form-item label="动作">
        <el-select v-model="filter.action" placeholder="全部" clearable filterable allow-create style="width: 240px">
          <el-option v-for="a in KNOWN_ACTIONS" :key="a" :label="a" :value="a" />
        </el-select>
      </el-form-item>
      <el-form-item label="目标 ID">
        <el-input v-model="filter.targetId" placeholder="UUID / orderNo" clearable style="width: 220px" />
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
      <el-table-column prop="createdAt" label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column prop="adminId" label="Admin" width="120">
        <template #default="{ row }">
          <span class="mono" :title="row.adminId">
            {{ row.adminId === SYSTEM_ACTOR ? 'system' : row.adminId.slice(0, 8) + '…' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="action" label="动作" width="180" />
      <el-table-column label="目标" width="200">
        <template #default="{ row }">
          <span class="muted">{{ row.targetType || '—' }}</span>
          <span class="mono small">{{ row.targetId || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="Payload" min-width="240">
        <template #default="{ row }">
          <pre class="payload">{{ formatPayload(row.payload) }}</pre>
        </template>
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
import * as auditApi from '@/api/audit-logs';

const SYSTEM_ACTOR = '00000000-0000-0000-0000-000000000000';

const KNOWN_ACTIONS = [
  'admin.login',
  'user.credit.adjust',
  'preset.create',
  'preset.update',
  'preset.soft_delete',
  'package.create',
  'package.update',
  'package.soft_delete',
  'config.create',
  'config.update',
  'refund.approve',
  'refund.reject',
  'payment.notify.bad_signature',
  'reconcile.warn',
];

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const loading = ref(false);

const filter = reactive({ action: '', targetId: '' });
const dateRange = ref([]);

const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatPayload = (p) => {
  if (!p) return '—';
  if (typeof p === 'string') return p;
  return JSON.stringify(p);
};

const fetch = async () => {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (filter.action) params.action = filter.action;
    if (filter.targetId) params.targetId = filter.targetId;
    if (dateRange.value?.length === 2) {
      params.fromDate = dateRange.value[0];
      params.toDate = dateRange.value[1];
    }
    const data = await auditApi.list(params);
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
  filter.action = '';
  filter.targetId = '';
  dateRange.value = [];
  page.value = 1;
  fetch();
};

watch(dateRange, () => onSearch());

onMounted(fetch);
</script>

<style scoped>
.audit-logs-page {
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
.mono.small {
  margin-left: 6px;
  color: #909399;
}
.muted {
  color: #909399;
  font-size: 12px;
}
.payload {
  margin: 0;
  font-family: monospace;
  font-size: 11px;
  white-space: pre-wrap;
  max-height: 80px;
  overflow: auto;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
</style>
