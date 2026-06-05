<template>
  <div class="login">
    <el-card class="login-card">
      <template #header>
        <span class="title">医美 AI 后台</span>
      </template>
      <el-form :model="form" label-width="80px" @submit.prevent>
        <el-form-item label="账号">
          <el-input v-model="form.username" placeholder="管理员账号" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" placeholder="密码" show-password />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="onSubmit" style="width: 100%">
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <p class="placeholder-note">占位页 — Task 32 接入 admin/auth/login API</p>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';

const form = reactive({ username: '', password: '' });
const loading = ref(false);

// Placeholder submit — Task 32 wires this to useAdminStore().login().
const onSubmit = () => {
  ElMessage.info('请等待 Task 32 接入真实登录 API');
};
</script>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5ebe7 0%, #e8d5cf 100%);
}
.login-card {
  width: 400px;
  max-width: calc(100vw - 32px);
}
.title {
  font-weight: 600;
  color: var(--el-color-primary);
  font-size: 18px;
}
.placeholder-note {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #909399;
}
</style>
