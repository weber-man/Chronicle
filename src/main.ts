import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { i18n } from './i18n';
import { useToastStore } from './stores/toast';
import './assets/main.css';

const pinia = createPinia();
const app = createApp(App).use(pinia).use(router).use(i18n);
const toast = useToastStore(pinia);

app.config.errorHandler = (error) => {
  console.error('[chronicles] unhandled component error', error);
  toast.error(i18n.global.t('login.actionFailed'));
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[chronicles] unhandled rejection', event.reason);
  toast.error(i18n.global.t('login.actionFailed'));
});

app.mount('#app');
