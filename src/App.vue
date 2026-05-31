<template>
  <div class="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,248,228,0.42),_transparent_32%),linear-gradient(180deg,rgba(247,235,208,0.62)_0%,rgba(225,208,175,0.56)_55%,rgba(211,191,151,0.62)_100%)] text-stone-800">
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header v-if="store.isAuthenticated && route.name !== 'account'" class="paper-panel mb-6 flex flex-col gap-4 rounded-[2rem] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="paper-chip mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
            Chronicles
          </p>
          <h1 class="paper-heading text-3xl font-semibold tracking-tight text-stone-900">Momente & Zeitspannen mit Kontext festhalten</h1>
          <p class="mt-2 text-sm text-stone-500">{{ store.me?.name }} · {{ store.me?.email }}<span v-if="store.isAdmin"> · Administrator</span></p>
        </div>

        <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <SegmentedTabs :items="navItems" :model-value="activeNav" @update:model-value="openSection" />
          <div class="flex items-center gap-3 sm:pl-1">
            <button class="account-button rounded-2xl px-3 py-2 transition" type="button" @click="openAccount">
              <span class="account-avatar" :style="{ backgroundColor: store.me?.color ?? '#7c3aed' }">{{ accountInitial }}</span>
              <span class="min-w-0">
                <span class="block text-xs text-stone-500">Account</span>
                <span class="block truncate text-sm font-medium text-stone-900">{{ store.me?.name }}</span>
              </span>
            </button>
            <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium" @click="logout">Logout</button>
          </div>
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
import SegmentedTabs from './components/SegmentedTabs.vue';
import { useLifelineStore } from './stores/lifeline';

const navItems = [
  { value: '/', label: 'Liste & Erfassen' },
  { value: '/timeline', label: 'Timeline' },
];

const store = useLifelineStore();
const route = useRoute();
const router = useRouter();

const activeNav = computed(() => (navItems.some((item) => item.value === route.path) ? route.path : '/'));
const accountInitial = computed(() => (store.me?.name?.trim().charAt(0) || 'A').toUpperCase());

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

async function openSection(path: string) {
  if (route.path === path) return;
  await router.push(path);
}

async function openAccount() {
  const from = activeNav.value || '/';
  await router.push({ name: 'account', query: { from } });
}
</script>
