<template>
  <section class="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-slate-300">Visuelle Timeline</p>
        <h2 class="text-xl font-semibold text-white">Zeitspannen auf einen Blick</h2>
      </div>
      <p class="text-sm text-slate-400">{{ yearStart }} – {{ yearEnd }}</p>
    </div>

    <div v-if="!events.length" class="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-14 text-center text-slate-400">
      Sobald Einträge da sind, wird hier die Timeline gezeichnet.
    </div>

    <div v-else class="overflow-x-auto pb-2">
      <div class="min-w-[900px]">
        <div class="relative mb-8 h-12">
          <div class="absolute left-0 right-0 top-6 h-px bg-white/10"></div>
          <div v-for="marker in markers" :key="marker.year" class="absolute top-0 -translate-x-1/2" :style="{ left: `${marker.left}%` }">
            <div class="mb-2 h-3 w-px bg-white/20"></div>
            <p class="text-xs text-slate-400">{{ marker.year }}</p>
          </div>
        </div>

        <div class="space-y-4">
          <div v-for="event in rows" :key="event.id" class="rounded-3xl border border-white/10 bg-slate-950/35 p-4">
            <div class="mb-3 flex items-start justify-between gap-4">
              <div>
                <p class="text-sm font-semibold text-white">{{ event.title }}</p>
                <p class="mt-1 text-xs text-slate-400">{{ userName(event.userId) }} · {{ formatEventRange(event) }}</p>
              </div>
              <span class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{{ event.category }}</span>
            </div>

            <div class="relative h-12 rounded-full bg-white/[0.04]">
              <div class="absolute inset-y-3 rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-violet-400 shadow-lg shadow-sky-500/20" :style="barStyle(event)"></div>
              <div class="absolute inset-y-2 flex items-center" :style="dotStyle(event)">
                <div class="h-4 w-4 rounded-full border-2 border-slate-950 bg-white shadow-lg shadow-sky-400/50"></div>
              </div>
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
const yearStart = computed(() => new Date(bounds.value.min * 86400000).getUTCFullYear());
const yearEnd = computed(() => new Date(bounds.value.max * 86400000).getUTCFullYear());
const rows = computed(() => [...props.events]);
const markers = computed(() => {
  const start = yearStart.value;
  const end = yearEnd.value;
  const items = [] as { year: number; left: number }[];
  for (let year = start; year <= end; year += 1) {
    const value = Date.UTC(year, 0, 1) / 86400000;
    items.push({ year, left: ((value - bounds.value.min) / span.value) * 100 });
  }
  return items;
});

function pos(dateValue: number) {
  return ((dateValue - bounds.value.min) / span.value) * 100;
}

function barStyle(event: LifeEvent) {
  const left = pos(numericValue(event.startDate, 'start'));
  const endValue = numericValue(event.endDate ?? event.startDate, 'end');
  const width = Math.max(1.2, pos(endValue) - left);
  return { left: `${left}%`, width: `${width}%` };
}

function dotStyle(event: LifeEvent) {
  return { left: `calc(${pos(numericValue(event.startDate, 'start'))}% - 0.5rem)` };
}

function userName(userId: number) {
  return props.users.find((user) => user.id === userId)?.name ?? 'Unbekannt';
}
</script>
