<template>
  <div class="presets-page">
    <h2>预设项目管理</h2>

    <div class="toolbar">
      <el-checkbox v-model="includeInactive">显示已停用</el-checkbox>
      <el-button type="primary" @click="openCreate">+ 新建预设</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="key" label="Key" width="180" />
      <el-table-column prop="category" label="分类" width="100" />
      <el-table-column prop="name" label="名称" width="160" />
      <el-table-column prop="description" label="描述" />
      <el-table-column prop="defaultPrompt" label="默认提示词" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="mono">{{ row.defaultPrompt }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="creditsCost" label="成本" width="80" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">
            {{ row.isActive ? '启用' : '已停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            v-if="row.isActive"
            size="small"
            type="danger"
            plain
            @click="onDelete(row)"
          >停用</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="formOpen"
      :title="form.id ? '编辑预设' : '新建预设'"
      width="560px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="Key" required>
          <el-input v-model="form.key" :disabled="!!form.id" placeholder="如 rhinoplasty_bridge" />
        </el-form-item>
        <el-form-item label="分类" required>
          <el-select v-model="form.category" placeholder="选择分类" style="width: 100%">
            <el-option label="鼻部 (nose)" value="nose" />
            <el-option label="眼部 (eye)" value="eye" />
            <el-option label="面部 (face)" value="face" />
            <el-option label="唇部 (lip)" value="lip" />
            <el-option label="颌面 (jaw)" value="jaw" />
            <el-option label="肤质 (skin)" value="skin" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如 鼻梁增高" maxlength="80" show-word-limit />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="默认提示词" required>
          <el-input v-model="form.defaultPrompt" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="成本积分" required>
          <el-input-number v-model="form.creditsCost" :min="1" :max="1000" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formOpen = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!canSave" @click="onSave">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as presetsApi from '@/api/presets';

const rows = ref([]);
const loading = ref(false);
const includeInactive = ref(false);

const fetch = async () => {
  loading.value = true;
  try {
    const data = await presetsApi.list(includeInactive.value);
    rows.value = data.items || [];
  } finally {
    loading.value = false;
  }
};

watch(includeInactive, () => fetch());

const formOpen = ref(false);
const form = reactive({
  id: null,
  key: '',
  category: '',
  name: '',
  description: '',
  defaultPrompt: '',
  creditsCost: 20,
  sortOrder: 0,
  isActive: true,
});
const saving = ref(false);
const canSave = computed(
  () => form.key.trim() && form.category && form.name.trim() && form.defaultPrompt.trim(),
);

const openCreate = () => {
  Object.assign(form, {
    id: null,
    key: '',
    category: '',
    name: '',
    description: '',
    defaultPrompt: '',
    creditsCost: 20,
    sortOrder: 0,
    isActive: true,
  });
  formOpen.value = true;
};

const openEdit = (row) => {
  Object.assign(form, { ...row });
  formOpen.value = true;
};

const onSave = async () => {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const payload = { ...form };
    delete payload.id;
    if (form.id) {
      await presetsApi.update(form.id, payload);
      ElMessage.success('已更新');
    } else {
      await presetsApi.create(payload);
      ElMessage.success('已创建');
    }
    formOpen.value = false;
    fetch();
  } finally {
    saving.value = false;
  }
};

const onDelete = async (row) => {
  try {
    await ElMessageBox.confirm(
      `确认停用「${row.name}」？停用后用户端不再展示，但历史生成记录仍会保留该 Key。`,
      '停用预设',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  await presetsApi.remove(row.id);
  ElMessage.success('已停用');
  fetch();
};

onMounted(fetch);
</script>

<style scoped>
.presets-page {
  padding: 8px;
}
h2 {
  margin: 0 0 16px;
  font-size: 20px;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}
.mono {
  font-family: monospace;
  font-size: 12px;
}
</style>
