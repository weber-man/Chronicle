<template>
  <div class="space-y-6">
    <div v-if="store.isLoadingInsights && !store.insights" class="paper-panel panel-reveal rounded-[2rem] p-10 text-center text-stone-500">
      Insights werden berechnet …
    </div>
    <InsightsPanel v-else-if="store.insights" :insights="store.insights" />
    <div v-else class="paper-panel panel-reveal rounded-[2rem] p-10 text-center text-stone-500">
      <p>Insights konnten nicht geladen werden.</p>
      <button class="paper-button mt-4 rounded-2xl px-4 py-2 text-sm" type="button" @click="load">Erneut versuchen</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import InsightsPanel from '../components/InsightsPanel.vue';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const store = useLifelineStore();
const toast = useToastStore();

onMounted(load);

async function load() {
  try {
    await store.loadInsights();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Insights konnten nicht geladen werden.');
  }
}
</script>
