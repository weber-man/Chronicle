<template>
  <section class="paper-panel panel-reveal rounded-[2rem] p-5" :aria-busy="loading">
    <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="text-sm font-medium text-stone-500">{{ t('eventList.kicker') }}</p>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">{{ t('eventList.heading') }}</h2>
      </div>
      <p class="text-sm text-stone-500">
        <span v-if="loading" class="inline-flex items-center gap-2"><span class="h-2 w-2 animate-pulse rounded-full bg-amber-800"></span>{{ t('eventList.loading') }}</span>
        <span v-else>{{ t(hasFilters ? 'eventList.countFound' : 'eventList.count', { count: pagination.total }) }}</span>
      </p>
    </div>

    <div class="paper-subtle mb-4 grid gap-3 rounded-3xl p-4 md:grid-cols-2 xl:grid-cols-5">
      <label class="grid gap-1 text-xs text-stone-500 xl:col-span-2">
        {{ t('eventList.search') }}
        <input
          v-model="searchDraft"
          class="paper-input w-full rounded-2xl px-3 py-2 text-sm"
          :placeholder="t('eventList.searchPlaceholder')"
          type="search"
          @input="scheduleSearch"
        />
      </label>

      <label class="grid gap-1 text-xs text-stone-500">
        {{ t('eventList.category') }}
        <select :value="query.category ?? 'all'" class="paper-input w-full rounded-2xl px-3 py-2 text-sm" @change="changeCategory(($event.target as HTMLSelectElement).value)">
          <option value="all">{{ t('common.allCategories') }}</option>
          <option v-for="category in facets.categories" :key="category.name" :value="category.name">{{ t('eventList.categoryCount', { name: category.name, count: category.count }) }}</option>
        </select>
      </label>

      <label class="grid gap-1 text-xs text-stone-500">
        {{ t('eventList.type') }}
        <select :value="query.type ?? 'all'" class="paper-input w-full rounded-2xl px-3 py-2 text-sm" @change="patch({ type: ($event.target as HTMLSelectElement).value as EventTypeFilter, page: 1 })">
          <option value="all">{{ t('eventList.typeAll') }}</option>
          <option value="points">{{ t('eventList.typePoints') }}</option>
          <option value="ranges">{{ t('eventList.typeRanges') }}</option>
          <option value="ongoing">{{ t('eventList.typeOngoing') }}</option>
        </select>
      </label>

      <label class="grid gap-1 text-xs text-stone-500">
        {{ t('eventList.sort') }}
        <select :value="query.sort ?? 'start-asc'" class="paper-input w-full rounded-2xl px-3 py-2 text-sm" @change="patch({ sort: ($event.target as HTMLSelectElement).value as EventSort, page: 1 })">
          <option value="start-asc">{{ t('eventList.sortStartAsc') }}</option>
          <option value="start-desc">{{ t('eventList.sortStartDesc') }}</option>
          <option value="duration-desc">{{ t('eventList.sortDurationDesc') }}</option>
          <option value="title-asc">{{ t('eventList.sortTitleAsc') }}</option>
          <option value="updated-desc">{{ t('eventList.sortUpdatedDesc') }}</option>
        </select>
      </label>

      <div class="flex flex-wrap items-center gap-2 md:col-span-2 xl:col-span-5">
        <button v-if="hasFilters" class="paper-button rounded-xl px-3 py-1.5 text-xs" type="button" @click="resetFilters">{{ t('eventList.resetFilters') }}</button>
        <span class="text-xs text-stone-500">{{ t('eventList.filterTip') }}</span>
        <label class="ml-auto flex items-center gap-2 text-xs text-stone-500">
          {{ t('common.perPage') }}
          <select :value="query.pageSize ?? 10" class="paper-input rounded-xl px-2 py-1.5 text-xs" @change="patch({ pageSize: Number(($event.target as HTMLSelectElement).value), page: 1 })">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="!loading && !events.length" class="rounded-3xl border border-dashed border-amber-900/20 bg-amber-50/50 px-5 py-14 text-center text-stone-500">
      <p v-if="hasFilters">{{ t('eventList.emptyFilters') }}</p>
      <p v-else>{{ t('eventList.emptyAll') }}</p>
      <button v-if="hasFilters" class="paper-button mt-4 rounded-2xl px-4 py-2 text-sm" type="button" @click="resetFilters">{{ t('eventList.resetFilters') }}</button>
    </div>

    <div v-else class="space-y-4" :class="{ 'opacity-60': loading }">
      <article v-for="event in events" :key="event.id" class="group list-card rounded-3xl border border-amber-900/18 bg-[rgba(255,251,242,0.74)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] transition hover:border-amber-900/28 hover:bg-[rgba(255,248,235,0.9)]">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full border border-amber-900/18 bg-amber-100/70 px-3 py-1 text-xs font-medium text-amber-950">{{ formatEventRange(event) }}</span>
              <button
                v-for="category in eventCategories(event.category)"
                :key="`${event.id}-${category}`"
                class="paper-chip rounded-full px-3 py-1 text-xs transition hover:text-stone-950"
                type="button"
                :aria-label="t('eventList.filterCategory', { category })"
                @click="changeCategory(category)"
              >{{ category }}</button>
              <span class="paper-chip rounded-full px-3 py-1 text-xs">{{ userName(event.userId) }}</span>
              <span v-if="event.endDate" class="rounded-full border border-emerald-900/15 bg-emerald-100/65 px-3 py-1 text-xs text-emerald-950">{{ eventDurationLabel(event) }}</span>
              <span v-if="event.isOngoing" class="rounded-full border border-sky-900/15 bg-sky-100/65 px-3 py-1 text-xs text-sky-950">{{ t('eventList.ongoingBadge') }}</span>
            </div>
            <div>
              <h3 class="paper-heading text-lg font-semibold text-stone-900">{{ event.title }}</h3>
              <p v-if="event.description" class="mt-2 max-w-3xl whitespace-pre-line text-sm leading-6 text-stone-600">{{ event.description }}</p>
            </div>
          </div>

          <div class="flex shrink-0 gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <button class="paper-button rounded-2xl px-4 py-2 text-sm hover:bg-white/95" type="button" @click="$emit('edit', event)">{{ t('eventList.edit') }}</button>
            <button class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-2 text-sm text-rose-950 hover:bg-rose-100" type="button" @click="$emit('remove', event)">{{ t('eventList.moveToTrash') }}</button>
          </div>
        </div>
      </article>
    </div>

    <div v-if="pagination.totalPages > 1" class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-amber-900/10 pt-4">
      <p class="text-xs text-stone-500">{{ t('common.pageOf', { page: pagination.page, total: pagination.totalPages }) }}</p>
      <div class="flex gap-2">
        <button class="paper-button rounded-xl px-3 py-1.5 text-sm disabled:opacity-40" type="button" :disabled="pagination.page <= 1 || loading" @click="patch({ page: pagination.page - 1 })">{{ t('common.back') }}</button>
        <button class="paper-button rounded-xl px-3 py-1.5 text-sm disabled:opacity-40" type="button" :disabled="pagination.page >= pagination.totalPages || loading" @click="patch({ page: pagination.page + 1 })">{{ t('common.next') }}</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { eventDurationLabel, formatEventRange } from '../lib/date';
