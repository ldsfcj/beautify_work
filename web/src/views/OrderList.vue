<template>
  <div class="order-list-page">
    <h2 class="page-title">我的订单</h2>

    <van-skeleton :row="6" v-if="loading" />

    <van-empty v-else-if="!orders.length" description="暂无订单">
      <van-button round type="primary" size="small" @click="$router.push('/packages')">
        去购买
      </van-button>
    </van-empty>

    <van-list
      v-else
      v-model:loading="loading"
      :finished="finished"
      finished-text="没有更多了"
      @load="onLoad"
    >
      <div
        v-for="o in orders"
        :key="o.orderNo"
        class="order-card"
        @click="$router.push({ name: 'OrderDetail', params: { no: o.orderNo } })"
      >
        <div class="row">
          <span class="order-no">订单号: {{ o.orderNo }}</span>
          <van-tag :type="statusType(o.status)">{{ statusLabel(o.status) }}</van-tag>
        </div>
        <div class="row">
          <span class="credits">+{{ o.credits }} 积分</span>
          <span class="amount">¥{{ (o.amountCents / 100).toFixed(2) }}</span>
        </div>
        <div class="row meta">
          <span>{{ o.paymentMethod === 'wechat' ? '微信' : '支付宝' }}</span>
          <span>{{ formatTime(o.createdAt) }}</span>
        </div>
      </div>
    </van-list>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import * as orderApi from '@/api/order';

const orders = ref([]);
const loading = ref(false);
const finished = ref(false);
const page = ref(1);

const statusType = (s) =>
  ({ pending: 'warning', paid: 'success', cancelled: 'default', refunded: 'primary' })[s] ||
  'default';
const statusLabel = (s) =>
  ({ pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款' })[s] || s;

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const onLoad = async () => {
  loading.value = true;
  try {
    const res = await orderApi.list(page.value, 10);
    orders.value.push(...res.items);
    if (orders.value.length >= res.total) {
      finished.value = true;
    } else {
      page.value += 1;
    }
  } catch (e) {
    finished.value = true;
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.order-list-page {
  padding: 16px;
}
.page-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 16px;
}
.order-card {
  background: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  cursor: pointer;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  font-size: 14px;
}
.order-no {
  font-family: monospace;
  font-size: 12px;
  color: var(--van-text-color-2);
}
.credits {
  color: var(--van-primary-color);
  font-weight: 600;
}
.amount {
  font-weight: 600;
}
.meta {
  font-size: 12px;
  color: var(--van-text-color-3);
}
</style>
