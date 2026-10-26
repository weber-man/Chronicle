<template>
  <div class="timeline-page">
    <div v-if="store.isLoading && !store.events.length" class="paper-panel panel-reveal rounded-[2rem] p-8 text-center text-stone-500">
      {{ t('timeline.loading') }}
    </div>
    <TimelineCanvas v-else :events="store.events" :users="store.users" @edit="editingEvent = $event" />
    <EventEditorOverlay v-if="editingEvent" :editing-event="editingEvent" initial-mode="manual" @close="editingEvent = null" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TimelineCanvas from '../components/TimelineCanvas.vue';
import EventEditorOverlay from '../components/EventEditorOverlay.vue';
import type { LifeEvent } from '../lib/types';
import { translateApiError } from '../i18n';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const editingEvent = ref<LifeEvent | null>(null);
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
