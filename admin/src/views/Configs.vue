<template>
  <div class="configs-page">
    <h2>系统配置</h2>
    <p class="hint">只读配置 (D8)。生产改前先在文档登记。</p>

    <el-skeleton v-if="loading" :rows="4" animated />

    <el-table v-else :data="rows" stripe>
      <el-table-column prop="key" label="Key" width="220" />
      <el-table-column label="Value" min-width="320">
        <template #default="{ row }">
          <pre class="value">{{ formatValue(row.value) }}</pre>
        </template>
      </el-table-column>
      <el-table-column prop="updatedBy" label="Updated By" width="160" />
      <el-table-column prop="updatedAt" label="Updated At" width="180">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="editOpen" :title="`编辑 ${form.key || ''}`" width="600px">
      <el-form label-width="80px">
        <el-form-item label="Value (JSON)">
          <el-input
            v-model="form.valueText"
            type="textarea"
            :rows="14"
            spellcheck="false"
            placeholder='{"key": "value"}'
          />
        </el-form-item>
        <el-form-item v-if="parseError">
          <el-alert :title="parseError" type="error" :closable="false" show-icon />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!!parseError" @click="onSave">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import * as configsApi from '@/api/configs';

const rows = ref([]);
const loading = ref(false);

const fetch = async () => {
  loading.value = true;
  try {
    const data = await configsApi.list();
    rows.value = data.items || [];
  } finally {
    loading.value = false;
  }
};

const formatValue = (v) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v, null, 2);
};

const formatTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const editOpen = ref(false);
const form = reactive({ key: '', valueText: '', parsed: null });
const saving = ref(false);

const parseError = computed(() => {
  if (!form.valueText) return null;
  try {
    form.parsed = JSON.parse(form.valueText);
    return null;
  } catch (e) {
    return `JSON 解析失败: ${e.message}`;
  }
});

const openEdit = (row) => {
  form.key = row.key;
  form.valueText = JSON.stringify(row.value, null, 2);
  form.parsed = null;
  editOpen.value = true;
};

const onSave = async () => {
  if (parseError.value) return;
  saving.value = true;
  try {
    await configsApi.upsert(form.key, form.parsed);
    ElMessage.success('已保存');
    editOpen.value = false;
    fetch();
  } finally {
    saving.value = false;
  }
};

onMounted(fetch);
</script>

<style scoped>
.configs-page {
  padding: 8px;
}
h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.hint {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--ma-text-muted);
}
.value {
  margin: 0;
  font-family: monospace;
  font-size: 12px;
  white-space: pre-wrap;
  max-height: 80px;
  overflow: auto;
}
</style>
