<template>
  <div class="generate-page">
    <!-- Title rendered by van-nav-bar in Layout.vue -->

    <section class="section">
      <div class="section-label">客户原图</div>
      <div class="card upload-card">
        <van-uploader
          v-model="fileList"
          :max-count="1"
          :after-read="onAfterRead"
          :before-delete="onBeforeDelete"
          accept="image/*"
          class="uploader"
        >
          <template #default>
            <div class="upload-trigger">
              <van-icon name="photograph" size="48" class="upload-icon" />
              <div class="upload-title">点击上传客户照片</div>
              <div class="upload-hint">建议正面、清晰、单人 · 最多 1 张</div>
            </div>
          </template>
        </van-uploader>
      </div>
    </section>

    <section class="section">
      <div class="section-label">
        选择项目 <span class="required">至少 1 项</span>
        <span v-if="selectedKeys.length" class="selected-count">
          已选 {{ selectedKeys.length }} 项 · 扣 {{ totalCost }} 积分
        </span>
      </div>
      <div v-if="preset.loading && !preset.loaded" class="card loading">
        <van-loading size="20" /> 加载中…
      </div>
      <van-checkbox-group v-else v-model="selectedKeys" @change="onPresetChange">
        <div
          v-for="(items, category) in preset.byCategory"
          :key="category"
          class="category-block"
        >
          <div class="category-title">{{ categoryLabel(category) }}</div>
          <div class="preset-grid">
            <div
              v-for="p in items"
              :key="p.key"
              class="preset-card"
              :class="{ 'preset-card--selected': selectedKeys.includes(p.key) }"
              @click="toggle(p.key)"
            >
              <div class="preset-card-head">
                <div class="preset-name">{{ p.name }}</div>
                <van-checkbox
                  :name="p.key"
                  :model-value="selectedKeys.includes(p.key)"
                  @click.stop
                  :ref="(el) => bindCheckboxRef(el, p.key)"
                />
              </div>
              <div v-if="p.description" class="preset-desc">{{ p.description }}</div>
            </div>
          </div>
        </div>
      </van-checkbox-group>
    </section>

    <section class="section">
      <div class="section-label">补充描述 <span class="optional">可选</span></div>
      <div class="card field-card">
        <van-field
          v-model="text"
          type="textarea"
          rows="3"
          autosize
          maxlength="500"
          show-word-limit
          placeholder="例如：自然款 / 偏夸张 / 偏甜美…"
        />
      </div>
    </section>

    <van-submit-bar
      :price="totalCost * 100"
      :button-text="submitText"
      :loading="submitting"
      :disabled="!canSubmit"
      button-color="var(--ma-primary)"
      @submit="onSubmit"
    >
      <template #default>合计</template>
    </van-submit-bar>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { useRouter } from 'vue-router';
import { usePresetStore, computeClientCost } from '@/stores/preset';
import { useUserStore } from '@/stores/user';
import { submit as submitGenerate } from '@/api/generate';
import { getPresignedUploadUrl, uploadFileToOss } from '@/api/oss';

const router = useRouter();
const preset = usePresetStore();
const user = useUserStore();

const fileList = ref([]); // van-uploader data shape: [{ url, file, status, message }]
const imageKey = ref(''); // OSS key we'll submit as `image_url`
const selectedKeys = ref([]);
const text = ref('');
const submitting = ref(false);
const uploading = ref(false);

const CATEGORY_LABELS = {
  nose: '鼻部',
  eye: '眼部',
  face: '面部',
  lip: '唇部',
  jaw: '颌面',
  skin: '肤质',
};
const categoryLabel = (c) => CATEGORY_LABELS[c] || c;

const totalCost = computed(() => computeClientCost(selectedKeys.value.length));

const canSubmit = computed(
  () =>
    Boolean(imageKey.value) &&
    selectedKeys.value.length > 0 &&
    !submitting.value &&
    !uploading.value,
);

const submitText = computed(() => {
  if (selectedKeys.value.length === 0) return '请选择项目';
  if (!imageKey.value) return '请上传图片';
  if (uploading.value) return '上传中…';
  return `提交（扣 ${totalCost.value} 积分）`;
});

// We keep a refs map purely for future programmatic focus / scroll-to-error;
// the checkbox-group itself is the source of truth for `selectedKeys`.
const checkboxRefs = {};
const bindCheckboxRef = (el, key) => {
  if (el) checkboxRefs[key] = el;
};
const toggle = (key) => {
  const idx = selectedKeys.value.indexOf(key);
  if (idx >= 0) selectedKeys.value.splice(idx, 1);
  else selectedKeys.value.push(key);
};
const onPresetChange = () => {
  // Stable hook for a future "auto-fill defaultPrompt into text" feature.
};

onMounted(async () => {
  await preset.ensureLoaded();
});

/**
 * Build the user-scoped OSS key. `userId` is opaque to the client —
 * we just need a stable unique segment per upload so concurrent
 * uploads from the same user don't collide.
 */
const buildOssKey = () => {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  // userId is a UUID from the auth payload; we keep it opaque.
  const userId = (user.profile?.id || 'anon').replace(/[^0-9a-f-]/gi, '');
  // Filename segment: timestamp_random, .jpg default — van-uploader
  // gives us a Blob with a type we can match.
  return `uploads/${userId}/${ts}_${rand}.jpg`;
};

