<template>
  <div class="refunds-page">
    <h2>退款审核</h2>

    <el-form :inline="true" class="filter-bar">
      <el-form-item label="状态">
        <el-select v-model="filter.status" placeholder="仅 PENDING" clearable style="width: 140px">
          <el-option label="待审核" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="全部" value="all" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button @click="onReset">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="id" label="ID" width="100">
        <template #default="{ row }">
          <span class="mono">{{ row.id.slice(0, 8) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="订单" width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.orderNo || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用户" width="160">
        <template #default="{ row }">{{ row.userNickname || '—' }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="退款原因" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="申请时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <template v-if="row.status === 'pending'">
            <el-button size="small" type="success" @click="onApprove(row)">通过</el-button>
            <el-button size="small" type="danger" plain @click="openReject(row)">拒绝</el-button>
          </template>
          <span v-else class="muted">—</span>
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

    <el-dialog v-model="rejectOpen" title="拒绝退款" width="420px">
      <el-form :model="rejectForm" label-width="80px">
        <el-form-item label="原因" required>
          <el-input
            v-model="rejectForm.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="请说明拒绝原因 (用户可见)"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectOpen = false">取消</el-button>
        <el-button type="danger" :loading="rejecting" :disabled="!rejectForm.reason.trim()" @click="onReject">
          确认拒绝
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as refundsApi from '@/api/refunds';

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

const filter = reactive({ status: 'pending' });

const statusType = (s) =>
  ({ pending: 'warning', approved: 'success', rejected: 'danger' })[s] || 'default';
const statusLabel = (s) =>
  ({ pending: '待审核', approved: '已通过', rejected: '已拒绝' })[s] || s;

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
    const data = await refundsApi.list(params);
    rows.value = data.items || [];
    total.value = data.total || 0;
  } finally {
    loading.value = false;
  }
};

const onReset = () => {
  filter.status = 'pending';
  page.value = 1;
  fetch();
};

const onApprove = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认通过订单 ${row.orderNo} 的退款申请？将通过 credit_ledger 退还对应积分。`,
      '通过退款',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  await refundsApi.approve(row.id);
  ElMessage.success('已通过');
  fetch();
};

const rejectOpen = ref(false);
const rejectForm = reactive({ id: null, reason: '' });
const rejecting = ref(false);
const openReject = (row) => {
  rejectForm.id = row.id;
  rejectForm.reason = '';
  rejectOpen.value = true;
};
const onReject = async () => {
  if (!rejectForm.reason.trim()) return;
  rejecting.value = true;
  try {
    await refundsApi.reject(rejectForm.id, rejectForm.reason.trim());
    ElMessage.success('已拒绝');
    rejectOpen.value = false;
    fetch();
  } finally {
    rejecting.value = false;
  }
};

onMounted(fetch);
</script>

<style scoped>
.refunds-page {
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
.muted {
  color: #c0c4cc;
  font-size: 12px;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
</style>
