<template>
  <div class="packages-page">
    <h2 class="page-title">积分套餐</h2>
    <p class="page-hint">选择套餐后点击进入支付</p>

    <van-skeleton title :row="3" v-if="loading" />

    <div v-else class="grid">
      <div
        v-for="pkg in packages"
        :key="pkg.id"
        class="pkg-card"
        @click="goCreate(pkg)"
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
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import * as pkgApi from '@/api/credit-package';

const router = useRouter();
const packages = ref([]);
const loading = ref(true);

const goCreate = (pkg) => {
  router.push({ name: 'OrderCreate', query: { pkgId: pkg.id, pkgName: pkg.name } });
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
</script>

<style scoped>
.packages-page {
  padding: 16px;
}
.page-title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 4px;
}
.page-hint {
  color: var(--van-text-color-2);
  font-size: 13px;
  margin: 0 0 16px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.pkg-card {
  background: linear-gradient(135deg, #fff 0%, #f7f8fa 100%);
  border: 1px solid var(--van-border-color);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  position: relative;
  cursor: pointer;
  transition: transform 0.1s;
}
.pkg-card:active {
  transform: scale(0.98);
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
}
</style>
