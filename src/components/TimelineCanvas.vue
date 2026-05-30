<template>
  <section class="paper-panel rounded-[2rem] p-5">
    <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p class="text-sm font-medium text-stone-500">Visuelle Timeline</p>
        <p class="mt-1 text-sm text-stone-500">{{ filteredEvents.length }} von {{ events.length }} Einträgen · {{ yearStart }} – {{ yearEnd }}</p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label class="grid gap-1 text-xs text-stone-500">
          Suche
          <input v-model="search" class="paper-input w-full rounded-2xl px-3 py-2 text-sm" placeholder="Titel oder Beschreibung" />
        </label>

        <label class="grid gap-1 text-xs text-stone-500">
          Typ
          <select v-model="typeFilter" class="paper-input w-full rounded-2xl px-3 py-2 text-sm">
            <option value="all">Alle</option>
            <option value="points">Nur Zeitpunkte</option>
            <option value="ranges">Nur Zeitspannen</option>
            <option value="ongoing">Nur laufend</option>
          </select>
        </label>

        <label class="grid gap-1 text-xs text-stone-500">
          Kategorie
          <select v-model="categoryFilter" class="paper-input w-full rounded-2xl px-3 py-2 text-sm">
            <option value="all">Alle Kategorien</option>
            <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
          </select>
        </label>

        <label class="grid gap-1 text-xs text-stone-500">
          Sortierung
          <select v-model="sortMode" class="paper-input w-full rounded-2xl px-3 py-2 text-sm">
            <option value="start-asc">Früh zuerst</option>
            <option value="start-desc">Spät zuerst</option>
            <option value="duration-desc">Lange zuerst</option>
            <option value="title-asc">Titel A–Z</option>
          </select>
        </label>
      </div>
    </div>

    <div v-if="!events.length" class="rounded-3xl border border-dashed border-amber-900/18 bg-amber-50/50 px-5 py-14 text-center text-stone-500">
      Sobald Einträge da sind, wird hier die Timeline gezeichnet.
    </div>

    <div v-else-if="!filteredEvents.length" class="rounded-3xl border border-dashed border-amber-900/18 bg-amber-50/50 px-5 py-14 text-center text-stone-500">
      Für diese Filter gibt es gerade keine passenden Einträge.
    </div>

    <div v-else class="overflow-x-auto">
      <div class="min-w-[980px]">
        <div class="grid grid-cols-[17rem_minmax(0,1fr)] gap-4 px-2 pb-3">
          <div></div>
          <div class="relative h-10">
            <div class="absolute left-0 right-0 top-5 h-px bg-amber-900/20"></div>
            <div
              v-for="marker in markers"
              :key="marker.year"
              class="absolute top-0"
              :class="marker.align === 'start' ? 'translate-x-0' : marker.align === 'end' ? '-translate-x-full' : '-translate-x-1/2'"
              :style="{ left: `${marker.left}%` }"
            >
              <div class="mb-1 h-3 w-px bg-amber-900/25" :class="marker.align === 'start' ? 'ml-0' : marker.align === 'end' ? 'ml-auto mr-0' : 'mx-auto'"></div>
              <p class="text-xs text-stone-500">{{ marker.year }}</p>
            </div>
          </div>
        </div>

        <div class="space-y-1">
          <div
            v-for="event in positionedEvents"
            :key="event.id"
            class="grid grid-cols-[17rem_minmax(0,1fr)] items-center gap-4 rounded-2xl px-2 py-2 hover:bg-amber-50/35"
            :title="eventMeta(event.rawEvent)"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-stone-800">{{ event.title }}</p>
              <p class="truncate text-[11px] text-stone-500">{{ userName(event.userId) }} · {{ formatEventRange(event.rawEvent) }}</p>
            </div>

            <div class="relative h-7 rounded-full border border-amber-900/10 bg-[rgba(201,174,126,0.1)]">
              <div class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-amber-900/10"></div>

              <template v-if="event.isInstant">
                <div class="absolute inset-y-1 w-px bg-amber-900/45" :style="{ left: `${event.left}%` }"></div>
                <div class="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-[#f8efe0] shadow-sm" :style="pointStyle(event.rawEvent, event.left)"></div>
              </template>

              <template v-else>
                <div class="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full shadow-sm" :style="rangeStyle(event)"></div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatEventRange, numericValue, timelineBounds } from '../lib/date';
import type { LifeEvent, User } from '../lib/types';

const props = defineProps<{ events: LifeEvent[]; users: User[] }>();

