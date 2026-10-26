<template>
  <div class="space-y-6">
    <div class="flex flex-wrap justify-end gap-3">
      <button v-if="isDevelopment" class="paper-button rounded-2xl px-5 py-3 text-sm font-medium disabled:opacity-60" type="button" :disabled="creatingDemoEvents" @click="createDemoEvents">
        {{ creatingDemoEvents ? t('dashboard.creatingDemoEvents') : t('dashboard.createDemoEvents') }}
      </button>
      <button class="ink-button rounded-2xl px-5 py-3 font-medium" type="button" @click="openEditor('manual')">+ {{ t('eventForm.modeCreate') }}</button>
    </div>

    <EventEditorOverlay v-if="editorOpen" :editing-event="editingEvent" :initial-mode="editorMode" @close="closeEditor" />

    <EventList
      :events="store.events"
      :users="store.users"
      :query="store.query"
      :pagination="store.pagination"
      :facets="store.facets"
      :loading="store.isLoading"
      :has-filters="store.hasFilters"
      @update-query="applyQuery"
      @edit="startEditing"
      @remove="removeEvent"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import EventEditorOverlay from '../components/EventEditorOverlay.vue';
import EventList from '../components/EventList.vue';
import { translateApiError } from '../i18n';
import type { EventQuery, LifeEvent } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const store = useLifelineStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const editingEvent = ref<LifeEvent | null>(null);
const editorOpen = ref(false);
const editorMode = ref<'manual' | 'ai'>('manual');
const isDevelopment = import.meta.env.DEV && import.meta.env.MODE === 'development';
const creatingDemoEvents = ref(false);

async function createDemoEvents() {
  if (isDevelopment) {
    if (creatingDemoEvents.value) return;
    creatingDemoEvents.value = true;
    try {
      const { createRandomEvents } = await import('../lib/dev-events');
      await store.importData({ events: createRandomEvents() });
    } catch (error) {
      toast.error(translateApiError(error) || t('dashboard.demoEventsFailed'));
    } finally {
      creatingDemoEvents.value = false;
    }
  }
}

watch([() => route.query.capture, () => route.hash], ([capture, hash], previous) => {
  if (capture === 'ai') openEditor('ai');
  else if (capture === 'manual' || hash === '#event-form') openEditor('manual');
  else if (previous?.[0] || previous?.[1] === '#event-form') {
    editorOpen.value = false;
    editingEvent.value = null;
  }
}, { immediate: true });

onMounted(async () => {
  const initialSearch = typeof route.query.search === 'string' ? route.query.search : '';
  await applyQuery({
    search: initialSearch || undefined,
    page: 1,
    pageSize: store.query.pageSize ?? 10,
    type: 'all',
    sort: 'start-asc',
  });
  if (initialSearch) toast.info(t('dashboard.filteredBy', { term: initialSearch }));
});

watch(
  () => route.query.search,
  async (value) => {
    const search = typeof value === 'string' ? value : '';
    if (search === (store.query.search ?? '')) return;
    await applyQuery({ search: search || undefined, page: 1 });
  },
);

async function applyQuery(patch: Partial<EventQuery>) {
  try {
    await store.loadEvents(patch);
  } catch (error) {
    toast.error(translateApiError(error) || t('dashboard.loadFailed'));
  }
  if ('search' in patch) {
    const current = typeof route.query.search === 'string' ? route.query.search : '';
    const next = patch.search ?? '';
    if (next !== current) {
      const query = { ...route.query };
      if (next) query.search = next;
      else delete query.search;
      await router.replace({ query });
    }
  }
}

async function removeEvent(event: LifeEvent) {
  if (!window.confirm(t('common.confirmMoveToTrash', { title: event.title }))) return;
  if (editingEvent.value?.id === event.id) editingEvent.value = null;
  try {
    await store.removeEvent(event.id);
  } catch (error) {
    toast.error(translateApiError(error) || t('dashboard.loadFailed'));
  }
}

function openEditor(mode: 'manual' | 'ai') {
  editingEvent.value = null;
  editorMode.value = mode;
  editorOpen.value = true;
}

async function closeEditor() {
  editorOpen.value = false;
  editingEvent.value = null;
  if (route.query.capture || route.hash === '#event-form') {
    const query = { ...route.query };
    delete query.capture;
    await router.replace({ query, hash: route.hash === '#event-form' ? '' : route.hash });
  }
}

function startEditing(event: LifeEvent) {
  editingEvent.value = event;
  editorMode.value = 'manual';
  editorOpen.value = true;
}
</script>
