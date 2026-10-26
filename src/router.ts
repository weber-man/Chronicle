import { createRouter, createWebHistory } from 'vue-router';
import { i18n } from './i18n';
import AccountPage from './pages/AccountPage.vue';
import AssistantPage from './pages/AssistantPage.vue';
import DashboardPage from './pages/DashboardPage.vue';
import InsightsPage from './pages/InsightsPage.vue';
import LoginPage from './pages/LoginPage.vue';
import NotFoundPage from './pages/NotFoundPage.vue';
import TimelinePage from './pages/TimelinePage.vue';
import TrashPage from './pages/TrashPage.vue';

function pageTitleKey(name: string) {
  switch (name) {
    case 'dashboard': return 'app.nav.list';
    case 'timeline': return 'app.nav.timeline';
    case 'insights': return 'app.nav.insights';
    case 'assistant': return 'app.nav.ai';
    case 'trash': return 'app.nav.trash';
    case 'account': return 'account.heading';
    case 'login': return 'login.headingLogin';
    case 'not-found': return 'notFound.heading';
    default: return '';
  }
}

export function refreshDocumentTitle() {
  const name = router.currentRoute.value.name ? String(router.currentRoute.value.name) : '';
  const key = pageTitleKey(name);
  const title = key ? i18n.global.t(key) : 'Chronicles';
  document.title = `${title} · Chronicles`;
}

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

router.afterEach(() => {
  refreshDocumentTitle();
});

export default router;
