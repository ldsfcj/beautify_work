<template>
  <div class="dashboard">
    <h2>工作台</h2>
    <p class="welcome">欢迎，{{ admin.username || 'admin' }}</p>

    <el-skeleton v-if="loading" :rows="6" animated />

    <template v-else-if="summary">
      <section class="section">
        <h3>用户</h3>
        <el-row :gutter="12">
          <el-col :span="6"><el-card><Kpi label="总用户" :value="summary.users.total" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="活跃" :value="summary.users.active" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="注销中" :value="summary.users.pendingDelete" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="7 日新增" :value="summary.users.newThisWeek" /></el-card></el-col>
        </el-row>
      </section>

      <section class="section">
        <h3>订单</h3>
        <el-row :gutter="12">
          <el-col :span="6"><el-card><Kpi label="总订单" :value="summary.orders.total" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="已支付" :value="summary.orders.paid" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="待支付" :value="summary.orders.pending" /></el-card></el-col>
          <el-col :span="6">
            <el-card>
              <Kpi
                label="7 日营收"
                :value="`¥${(summary.orders.revenueCentsThisWeek / 100).toFixed(2)}`"
              />
            </el-card>
          </el-col>
        </el-row>
      </section>

      <section class="section">
        <h3>AI 生成</h3>
        <el-row :gutter="12">
          <el-col :span="6"><el-card><Kpi label="总生成" :value="summary.generations.total" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="成功" :value="summary.generations.success" /></el-card></el-col>
          <el-col :span="6"><el-card><Kpi label="失败" :value="summary.generations.failed" /></el-card></el-col>
          <el-col :span="6">
            <el-card>
              <Kpi label="7 日成功率" :value="`${summary.generations.successRate7d}%`" />
            </el-card>
          </el-col>
        </el-row>
      </section>

      <section class="section">
        <h3>AI 成本 / 退款</h3>
        <el-row :gutter="12">
          <el-col :span="6">
            <el-card>
              <Kpi
                label="7 日 AI 成本"
                :value="`¥${(summary.ai.costCents7d / 100).toFixed(2)}`"
              />
            </el-card>
          </el-col>
          <el-col :span="6"><el-card><Kpi label="7 日 AI 调用" :value="summary.ai.calls7d" /></el-card></el-col>
          <el-col :span="6">
            <el-card>
              <Kpi label="平均延迟" :value="`${summary.ai.avgLatencyMs7d} ms`" />
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card>
              <Kpi label="退款待审" :value="summary.refunds.pending" />
            </el-card>
          </el-col>
        </el-row>
      </section>
    </template>
  </div>
</template>

<script setup>
import { h, onMounted, ref } from 'vue';
import { useAdminStore } from '@/stores/admin';
import * as dashboardApi from '@/api/dashboard';

const admin = useAdminStore();
const summary = ref(null);
const loading = ref(true);

onMounted(async () => {
  try {
    summary.value = await dashboardApi.summary();
  } finally {
    loading.value = false;
  }
});

/** Small render helper to keep the KPI card markup inline. */
const Kpi = (props) => {
  return [
    h('div', { class: 'kpi-label' }, props.label),
    h('div', { class: 'kpi-value' }, String(props.value)),
  ];
};
Kpi.props = ['label', 'value'];
</script>

<style scoped>
.dashboard {
  padding: 8px;
}
h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.welcome {
  margin: 0 0 16px;
  color: var(--ma-text-muted);
  font-size: 13px;
}
.section {
  margin-bottom: 16px;
}
.section h3 {
  margin: 0 0 8px;
  font-size: 14px;
  color: #606266;
  font-weight: 600;
}
.kpi-label {
  color: var(--ma-text-muted);
  font-size: 12px;
}
.kpi-value {
  color: #303133;
  font-size: 22px;
  font-weight: 600;
  margin-top: 6px;
}
</style>
