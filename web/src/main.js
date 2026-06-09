import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './router';

// Load Vant's full stylesheet FIRST so its default :root variables
// (--van-primary-color: var(--van-blue), etc.) land before our overrides.
// Without this, on-demand component CSS loaded by VantResolver injects
// its own :root with the default blue *after* our global.scss, beating
// our nude-pink theme on specificity-equal selectors.
import 'vant/lib/index.css';

// Our overrides — must come after Vant so :root specificity ties
// resolve in our favour (later wins).
import './styles/global.scss';

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);

const app = createApp(App);
app.use(pinia);
app.use(router);
app.mount('#app');
