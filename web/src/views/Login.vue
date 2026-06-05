<template>
  <div class="login-page">
    <h1>医美咨询 AI 预览</h1>
    <p class="subtitle">请使用手机号登录</p>
    <p class="placeholder-note">占位页 — Task 28 完整实现</p>
  </div>
</template>

<script setup>
// Placeholder. Real implementation (Task 28):
//   - phone input (van-field, type=tel)
//   - "获取验证码" button → authApi.sendSms
//   - 6-digit code input
//   - "登录" button → authApi.login → router.push(redirect)
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 80px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--van-primary-color);
  margin: 0 0 8px;
}
.subtitle {
  color: var(--van-text-color-2);
  margin: 0 0 32px;
}
.placeholder-note {
  margin-top: 16px;
  font-size: 12px;
  color: var(--van-text-color-2);
  opacity: 0.6;
}
</style>
