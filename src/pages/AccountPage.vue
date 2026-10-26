<template>
  <div class="space-y-6">
    <section class="paper-panel min-h-[calc(100vh-3rem)] rounded-[2rem] p-5 sm:p-6">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="paper-chip mb-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">{{ t('account.kicker') }}</p>
          <h1 class="paper-heading text-2xl font-semibold text-stone-900">{{ t('account.heading') }}</h1>
          <p class="mt-1 text-sm text-stone-500">{{ t('account.subtitle') }}</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <LangSwitcher />
          <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium" type="button" @click="logout">{{ t('account.logout') }}</button>
          <button class="paper-button rounded-2xl px-4 py-2 text-sm font-medium" type="button" @click="close">{{ t('account.close') }}</button>
        </div>
      </div>

      <UserPanel />

      <div class="mt-6">
        <p v-if="aiLoading" class="p-5 text-sm text-stone-500" role="status">{{ t('assistant.loadingSettings') }}</p>
        <div v-else-if="aiError" class="paper-subtle rounded-3xl p-5" role="alert">
          <p class="text-sm text-rose-950">{{ aiError }}</p>
          <button class="paper-button mt-3 rounded-xl px-4 py-2 text-sm" type="button" @click="loadAi">{{ t('assistant.retry') }}</button>
        </div>
        <AiSettingsPanel v-else />
      </div>
    </section>

    <DataPanel />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import DataPanel from '../components/DataPanel.vue';
import AiSettingsPanel from '../components/AiSettingsPanel.vue';
import LangSwitcher from '../components/LangSwitcher.vue';
import UserPanel from '../components/UserPanel.vue';
import { useLifelineStore } from '../stores/lifeline';
import { useAiStore } from '../stores/ai';
import { translateApiError } from '../i18n';

const { t } = useI18n();
const store = useLifelineStore();
const route = useRoute();
const router = useRouter();
const ai = useAiStore();
const aiLoading = ref(true);
const aiError = ref('');

onMounted(loadAi);

async function loadAi() {
  aiLoading.value = true;
  aiError.value = '';
  try {
    await ai.ensureLoaded();
  } catch (error) {
    aiError.value = translateApiError(error) || t('assistant.loadFailed');
  } finally {
    aiLoading.value = false;
  }
}

const returnPath = computed(() => {
  const from = typeof route.query.from === 'string' ? route.query.from : '/';
  return ['/', '/timeline', '/insights', '/trash'].includes(from) ? from : '/';
});

async function close() {
  await router.push({ path: returnPath.value, query: route.query.capture === 'ai' ? { capture: 'ai' } : {} });
}

async function logout() {
  await store.logout();
  await router.replace({ name: 'login' });
}
</script>
