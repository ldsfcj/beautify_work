import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  // The admin SPA is served behind the main reverse proxy under the
  // `/admin/` prefix. Build with this base so generated asset URLs
  // (e.g. `/admin/assets/index-xxx.js`) and vue-router's history
  // resolution stay in sync with how the reverse proxy routes them.
  base: '/admin/',
  plugins: [
    vue(),
    // Auto-import Element Plus APIs (ElMessage, ElMessageBox, ...) so we
    // never have to `import { ElMessage } from 'element-plus'` in views.
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    // Auto-register Element Plus components on demand.
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5174,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
