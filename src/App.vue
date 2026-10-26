<template>
  <div class="app-shell min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,248,228,0.42),_transparent_32%),linear-gradient(180deg,rgba(247,235,208,0.62)_0%,rgba(225,208,175,0.56)_55%,rgba(211,191,151,0.62)_100%)] text-stone-800">
    <a class="skip-link" href="#main-content">Zum Inhalt springen</a>
    <div class="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8">
      <header v-if="store.isAuthenticated && route.name !== 'account'" class="paper-panel hero-panel mb-6 flex flex-col gap-4 rounded-[2rem] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="paper-chip mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
            Chronicles
          </p>
          <h1 class="paper-heading text-3xl font-semibold tracking-tight text-stone-900">Momente & Zeitspannen mit Kontext festhalten</h1>
          <p class="mt-2 text-sm text-stone-500">{{ store.me?.name }} · {{ store.me?.email }}<span v-if="store.isAdmin"> · Administrator</span></p>
        </div>

        <div class="flex flex-col items-stretch gap-3 sm:items-end">
          <div class="flex flex-wrap items-center justify-end gap-2">
            <button
              class="search-button group inline-flex h-12 items-center gap-2.5 rounded-2xl px-3 text-left"
              type="button"
              aria-label="Globale Suche öffnen (Strg oder Cmd plus K)"
              @click="paletteOpen = true"
            >
              <span class="search-button-icon grid h-8 w-8 shrink-0 place-items-center rounded-xl" aria-hidden="true">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round">
                  <circle cx="10.5" cy="10.5" r="6.5" />
                  <path d="m15.4 15.4 4.1 4.1" />
                </svg>
              </span>
              <span class="min-w-0">
                <span class="block text-xs text-stone-500">Schnellsuche</span>
                <span class="block text-sm font-medium leading-5 text-stone-900">Suchen</span>
              </span>
              <kbd class="ml-1 hidden rounded-lg border border-amber-900/15 bg-white/55 px-1.5 py-1 text-[10px] font-medium text-stone-500 lg:inline-flex">⌘ K</kbd>
            </button>
            <button
              class="account-button h-12 w-12 shrink-0 justify-center rounded-2xl p-0"
              type="button"
              :aria-label="`Account von ${store.me?.name ?? 'Benutzer'} öffnen`"
              :title="`${store.me?.name ?? 'Account'} · Account & Einstellungen`"
              @click="openAccount"
            >
              <span class="account-avatar" :style="{ backgroundColor: store.me?.color ?? '#7c3aed' }">{{ accountInitial }}</span>
            </button>
          </div>
          <SegmentedTabs :items="navItems" :model-value="activeNav" @update:model-value="openSection" />
        </div>
      </header>

      <main id="main-content" class="flex-1">
        <div v-if="!store.authReady" class="paper-panel panel-reveal rounded-[2rem] p-8 text-center text-stone-500">Lade …</div>
        <RouterView v-else v-slot="{ Component, route: currentRoute }">
          <Transition name="route-fade" mode="out-in">
            <component :is="Component" :key="currentRoute.fullPath" />
          </Transition>
        </RouterView>
      </main>

      <footer v-if="store.isAuthenticated && route.name !== 'account'" class="mt-6 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-stone-500/80">
        <span>Chronicles {{ store.appVersion ? `v${store.appVersion}` : '' }} · Daten bleiben in deiner SQLite-Datei.</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-1.5 w-1.5 rounded-full bg-emerald-700/70"></span> Automatische Backups vor Migrationen</span>
      </footer>
    </div>

    <CommandPalette v-if="store.isAuthenticated" v-model:open="paletteOpen" />
    <ToastStack />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CommandPalette from './components/CommandPalette.vue';
import SegmentedTabs from './components/SegmentedTabs.vue';
import ToastStack from './components/ToastStack.vue';
import { useAiStore } from './stores/ai';
import { useLifelineStore } from './stores/lifeline';

const store = useLifelineStore();
const aiStore = useAiStore();
const route = useRoute();
const router = useRouter();
const paletteOpen = ref(false);

const navItems = computed(() => [
  { value: '/', label: 'Liste' },
  { value: '/timeline', label: 'Timeline', shortLabel: 'Zeit' },
  { value: '/insights', label: 'Insights', shortLabel: 'Stats' },
  { value: '/assistant', label: 'KI' },
  { value: '/trash', label: store.trashCount > 0 ? `Papierkorb · ${store.trashCount}` : 'Papierkorb', shortLabel: 'Korb' },
]);

const activeNav = computed(() => (navItems.value.some((item) => item.value === route.path) ? route.path : '/'));
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
    if (authenticated) {
      aiStore.prefetchModels();
    }
    if (authenticated && routeName === 'login') {
      await router.replace({ name: 'dashboard' });
    }
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => {
    paletteOpen.value = false;
  },
);

async function openSection(path: string) {
  if (route.path === path) return;
  await router.push(path);
}

async function openAccount() {
  const from = navItems.value.some((item) => item.value === route.path) ? route.path : '/';
  await router.push({ name: 'account', query: { from } });
}
</script>
