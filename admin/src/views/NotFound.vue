<template>
  <div class="notfound">
    <h1>404</h1>
    <p>页面不存在</p>
    <el-button type="primary" @click="$router.replace('/dashboard')">返回工作台</el-button>
  </div>
</template>

<style scoped>
.notfound {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
h1 {
  font-size: 72px;
  margin: 0;
  color: var(--el-color-primary);
}
p {
  margin: 0 0 16px;
  color: #606266;
}
</style>
