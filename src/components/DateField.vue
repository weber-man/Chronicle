<template>
  <div class="min-w-0 rounded-2xl border border-amber-900/15 bg-[rgba(255,252,244,0.72)] p-4">
    <div>
      <p class="paper-heading text-sm font-medium text-stone-900">{{ label }}</p>
      <p class="text-xs text-stone-500">Jahr, Monat oder exaktes Datum</p>
    </div>

    <select v-model="model.precision" class="paper-input mt-3 w-full rounded-2xl px-4 py-3" :aria-label="`${label}: Genauigkeit`">
      <option value="year">Nur Jahr</option>
      <option value="month">Monat + Jahr</option>
      <option value="day">Tag + Monat + Jahr</option>
    </select>

    <div class="mt-3 grid gap-3" :class="fieldGridClass">
      <label class="grid min-w-0 gap-2">
        <span class="text-xs text-stone-500">Jahr</span>
        <input
          v-model.number="model.year"
          type="number"
          min="0"
          max="9999"
          inputmode="numeric"
          class="paper-input w-full min-w-0 rounded-2xl px-4 py-3"
          placeholder="2025"
        />
      </label>

      <label v-if="model.precision !== 'year'" class="grid min-w-0 gap-2">
        <span class="text-xs text-stone-500">Monat</span>
        <select v-model.number="model.month" class="paper-input w-full min-w-0 rounded-2xl px-4 py-3">
          <option :value="null" disabled>Monat wählen</option>
          <option v-for="month in months" :key="month.value" :value="month.value">{{ month.label }}</option>
        </select>
      </label>

      <label v-if="model.precision === 'day'" class="grid min-w-0 gap-2">
        <span class="text-xs text-stone-500">Tag</span>
        <select v-model.number="model.day" class="paper-input w-full min-w-0 rounded-2xl px-4 py-3">
          <option :value="null" disabled>Tag wählen</option>
          <option v-for="day in daysInSelectedMonth" :key="day" :value="day">{{ day }}</option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import type { TimelineDate } from '../lib/types';

const model = defineModel<TimelineDate>({ required: true });
defineProps<{ label: string }>();

const months = [
  { value: 1, label: 'Januar' },
  { value: 2, label: 'Februar' },
  { value: 3, label: 'März' },
  { value: 4, label: 'April' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juni' },
  { value: 7, label: 'Juli' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'Oktober' },
  { value: 11, label: 'November' },
  { value: 12, label: 'Dezember' },
];

const fieldGridClass = computed(() => {
  if (model.value.precision === 'day') return 'md:grid-cols-3';
  if (model.value.precision === 'month') return 'md:grid-cols-2';
  return 'md:grid-cols-1';
});

const daysInSelectedMonth = computed(() => {
  const year = Number(model.value.year) || 2000;
  const month = Number(model.value.month) || 1;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
});

watch(
  () => model.value.precision,
  (precision) => {
    if (precision === 'year') {
      model.value = { ...model.value, month: null, day: null };
    } else if (precision === 'month') {
      model.value = { ...model.value, day: null };
    }
  },
);

watch(
  () => [model.value.year, model.value.month] as const,
  () => {
    if (model.value.precision !== 'day') return;
    if (model.value.day && model.value.day > daysInSelectedMonth.value) {
      model.value = { ...model.value, day: null };
    }
  },
);
</script>
