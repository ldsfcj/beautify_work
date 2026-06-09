<template>
  <div class="users-page">
    <h2>用户管理</h2>

    <el-form :inline="true" :model="filter" class="filter-bar">
      <el-form-item label="状态">
        <el-select v-model="filter.status" placeholder="全部" clearable style="width: 140px">
          <el-option label="活跃" value="active" />
          <el-option label="注销中" value="pending_delete" />
          <el-option label="已封禁" value="banned" />
          <el-option label="已删除" value="deleted" />
        </el-select>
      </el-form-item>
      <el-form-item label="搜索">
        <el-input
          v-model="filter.q"
          placeholder="昵称 / 手机号末 4"
          clearable
          style="width: 220px"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="nickname" label="昵称" width="160" />
      <el-table-column label="手机号" width="140">
        <template #default="{ row }">
          <span class="mono">{{ row.phoneMask || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="credits" label="积分" width="100" sortable />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="注册时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openAdjust(row)">调整积分</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :page-sizes="[20, 50, 100]"
      :total="total"
      layout="total, sizes, prev, pager, next"
      background
      class="pagination"
      @current-change="fetch"
      @size-change="fetch"
    />

    <el-dialog
      v-model="adjustOpen"
      :title="`调整积分 — ${adjustTarget?.nickname || ''}`"
      width="420px"
    >
      <el-form :model="adjustForm" label-width="100px">
        <el-form-item label="当前积分">
          <span class="current-credits">{{ adjustTarget?.credits ?? 0 }}</span>
        </el-form-item>
        <el-form-item label="增加积分" required>
          <el-input-number
            v-model="adjustForm.amount"
            :min="1"
            :max="100000"
            :step="10"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因" required>
          <el-input
            v-model="adjustForm.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="如：客服补偿 / 活动赠送 / 退款返还"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustOpen = false">取消</el-button>
        <el-button type="primary" :loading="adjusting" :disabled="!canAdjust" @click="onAdjust">
          确认
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as usersApi from '@/api/users';

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

const filter = reactive({ status: '', q: '' });

const statusType = (s) =>
  ({ active: 'success', pending_delete: 'warning', banned: 'danger', deleted: 'info' })[s] ||
  'default';
const statusLabel = (s) =>
  ({ active: '活跃', pending_delete: '注销中', banned: '已封禁', deleted: '已删除' })[s] || s;

const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fetch = async () => {
  loading.value = true;
  try {
    const params = { page: page.value, pageSize: pageSize.value };
    if (filter.status) params.status = filter.status;
    if (filter.q) params.q = filter.q;
    const data = await usersApi.list(params);
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
  filter.status = '';
  filter.q = '';
  page.value = 1;
  fetch();
};

const adjustOpen = ref(false);
const adjustTarget = ref(null);
const adjustForm = reactive({ amount: 10, reason: '' });
const adjusting = ref(false);
const canAdjust = computed(
  () => adjustForm.amount > 0 && adjustForm.reason.trim().length >= 2,
);

const openAdjust = (row) => {
  adjustTarget.value = row;
  adjustForm.amount = 10;
  adjustForm.reason = '';
  adjustOpen.value = true;
};

const onAdjust = async () => {
  if (!canAdjust.value || !adjustTarget.value) return;
  adjusting.value = true;
  try {
    const res = await usersApi.adjustCredits(adjustTarget.value.id, {
      amount: adjustForm.amount,
      reason: adjustForm.reason.trim(),
    });
    ElMessage.success(`已增加 ${adjustForm.amount} 积分，余额 ${res.balanceAfter}`);
    adjustOpen.value = false;
    fetch();
  } finally {
    adjusting.value = false;
  }
};

onMounted(fetch);
</script>

<style scoped>
.users-page {
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
.current-credits {
  font-weight: 600;
  font-size: 16px;
  color: var(--el-color-primary);
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
</style>
