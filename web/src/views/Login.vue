<template>
  <div class="login-page">
    <div class="hero">
      <h1>医美咨询 AI 预览</h1>
      <p class="subtitle">为咨询师提供 AI 整形预览生成工具</p>
    </div>

    <van-form @submit="onSubmit" class="form">
      <van-cell-group inset>
        <van-field
          v-model="phone"
          type="tel"
          name="phone"
          label="手机号"
          placeholder="请输入 11 位手机号"
          :rules="[
            { required: true, message: '请输入手机号' },
            { pattern: /^1[3-9]\d{9}$/, message: '格式不正确' },
          ]"
          maxlength="11"
        />
        <van-field
          v-model="code"
          type="digit"
          name="code"
          label="验证码"
          placeholder="6 位数字"
          maxlength="6"
        >
          <template #button>
            <van-button
              size="small"
              type="primary"
              :disabled="!canSend"
              :loading="sending"
              @click.prevent="onSend"
            >
              {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
            </van-button>
          </template>
        </van-field>
      </van-cell-group>

      <div class="agreement">
        <van-checkbox v-model="agreed" shape="square">
          我已阅读并同意
        </van-checkbox>
        <a class="link" @click="openAgreement('user')">《用户服务协议》</a>
        <span>与</span>
        <a class="link" @click="openAgreement('privacy')">《隐私政策》</a>
      </div>

      <div class="submit">
        <van-button
          block
          type="primary"
          native-type="submit"
          :loading="submitting"
          :disabled="!canSubmit"
        >
          登录
        </van-button>
      </div>
    </van-form>
  </div>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import * as authApi from '@/api/auth';
import * as agreementApi from '@/api/agreement';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const route = useRoute();
const user = useUserStore();

const phone = ref('');
const code = ref('');
const agreed = ref(false);
const sending = ref(false);
const submitting = ref(false);
const countdown = ref(0);

const canSend = computed(
  () => /^1[3-9]\d{9}$/.test(phone.value) && countdown.value === 0 && !sending.value,
);
const canSubmit = computed(
  () => /^1[3-9]\d{9}$/.test(phone.value) && /^\d{6}$/.test(code.value) && agreed.value,
);

let timer = null;
const startCountdown = () => {
  countdown.value = 60;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
};
onUnmounted(() => timer && clearInterval(timer));

const onSend = async () => {
  if (!canSend.value) return;
  sending.value = true;
  try {
    await authApi.sendSms(phone.value);
    showToast('验证码已发送（dev 模式见服务端日志）');
    startCountdown();
  } catch (e) {
    // axios interceptor already surfaces the dialog; just log.
    console.warn('sendSms failed', e);
  } finally {
    sending.value = false;
  }
};

const onSubmit = async () => {
  if (!agreed.value) {
    showToast('请先勾选用户协议');
    return;
  }
  submitting.value = true;
  try {
    await user.login(phone.value, code.value);
    // Best-effort record acceptance of both agreements. We don't block
    // login on this — if it fails the user will see the dialog again
    // next time they open the app.
    try {
      await agreementApi.accept('user');
    } catch (e) {
      console.warn('accept user agreement', e);
    }
    try {
      await agreementApi.accept('privacy');
    } catch (e) {
      console.warn('accept privacy agreement', e);
    }
    const redirect = (route.query.redirect && String(route.query.redirect)) || '/';
    router.replace(redirect);
  } catch (e) {
    // interceptor showed the dialog
  } finally {
    submitting.value = false;
  }
};

const openAgreement = (type) => {
  // Navigate to the dedicated agreement page instead of showing a
  // cramped dialog — long legal text is unreadable in a dialog box.
  router.push({ path: '/agreement', query: { type, readonly: '1' } });
};
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 80px 16px 24px;
  background: var(--van-background);
}
.hero {
  text-align: center;
  margin-bottom: 32px;
}
.hero h1 {
  font-size: 24px;
  font-weight: 600;
  color: var(--van-primary-color);
  margin: 0 0 8px;
}
.subtitle {
  color: var(--van-text-color-2);
  font-size: 14px;
  margin: 0;
}
.form {
  margin: 0 auto;
  max-width: 480px;
}
.agreement {
  margin: 16px 24px 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 12px;
  color: var(--van-text-color-2);
}
.link {
  color: var(--van-primary-color);
  cursor: pointer;
}
.submit {
  margin: 24px 16px 0;
}
</style>
