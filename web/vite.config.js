import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Components from 'unplugin-vue-components/vite';
import { VantResolver } from '@vant/auto-import-resolver';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Auto-register Vant components on demand; no manual `import` needed in views.
    Components({ resolvers: [VantResolver()] }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
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
