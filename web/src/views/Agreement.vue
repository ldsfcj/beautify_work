<template>
  <div class="agreement-page">
    <van-nav-bar
      :title="title"
      left-arrow
      @click-left="$router.back()"
    >
      <template #right>
        <span
          v-if="!readonly"
          class="accept"
          :class="{ enabled: scrolledToBottom }"
          @click="onAccept"
        >同意</span>
      </template>
    </van-nav-bar>

    <div
      ref="scroller"
      class="scroller"
      @scroll="onScroll"
    >
      <div v-if="loading" class="loading">
        <van-loading size="20" /> 加载中…
      </div>
      <div v-else class="content" v-html="content" />
      <div v-if="!loading" class="bottom-anchor">— 已到底部 —</div>
    </div>

    <p v-if="!readonly" class="hint">
      <van-icon
        :name="scrolledToBottom ? 'success' : 'arrow-down'"
        :color="scrolledToBottom ? '#07c160' : '#999'"
      />
      {{ scrolledToBottom ? '已阅读完整协议' : '请将协议滚动到底部' }}
    </p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import * as agreementApi from '@/api/agreement';

const route = useRoute();
const router = useRouter();

const type = (route.query.type === 'privacy' ? 'privacy' : 'user');
const title = computed(() =>
  type.value === 'privacy' ? '隐私政策' : '用户服务协议',
);
const readonly = ref(route.query.readonly === '1');

const content = ref('');
const loading = ref(true);
const scroller = ref(null);
const scrolledToBottom = ref(false);

onMounted(async () => {
  try {
    const data = await agreementApi.getCurrent(type.value);
    content.value = data?.content || '(暂无内容)';
  } catch (e) {
    content.value = '(协议加载失败)';
  } finally {
    loading.value = false;
    // Reset scroll once content is in the DOM.
    requestAnimationFrame(() => {
      if (scroller.value) scroller.value.scrollTop = 0;
    });
  }
});

const onScroll = (e) => {
  if (scrolledToBottom.value) return;
  const el = e.target;
  // 5px tolerance — text height is never an exact integer.
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 5) {
    scrolledToBottom.value = true;
  }
};

const onAccept = async () => {
  if (!scrolledToBottom.value) {
    showToast('请先滚动到底部阅读完整协议');
    return;
  }
  try {
    await agreementApi.accept(type.value);
    showToast('已同意');
    router.back();
  } catch (e) {
    // interceptor surfaces
  }
};
</script>

<style scoped>
.agreement-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--van-background);
}
.scroller {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  -webkit-overflow-scrolling: touch;
}
.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--van-text-color-2);
}
.content {
  font-size: 14px;
  line-height: 1.7;
  color: var(--van-text-color);
  word-break: break-word;
}
.content :deep(h1),
.content :deep(h2),
.content :deep(h3) {
  font-size: 16px;
  font-weight: 600;
  margin: 16px 0 8px;
}
.content :deep(p) {
  margin: 0 0 12px;
}
.bottom-anchor {
  margin-top: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--van-text-color-3);
}
.hint {
  margin: 0;
  padding: 12px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--van-text-color-2);
  background: #fff;
  border-top: 1px solid var(--van-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.accept {
  font-size: 14px;
  color: var(--van-text-color-3);
  cursor: not-allowed;
}
.accept.enabled {
  color: var(--van-primary-color);
  cursor: pointer;
  font-weight: 600;
}
</style>
