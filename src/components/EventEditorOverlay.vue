<template>
  <Teleport to="body">
    <dialog ref="dialog" class="event-editor m-auto max-h-[90dvh] w-[calc(100%_-_1.5rem)] max-w-4xl overflow-y-auto rounded-[2rem] border border-amber-900/20 bg-[#fcf6e8] p-3 text-stone-800 shadow-2xl sm:p-5" aria-labelledby="event-editor-title" @cancel.prevent="close">
      <div class="mb-4 flex items-center justify-between gap-3 px-2">
        <h2 id="event-editor-title" class="paper-heading text-xl font-semibold">{{ editingEvent ? t('eventForm.modeEdit') : t('eventForm.modeCreate') }}</h2>
        <button class="paper-button rounded-xl px-3 py-2 text-sm disabled:opacity-50" type="button" :disabled="busy" @click="close">{{ t('common.close') }}</button>
      </div>

      <div v-if="!editingEvent" class="mb-4 flex gap-2 px-2" role="group" :aria-label="t('eventEditor.method')">
        <button v-for="option in methods" :key="option.value" type="button" class="rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50" :class="mode === option.value ? 'ink-button' : 'paper-button'" :aria-pressed="mode === option.value" :disabled="busy" @click="mode = option.value">{{ option.label }}</button>
      </div>

      <EventForm v-show="mode === 'manual'" :editing-event="editingEvent" @saved="emit('close')" @busy-change="busy = $event" />
      <div v-if="aiOpened" v-show="mode === 'ai'">
        <p v-if="loading" class="p-5 text-sm text-stone-500" role="status">{{ t('assistant.loadingSettings') }}</p>
        <div v-else-if="loadError" class="paper-subtle rounded-3xl p-5" role="alert">
          <p class="text-sm text-rose-950">{{ loadError }}</p>
          <button class="paper-button mt-3 rounded-xl px-4 py-2 text-sm" type="button" @click="loadAi">{{ t('assistant.retry') }}</button>
        </div>
        <template v-else-if="ai.configured && !ai.settings?.needsReentry">
          <AiComposer @saved="emit('close')" @busy-change="busy = $event" />
          <p class="px-5 pt-3 text-xs leading-5 text-stone-500">{{ t('assistant.dataNote2') }}</p>
        </template>
        <div v-else class="paper-subtle rounded-3xl p-5">
          <p class="text-sm leading-6 text-stone-600">{{ t('eventEditor.setupHint') }}</p>
          <RouterLink class="ink-button mt-4 inline-flex rounded-xl px-4 py-2 text-sm" :to="{ name: 'account', query: { from: '/', capture: 'ai' } }">{{ t('eventEditor.openSettings') }}</RouterLink>
        </div>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { translateApiError } from '../i18n';
import type { LifeEvent } from '../lib/types';
import { useAiStore } from '../stores/ai';
import AiComposer from './AiComposer.vue';
import EventForm from './EventForm.vue';

const props = defineProps<{ editingEvent: LifeEvent | null; initialMode: 'manual' | 'ai' }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const ai = useAiStore();
const dialog = ref<HTMLDialogElement | null>(null);
const mode = ref(props.editingEvent ? 'manual' : props.initialMode);
const aiOpened = ref(false);
const busy = ref(false);
const loading = ref(false);
const loadError = ref('');
const methods = computed(() => [
  { value: 'manual', label: t('eventEditor.manual') },
  { value: 'ai', label: t('eventEditor.ai') },
] as const);
let previousOverflow = '';

async function loadAi() {
  loading.value = true;
  loadError.value = '';
  try {
    await ai.loadSettings();
  } catch (error) {
    loadError.value = translateApiError(error) || t('assistant.loadFailed');
  } finally {
    loading.value = false;
  }
}

watch(mode, (value) => {
  if (value === 'ai' && !aiOpened.value) {
    aiOpened.value = true;
    void loadAi();
  }
}, { immediate: true });

function close() {
  if (!busy.value) emit('close');
}

onMounted(() => {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dialog.value?.showModal();
});

onBeforeUnmount(() => {
  dialog.value?.close();
  document.body.style.overflow = previousOverflow;
});
</script>

<style scoped>
.event-editor::backdrop {
  background: rgba(40, 30, 20, 0.5);
  backdrop-filter: blur(4px);
}
</style>
