<template>
  <section class="paper-panel panel-reveal mx-auto max-w-2xl rounded-[2rem] p-8 text-center">
    <p class="paper-chip mx-auto mb-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-amber-900">404</p>
    <h1 class="paper-heading text-3xl font-semibold text-stone-900">{{ t('notFound.heading') }}</h1>
    <p class="mt-3 text-sm text-stone-500">{{ t('notFound.text') }}</p>
    <RouterLink :to="{ name: 'dashboard' }" class="ink-button mt-6 inline-flex rounded-2xl px-5 py-3 text-sm font-medium">{{ t('notFound.back') }}</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>
