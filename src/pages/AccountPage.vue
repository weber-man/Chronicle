<template>
  <section class="paper-panel min-h-[calc(100vh-3rem)] rounded-[2rem] p-5 sm:p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <p class="paper-chip mb-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">Chronicles</p>
        <h1 class="paper-heading text-2xl font-semibold text-stone-900">Account</h1>
        <p class="mt-1 text-sm text-stone-500">Verwalte Profil, Passwort und Benutzerverwaltung an einem Ort.</p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium" type="button" @click="logout">Abmelden</button>
        <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium" type="button" @click="close">✕ Schließen</button>
      </div>
    </div>

    <UserPanel />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UserPanel from '../components/UserPanel.vue';
import { useLifelineStore } from '../stores/lifeline';

const store = useLifelineStore();
const route = useRoute();
const router = useRouter();

const returnPath = computed(() => {
  const from = typeof route.query.from === 'string' ? route.query.from : '/';
  return from === '/timeline' ? '/timeline' : '/';
});

async function close() {
  await router.push(returnPath.value);
}

async function logout() {
  await store.logout();
  await router.replace({ name: 'login' });
}
</script>
