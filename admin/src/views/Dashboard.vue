<template>
  <div class="dashboard">
    <h2>工作台</h2>
    <p>欢迎，{{ admin.username || 'admin' }}</p>
    <el-row :gutter="16" class="cards">
      <el-col :span="6" v-for="c in cards" :key="c.label">
        <el-card>
          <div class="card-label">{{ c.label }}</div>
          <div class="card-value">{{ c.value }}</div>
        </el-card>
      </el-col>
    </el-row>
    <p class="placeholder-note">占位页 — Task 32 接入统计 API（订单/用户/套餐/AI 调用）</p>
  </div>
</template>

<script setup>
import { useAdminStore } from '@/stores/admin';
const admin = useAdminStore();

// Placeholder data — replaced with real metrics in Task 32.
const cards = [
  { label: '今日订单', value: '—' },
  { label: '今日用户', value: '—' },
  { label: 'AI 调用', value: '—' },
  { label: '退款待审', value: '—' },
];
</script>

<style scoped>
.dashboard {
  padding: 8px;
}
h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.cards {
  margin-top: 16px;
}
.card-label {
  color: #909399;
  font-size: 13px;
}
.card-value {
  color: #303133;
  font-size: 24px;
  font-weight: 600;
  margin-top: 8px;
}
.placeholder-note {
  margin-top: 24px;
  font-size: 12px;
  color: #909399;
}
</style>
