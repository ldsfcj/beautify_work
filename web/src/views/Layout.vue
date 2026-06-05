<template>
  <div class="layout">
    <header class="topbar">
      <span class="title">医美咨询</span>
      <span class="credits">积分 {{ user.credits }}</span>
    </header>
    <main class="content">
      <router-view />
    </main>
    <van-tabbar route>
      <van-tabbar-item to="/" icon="home-o">工作台</van-tabbar-item>
      <van-tabbar-item to="/generate" icon="photograph">生成</van-tabbar-item>
      <van-tabbar-item to="/history" icon="orders-o">历史</van-tabbar-item>
      <van-tabbar-item to="/profile" icon="user-o">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup>
import { useUserStore } from '@/stores/user';
const user = useUserStore();
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.topbar {
  height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--van-background-2);
  border-bottom: 1px solid var(--van-border-color);
  position: sticky;
  top: 0;
  z-index: 10;
}
.title {
  font-weight: 600;
  color: var(--van-primary-color);
}
.credits {
  font-size: 13px;
  color: var(--van-text-color-2);
}
.content {
  flex: 1;
  padding: 16px;
}
</style>
