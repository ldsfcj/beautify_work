<template>
  <div class="generate-page">
    <h2 class="page-title">AI 整形预览</h2>

    <section class="section">
      <div class="section-label">客户原图</div>
      <van-uploader
        v-model="fileList"
        :max-count="1"
        :after-read="onAfterRead"
        :before-delete="onBeforeDelete"
        accept="image/*"
      >
        <template #default>
          <div class="upload-trigger">
            <van-icon name="photograph" size="32" color="#999" />
            <div class="hint">点击上传 (1 张)</div>
          </div>
        </template>
      </van-uploader>
    </section>

    <section class="section">
      <div class="section-label">选择项目 (至少 1 项)</div>
      <div v-if="preset.loading && !preset.loaded" class="loading">
        <van-loading size="20" /> 加载中…
      </div>
      <van-checkbox-group v-else v-model="selectedKeys" @change="onPresetChange">
        <div
          v-for="(items, category) in preset.byCategory"
          :key="category"
          class="category-block"
        >
          <div class="category-title">{{ categoryLabel(category) }}</div>
          <van-cell-group inset>
            <van-cell
              v-for="p in items"
              :key="p.key"
              clickable
              @click="toggle(p.key)"
            >
              <template #title>
                <div class="preset-name">{{ p.name }}</div>
                <div v-if="p.description" class="preset-desc">{{ p.description }}</div>
              </template>
              <template #right-icon>
                <van-checkbox :name="p.key" :ref="(el) => bindCheckboxRef(el, p.key)" />
              </template>
            </van-cell>
          </van-cell-group>
        </div>
      </van-checkbox-group>
    </section>

    <section class="section">
      <div class="section-label">补充描述 (可选)</div>
      <van-field
        v-model="text"
        type="textarea"
        rows="3"
        autosize
        maxlength="500"
        show-word-limit
        placeholder="例如：自然款 / 偏夸张 / 偏甜美…"
      />
    </section>

    <van-submit-bar
      :price="totalCost * 100"
      :button-text="submitText"
      :loading="submitting"
      :disabled="!canSubmit"
      button-color="var(--van-primary-color)"
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
import { submit as submitGenerate } from '@/api/generate';

const router = useRouter();
const preset = usePresetStore();

const fileList = ref([]); // van-uploader data shape: [{ url, file, ... }]
const imageUrl = ref(''); // data URL we ship as `image_url` to the API
const selectedKeys = ref([]);
const text = ref('');
const submitting = ref(false);

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
  () => Boolean(imageUrl.value) && selectedKeys.value.length > 0 && !submitting.value,
);

const submitText = computed(() => {
  if (selectedKeys.value.length === 0) return '请选择项目';
  if (!imageUrl.value) return '请上传图片';
  return `提交（扣 ${totalCost.value} 积分）`;
});

// We use a programmatic toggle so the cell-click and the checkbox-click both
// flip state. Vant's checkbox-group tracks names; we keep an empty refs map
// just so future programmatic focus / scroll-to-error can find them.
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
  // The checkbox group is the source of truth; this handler exists so a
  // future "auto-fill defaultPrompt into text" hook has a stable place.
};

onMounted(async () => {
  await preset.ensureLoaded();
});

const onAfterRead = (file) => {
  // van-uploader populates file.content (data URL) when the file is
  // a local blob; that's exactly the shape our submit API expects for
  // `image_url` in dev (the mock AI adapter never fetches it). For
  // production we'll swap this for a presigned-OSS direct upload.
  imageUrl.value = file.content || '';
  if (!imageUrl.value) {
    showToast('图片读取失败，请重试');
  }
};

const onBeforeDelete = () => {
  imageUrl.value = '';
  return true;
};

const onSubmit = async () => {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    const res = await submitGenerate({
      image_url: imageUrl.value,
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
  padding: 16px 0 80px;
}
.page-title {
  margin: 0 16px 16px;
  font-size: 20px;
  font-weight: 600;
  color: var(--van-text-color);
}
.section {
  margin-bottom: 20px;
  padding: 0 16px;
}
.section-label {
  font-size: 14px;
  color: var(--van-text-color-2);
  margin-bottom: 8px;
}
.upload-trigger {
  width: 100%;
  height: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 8px;
  gap: 8px;
}
.upload-trigger .hint {
  font-size: 12px;
  color: var(--van-text-color-2);
}
.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  font-size: 13px;
  color: var(--van-text-color-2);
}
.category-block {
  margin-bottom: 12px;
}
.category-title {
  font-size: 13px;
  color: var(--van-text-color-2);
  margin: 0 4px 6px;
}
.preset-name {
  font-size: 14px;
  color: var(--van-text-color);
}
.preset-desc {
  font-size: 12px;
  color: var(--van-text-color-2);
  margin-top: 2px;
  line-height: 1.4;
}
</style>
