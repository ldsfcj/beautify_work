<template>
  <div class="recharge-page">
    <h2 class="page-title">充值积分</h2>
    <p class="page-hint">当前余额 <strong>{{ user.credits }}</strong> 积分</p>

    <van-cell-group inset class="agreement-card">
      <van-cell>
        <template #title>
          <van-checkbox v-model="agreed" shape="square" @click="onToggleAgree">
            我已阅读并同意
          </van-checkbox>
        </template>
        <template #right-icon>
          <a class="link" @click="$router.push('/agreement?type=user')">《用户服务协议》</a>
        </template>
      </van-cell>
    </van-cell-group>

    <van-skeleton title :row="3" v-if="loading" />

    <div v-else class="grid">
      <div
        v-for="pkg in packages"
        :key="pkg.id"
        class="pkg-card"
        :class="{ selected: selectedId === pkg.id }"
        @click="select(pkg)"
      >
        <div class="name">{{ pkg.name }}</div>
        <div class="credits">
          <span class="big">{{ pkg.credits }}</span>
          <span class="unit">积分</span>
          <span v-if="pkg.bonusCredits" class="bonus">+{{ pkg.bonusCredits }}</span>
        </div>
        <div class="total">到账 {{ pkg.credits + pkg.bonusCredits }} 积分</div>
        <div class="price">
          <span class="yen">¥</span>
          <span class="amount">{{ (pkg.priceCents / 100).toFixed(2) }}</span>
        </div>
        <div class="validity">有效期 {{ pkg.validityDays }} 天</div>
        <van-button
          size="small"
          type="primary"
          class="pay-btn"
          :disabled="!agreed"
          @click.stop="onPay(pkg, 'wechat')"
        >微信支付</van-button>
        <van-button
          size="small"
          plain
          type="primary"
          class="pay-btn"
          :disabled="!agreed"
          @click.stop="onPay(pkg, 'alipay')"
        >支付宝</van-button>
      </div>
    </div>

    <van-dialog
      v-model:show="payDialog"
      title="支付已发起 (Mock)"
      :message="payMsg"
      show-cancel-button
      confirm-button-text="我已支付"
      cancel-button-text="稍后"
      @confirm="onPaid"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import * as pkgApi from '@/api/credit-package';
import * as orderApi from '@/api/order';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const user = useUserStore();

const packages = ref([]);
const loading = ref(true);
const selectedId = ref(null);
const agreed = ref(false);
const submitting = ref(false);
const payDialog = ref(false);
const lastOrder = ref(null);

const payMsg = computed(() => {
  if (!lastOrder.value) return '';
  const o = lastOrder.value;
  return [
    `订单号: ${o.orderNo}`,
    `积分: +${o.credits}`,
    `金额: ¥${(o.amountCents / 100).toFixed(2)}`,
    `支付链接: ${o.h5Url}`,
    `有效期至: ${formatExpire(o.expireAt)}`,
  ].join('\n');
});

const formatExpire = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
};

const select = (pkg) => {
  selectedId.value = pkg.id;
};

const onToggleAgree = () => {
  // van-checkbox v-model already flips `agreed`; we don't need to do
  // anything here. This handler is a future hook for "show toast if
  // user un-agrees mid-flow" style UX.
};

onMounted(async () => {
  try {
    packages.value = await pkgApi.list();
  } catch (e) {
    showToast('套餐加载失败');
  } finally {
    loading.value = false;
  }
});

const onPay = async (pkg, method) => {
  if (!agreed.value) {
    showToast('请先勾选用户协议');
    return;
  }
  if (submitting.value) return;
  submitting.value = true;
  try {
    const order = await orderApi.create(pkg.id, method);
    lastOrder.value = order;
    payDialog.value = true;
  } catch (e) {
    /* interceptor */
  } finally {
    submitting.value = false;
  }
};

const onPaid = () => {
  // In dev (Mock) there's no real wechat/alipay callback. We don't mark
  // the order paid here — the user does that in /orders. The dialog
  // simply acknowledges the order is created. Production: the h5_url
  // would redirect to the real payment page, the async notify handler
  // (Task 18) would mark it paid, and the dialog wouldn't be needed.
  router.push({ name: 'OrderList' });
};
</script>

<style scoped>
.recharge-page {
  padding: 16px 0 32px;
}
.page-title {
  margin: 0 16px 4px;
  font-size: 22px;
  font-weight: 600;
}
.page-hint {
  margin: 0 16px 16px;
  font-size: 13px;
  color: var(--van-text-color-2);
}
.page-hint strong {
  color: var(--van-primary-color);
  font-weight: 700;
  font-size: 15px;
}
.agreement-card {
  margin: 0 16px 16px;
}
.link {
  color: var(--van-primary-color);
  font-size: 13px;
  cursor: pointer;
  margin-left: 4px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 0 16px;
}
.pkg-card {
  background: #fff;
  border: 1px solid var(--van-border-color);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s;
}
.pkg-card.selected {
  border-color: var(--van-primary-color);
  box-shadow: 0 0 0 1px var(--van-primary-color) inset;
}
.name {
  font-size: 16px;
  font-weight: 600;
  color: var(--van-primary-color);
  margin-bottom: 8px;
}
.credits {
  margin: 8px 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
}
.credits .big {
  font-size: 32px;
  font-weight: 700;
  color: var(--van-text-color);
}
.credits .unit {
  font-size: 12px;
  color: var(--van-text-color-2);
}
.credits .bonus {
  font-size: 12px;
  color: #ee0a24;
  font-weight: 600;
  margin-left: 4px;
}
.total {
  font-size: 12px;
  color: var(--van-text-color-2);
  margin-bottom: 8px;
}
.price {
  margin: 8px 0;
  color: var(--van-primary-color);
}
.price .yen {
  font-size: 14px;
}
.price .amount {
  font-size: 24px;
  font-weight: 700;
  margin-left: 2px;
}
.validity {
  font-size: 11px;
  color: var(--van-text-color-3);
  margin-bottom: 8px;
}
.pay-btn {
  margin-top: 6px;
  width: 100%;
}
</style>
