<template>
  <div class="dashboard">
    <div class="hero">
      <div class="hello">
        <div class="nickname">{{ user.profile?.nickname || '游客' }}</div>
        <div class="mask">{{ user.phoneMask || '—' }}</div>
      </div>
      <div class="credits-card">
        <div class="credits-label">积分余额</div>
        <div class="credits-value">{{ user.credits }}</div>
        <van-button size="mini" type="primary" @click="$router.push('/packages')">
          充值
        </van-button>
      </div>
    </div>

    <div class="quick-grid">
      <div class="quick-item" @click="$router.push('/generate')">
        <van-icon name="photograph" size="32" color="#1989fa" />
        <span>AI 预览</span>
      </div>
      <div class="quick-item" @click="$router.push('/history')">
        <van-icon name="orders-o" size="32" color="#1989fa" />
        <span>历史</span>
      </div>
      <div class="quick-item" @click="$router.push('/orders')">
        <van-icon name="balance-o" size="32" color="#1989fa" />
        <span>订单</span>
      </div>
      <div class="quick-item" @click="$router.push('/profile')">
        <van-icon name="user-o" size="32" color="#1989fa" />
        <span>我的</span>
      </div>
    </div>

    <section v-if="recent.length > 0" class="recent">
      <div class="section-head">
        <h3>最近生成</h3>
        <span class="more" @click="$router.push('/history')">查看全部 ›</span>
      </div>
      <div class="recent-grid">
        <div
          v-for="g in recent"
          :key="g.id"
          class="recent-item"
          @click="$router.push(`/result/${g.id}`)"
        >
          <van-image
            :src="g.resultUrl"
            fit="cover"
            radius="8"
            class="thumb"
          />
          <div class="status" :class="`status-${g.status}`">
            {{ statusLabel(g.status) }}
          </div>
        </div>
      </div>
    </section>

    <div class="banner" @click="$router.push('/packages')">
      <van-icon name="gem-o" size="20" color="#fff" />
      <span>新人首充 8 折 — 仅限本周</span>
      <van-icon name="arrow" color="#fff" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useUserStore } from '@/stores/user';
import * as userApi from '@/api/user';
import * as generateApi from '@/api/generate';

const user = useUserStore();
const recent = ref([]);

const STATUS_LABELS = {
  pending: '生成中',
  processing: '生成中',
  success: '已完成',
  failed: '失败',
};

const statusLabel = (s) => STATUS_LABELS[s] || s;

onMounted(async () => {
  // Refresh profile on dashboard mount so the credits / mask / nickname
  // reflect the latest server state.
  if (user.token && !user.profile) {
    try {
      user.profile = await userApi.getMe();
    } catch (e) {
      /* interceptor handles 401 */
    }
  }
  // Pull the 3 most recent successful generations. We ask for `success`
  // explicitly so the thumbnail grid isn't polluted by in-flight rows.
  if (user.token) {
    try {
      const data = await generateApi.list({ page: 1, pageSize: 3, status: 'success' });
      recent.value = (data.items || []).slice(0, 3);
    } catch (e) {
      // Best-effort: leave the section hidden on error.
      recent.value = [];
    }
  }
});
</script>

<style scoped>
.dashboard {
  padding: 16px 0;
}
.hero {
  background: linear-gradient(135deg, #1989fa 0%, #4ea3ff 100%);
  color: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.hello .nickname {
  font-size: 18px;
  font-weight: 600;
}
.hello .mask {
  font-size: 13px;
  opacity: 0.8;
  margin-top: 4px;
}
.credits-card {
  text-align: right;
}
.credits-label {
  font-size: 12px;
  opacity: 0.85;
}
.credits-value {
  font-size: 28px;
  font-weight: 700;
  margin: 4px 0 8px;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  background: #fff;
  border-radius: 12px;
  padding: 16px 8px;
  margin-bottom: 16px;
}
.quick-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--van-text-color);
  cursor: pointer;
}
.recent {
  background: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 16px;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.section-head h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.more {
  font-size: 13px;
  color: var(--van-text-color-2);
  cursor: pointer;
}
.recent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.recent-item {
  position: relative;
  cursor: pointer;
}
.thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: block;
}
.status {
  position: absolute;
  bottom: 4px;
  left: 4px;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, 0.55);
}
.status-failed {
  background: rgba(238, 10, 36, 0.85);
}
.banner {
  background: linear-gradient(135deg, #ff976a 0%, #ff5e5e 100%);
  color: #fff;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}
.banner > span {
  flex: 1;
}
</style>
