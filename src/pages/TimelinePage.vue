<template>
  <div class="space-y-6">
    <div v-if="store.isLoading && !store.events.length" class="paper-panel panel-reveal rounded-[2rem] p-8 text-center text-stone-500">
      {{ t('timeline.loading') }}
    </div>
    <TimelineCanvas v-else :events="store.events" :users="store.users" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import TimelineCanvas from '../components/TimelineCanvas.vue';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const store = useLifelineStore();
const toast = useToastStore();

onMounted(async () => {
  try {
    await store.loadAllEvents();
  } catch (error) {
    toast.error(translateApiError(error) || t('timeline.loadFailed'));
  }
});
</script>
