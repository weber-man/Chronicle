import { createRouter, createWebHistory } from 'vue-router';
import AccountPage from './pages/AccountPage.vue';
import AssistantPage from './pages/AssistantPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import InsightsPage from './pages/InsightsPage.vue';
import LoginPage from './pages/LoginPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import TimelinePage from './pages/TimelinePage.vue';
import TrashPage from './pages/TrashPage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardPage },
    { path: '/timeline', name: 'timeline', component: TimelinePage },
    { path: '/insights', name: 'insights', component: InsightsPage },
    { path: '/assistant', name: 'assistant', component: AssistantPage },
    { path: '/trash', name: 'trash', component: TrashPage },
    { path: '/account', name: 'account', component: AccountPage },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundPage },
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.hash) return { el: to.hash, behavior: 'smooth' };
    return { top: 0 };
  },
});

router.afterEach((to) => {
  const titles: Record<string, string> = {
    dashboard: 'Liste & Erfassen',
    timeline: 'Timeline',
    insights: 'Insights',
    assistant: 'KI-Assistent',
    trash: 'Papierkorb',
    account: 'Account',
    login: 'Anmelden',
    'not-found': 'Nicht gefunden',
  };
  document.title = `${titles[String(to.name)] ?? 'Chronicles'} · Chronicles`;
});

export default router;
