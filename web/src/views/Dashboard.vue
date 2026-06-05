<template>
  <div class="dashboard">
    <h2>工作台</h2>
    <p>欢迎，{{ user.profile?.nickname || '用户' }}</p>
    <p class="placeholder-note">占位页 — Task 28 完整实现（生成入口 + 最近记录）</p>
  </div>
</template>

<script setup>
import { useUserStore } from '@/stores/user';
const user = useUserStore();
</script>

<style scoped>
.dashboard {
  padding: 16px 0;
}
h2 {
  margin: 0 0 8px;
  font-size: 20px;
}
.placeholder-note {
  margin-top: 16px;
  font-size: 12px;
  color: var(--van-text-color-2);
  opacity: 0.6;
}
</style>
