<template>
  <section class="rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-xl shadow-slate-950/30 backdrop-blur-xl">
    <div class="mb-5 flex items-center justify-between gap-4">
      <div>
        <p class="text-sm font-medium text-slate-300">Chronologische Liste</p>
        <h2 class="text-xl font-semibold text-white">Alle Ereignisse zeitlich sortiert</h2>
      </div>
      <p class="text-sm text-slate-400">{{ events.length }} Einträge</p>
    </div>

    <div v-if="!events.length" class="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-5 py-14 text-center text-slate-400">
      Noch nichts drin. Trag den ersten prägenden Moment ein.
    </div>

    <div v-else class="space-y-4">
      <article v-for="event in events" :key="event.id" class="group rounded-3xl border border-white/10 bg-slate-950/35 p-5 transition hover:border-white/20 hover:bg-slate-950/55">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-xs font-medium text-sky-100">{{ formatEventRange(event) }}</span>
              <span class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{{ event.category }}</span>
              <span class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">{{ userName(event.userId) }}</span>
              <span v-if="event.endDate" class="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-100">{{ eventDurationLabel(event) }}</span>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-white">{{ event.title }}</h3>
              <p v-if="event.description" class="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{{ event.description }}</p>
            </div>
          </div>

          <div class="flex gap-2 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <button class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10" @click="$emit('edit', event)">Bearbeiten</button>
            <button class="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-2 text-sm text-rose-100 hover:bg-rose-400/20" @click="$emit('remove', event)">Löschen</button>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { formatEventRange, eventDurationLabel } from '../lib/date';
import type { LifeEvent, User } from '../lib/types';

const props = defineProps<{ events: LifeEvent[]; users: User[] }>();
defineEmits<{ edit: [event: LifeEvent]; remove: [event: LifeEvent] }>();

function userName(userId: number) {
  return props.users.find((user) => user.id === userId)?.name ?? 'Unbekannt';
}
</script>