import type { EventFacets, EventQuery, EventSort, EventTypeFilter, LifeEvent, Pagination, User } from '../lib/types';
import { splitCategories } from '../lib/types';

const props = defineProps<{
  events: LifeEvent[];
  users: User[];
  query: EventQuery;
  pagination: Pagination;
  facets: EventFacets;
  loading: boolean;
  hasFilters: boolean;
}>();

const emit = defineEmits<{
  'update-query': [patch: Partial<EventQuery>];
  edit: [event: LifeEvent];
  remove: [event: LifeEvent];
}>();

const { t } = useI18n();
const searchDraft = ref(props.query.search ?? '');
let searchTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.query.search,
  (value) => {
    if ((value ?? '') !== searchDraft.value) searchDraft.value = value ?? '';
  },
);

function scheduleSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    patch({ search: searchDraft.value.trim(), page: 1 });
  }, 260);
}

function patch(next: Partial<EventQuery>) {
  emit('update-query', next);
}

function changeCategory(category: string) {
  patch({ category: category === 'all' ? undefined : category, page: 1 });
}

function resetFilters() {
  if (searchTimer) clearTimeout(searchTimer);
  searchDraft.value = '';
  patch({ search: undefined, category: undefined, type: 'all', sort: 'start-asc', page: 1 });
}

function userName(userId: number) {
  return props.users.find((user) => user.id === userId)?.name ?? t('common.unknown');
}

function eventCategories(category: string) {
  return splitCategories(category);
}

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
});
</script>
