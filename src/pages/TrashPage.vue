<template>
  <div class="space-y-6">
    <section class="paper-panel panel-reveal rounded-[2rem] p-5 sm:p-6">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-sm font-medium text-stone-500">{{ t('trash.kicker') }}</p>
          <h1 class="paper-heading text-2xl font-semibold text-stone-900">{{ t('trash.heading') }}</h1>
          <p class="mt-1 text-sm text-stone-500">
            {{ t('trash.note', { count: store.trashPagination.total }) }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <RouterLink :to="{ name: 'dashboard' }" class="paper-button rounded-2xl px-4 py-2 text-sm">{{ t('trash.backToList') }}</RouterLink>
          <button
            v-if="store.trashPagination.total"
            class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-2 text-sm text-rose-950 disabled:opacity-50"
            type="button"
            :disabled="emptying"
            @click="removeAll"
          >{{ emptying ? t('trash.emptying') : t('trash.emptyButton') }}</button>
        </div>
      </div>

      <div class="paper-subtle mt-4 grid gap-3 rounded-3xl p-4 sm:grid-cols-[1fr_auto]">
        <label class="grid gap-1 text-xs text-stone-500">
          {{ t('trash.searchLabel') }}
          <input v-model="search" type="search" class="paper-input rounded-2xl px-3 py-2 text-sm" :placeholder="t('trash.searchPlaceholder')" @input="scheduleSearch" />
        </label>
        <label class="flex items-end gap-2 text-xs text-stone-500">
          {{ t('common.perPage') }}
          <select :value="store.trashQuery.pageSize ?? 20" class="paper-input rounded-xl px-2 py-2 text-xs" @change="changePageSize(Number(($event.target as HTMLSelectElement).value))">
            <option :value="10">10</option>
            <option :value="20">20</option>
            <option :value="50">50</option>
          </select>
        </label>
      </div>

      <div v-if="store.isLoadingTrash && !store.trash.length" class="mt-5 rounded-3xl border border-dashed border-amber-900/20 bg-amber-50/40 px-5 py-14 text-center text-stone-500">
        {{ t('trash.loading') }}
      </div>

      <div v-else-if="!store.trash.length" class="mt-5 rounded-3xl border border-dashed border-amber-900/20 bg-amber-50/40 px-5 py-14 text-center text-stone-500">
        <p class="paper-heading text-lg text-stone-800">{{ t('trash.emptyTitle') }}</p>
        <p class="mt-1 text-sm">{{ t('trash.emptyText') }}</p>
      </div>

      <div v-else class="mt-5 space-y-3" :class="{ 'opacity-60': store.isLoadingTrash }">
        <article v-for="event in store.trash" :key="event.id" class="rounded-2xl border border-amber-900/18 bg-[rgba(255,251,242,0.72)] p-4">
          <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded-full border border-rose-900/15 bg-rose-100/60 px-3 py-1 text-xs text-rose-950">{{ t('trash.deletedAt', { date: formatDeletedAt(event.deletedAt) }) }}</span>
                <span class="rounded-full border border-amber-900/18 bg-amber-100/60 px-3 py-1 text-xs text-amber-950">{{ formatEventRange(event) }}</span>
                <span v-for="category in splitCategories(event.category)" :key="`${event.id}-${category}`" class="paper-chip rounded-full px-3 py-1 text-xs">{{ category }}</span>
              </div>
              <h2 class="paper-heading mt-3 text-lg font-semibold text-stone-900">{{ event.title }}</h2>
              <p v-if="event.description" class="mt-1 max-w-3xl whitespace-pre-line text-sm leading-6 text-stone-600">{{ event.description }}</p>
            </div>
            <div class="flex shrink-0 flex-wrap gap-2">
              <button class="paper-button rounded-2xl px-4 py-2 text-sm" type="button" :disabled="busyId === event.id" @click="restore(event.id)">
                {{ busyId === event.id ? t('trash.restoring') : t('trash.restore') }}
              </button>
              <button class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-2 text-sm text-rose-950" type="button" :disabled="busyId === event.id" @click="purge(event)">
                {{ t('trash.purge') }}
              </button>
            </div>
          </div>
        </article>
      </div>

      <div v-if="store.trashPagination.totalPages > 1" class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-amber-900/10 pt-4">
        <p class="text-xs text-stone-500">{{ t('common.pageOf', { page: store.trashPagination.page, total: store.trashPagination.totalPages }) }}</p>
        <div class="flex gap-2">
          <button class="paper-button rounded-xl px-3 py-1.5 text-sm disabled:opacity-40" type="button" :disabled="store.trashPagination.page <= 1 || store.isLoadingTrash" @click="page(store.trashPagination.page - 1)">{{ t('common.back') }}</button>
          <button class="paper-button rounded-xl px-3 py-1.5 text-sm disabled:opacity-40" type="button" :disabled="store.trashPagination.page >= store.trashPagination.totalPages || store.isLoadingTrash" @click="page(store.trashPagination.page + 1)">{{ t('common.next') }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatEventRange } from '../lib/date';
import { translateApiError, currentLocale } from '../i18n';
import { splitCategories, type EventQuery, type LifeEvent } from '../lib/types';
import { useLifelineStore } from '../stores/lifeline';
import { useToastStore } from '../stores/toast';

const { t } = useI18n();
const store = useLifelineStore();
const toast = useToastStore();
const search = ref(store.trashQuery.search ?? '');
const busyId = ref<number | null>(null);
const emptying = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => load({ page: 1 }));

async function load(patch: Partial<EventQuery> = {}) {
  try {
    await store.loadTrash(patch);
  } catch (error) {
    toast.error(translateApiError(error) || t('trash.loadFailed'));
  }
}

function scheduleSearch() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => load({ page: 1, search: search.value.trim() }), 260);
}

function page(next: number) {
  void load({ page: next });
}

function changePageSize(size: number) {
  void load({ page: 1, pageSize: size });
}

async function restore(id: number) {
  busyId.value = id;
  try {
    await store.restoreEvent(id);
    await normalizePage();
  } catch (error) {
    toast.error(translateApiError(error) || t('trash.restoreFailed'));
  } finally {
    busyId.value = null;
  }
}

async function purge(event: LifeEvent) {
  if (!window.confirm(t('trash.confirmPurge', { title: event.title }))) return;
  busyId.value = event.id;
  try {
    await store.purgeEvent(event.id);
    await normalizePage();
  } catch (error) {
    toast.error(translateApiError(error) || t('trash.purgeFailed'));
  } finally {
    busyId.value = null;
  }
}

async function removeAll() {
  if (!window.confirm(t('trash.confirmEmptyAll', { count: store.trashPagination.total }))) return;
  emptying.value = true;
  try {
    await store.emptyTrash();
  } catch (error) {
    toast.error(translateApiError(error) || t('trash.emptyFailed'));
  } finally {
    emptying.value = false;
  }
}

async function normalizePage() {
  if (store.trashPagination.page > store.trashPagination.totalPages) {
    await load({ page: store.trashPagination.totalPages });
  }
}

function formatDeletedAt(value?: string | null) {
  if (!value) return t('trash.unknown');
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const tag = currentLocale() === 'de' ? 'de-DE' : 'en-US';
  return new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>
