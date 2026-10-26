<template>
  <div class="space-y-6">
    <div v-if="store.isLoadingInsights && !store.insights" class="paper-panel panel-reveal rounded-[2rem] p-10 text-center text-stone-500">
      {{ t('insights.calculating') }}
    </div>
    <InsightsPanel v-else-if="store.insights" :insights="store.insights" />
    <div v-else class="paper-panel panel-reveal rounded-[2rem] p-10 text-center text-stone-500">
      <p>{{ t('insights.loadFailed') }}</p>
      <button class="paper-button mt-4 rounded-2xl px-4 py-2 text-sm" type="button" @click="load">{{ t('assistant.retry') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import InsightsPanel from '../components/InsightsPanel.vue';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const store = useLifelineStore();
const toast = useToastStore();

onMounted(load);

async function load() {
  try {
    await store.loadInsights();
  } catch (error) {
    toast.error(translateApiError(error) || t('insights.loadFailed'));
  }
}
</script>
