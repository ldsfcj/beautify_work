<template>
  <div class="orders-page">
    <h2>订单管理</h2>

    <el-form :inline="true" :model="filter" class="filter-bar">
      <el-form-item label="状态">
        <el-select v-model="filter.status" placeholder="全部" clearable style="width: 140px">
          <el-option label="待支付" value="pending" />
          <el-option label="已支付" value="paid" />
          <el-option label="已取消" value="cancelled" />
          <el-option label="已退款" value="refunded" />
          <el-option label="全部 (不过滤)" value="all" />
        </el-select>
      </el-form-item>
      <el-form-item label="搜索">
        <el-input
          v-model="filter.q"
          placeholder="订单号 / 昵称 / 手机号末 4"
          clearable
          style="width: 220px"
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
      <el-table-column prop="orderNo" label="订单号" width="190" />
      <el-table-column label="用户" width="160">
        <template #default="{ row }">
          <div>{{ row.userNickname || '—' }}</div>
          <div class="muted">{{ row.userPhoneMask || '—' }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="packageName" label="套餐" width="120" />
      <el-table-column label="金额" width="100">
        <template #default="{ row }">¥{{ (row.amountCents / 100).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="credits" label="积分" width="80" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="支付方式" width="100">
        <template #default="{ row }">
          {{ row.paymentMethod === 'wechat' ? '微信' : row.paymentMethod === 'alipay' ? '支付宝' : '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
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
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import * as ordersApi from '@/api/orders';

const rows = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);

const filter = reactive({ status: '', q: '' });
const dateRange = ref([]);

const statusType = (s) =>
  ({ pending: 'warning', paid: 'success', cancelled: 'info', refunded: 'primary' })[s] || 'default';
const statusLabel = (s) =>
  ({ pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款' })[s] || s;

const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fetch = async () => {
  loading.value = true;
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
    };
    if (filter.status) params.status = filter.status;
    if (filter.q) params.q = filter.q;
    if (dateRange.value?.length === 2) {
      params.fromDate = dateRange.value[0];
      params.toDate = dateRange.value[1];
    }
    const data = await ordersApi.list(params);
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
  dateRange.value = [];
  page.value = 1;
  fetch();
};

watch(dateRange, () => onSearch());

onMounted(fetch);
</script>

<style scoped>
.orders-page {
  padding: 8px;
}
h2 {
  margin: 0 0 16px;
  font-size: 20px;
}
.filter-bar {
  margin-bottom: 12px;
}
.muted {
  font-size: 12px;
  color: #909399;
  font-family: monospace;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
  display: flex;
}
</style>