const inferContentType = (file) => {
  // file.file is the underlying Blob from <input type="file">. Most
  // browsers set file.type correctly; fall back to jpeg for HEIC
  // (Safari labels it image/heic or leaves it empty).
  return file.file?.type || 'image/jpeg';
};

const onAfterRead = async (file) => {
  // Mark the uploader row as 'uploading' so the spinner shows.
  file.status = 'uploading';
  file.message = '准备上传…';
  uploading.value = true;
  imageKey.value = '';
  try {
    const key = buildOssKey();
    const contentType = inferContentType(file);
    const { url } = await getPresignedUploadUrl(key, contentType);
    file.message = '上传中…';
    await uploadFileToOss(url, file.file, contentType, ({ loaded, total }) => {
      // Vant shows a tiny percentage; clamp 0-100.
      const pct = total ? Math.round((loaded / total) * 100) : 0;
      file.message = `上传中… ${pct}%`;
    });
    file.status = 'done';
    file.message = '';
    imageKey.value = key;
  } catch (e) {
    // Interceptor surfaces the error to the user. We still need to
    // flip the uploader row to 'failed' so the preview shows the X
    // and the user can retry via the trash icon.
    file.status = 'failed';
    file.message = '上传失败';
  } finally {
    uploading.value = false;
  }
};

const onBeforeDelete = () => {
  imageKey.value = '';
  return true;
};

const onSubmit = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const res = await submitGenerate({
      image_url: imageKey.value,
      preset_keys: selectedKeys.value,
      text: text.value.trim() || undefined,
    });
    if (!res?.generationId) {
      showToast('提交成功但未返回任务 ID');
      return;
    }
    showToast('已提交，后台生成中…');
    router.push(`/generating/${res.generationId}`);
  } catch (e) {
    // axios interceptor already surfaces the dialog/toast.
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.generate-page {
  padding: 8px 0 80px;
}
.section {
  margin-bottom: 24px;
  padding: 0 16px;
}
.section-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--ma-text);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.required {
  font-size: 11px;
  font-weight: 400;
  color: var(--ma-danger);
  background: rgba(238, 10, 36, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}
.optional {
  font-size: 11px;
  font-weight: 400;
  color: var(--ma-text-muted);
  background: var(--ma-surface);
  padding: 2px 8px;
  border-radius: 4px;
}
.selected-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 500;
  color: var(--ma-primary);
}

/* ── Generic white card surface — visible against the cream page bg. */
.card {
  background: var(--ma-surface-white);
  border-radius: 12px;
  border: 1px solid var(--ma-border);
  box-shadow: var(--ma-shadow-sm);
}

/* ── Upload area — self-sized to its parent card, large clickable target. */
.upload-card {
  padding: 16px;
}
.uploader {
  display: block;
  width: 100%;
}
/* Make Vant's uploader wrapper take the full row so the preview /
 * trigger spans the card width — default is inline-block ~80px. */
.uploader :deep(.van-uploader__wrapper) {
  width: 100%;
}
.uploader :deep(.van-uploader__input-wrapper) {
  width: 100%;
}
.uploader :deep(.van-uploader__preview) {
  width: 100% !important;
  margin: 0;
}
.uploader :deep(.van-uploader__preview-image) {
  width: 100% !important;
  height: auto !important;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
}
.upload-trigger {
  width: 100%;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--ma-surface);
  border: 2px dashed var(--ma-border);
  border-radius: 10px;
  gap: 10px;
  transition: border-color 0.15s, background 0.15s;
}
.upload-trigger:hover {
  border-color: var(--ma-primary);
  background: rgba(212, 165, 160, 0.06);
}
.upload-icon {
  color: var(--ma-primary);
}
.upload-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--ma-text);
}
.upload-hint {
  font-size: 12px;
  color: var(--ma-text-muted);
}

/* ── Preset selection — card grid with clear selected state. */
.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-size: 13px;
  color: var(--ma-text-secondary);
}
.category-block {
  margin-bottom: 16px;
}
.category-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ma-text-secondary);
  margin: 0 4px 8px;
}
.preset-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.preset-card {
  background: var(--ma-surface-white);
  border: 1.5px solid var(--ma-border);
  border-radius: 10px;
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}
.preset-card:hover {
  border-color: var(--ma-primary);
}
.preset-card--selected {
  border-color: var(--ma-primary);
  background: rgba(212, 165, 160, 0.08);
  box-shadow: var(--ma-shadow-sm);
}
.preset-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--ma-text);
}
.preset-desc {
  font-size: 12px;
  color: var(--ma-text-secondary);
  margin-top: 6px;
  line-height: 1.4;
}

/* ── Textarea card — same surface treatment as the upload card. */
.field-card {
  padding: 4px 0;
  overflow: hidden;
}
.field-card :deep(.van-field) {
  background: transparent;
}

/* ── Wider grids on tablet+ */
@media (min-width: 768px) {
  .preset-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .upload-trigger {
    min-height: 220px;
  }
}
@media (min-width: 1024px) {
  .preset-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
