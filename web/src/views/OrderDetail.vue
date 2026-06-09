<template>
  <div class="order-detail-page">
    <van-skeleton :row="6" v-if="loading" />

    <div v-else-if="order">
      <van-cell-group inset title="订单信息">
        <van-cell title="订单号">
          <template #value>
            <div class="mono-with-copy">
              <span class="mono">{{ order.orderNo }}</span>
              <van-icon
                name="orders-o"
                class="copy-icon"
                @click="copy(order.orderNo, '订单号已复制')"
              />
            </div>
          </template>
        </van-cell>
        <van-cell title="状态">
          <template #value>
            <van-tag :type="statusType(order.status)">
              {{ statusLabel(order.status) }}
            </van-tag>
          </template>
        </van-cell>
        <van-cell title="创建时间" :value="formatTime(order.createdAt)" />
        <van-cell v-if="order.paidAt" title="支付时间" :value="formatTime(order.paidAt)" />
        <van-cell
          v-if="order.txnId"
          title="支付流水"
        >
          <template #value>
            <div class="mono-with-copy">
              <span class="mono short">{{ order.txnId }}</span>
              <van-icon
                name="orders-o"
                class="copy-icon"
                @click="copy(order.txnId, '支付流水已复制')"
              />
            </div>
          </template>
        </van-cell>
      </van-cell-group>

      <van-cell-group inset title="商品">
        <van-cell title="积分到账" :value="`+${order.credits} 积分`" />
        <van-cell title="应付金额" :value="`¥${(order.amountCents / 100).toFixed(2)}`" />
        <van-cell
          title="支付方式"
          :value="order.paymentMethod === 'wechat' ? '微信支付' : '支付宝'"
        />
      </van-cell-group>

      <div class="actions" v-if="order.status === 'pending'">
        <van-button type="primary" block @click="onMockPay">
          模拟支付 (dev)
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showDialog, showToast } from 'vant';
import * as orderApi from '@/api/order';

const route = useRoute();
const router = useRouter();
const order = ref(null);
const loading = ref(true);

const statusType = (s) =>
  ({ pending: 'warning', paid: 'success', cancelled: 'default', refunded: 'primary' })[s] ||
  'default';
const statusLabel = (s) =>
  ({ pending: '待支付', paid: '已支付', cancelled: '已取消', refunded: '已退款' })[s] || s;

const formatTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const copy = async (text, successMsg) => {
  if (!text) return;
  try {
    // navigator.clipboard is async + HTTPS-only. The deprecated execCommand
    // path is the dev-server fallback (vite dev is http://).
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(successMsg);
  } catch (e) {
    showToast('复制失败，请手动选择');
  }
};

const onMockPay = () => {
  showDialog({
    title: '支付回调未实现',
    message: 'Task 18 微信/支付宝回调 + 积分入账尚未实现. 此处仅展示订单详情.',
    confirmButtonText: '好的',
  }).catch(() => {});
};

onMounted(async () => {
  try {
    order.value = await orderApi.detail(route.params.no);
  } catch (e) {
    showToast('订单不存在');
    router.replace({ name: 'OrderList' });
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.order-detail-page {
  padding: 16px;
}
.mono-with-copy {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 200px;
}
.mono {
  font-family: monospace;
  font-size: 13px;
  word-break: break-all;
  flex: 1;
  min-width: 0;
}
.mono.short {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.copy-icon {
  cursor: pointer;
  color: var(--van-primary-color);
  font-size: 16px;
  flex-shrink: 0;
}
.actions {
  margin: 24px 0;
}
</style>
