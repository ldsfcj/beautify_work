<template>
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue';
import { useUserStore } from '@/stores/user';

const user = useUserStore();
// Pull fresh profile (credits, etc.) on first paint if we have a token.
onMounted(() => {
  if (user.token) {
    user.fetchProfile().catch(() => {
      /* swallow — interceptor will redirect on 401 */
    });
  }
});
</script>
