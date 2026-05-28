<template>
  <div class="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
    <div>
      <p class="text-sm font-medium text-white">{{ label }}</p>
      <p class="text-xs text-slate-400">Jahr, Monat oder exaktes Datum</p>
    </div>

    <select v-model="model.precision" class="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white">
      <option value="year">Nur Jahr</option>
      <option value="month">Monat + Jahr</option>
      <option value="day">Tag + Monat + Jahr</option>
    </select>

    <div class="grid gap-3 sm:grid-cols-3">
      <input v-model.number="model.year" type="number" min="0" class="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="2025" />
      <input v-if="model.precision !== 'year'" v-model.number="model.month" type="number" min="1" max="12" class="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="6" />
      <input v-if="model.precision === 'day'" v-model.number="model.day" type="number" min="1" max="31" class="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-white" placeholder="3" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TimelineDate } from '../lib/types';

const model = defineModel<TimelineDate>({ required: true });
defineProps<{ label: string }>();
</script>
