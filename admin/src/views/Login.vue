<template>
  <div class="login">
    <el-card class="login-card">
      <template #header>
        <span class="title">医美 AI 后台</span>
      </template>
      <el-form
        :model="form"
        label-width="80px"
        @submit.prevent="onSubmit"
      >
        <el-form-item label="账号">
          <el-input
            v-model="form.username"
            placeholder="管理员账号"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <el-form-item v-if="errorMsg">
          <el-alert :title="errorMsg" type="error" :closable="false" show-icon />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            :disabled="!canSubmit"
            @click="onSubmit"
            style="width: 100%"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
      <p class="hint">默认账号 <code>admin</code> / 密码 <code>admin123</code>（首次部署后请立即修改）</p>
    </el-card>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminStore } from '@/stores/admin';

const route = useRoute();
const router = useRouter();
const admin = useAdminStore();

const form = reactive({ username: '', password: '' });
const loading = ref(false);
const errorMsg = ref('');

const canSubmit = computed(
  () => form.username.trim().length > 0 && form.password.length > 0 && !loading.value,
);

const onSubmit = async () => {
  if (!canSubmit.value) return;
  errorMsg.value = '';
  loading.value = true;
  try {
    await admin.login(form.username.trim(), form.password);
    // Redirect to ?redirect=… if present, else the default /dashboard.
    const redirect = (route.query.redirect && String(route.query.redirect)) || '/dashboard';
    router.replace(redirect);
  } catch (e) {
    // The api interceptor surfaces a generic ElMessage for backend errors.
    // Pin the message in the form for sticky feedback (e.g. wrong password
    // where the toast disappears too fast on a 401 attempt).
    errorMsg.value = '账号或密码错误';
  } finally {
    loading.value = false;
  }
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
.hint {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: #909399;
}
.hint code {
  background: #f5f5f5;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}
</style>
