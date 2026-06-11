<template>
  <div class="order-create-page">
    <van-nav-bar
      title="确认订单"
      left-arrow
      @click-left="onBack"
      class="topbar"
    />

    <div class="page-body">

    <div v-if="pkg" class="pkg-summary">
      <div class="pkg-name">{{ pkg.name }} 套餐</div>
      <div class="pkg-detail">
        积分 <strong>{{ pkg.credits }}</strong>
        <span v-if="pkg.bonusCredits" class="bonus">+{{ pkg.bonusCredits }} 赠送</span>
        <span class="total">= {{ pkg.credits + pkg.bonusCredits }} 积分</span>
      </div>
      <div class="pkg-validity">有效期 {{ pkg.validityDays }} 天</div>
    </div>

    <h3 class="section-title">选择支付方式</h3>
    <van-radio-group v-model="method" direction="horizontal" class="methods">
      <van-radio name="wechat" icon-size="20">微信支付</van-radio>
      <van-radio name="alipay" icon-size="20">支付宝</van-radio>
    </van-radio-group>

    <div class="price-row">
      <span>应付金额</span>
      <span class="price">
        <span class="yen">¥</span>
        <span class="amount">{{ pkg ? (pkg.priceCents / 100).toFixed(2) : '0.00' }}</span>
      </span>
    </div>

    <div class="submit">
      <van-button
        block
        type="primary"
        :loading="submitting"
        :disabled="!method"
        @click="onSubmit"
      >
        立即支付
      </van-button>
    </div>

    <van-dialog
      v-model:show="showPay"
      title="支付已发起 (Mock)"
      :message="payMsg"
      show-cancel-button
      confirm-button-text="已完成支付"
      cancel-button-text="稍后"
      @confirm="goList"
    />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import * as pkgApi from '@/api/credit-package';
import * as orderApi from '@/api/order';

const route = useRoute();
const router = useRouter();
const pkg = ref(null);
const method = ref('wechat');
const submitting = ref(false);
const showPay = ref(false);

const payMsg = computed(() => {
  if (!lastOrder.value) return '';
  return `订单号: ${lastOrder.value.order_no}\n积分: +${lastOrder.value.credits}\n金额: ¥${(lastOrder.value.amount_cents / 100).toFixed(2)}\n支付链接: ${lastOrder.value.h5_url}\n有效期至: ${new Date(lastOrder.value.expire_at).toLocaleString()}`;
});

const lastOrder = ref(null);

onMounted(async () => {
  try {
    const list = await pkgApi.list();
    pkg.value = list.find((p) => p.id === route.query.pkgId) || null;
  } catch (e) {
    showToast('套餐加载失败');
  }
});

const onSubmit = async () => {
  if (!pkg.value) return;
  submitting.value = true;
  try {
    const order = await orderApi.create(pkg.value.id, method.value);
    lastOrder.value = order;
    showPay.value = true;
  } catch (e) {
    /* interceptor */
  } finally {
    submitting.value = false;
  }
};

const goList = () => {
  router.replace({ name: 'OrderList' });
};

const onBack = () => {
  if (window.history.state?.back) {
    router.back();
  } else {
    router.replace({ name: 'Packages' });
  }
};
</script>

<style scoped>
.order-create-page {
  min-height: 100vh;
}
.topbar {
  background: var(--ma-surface);
  border-bottom: 1px solid var(--ma-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
:deep(.van-nav-bar__title) {
  color: var(--ma-primary);
  font-weight: 600;
}
:deep(.van-nav-bar__left .van-icon) {
  color: var(--ma-text);
}
.page-body {
  padding: 16px;
}
.pkg-summary {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}
.pkg-name {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}
.pkg-detail {
  color: var(--van-text-color-2);
  font-size: 14px;
}
.pkg-detail strong {
  color: var(--van-text-color);
  font-size: 16px;
}
.pkg-detail .bonus {
  color: #ee0a24;
  margin-left: 4px;
  font-weight: 600;
}
.pkg-detail .total {
  margin-left: 8px;
  color: var(--van-primary-color);
}
.pkg-validity {
  font-size: 12px;
  color: var(--van-text-color-3);
  margin-top: 4px;
}
.section-title {
  font-size: 14px;
  color: var(--van-text-color-2);
  margin: 16px 0 8px;
}
.methods {
  background: #fff;
  border-radius: 8px;
  padding: 8px 16px;
}
.price-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-top: 16px;
  font-size: 14px;
}
.price {
  color: var(--van-primary-color);
  font-weight: 600;
}
.price .yen {
  font-size: 13px;
}
.price .amount {
  font-size: 22px;
  margin-left: 2px;
}
.submit {
  margin-top: 24px;
}
</style>
