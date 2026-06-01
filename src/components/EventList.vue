<template>
  <section class="paper-panel panel-reveal rounded-[2rem] p-5">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-stone-500">Chronologische Liste</p>
        <h2 class="paper-heading text-xl font-semibold text-stone-900">Alle Ereignisse zeitlich sortiert</h2>
      </div>
      <p class="text-sm text-stone-500">{{ events.length }} Einträge</p>
    </div>

    <div v-if="!events.length" class="rounded-3xl border border-dashed border-amber-900/20 bg-amber-50/50 px-5 py-14 text-center text-stone-500">
      Noch nichts drin. Trag den ersten prägenden Moment ein.
    </div>

    <div v-else class="space-y-4 stagger-group">
      <article v-for="event in events" :key="event.id" class="group list-card rounded-3xl border border-amber-900/18 bg-[rgba(255,251,242,0.74)] p-5 shadow-[0_1px_0_rgba(255,255,255,0.55)_inset] transition hover:border-amber-900/28 hover:bg-[rgba(255,248,235,0.9)]">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full border border-amber-900/18 bg-amber-100/70 px-3 py-1 text-xs font-medium text-amber-950">{{ formatEventRange(event) }}</span>
              <span v-for="category in eventCategories(event.category)" :key="`${event.id}-${category}`" class="paper-chip rounded-full px-3 py-1 text-xs">{{ category }}</span>
              <span class="paper-chip rounded-full px-3 py-1 text-xs">{{ userName(event.userId) }}</span>
              <span v-if="event.endDate" class="rounded-full border border-emerald-900/15 bg-emerald-100/65 px-3 py-1 text-xs text-emerald-950">{{ eventDurationLabel(event) }}</span>
            </div>
            <div>
              <h3 class="paper-heading text-lg font-semibold text-stone-900">{{ event.title }}</h3>
              <p v-if="event.description" class="mt-2 max-w-3xl text-sm leading-6 text-stone-600">{{ event.description }}</p>
            </div>
          </div>

          <div class="flex gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <button class="paper-button rounded-2xl px-4 py-2 text-sm hover:bg-white/95" @click="$emit('edit', event)">Bearbeiten</button>
            <button class="rounded-2xl border border-rose-900/15 bg-rose-100/70 px-4 py-2 text-sm text-rose-950 hover:bg-rose-100" @click="$emit('remove', event)">Löschen</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatEventRange, eventDurationLabel } from '../lib/date';
import { splitCategories, type LifeEvent, type User } from '../lib/types';

const props = defineProps<{ events: LifeEvent[]; users: User[] }>();
defineEmits<{ edit: [event: LifeEvent]; remove: [event: LifeEvent] }>();

function userName(userId: number) {
  return props.users.find((user) => user.id === userId)?.name ?? 'Unbekannt';
}

function eventCategories(category: string) {
  return splitCategories(category);
}
</script>
