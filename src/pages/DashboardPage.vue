<template>
  <div class="space-y-6">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard :label="t('dashboard.statEvents')" :value="store.summary.totalEvents" :hint="t('dashboard.statEventsHint')" />
      <StatCard :label="t('dashboard.statCategories')" :value="store.summary.totalCategories" :hint="t('dashboard.statCategoriesHint')" />
      <StatCard :label="t('dashboard.statRange')" :value="rangeLabel" :hint="t('dashboard.statRangeHint', { count: store.summary.ongoingEvents })" />
      <StatCard :label="t('dashboard.statTrash')" :value="store.summary.trashEvents" :hint="t('dashboard.statTrashHint')" />
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import EventForm from '../components/EventForm.vue';
import EventList from '../components/EventList.vue';
import StatCard from '../components/StatCard.vue';
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
const eventFormRef = ref<InstanceType<typeof EventForm> | null>(null);

const rangeLabel = computed(() => (store.summary.totalEvents ? store.summary.rangeLabel : t('common.nothingYet')));

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

async function startEditing(event: LifeEvent) {
  editingEvent.value = event;
  await nextTick();
  document.getElementById('event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
</script>
