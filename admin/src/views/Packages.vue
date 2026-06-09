<template>
  <div class="packages-page">
    <h2>积分套餐管理</h2>

    <div class="toolbar">
      <el-checkbox v-model="includeInactive">显示已停用</el-checkbox>
      <el-button type="primary" @click="openCreate">+ 新建套餐</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column prop="name" label="名称" width="140" />
      <el-table-column prop="credits" label="基础积分" width="100" />
      <el-table-column prop="bonusCredits" label="赠送积分" width="100" />
      <el-table-column label="到账" width="100">
        <template #default="{ row }">
          <strong>{{ row.credits + row.bonusCredits }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="价格" width="120">
        <template #default="{ row }">¥{{ (row.priceCents / 100).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="validityDays" label="有效期(天)" width="120" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">
            {{ row.isActive ? '上架' : '已下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button
            v-if="row.isActive"
            size="small"
            type="danger"
            plain
            @click="onDelete(row)"
          >下架</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="formOpen"
      :title="form.id ? '编辑套餐' : '新建套餐'"
      width="480px"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="基础积分" required>
          <el-input-number v-model="form.credits" :min="1" :max="100000" />
        </el-form-item>
        <el-form-item label="赠送积分">
          <el-input-number v-model="form.bonusCredits" :min="0" :max="100000" />
        </el-form-item>
        <el-form-item label="价格(分)" required>
          <el-input-number v-model="form.priceCents" :min="1" :max="10000000" :step="100" />
          <span class="hint">¥{{ (form.priceCents / 100).toFixed(2) }}</span>
        </el-form-item>
        <el-form-item label="有效期(天)" required>
          <el-input-number v-model="form.validityDays" :min="1" :max="3650" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="上架">
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
import * as packagesApi from '@/api/packages';

const rows = ref([]);
const loading = ref(false);
const includeInactive = ref(false);

const fetch = async () => {
  loading.value = true;
  try {
    const data = await packagesApi.list(includeInactive.value);
    rows.value = data.items || [];
  } finally {
    loading.value = false;
  }
};

watch(includeInactive, () => fetch());

const formOpen = ref(false);
const form = reactive({
  id: null,
  name: '',
  credits: 50,
  bonusCredits: 0,
  priceCents: 2900,
  validityDays: 90,
  sortOrder: 0,
  isActive: true,
});
const saving = ref(false);
const canSave = computed(
  () => form.name.trim() && form.credits > 0 && form.priceCents > 0 && form.validityDays > 0,
);

const openCreate = () => {
  Object.assign(form, {
    id: null,
    name: '',
    credits: 50,
    bonusCredits: 0,
    priceCents: 2900,
    validityDays: 90,
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
      await packagesApi.update(form.id, payload);
      ElMessage.success('已更新');
    } else {
      await packagesApi.create(payload);
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
      `确认下架「${row.name}」？已下架的套餐在用户端不再展示，但历史订单仍可查询。`,
      '下架套餐',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  await packagesApi.remove(row.id);
  ElMessage.success('已下架');
  fetch();
};

onMounted(fetch);
</script>

<style scoped>
.packages-page {
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
.hint {
  margin-left: 12px;
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
