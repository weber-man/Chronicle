import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import router from './router';
import { useToastStore } from './stores/toast';
import './assets/main.css';

const pinia = createPinia();
const app = createApp(App).use(pinia).use(router);
const toast = useToastStore(pinia);

app.config.errorHandler = (error) => {
  console.error('[chronicles] unhandled component error', error);
  toast.error(error instanceof Error ? error.message : 'Unerwarteter Fehler in der Oberfläche.');
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[chronicles] unhandled rejection', event.reason);
  const message = event.reason instanceof Error ? event.reason.message : 'Unerwarteter Fehler.';
  toast.error(message);
});

app.mount('#app');
