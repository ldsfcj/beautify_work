<template>
  <div class="profile-page">
    <div class="card">
      <div class="row">
        <span class="label">头像</span>
        <div class="value avatar">
          <van-image
            round
            width="48"
            height="48"
            :src="user.profile?.avatar || defaultAvatar"
          />
        </div>
      </div>
      <div class="row" @click="showEditNickname = true">
        <span class="label">昵称</span>
        <span class="value">{{ user.profile?.nickname || '未设置' }}</span>
        <van-icon name="arrow" />
      </div>
      <div class="row">
        <span class="label">手机号</span>
        <span class="value">{{ user.phoneMask || '—' }}</span>
      </div>
      <div class="row">
        <span class="label">积分</span>
        <span class="value credits">{{ user.credits }}</span>
        <!-- TODO: 线上支付暂未接入，充值入口屏蔽，后续恢复 -->
        <!-- <van-button size="mini" type="primary" plain @click="$router.push('/recharge')">
          充值
        </van-button> -->
      </div>
    </div>

    <div class="card">
      <div class="row" @click="openAgreement('user')">
        <span class="label">用户服务协议</span>
        <van-icon name="arrow" />
      </div>
      <div class="row" @click="openAgreement('privacy')">
        <span class="label">隐私政策</span>
        <van-icon name="arrow" />
      </div>
    </div>

    <!-- TODO: 线上支付暂未接入，订单入口屏蔽，后续恢复 -->
    <!-- <div class="card">
      <div class="row" @click="$router.push('/orders')">
        <span class="label">我的订单</span>
        <van-icon name="arrow" />
      </div>
    </div> -->

    <div class="danger-zone">
      <van-button block type="primary" plain @click="onLogout" class="logout-btn">
        退出登录
      </van-button>
      <van-button block plain type="danger" @click="onCancel">注销账号</van-button>
      <p class="danger-hint">
        退出登录：仅在本设备清除登录态，下次可重新登录。<br />
        注销账号：30 天后账号及数据永久删除。
      </p>
    </div>

    <van-dialog
      v-model:show="showEditNickname"
      title="修改昵称"
      show-cancel-button
      @confirm="onSaveNickname"
    >
      <div class="dialog-body">
        <van-field
          v-model="nicknameDraft"
          placeholder="请输入新昵称 (1-50 字)"
          maxlength="50"
          show-word-limit
        />
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { showConfirmDialog, showDialog, showToast } from 'vant';
import * as userApi from '@/api/user';
import * as agreementApi from '@/api/agreement';
import { useUserStore } from '@/stores/user';

const user = useUserStore();

const showEditNickname = ref(false);
const nicknameDraft = ref('');

// Use a simple SVG data URI as the default avatar — avoids external
// CDN dependency and keeps the warm-pink brand feel.
const defaultAvatar = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect fill="#e8d5cf" width="48" height="48" rx="24"/><text x="24" y="30" text-anchor="middle" fill="#d4a5a0" font-size="20" font-family="sans-serif">?</text></svg>')}`;

const onSaveNickname = async () => {
  const v = nicknameDraft.value.trim();
  if (!v) {
    showToast('昵称不能为空');
    return;
  }
  try {
    const profile = await userApi.updateMe({ nickname: v });
    user.profile = profile;
    nicknameDraft.value = '';
    showToast('已保存');
  } catch (e) {
    /* interceptor showed */
  }
};

const openAgreement = async (type) => {
  try {
    const data = await agreementApi.getCurrent(type);
    showDialog({
      title: data.type === 'user' ? '用户服务协议' : '隐私政策',
      message: data.content,
      confirmButtonText: '我已阅读',
      messageAlign: 'left',
    }).catch(() => {});
  } catch (e) {
    /* interceptor */
  }
};

const onLogout = async () => {
  try {
    await showConfirmDialog({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmButtonText: '退出',
    });
  } catch {
    return;
  }
  try {
    // Logout calls /auth/logout (best-effort; swallows errors) and
    // clears local token + profile. Then route to /login.
    await user.logout();
    location.href = '/login';
  } catch (e) {
    // user.logout() already clears local state in `finally`; even if
    // the server call fails we still want the user out of the app.
    location.href = '/login';
  }
};

const onCancel = async () => {
  try {
    await showConfirmDialog({
      title: '注销账号',
      message: '注销后 30 天内不可恢复，30 天后账号及数据将永久删除。是否继续？',
      confirmButtonText: '确认注销',
      confirmButtonColor: '#ee0a24',
    });
  } catch {
    return;
  }
  try {
    await userApi.cancel();
    showDialog({
      title: '已提交注销',
      message: '30 天后账号将永久删除。期间重新登录可撤回。',
      confirmButtonText: '我知道了',
    }).catch(() => {});
    await user.logout();
    location.href = '/login';
  } catch (e) {
    /* interceptor */
  }
};
</script>

<style scoped>
.profile-page {
  padding: 16px;
}
.card {
  background: #fff;
  border-radius: 12px;
  margin-bottom: 16px;
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--van-border-color);
}
.row:last-child {
  border-bottom: none;
}
.label {
  width: 80px;
  font-size: 14px;
  color: var(--van-text-color-2);
}
.value {
  flex: 1;
  font-size: 15px;
  color: var(--van-text-color);
}
.value.credits {
  color: var(--van-primary-color);
  font-weight: 600;
}
.avatar {
  display: flex;
  justify-content: flex-end;
}
.danger-zone {
  margin: 32px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.logout-btn {
  /* Primary brand colour (nude-pink) — a normal action, not destructive. */
}
.danger-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--ma-text-secondary);
  line-height: 1.6;
  padding: 0 4px;
}
.dialog-body {
  padding: 16px;
}
</style>
