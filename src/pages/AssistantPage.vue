<template>
  <div class="space-y-6">
    <section class="paper-panel panel-reveal rounded-[2rem] p-5 sm:p-7">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="max-w-3xl">
          <p class="paper-chip mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">
            <span aria-hidden="true">✦</span> OpenRouter
          </p>
          <h1 class="paper-heading text-2xl font-semibold text-stone-900 sm:text-3xl">{{ t('assistant.heading') }}</h1>
          <p class="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
            {{ t('assistant.intro') }}
          </p>
        </div>
        <span class="ai-orbit hidden h-16 w-16 shrink-0 place-items-center rounded-[1.4rem] border border-amber-900/15 bg-amber-100/55 text-2xl text-amber-900 sm:grid" aria-hidden="true">
          ✦
        </span>
      </div>

      <div v-if="loading" class="mt-7 grid gap-4 lg:grid-cols-3" aria-live="polite">
        <div class="h-36 animate-pulse rounded-3xl bg-amber-900/[0.06]"></div>
        <div class="h-36 animate-pulse rounded-3xl bg-amber-900/[0.06]"></div>
        <div class="h-36 animate-pulse rounded-3xl bg-amber-900/[0.06]"></div>
        <span class="sr-only">{{ t('assistant.loadingSettings') }}</span>
      </div>

      <div v-else-if="loadError" class="mt-7 rounded-3xl border border-rose-900/15 bg-rose-100/60 p-5" role="alert">
        <p class="font-medium text-rose-950">{{ t('assistant.loadErrorTitle') }}</p>
        <p class="mt-1 text-sm text-rose-900">{{ loadError }}</p>
        <button class="paper-button mt-4 rounded-2xl px-4 py-2 text-sm" type="button" @click="load">{{ t('assistant.retry') }}</button>
      </div>

      <div v-else-if="!store.configured" class="mt-7 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
        <div class="grid content-start gap-3">
          <div v-for="feature in features" :key="feature.title" class="paper-subtle rounded-3xl p-4">
            <div class="flex items-start gap-3">
              <span class="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-900/10 text-sm text-amber-950" aria-hidden="true">{{ feature.icon }}</span>
              <div>
                <p class="text-sm font-medium text-stone-900">{{ feature.title }}</p>
                <p class="mt-1 text-xs leading-5 text-stone-500">{{ feature.text }}</p>
              </div>
            </div>
          </div>
          <p class="rounded-2xl border border-amber-900/15 bg-amber-50/50 px-4 py-3 text-xs leading-5 text-stone-600">
            {{ t('assistant.dataNote1') }}
          </p>
        </div>

        <AiSettingsPanel />
      </div>

      <div v-else class="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <AiComposer />
        <div class="grid gap-4">
          <AiSettingsPanel />
          <p class="rounded-2xl border border-amber-900/15 bg-amber-50/50 px-4 py-3 text-xs leading-5 text-stone-600">
            {{ t('assistant.dataNote2') }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AiComposer from '../components/AiComposer.vue';
import AiSettingsPanel from '../components/AiSettingsPanel.vue';
import { translateApiError } from '../i18n';
import { useAiStore } from '../stores/ai';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const store = useAiStore();
const toast = useToastStore();
const loading = ref(true);
const loadError = ref('');

const features = computed(() => [
  {
    icon: '✎',
    title: t('assistant.feature1Title'),
    text: t('assistant.feature1Text'),
  },
  {
    icon: '◉',
    title: t('assistant.feature2Title'),
    text: t('assistant.feature2Text'),
  },
  {
    icon: '↺',
    title: t('assistant.feature3Title'),
    text: t('assistant.feature3Text'),
  },
]);

onMounted(load);

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    await store.ensureLoaded();
  } catch (error) {
    loadError.value = translateApiError(error) || t('login.actionFailed');
    toast.error(t('assistant.loadFailed'));
  } finally {
    loading.value = false;
  }
}
</script>
