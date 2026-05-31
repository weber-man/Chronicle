<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,248,228,0.42),_transparent_32%),linear-gradient(180deg,rgba(247,235,208,0.62)_0%,rgba(225,208,175,0.56)_55%,rgba(211,191,151,0.62)_100%)] text-stone-800">
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header v-if="store.isAuthenticated" class="paper-panel mb-6 flex flex-col gap-4 rounded-[2rem] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="paper-chip mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
            Lifeline
          </p>
          <h1 class="paper-heading text-3xl font-semibold tracking-tight text-stone-900">Momente & Zeitspannen mit Kontext festhalten</h1>
          <p class="mt-2 text-sm text-stone-500">{{ store.me?.name }} · {{ store.me?.email }}<span v-if="store.isAdmin"> · Administrator</span></p>
        </div>

        <div class="flex items-center gap-3">
          <nav class="paper-nav paper-nav-tabs relative grid grid-cols-2 items-center gap-2 rounded-2xl p-1.5">
            <span class="paper-nav-indicator absolute top-1.5 bottom-1.5 left-1.5 rounded-xl" :style="indicatorStyle"></span>
            <RouterLink v-for="item in navItems" :key="item.to" :to="item.to" class="paper-nav-link relative z-10 rounded-xl px-4 py-2 text-sm font-medium transition">
              {{ item.label }}
            </RouterLink>
          </nav>
          <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium" @click="logout">Logout</button>
        </div>
      </header>

      <main class="flex-1">
        <div v-if="!store.authReady" class="paper-panel rounded-[2rem] p-8 text-center text-stone-500">Lade …</div>
        <RouterView v-else />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useLifelineStore } from './stores/lifeline';

const navItems = [
  { to: '/', label: 'Liste & Erfassen' },
  { to: '/timeline', label: 'Timeline' },
];

const store = useLifelineStore();
const route = useRoute();
const router = useRouter();

const activeNavIndex = computed(() => {
  const currentPath = route.path === '/timeline' ? '/timeline' : '/';
  return Math.max(navItems.findIndex((item) => item.to === currentPath), 0);
});

const indicatorStyle = computed(() => ({
  width: `calc((100% - 0.5rem) / ${navItems.length})`,
  transform: `translateX(calc(${activeNavIndex.value} * 100% + ${activeNavIndex.value} * 0.5rem))`,
}));

onMounted(async () => {
  await store.bootstrap();
});

watch(
  () => [store.authReady, store.isAuthenticated, route.name],
  async ([ready, authenticated, routeName]) => {
    if (!ready) return;
    if (!authenticated && routeName !== 'login') {
      await router.replace({ name: 'login' });
    }
    if (authenticated && routeName === 'login') {
      await router.replace({ name: 'dashboard' });
    }
  },
  { immediate: true },
);

async function logout() {
  await store.logout();
  await router.replace({ name: 'login' });
}
</script>