const search = ref('');
const typeFilter = ref<'all' | 'points' | 'ranges' | 'ongoing'>('all');
const categoryFilter = ref('all');
const sortMode = ref<'start-asc' | 'start-desc' | 'duration-desc' | 'title-asc'>('start-asc');

const categories = computed(() => [...new Set(props.events.map((event) => event.category))].sort((a, b) => a.localeCompare(b, 'de')));

const filteredEvents = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('de');

  return props.events
    .filter((event) => {
      if (typeFilter.value === 'points' && (event.endDate || event.isOngoing)) return false;
      if (typeFilter.value === 'ranges' && !event.endDate) return false;
      if (typeFilter.value === 'ongoing' && !event.isOngoing) return false;
      if (categoryFilter.value !== 'all' && event.category !== categoryFilter.value) return false;
      if (!term) return true;
      const haystack = `${event.title} ${event.description} ${event.category} ${userName(event.userId)}`.toLocaleLowerCase('de');
      return haystack.includes(term);
    })
    .slice()
    .sort((a, b) => sortEvents(a, b, sortMode.value));
});

const bounds = computed(() => timelineBounds(filteredEvents.value));
const span = computed(() => Math.max(1, bounds.value.max - bounds.value.min));
const markers = computed(() => {
  const start = new Date(bounds.value.min * 86400000).getUTCFullYear();
  const end = new Date(bounds.value.max * 86400000).getUTCFullYear();
  const items = [] as { year: number; left: number; align: 'start' | 'center' | 'end' }[];
  for (let year = start; year <= end; year += 1) {
    const value = Date.UTC(year, 0, 1) / 86400000;
    const left = pos(value);
    if (left >= 0 && left <= 100) {
      const align = left < 3 ? 'start' : left > 97 ? 'end' : 'center';
      items.push({ year, left, align });
    }
  }
  return items;
});
const yearStart = computed(() => markers.value[0]?.year ?? new Date(bounds.value.min * 86400000).getUTCFullYear());
const yearEnd = computed(() => markers.value.at(-1)?.year ?? new Date(bounds.value.max * 86400000).getUTCFullYear());

const positionedEvents = computed(() => {
  return filteredEvents.value.map((event) => {
    const left = insetPos(numericValue(event.startDate, 'start'));
    const rawEnd = numericValue(event.endDate ?? event.startDate, 'end');
    const isInstant = !event.endDate && !event.isOngoing;
    const right = isInstant ? left : insetPos(rawEnd);
    return {
      ...event,
      rawEvent: event,
      isInstant,
      left,
      right,
      width: Math.max(1.2, right - left),
    };
  });
});

function pos(dateValue: number) {
  return ((dateValue - bounds.value.min) / span.value) * 100;
}

function insetPos(dateValue: number) {
  return Math.min(96, Math.max(2.5, pos(dateValue)));
}

function sortEvents(a: LifeEvent, b: LifeEvent, mode: typeof sortMode.value) {
  const startA = numericValue(a.startDate, 'start');
  const startB = numericValue(b.startDate, 'start');
  const durationA = numericValue(a.endDate ?? a.startDate, 'end') - startA;
  const durationB = numericValue(b.endDate ?? b.startDate, 'end') - startB;

  switch (mode) {
    case 'start-desc':
      return startB - startA || a.title.localeCompare(b.title, 'de');
    case 'duration-desc':
      return durationB - durationA || startA - startB || a.title.localeCompare(b.title, 'de');
    case 'title-asc':
      return a.title.localeCompare(b.title, 'de') || startA - startB;
    case 'start-asc':
    default:
      return startA - startB || durationA - durationB || a.title.localeCompare(b.title, 'de');
  }
}

function rangeStyle(event: (typeof positionedEvents.value)[number]) {
  return {
    left: `${event.left}%`,
    width: `${event.width}%`,
    background: `linear-gradient(90deg, ${userColor(event.userId)}dd, ${userColor(event.userId)}aa)`,
  };
}

function pointStyle(event: LifeEvent, left: number) {
  return {
    left: `calc(${left}% - 0.45rem)`,
    backgroundColor: userColor(event.userId),
  };
}

function userColor(userId: number) {
  return props.users.find((user) => user.id === userId)?.color ?? '#7b3f00';
}

function userName(userId: number) {
  return props.users.find((user) => user.id === userId)?.name ?? 'Unbekannt';
}

function eventMeta(event: LifeEvent) {
  return `${event.title} — ${userName(event.userId)} · ${formatEventRange(event)}`;
}
</script>
