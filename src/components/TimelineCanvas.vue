<template>
  <section class="paper-panel rounded-[2rem] p-5">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-stone-500">Visuelle Timeline</p>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">Zeitspannen auf einen Blick</h2>
      </div>
      <p class="text-sm text-stone-500">{{ yearStart }} – {{ yearEnd }}</p>
    </div>

    <div v-if="!events.length" class="rounded-3xl border border-dashed border-amber-900/18 bg-amber-50/50 px-5 py-14 text-center text-stone-500">
      Sobald Einträge da sind, wird hier die Timeline gezeichnet.
    </div>

    <div v-else class="overflow-x-auto pb-2">
      <div class="min-w-[900px] px-12">
        <div class="relative mb-8 h-12">
          <div class="absolute left-0 right-0 top-6 h-px bg-amber-900/20"></div>
          <div v-for="marker in markers" :key="marker.year" class="absolute top-0 -translate-x-1/2" :style="{ left: `${marker.left}%` }">
            <div class="mb-2 h-3 w-px bg-amber-900/25"></div>
            <p class="text-xs text-stone-500">{{ marker.year }}</p>
          </div>
        </div>

        <div class="space-y-4">
          <div v-for="event in rows" :key="event.id" class="rounded-3xl border border-amber-900/15 bg-[rgba(255,251,242,0.72)] p-4 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset]">
            <div class="mb-3 flex items-start justify-between gap-4">
              <div>
                <p class="paper-heading text-sm font-semibold text-stone-900">{{ event.title }}</p>
                <p class="mt-1 text-xs text-stone-500">{{ userName(event.userId) }} · {{ formatEventRange(event) }}</p>
              </div>
              <span class="paper-chip rounded-full px-3 py-1 text-xs">{{ event.category }}</span>
            </div>

            <div class="relative h-12 rounded-full border border-amber-900/10 bg-[rgba(201,174,126,0.12)]">
              <template v-if="isInstantEvent(event)">
                <div class="absolute inset-y-1 w-px bg-gradient-to-b from-transparent via-amber-900/55 to-transparent" :style="instantLineStyle(event)"></div>
                <div class="absolute inset-y-0 flex items-center" :style="instantDotStyle(event)">
                  <div class="flex h-6 w-6 items-center justify-center rounded-full border border-amber-950/20 bg-[#f9f2e1] shadow-lg shadow-amber-950/10 ring-1 ring-amber-900/20">
                    <div class="h-3 w-3 rounded-full bg-gradient-to-br from-[#7b3f00] to-[#a84f25] shadow shadow-amber-950/25"></div>
                  </div>
                </div>
              </template>
              <template v-else>
                <div class="absolute inset-y-3 rounded-full bg-gradient-to-r from-[#a67c52] via-[#8d6744] to-[#6b4d35] shadow-lg shadow-amber-950/15" :style="barStyle(event)"></div>
                <div class="absolute inset-y-2 flex items-center" :style="dotStyle(event)">
                  <div class="h-4 w-4 rounded-full border-2 border-[#f8efe0] bg-[#5d4330] shadow-lg shadow-amber-950/20"></div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatEventRange, numericValue, timelineBounds } from '../lib/date';
import type { LifeEvent, User } from '../lib/types';

const props = defineProps<{ events: LifeEvent[]; users: User[] }>();

const bounds = computed(() => timelineBounds(props.events));
const span = computed(() => Math.max(1, bounds.value.max - bounds.value.min));
const rows = computed(() => [...props.events]);
const markers = computed(() => {
  const start = new Date(bounds.value.min * 86400000).getUTCFullYear();
  const end = new Date(bounds.value.max * 86400000).getUTCFullYear();
  const items = [] as { year: number; left: number }[];
  for (let year = start; year <= end; year += 1) {
    const value = Date.UTC(year, 0, 1) / 86400000;
    const left = ((value - bounds.value.min) / span.value) * 100;
    if (left >= 0 && left <= 100) items.push({ year, left });
  }
  return items;
});
const yearStart = computed(() => markers.value[0]?.year ?? new Date(bounds.value.min * 86400000).getUTCFullYear());
const yearEnd = computed(() => markers.value.at(-1)?.year ?? new Date(bounds.value.max * 86400000).getUTCFullYear());

function pos(dateValue: number) {
  return ((dateValue - bounds.value.min) / span.value) * 100;
}

function insetPos(dateValue: number) {
  return Math.min(96.5, Math.max(2.5, pos(dateValue)));
}

function isInstantEvent(event: LifeEvent) {
  return !event.endDate && !event.isOngoing;
}

function barStyle(event: LifeEvent) {
  const left = insetPos(numericValue(event.startDate, 'start'));
  const endValue = insetPos(numericValue(event.endDate ?? event.startDate, 'end'));
  const width = Math.max(1.2, endValue - left);
  return { left: `${left}%`, width: `${width}%` };
}

function dotStyle(event: LifeEvent) {
  return { left: `calc(${insetPos(numericValue(event.startDate, 'start'))}% - 0.5rem)` };
}

function instantLineStyle(event: LifeEvent) {
  return { left: `${insetPos(numericValue(event.startDate, 'start'))}%` };
}

function instantDotStyle(event: LifeEvent) {
  return { left: `calc(${insetPos(numericValue(event.startDate, 'start'))}% - 0.75rem)` };
}

function userName(userId: number) {
  return props.users.find((user) => user.id === userId)?.name ?? 'Unbekannt';
}
</script>
