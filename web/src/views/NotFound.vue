<template>
  <div class="notfound">
    <h1>404</h1>
    <p>页面不存在</p>
    <van-button type="primary" @click="$router.replace('/')">返回首页</van-button>
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
  color: var(--van-primary-color);
}
p {
  margin: 0 0 16px;
  color: var(--van-text-color-2);
}
</style>
