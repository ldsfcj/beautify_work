<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '220px'" class="aside">
      <div class="logo">
        <span v-if="!collapsed">医美 AI 后台</span>
        <span v-else>医</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        :collapse="collapsed"
        background-color="#3d2e2a"
        text-color="#e8d5cf"
        active-text-color="#f5ebe7"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <template #title>工作台</template>
        </el-menu-item>
        <!-- Tasks 32-35: orders / users / packages / presets / configs / ai-logs / audit / refunds -->
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <el-button text @click="collapsed = !collapsed">
          <el-icon><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
        </el-button>
        <div class="header-right">
          <span class="username">{{ admin.username || 'admin' }}</span>
          <el-button text @click="onLogout">退出</el-button>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminStore } from '@/stores/admin';

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();
const collapsed = ref(false);

const activeMenu = computed(() => route.path);

const onLogout = async () => {
  await admin.logout();
  router.push({ name: 'Login' });
};
</script>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: #3d2e2a;
  transition: width 0.2s;
  overflow-x: hidden;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f5ebe7;
  font-weight: 600;
  font-size: 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.header {
  background: #fff;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.username {
  color: #606266;
  font-size: 14px;
}
.main {
  background: #f5f5f5;
  padding: 16px;
}
</style>
