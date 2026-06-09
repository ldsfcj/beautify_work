<template>
  <div class="result-page">
    <van-nav-bar title="预览结果" left-arrow @click-left="$router.back()" />

    <div v-if="loading" class="loading">
      <van-loading size="24" /> 加载中…
    </div>

    <template v-else-if="gen">
      <div v-if="gen.status !== 'success'" class="error-card">
        <van-icon name="warning-o" size="48" color="#ee0a24" />
        <h3>本次生成未成功</h3>
        <p>状态：{{ statusLabel(gen.status) }}</p>
        <p v-if="gen.status === 'failed'">积分已退还，请稍后重试。</p>
      </div>

      <template v-else>
        <div class="compare-wrap">
          <CompareSlider
            v-if="originalUrl && resultUrl"
            :left-src="originalUrl"
            :right-src="resultUrl"
          />
          <p class="compare-hint">← 拖动滑块左右对比 →</p>
        </div>

        <div class="meta-card">
          <div class="row">
            <span class="label">使用模型</span>
            <span class="value">{{ gen.modelUsed || '—' }}</span>
          </div>
          <div class="row">
            <span class="label">消耗积分</span>
            <span class="value credits">{{ gen.creditsCost }} 积分</span>
          </div>
          <div class="row">
            <span class="label">所选项目</span>
            <span class="value presets">
              <van-tag
                v-for="k in (gen.presetKeys || [])"
                :key="k"
                plain
                type="primary"
                class="tag"
              >{{ presetNameOf(k) }}</van-tag>
            </span>
          </div>
          <div class="row">
            <span class="label">生成时间</span>
            <span class="value">{{ formatTime(gen.createdAt) }}</span>
          </div>
        </div>

        <div class="actions">
          <van-button
            block
            type="primary"
            :loading="downloading"
            @click="onDownload"
          >
            下载结果图
          </van-button>
          <van-button block plain @click="onAgain">再生成一张</van-button>
          <van-button block plain @click="onFeedback">反馈问题</van-button>
        </div>
      </template>
    </template>

    <van-dialog
      v-model:show="feedbackOpen"
      title="反馈问题"
      show-cancel-button
      @confirm="onSubmitFeedback"
    >
      <div class="dialog-body">
        <van-field
          v-model="feedbackText"
          type="textarea"
          rows="4"
          maxlength="300"
          show-word-limit
          placeholder="告诉我们哪里不对（可选）"
        />
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showDialog, showToast } from 'vant';
import { detail, downloadUrl } from '@/api/generate';
import { usePresetStore } from '@/stores/preset';
import CompareSlider from '@/components/CompareSlider.vue';

const route = useRoute();
const router = useRouter();
const preset = usePresetStore();

const id = route.params.id;
const gen = ref(null);
const loading = ref(true);
const downloading = ref(false);
const feedbackOpen = ref(false);
const feedbackText = ref('');

const originalUrl = computed(() => gen.value?.originalUrl || '');
const resultUrl = computed(() => gen.value?.resultUrl || '');

const STATUS_LABELS = {
  pending: '排队中',
  processing: '生成中',
  success: '已完成',
  failed: '失败',
  deleted: '已删除',
};
const statusLabel = (s) => STATUS_LABELS[s] || s;

const presetNameOf = (key) => preset.byKey[key]?.name || key;

const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-CN', { hour12: false });
};

onMounted(async () => {
  await preset.ensureLoaded();
  try {
    const data = await detail(id);
    gen.value = data.generation || data;
  } catch (e) {
    // interceptor surfaces error
  } finally {
    loading.value = false;
  }
});

const onDownload = async () => {
  downloading.value = true;
  try {
    const res = await downloadUrl(id);
    if (!res?.url) {
      showToast('下载链接为空，请稍后重试');
      return;
    }
    // Open the signed URL in a new tab; mobile browsers can save from there.
    window.open(res.url, '_blank', 'noopener');
  } catch (e) {
    // surfaced
  } finally {
    downloading.value = false;
  }
};

const onAgain = () => {
  router.replace('/generate');
};

const onFeedback = () => {
  feedbackText.value = '';
  feedbackOpen.value = true;
};

const onSubmitFeedback = () => {
  // Feedback is a placeholder for the P5 admin audit-logs page. We just
  // acknowledge the user — there's no backend endpoint yet, so the
  // dialog confirms and we move on. Task 34 (audit-logs) will introduce
  // a real `POST /api/feedback` and surface it in the admin UI.
  showToast('已收到反馈，谢谢');
};
</script>

<style scoped>
.result-page {
  min-height: 100vh;
  background: var(--van-background);
  padding-bottom: 24px;
}
.loading {
  padding: 80px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--van-text-color-2);
}
.error-card {
  margin: 24px 16px;
  padding: 32px 16px;
  background: #fff;
  border-radius: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.error-card h3 {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 600;
}
.error-card p {
  margin: 0;
  font-size: 13px;
  color: var(--van-text-color-2);
}
.compare-wrap {
  margin: 16px;
  background: #fff;
  border-radius: 12px;
  padding: 12px;
}
.compare-hint {
  margin: 12px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--van-text-color-3);
}
.meta-card {
  margin: 0 16px 16px;
  background: #fff;
  border-radius: 12px;
  padding: 4px 16px;
}
.row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--van-border-color);
  gap: 12px;
}
.row:last-child {
  border-bottom: none;
}
.label {
  width: 80px;
  font-size: 13px;
  color: var(--van-text-color-2);
  flex-shrink: 0;
}
.value {
  flex: 1;
  font-size: 14px;
  color: var(--van-text-color);
  word-break: break-all;
}
.value.credits {
  color: var(--van-primary-color);
  font-weight: 600;
}
.value.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tag {
  margin: 0;
}
.actions {
  margin: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dialog-body {
  padding: 16px;
}
</style>
