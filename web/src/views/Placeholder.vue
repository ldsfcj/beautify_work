<template>
  <div class="placeholder-page">
    <van-empty :description="title">
      <template #image>
        <van-icon name="underway-o" size="80" color="#7a6761" />
      </template>
      <van-button round type="primary" size="small" @click="$router.push('/')">
        返回工作台
      </van-button>
    </van-empty>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const title = computed(() => {
  const map = {
    Generate: 'AI 预览生成 (Task 25 待实现)',
    History: '生成历史 (Task 30 待实现)',
  };
  return map[route.name] || '该页面待实现';
});
</script>

<style scoped>
.placeholder-page {
  padding: 80px 16px;
}
</style>
