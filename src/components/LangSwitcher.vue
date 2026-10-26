<template>
  <div class="flex items-center gap-1 rounded-full border border-amber-900/15 bg-white/45 p-0.5" role="group" :aria-label="t('lang.switchLabel')">
    <button
      v-for="locale in SUPPORTED_LOCALES"
      :key="locale"
      type="button"
      class="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition"
      :class="current === locale ? 'bg-amber-900 text-amber-50' : 'text-stone-500 hover:text-stone-800'"
      :aria-pressed="current === locale"
      @click="changeLocale(locale)"
    >
      {{ locale }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { currentLocale, setLocale, SUPPORTED_LOCALES, type AppLocale } from '../i18n';
import { refreshDocumentTitle } from '../router';

const { t } = useI18n();
const current = computed<AppLocale>(() => currentLocale());

function changeLocale(locale: AppLocale) {
  setLocale(locale);
  refreshDocumentTitle();
}
</script>
