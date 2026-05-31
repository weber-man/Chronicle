import { createRouter, createWebHistory } from 'vue-router';
import AccountPage from './pages/AccountPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import LoginPage from './pages/LoginPage.vue';
import TimelinePage from './pages/TimelinePage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardPage },
    { path: '/timeline', name: 'timeline', component: TimelinePage },
    { path: '/account', name: 'account', component: AccountPage },
    { path: '/login', name: 'login', component: LoginPage },
  ],
});

export default router;
