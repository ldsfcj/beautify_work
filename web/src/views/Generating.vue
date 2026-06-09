<template>
  <div class="generating-page">
    <div class="card">
      <van-loading type="spinner" size="48" color="var(--van-primary-color)" />
      <h2 class="title">正在生成预览…</h2>
      <p class="subtitle">
        <template v-if="status === 'pending'">排队中，预计 5-15 秒</template>
        <template v-else-if="status === 'processing'">AI 生成中，预计 5-30 秒</template>
        <template v-else-if="status === 'success'">即将跳转到结果页</template>
        <template v-else>{{ status }}</template>
      </p>

      <div v-if="attempts > 0" class="attempts">
        已轮询 {{ attempts }} 次 · 上次状态：{{ status }}
      </div>

      <div class="actions">
        <van-button plain size="small" @click="onCancel">取消</van-button>
        <van-button
          size="small"
          type="primary"
          plain
          :loading="manualRefreshing"
          @click="pollOnce"
        >
          手动刷新
        </van-button>
      </div>
    </div>

    <p class="tip">生成完成后会在「通知」中提醒你，关闭本页也无所谓。</p>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showDialog, showToast } from 'vant';
import { status as pollStatus } from '@/api/generate';

const route = useRoute();
const router = useRouter();

const id = route.params.id;
const status = ref('pending');
const attempts = ref(0);
const manualRefreshing = ref(false);

let timer = null;
let stopped = false;

const POLL_MS = 3000;

const pollOnce = async (silent = false) => {
  if (stopped) return;
  if (!silent) manualRefreshing.value = true;
  attempts.value += 1;
  try {
    const res = await pollStatus(id);
    status.value = res?.status || 'pending';
    if (status.value === 'success') {
      stopped = true;
      if (timer) clearInterval(timer);
      router.replace(`/result/${id}`);
    } else if (status.value === 'failed') {
      stopped = true;
      if (timer) clearInterval(timer);
      showDialog({
        title: '生成失败',
        message: '已自动退还积分，请稍后重试。',
        confirmButtonText: '我知道了',
      })
        .catch(() => {})
        .finally(() => {
          router.replace('/');
        });
    }
  } catch (e) {
    // axios interceptor handles 401/network; keep polling so transient
    // errors don't drop the user out of the flow.
  } finally {
    manualRefreshing.value = false;
  }
};

onMounted(() => {
  pollOnce(true);
  timer = setInterval(() => pollOnce(true), POLL_MS);
});

onBeforeUnmount(() => {
  stopped = true;
  if (timer) clearInterval(timer);
});

const onCancel = () => {
  stopped = true;
  if (timer) clearInterval(timer);
  router.replace('/');
  showToast('已取消轮询（任务仍在后台跑）');
};
</script>

<style scoped>
.generating-page {
  min-height: 100vh;
  padding: 80px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}
.card {
  width: 100%;
  max-width: 480px;
  background: #fff;
  border-radius: 16px;
  padding: 32px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04);
}
.title {
  margin: 12px 0 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--van-text-color);
}
.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--van-text-color-2);
  text-align: center;
}
.attempts {
  margin-top: 8px;
  font-size: 12px;
  color: var(--van-text-color-3);
}
.actions {
  margin-top: 16px;
  display: flex;
  gap: 12px;
}
.tip {
  font-size: 12px;
  color: var(--van-text-color-3);
  text-align: center;
  max-width: 320px;
  line-height: 1.5;
}
</style>
