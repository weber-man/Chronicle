<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Ereignisse" :value="store.summary.totalEvents" hint="Zeitpunkte und Zeitspannen zusammen" />
      <StatCard label="Kategorien" :value="store.summary.totalCategories" hint="Themen in deinem Archiv" />
      <StatCard label="Zeitraum" :value="store.summary.rangeLabel" :hint="`${store.summary.ongoingEvents} laufende Einträge`" />
      <StatCard label="Papierkorb" :value="store.summary.trashEvents" hint="Jederzeit wiederherstellbar" />
    </div>

    <EventForm ref="eventFormRef" :editing-event="editingEvent" @saved="editingEvent = null" @cancel="editingEvent = null" />

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
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import EventForm from '../components/EventForm.vue';
import EventList from '../components/EventList.vue';
import StatCard from '../components/StatCard.vue';
import type { EventQuery, LifeEvent } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const store = useLifelineStore();
const toast = useToastStore();
const route = useRoute();
const router = useRouter();
const editingEvent = ref<LifeEvent | null>(null);
const eventFormRef = ref<InstanceType<typeof EventForm> | null>(null);

onMounted(async () => {
  const initialSearch = typeof route.query.search === 'string' ? route.query.search : '';
  await applyQuery({
    search: initialSearch || undefined,
    page: 1,
    pageSize: store.query.pageSize ?? 10,
    type: 'all',
    sort: 'start-asc',
  });
  if (initialSearch) toast.info(`Gefiltert nach „${initialSearch}“.`);
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
    toast.error(error instanceof Error ? error.message : 'Ereignisse konnten nicht geladen werden.');
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
  if (!window.confirm(`"${event.title}" in den Papierkorb verschieben?`)) return;
  if (editingEvent.value?.id === event.id) editingEvent.value = null;
  try {
    await store.removeEvent(event.id);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Ereignis konnte nicht gelöscht werden.');
  }
}

async function startEditing(event: LifeEvent) {
  editingEvent.value = event;
  await nextTick();
  document.getElementById('event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
