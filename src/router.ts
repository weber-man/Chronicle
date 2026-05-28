import { createRouter, createWebHistory } from 'vue-router';
import DashboardPage from './pages/DashboardPage.vue';
import TimelinePage from './pages/TimelinePage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardPage },
    { path: '/timeline', name: 'timeline', component: TimelinePage },
  ],
});

export default router;
