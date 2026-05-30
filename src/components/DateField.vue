<template>
  <div class="min-w-0 rounded-2xl border border-amber-900/15 bg-[rgba(255,252,244,0.72)] p-4">
    <div>
      <p class="paper-heading text-sm font-medium text-stone-900">{{ label }}</p>
      <p class="text-xs text-stone-500">Jahr, Monat oder exaktes Datum</p>
    </div>

    <select v-model="model.precision" class="paper-input mt-3 w-full rounded-2xl px-4 py-3">
      <option value="year">Nur Jahr</option>
      <option value="month">Monat + Jahr</option>
      <option value="day">Tag + Monat + Jahr</option>
    </select>

    <div class="mt-3 grid gap-3 sm:grid-cols-3">
      <input v-model.number="model.year" type="number" min="0" class="paper-input w-full rounded-2xl px-4 py-3" placeholder="2025" />
      <input v-if="model.precision !== 'year'" v-model.number="model.month" type="number" min="1" max="12" class="paper-input w-full rounded-2xl px-4 py-3" placeholder="6" />
      <input v-if="model.precision === 'day'" v-model.number="model.day" type="number" min="1" max="31" class="paper-input w-full rounded-2xl px-4 py-3" placeholder="3" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { TimelineDate } from '../lib/types';

const model = defineModel<TimelineDate>({ required: true });
defineProps<{ label: string }>();
</script>
